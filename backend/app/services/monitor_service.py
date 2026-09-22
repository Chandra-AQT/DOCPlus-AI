"""
monitor_service.py — Feature 1: Continuous Document Intelligence

Core engine that:
  1. Crawls a monitored URL using the existing crawler_service
  2. Computes a content hash for every discovered document (HEAD request)
  3. Diffs against the previous run snapshot to find new / changed / removed docs
  4. Downloads new and changed documents into the library
  5. Optionally runs auto-extraction on downloaded documents
  6. Persists a MonitorRun record with full change detail

Entry point:
  await run_monitor(source_id, db, triggered_by="scheduler")
"""
from __future__ import annotations

import hashlib
import os
import shutil
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import requests
from loguru import logger
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.monitor import MonitoredSource, MonitorRun
from app.models.document import Document
from crawler_service import crawl_website
from filter_service import filter_links

# ── Download headers (mirror main.py) ────────────────────────────────────────
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "application/pdf,application/octet-stream,*/*;q=0.9",
}


# ══════════════════════════════════════════════════════════════════════════════
# Public entry point
# ══════════════════════════════════════════════════════════════════════════════

async def run_monitor(
    source_id: str,
    db: Session,
    triggered_by: str = "scheduler",
) -> dict:
    """
    Run one full monitor cycle for the given source.

    Returns a summary dict:
    {
      run_id, source_id, status,
      new_count, changed_count, removed_count,
      docs_found, pages_crawled, duration_seconds,
      changes: [...]
    }
    """
    source = db.query(MonitoredSource).filter(MonitoredSource.id == source_id).first()
    if not source:
        raise ValueError(f"MonitoredSource '{source_id}' not found")

    # Mark as running
    source.status = "running"
    db.commit()

    # Create the run record
    run_id = str(uuid.uuid4())
    run = MonitorRun(
        id           = run_id,
        source_id    = source_id,
        triggered_by = triggered_by,
        status       = "running",
    )
    db.add(run)
    db.commit()

    start = time.time()

    try:
        result = await _execute_monitor_cycle(source, run, db)

        # Update run record
        run.status           = "completed"
        run.duration_seconds = round(time.time() - start, 2)
        db.commit()

        # Update source stats
        source.status              = "active"
        source.last_run_at         = datetime.utcnow()
        source.next_run_at         = _calc_next_run(source.schedule)
        source.last_new_count      = result["new_count"]
        source.last_changed_count  = result["changed_count"]
        source.last_removed_count  = result["removed_count"]
        source.total_docs_seen     = max(
            source.total_docs_seen or 0,
            result["docs_found"],
        )
        source.error = None
        db.commit()

        logger.info(
            f"[MONITOR] {source.name} — "
            f"new={result['new_count']} changed={result['changed_count']} "
            f"removed={result['removed_count']} in {run.duration_seconds}s"
        )

        return {
            "run_id":           run_id,
            "source_id":        source_id,
            "status":           "completed",
            **result,
            "duration_seconds": run.duration_seconds,
        }

    except Exception as exc:
        import traceback
        err = f"{type(exc).__name__}: {exc}"
        tb  = traceback.format_exc()
        logger.error(f"[MONITOR] {source.name} failed:\n{tb}")

        run.status           = "failed"
        run.error            = err
        run.duration_seconds = round(time.time() - start, 2)
        source.status        = "error"
        source.error         = err
        source.last_run_at   = datetime.utcnow()
        source.next_run_at   = _calc_next_run(source.schedule)
        db.commit()

        return {
            "run_id":    run_id,
            "source_id": source_id,
            "status":    "failed",
            "error":     err,
            "new_count": 0, "changed_count": 0, "removed_count": 0,
            "docs_found": 0, "pages_crawled": 0, "duration_seconds": run.duration_seconds,
            "changes": [],
        }


# ══════════════════════════════════════════════════════════════════════════════
# Core cycle
# ══════════════════════════════════════════════════════════════════════════════

async def _execute_monitor_cycle(
    source: MonitoredSource,
    run: MonitorRun,
    db: Session,
) -> dict:
    """
    Full cycle:
      1. Crawl URL → raw links
      2. Filter by source.formats / source.doc_types
      3. Hash each link (HEAD request for content-length + last-modified)
      4. Diff against previous snapshot
      5. Download new + changed docs
      6. Auto-extract if configured
      7. Persist snapshot on run record
    """

    # ── Step 1: Crawl ─────────────────────────────────────────────────────────
    pages_visited = [0]

    def on_progress(pages, found):
        pages_visited[0] = pages

    logger.info(f"[MONITOR] Crawling: {source.url}")
    raw_links = crawl_website(
        source.url,
        max_pages=300,
        progress_callback=on_progress,
        max_seconds=120,
    )
    run.pages_crawled = pages_visited[0]
    db.commit()

    # ── Step 2: Filter ────────────────────────────────────────────────────────
    fmt_list  = source.formats   or []
    type_list = source.doc_types or []
    classified = filter_links(raw_links, formats=fmt_list, doc_types=type_list)
    doc_urls = [item["url"] for item in classified]

    run.docs_found = len(doc_urls)
    db.commit()

    # ── Step 3: Hash each URL ─────────────────────────────────────────────────
    current_snapshot: dict[str, str] = {}
    for item in classified:
        url  = item["url"]
        h    = _hash_url(url)
        current_snapshot[url] = h

    # ── Step 4: Load previous snapshot ───────────────────────────────────────
    prev_run = (
        db.query(MonitorRun)
        .filter(
            MonitorRun.source_id == source.id,
            MonitorRun.status    == "completed",
            MonitorRun.id        != run.id,
        )
        .order_by(MonitorRun.run_at.desc())
        .first()
    )
    prev_snapshot: dict[str, str] = (prev_run.snapshot or {}) if prev_run else {}

    # ── Step 5: Diff ──────────────────────────────────────────────────────────
    changes = _diff_snapshots(prev_snapshot, current_snapshot, classified)

    new_changes     = [c for c in changes if c["change_type"] == "new"]
    changed_changes = [c for c in changes if c["change_type"] == "changed"]
    removed_changes = [c for c in changes if c["change_type"] == "removed"]

    # ── Step 6: Download new + changed docs ───────────────────────────────────
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    to_download = new_changes + changed_changes
    for change in to_download:
        url = change["url"]
        try:
            doc_id, fpath = _download_document(url, change.get("format", "pdf"))
            if doc_id:
                # Save document record
                doc = Document(
                    id            = doc_id,
                    user_id       = source.user_id,
                    file_name     = change["filename"],
                    file_path     = fpath,
                    file_size     = os.path.getsize(fpath),
                    mime_type     = "application/pdf",
                    status        = "uploaded",
                    upload_source = "monitor",
                )
                db.add(doc)
                db.flush()

                # Parse in background
                _parse_document_bg(doc_id, fpath, db)

                change["doc_id"] = doc_id
                logger.info(f"[MONITOR] Downloaded: {change['filename']} ({doc_id[:8]})")

                # ── Step 7: Auto-extract if configured ────────────────────────
                if source.auto_extract and source.schema_id and doc_id:
                    job_id = await _auto_extract(
                        doc_id    = doc_id,
                        schema_id = source.schema_id,
                        provider  = source.provider or "none",
                        db        = db,
                    )
                    change["job_id"] = job_id

        except Exception as e:
            logger.warning(f"[MONITOR] Download failed for {url}: {e}")
            change["download_error"] = str(e)

    db.commit()

    # ── Persist snapshot and changes on run record ────────────────────────────
    run.snapshot      = current_snapshot
    run.changes       = changes
    run.new_count     = len(new_changes)
    run.changed_count = len(changed_changes)
    run.removed_count = len(removed_changes)
    db.commit()

    return {
        "new_count":     len(new_changes),
        "changed_count": len(changed_changes),
        "removed_count": len(removed_changes),
        "docs_found":    len(doc_urls),
        "pages_crawled": pages_visited[0],
        "changes":       changes,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Diff logic
# ══════════════════════════════════════════════════════════════════════════════

def _diff_snapshots(
    prev: dict[str, str],
    current: dict[str, str],
    classified: list[dict],
) -> list[dict]:
    """
    Compare two URL→hash snapshots and return a list of change objects.
    """
    # Build quick lookup for classified metadata
    meta: dict[str, dict] = {item["url"]: item for item in classified}
    changes = []

    for url, new_hash in current.items():
        filename = _url_to_filename(url)
        item     = meta.get(url, {})

        if url not in prev:
            changes.append({
                "url":         url,
                "filename":    filename,
                "change_type": "new",
                "old_hash":    None,
                "new_hash":    new_hash,
                "doc_id":      None,
                "job_id":      None,
                "format":      item.get("format", "pdf"),
                "doc_type":    item.get("doc_type", ""),
            })
        elif prev[url] != new_hash:
            changes.append({
                "url":         url,
                "filename":    filename,
                "change_type": "changed",
                "old_hash":    prev[url],
                "new_hash":    new_hash,
                "doc_id":      None,
                "job_id":      None,
                "format":      item.get("format", "pdf"),
                "doc_type":    item.get("doc_type", ""),
            })

    # Removed: in prev but not in current
    for url in prev:
        if url not in current:
            changes.append({
                "url":         url,
                "filename":    _url_to_filename(url),
                "change_type": "removed",
                "old_hash":    prev[url],
                "new_hash":    None,
                "doc_id":      None,
                "job_id":      None,
                "format":      "",
                "doc_type":    "",
            })

    return changes


# ══════════════════════════════════════════════════════════════════════════════
# Hashing
# ══════════════════════════════════════════════════════════════════════════════

def _hash_url(url: str) -> str:
    """
    Compute a lightweight hash representing the document state.

    Uses: URL + Content-Length header + Last-Modified header (if available).
    Falls back to URL-only hash if the HEAD request fails.

    This is fast (no download) and catches:
      - New documents (new URL)
      - Updated documents (changed Content-Length or Last-Modified)
    """
    try:
        r = requests.head(url, headers=_HEADERS, timeout=10, allow_redirects=True, verify=False)
        content_length   = r.headers.get("content-length", "")
        last_modified    = r.headers.get("last-modified", "")
        etag             = r.headers.get("etag", "")
        fingerprint      = f"{url}|{content_length}|{last_modified}|{etag}"
    except Exception:
        fingerprint = url

    return hashlib.md5(fingerprint.encode()).hexdigest()


# ══════════════════════════════════════════════════════════════════════════════
# Download
# ══════════════════════════════════════════════════════════════════════════════

def _download_document(url: str, fmt: str = "pdf") -> tuple[str | None, str | None]:
    """
    Download a document to the uploads directory.
    Returns (doc_id, file_path) or (None, None) on failure.
    """
    ext_map = {"pdf": ".pdf", "word": ".docx", "excel": ".xlsx", "ppt": ".pptx"}
    ext     = ext_map.get(fmt, ".pdf")
    doc_id  = str(uuid.uuid4())
    fpath   = os.path.join(settings.UPLOAD_DIR, f"{doc_id}{ext}")

    try:
        r = requests.get(url, headers=_HEADERS, timeout=60, stream=True,
                         allow_redirects=True, verify=False)
        r.raise_for_status()

        ct = r.headers.get("content-type", "").lower()
        if "html" in ct and "pdf" not in ct:
            raise ValueError(f"Server returned HTML (content-type: {ct})")

        with open(fpath, "wb") as f:
            for chunk in r.iter_content(65536):
                if chunk:
                    f.write(chunk)

        size = os.path.getsize(fpath)
        if size < 500:
            os.remove(fpath)
            raise ValueError(f"File too small ({size} bytes)")

        return doc_id, fpath

    except Exception as e:
        if os.path.exists(fpath):
            try: os.remove(fpath)
            except: pass
        raise


def _parse_document_bg(doc_id: str, fpath: str, db: Session):
    """
    Parse the downloaded document synchronously (monitor runs in background thread).
    Updates document status to 'parsed' on success, 'error' on failure.
    """
    try:
        from app.services.parser import parse_document
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return
        doc.status = "parsing"
        db.commit()

        parsed = parse_document(fpath, "application/pdf")
        doc.parsed_data = parsed
        doc.page_count  = parsed.get("metadata", {}).get("page_count", 0)
        doc.status      = "parsed"
        db.commit()
        logger.info(f"[MONITOR] Parsed {doc_id[:8]} ({doc.page_count} pages)")
    except Exception as e:
        logger.warning(f"[MONITOR] Parse failed for {doc_id}: {e}")
        try:
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.status        = "error"
                doc.error_message = str(e)
                db.commit()
        except Exception:
            pass


# ══════════════════════════════════════════════════════════════════════════════
# Auto-extraction
# ══════════════════════════════════════════════════════════════════════════════

async def _auto_extract(
    doc_id: str,
    schema_id: str,
    provider: str,
    db: Session,
) -> str | None:
    """
    Run extraction on a freshly downloaded document using the monitor's schema.
    Returns the job_id or None if extraction failed.
    """
    try:
        from app.models.job import ExtractionJob
        from app.models.schema import SchemaDefinition
        from app.services.pipeline import run_extraction
        from app.services.lineage_writer import write_lineage

        # Verify document is parsed
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc or doc.status != "parsed" or not doc.parsed_data:
            logger.warning(f"[MONITOR] Auto-extract skipped — doc {doc_id[:8]} not parsed")
            return None

        # Load schema
        saved = db.query(SchemaDefinition).filter(SchemaDefinition.id == schema_id).first()
        if not saved:
            logger.warning(f"[MONITOR] Auto-extract skipped — schema {schema_id} not found")
            return None

        schema_dict = saved.raw_definition or {"name": saved.name, "fields": saved.fields}

        # Create job record
        job_id = str(uuid.uuid4())
        job = ExtractionJob(
            id          = job_id,
            document_id = doc_id,
            schema_name = saved.name,
            schema_id   = schema_id,
            status      = "running",
            provider    = provider,
        )
        db.add(job)
        db.commit()

        # Run extraction
        extraction = await run_extraction(
            parsed_doc      = doc.parsed_data,
            schema          = schema_dict,
            provider_config = {"provider": provider, "api_key": "", "model": "", "base_url": ""},
            options         = {},
        )

        job.status = "completed"
        job.result = extraction
        db.commit()

        # Write lineage
        write_lineage(
            db,
            job_id            = job_id,
            document_id       = doc_id,
            schema_name       = saved.name,
            schema_fields     = schema_dict.get("fields", []),
            extraction_result = extraction.get("result", {}),
            confidence        = extraction.get("confidence", {}),
            sources           = extraction.get("sources", {}),
            evidence          = extraction.get("evidence", {}),
            validation_errors = extraction.get("validation", {}),
        )

        logger.info(f"[MONITOR] Auto-extracted doc {doc_id[:8]} → job {job_id[:8]}")
        return job_id

    except Exception as e:
        logger.error(f"[MONITOR] Auto-extract failed for {doc_id}: {e}")
        return None


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _url_to_filename(url: str) -> str:
    """Extract a clean filename from a URL."""
    name = url.split("/")[-1].split("?")[0].strip()
    return name if name else "document.pdf"


def _calc_next_run(schedule: str) -> datetime:
    """Calculate the next run time based on schedule string."""
    now = datetime.utcnow()
    if schedule == "hourly":
        return now + timedelta(hours=1)
    if schedule == "daily":
        return now + timedelta(days=1)
    if schedule == "weekly":
        return now + timedelta(weeks=1)
    # "manual" or unknown — set far future so scheduler skips it
    return now + timedelta(days=3650)


def compute_next_run(schedule: str) -> datetime:
    """Public alias used by the scheduler and endpoint."""
    return _calc_next_run(schedule)
