"""
DOCPlus AI+ — Unified Platform Backend
Merges DocPlus (PDF discovery) + DocLens AI (document intelligence)
into a single FastAPI application.
"""
import os
import io
import json
import uuid
import zipfile
import threading
import queue
import shutil
from typing import Optional, List
from pathlib import Path
from urllib.parse import urlparse

import requests as req_lib
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form, BackgroundTasks, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from loguru import logger

# ── DocPlus services ──────────────────────────────────────────────────────────
from crawler_service import crawl_website
from filter_service import filter_links, detect_format, ALL_FORMATS
from excel_service import create_excel

# ── DocLens AI core ───────────────────────────────────────────────────────────
from app.core.config import settings
from app.core.database import init_db, get_db, SessionLocal
from app.core.auth import get_current_user_optional
from app.models.document import Document
from app.models.user import User
from app.models.guest_activity import GuestActivity, GuestAccessRequest

# ── DocLens AI API router (all existing endpoints preserved) ──────────────────
from guest_router import router as guest_router
from app.api.v1.router import api_router

# ═══════════════════════════════════════════════════════════════════════════════
# App Setup
# ═══════════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="DOCPlus AI+ Platform",
    description=(
        "Unified platform: DocPlus PDF discovery + DocLens AI document intelligence. "
        "URL → PDF discovery → schema extraction → structured results."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        # Railway backend self (for API docs)
        # Vercel frontend — set FRONTEND_URL env var in Railway to your Vercel domain
        settings.FRONTEND_URL,
        # Allow all Vercel preview deployments
        "https://*.vercel.app",
    ] + ([settings.FRONTEND_URL] if settings.FRONTEND_URL else ["*"]),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount DocLens AI API at /api/v1 ───────────────────────────────────────────
app.include_router(api_router)

# ── Mount Guest & Admin API ───────────────────────────────────────────────────
app.include_router(guest_router)

# ── Serve uploaded files ──────────────────────────────────────────────────────
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs("downloads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# ═══════════════════════════════════════════════════════════════════════════════
# DocPlus Discovery State
# ═══════════════════════════════════════════════════════════════════════════════

_state_lock = threading.Lock()
_state = {
    "running": False, "pages": 0, "pdf_found": 0,
    "downloaded": 0, "total": 0, "progress": 0,
    "phase": "idle", "result": None, "error": None,
}

def _set_state(**kwargs):
    with _state_lock:
        _state.update(kwargs)

DOWNLOAD_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def download_file(link: str, folder: str, fmt: str) -> Optional[str]:
    ext_map = {"pdf": ".pdf", "word": ".docx", "excel": ".xlsx", "ppt": ".pptx"}
    raw_name = link.split("/")[-1].split("?")[0].strip() or "document"
    ext = ext_map.get(fmt, "")
    if not any(raw_name.lower().endswith(e) for e in [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"]):
        raw_name += ext
    path = os.path.join(folder, raw_name)
    if os.path.exists(path) and os.path.getsize(path) > 500:
        return path
    try:
        r = req_lib.get(link, headers=DOWNLOAD_HEADERS, timeout=20, stream=True)
        r.raise_for_status()
        with open(path, "wb") as f:
            for chunk in r.iter_content(65536):
                if chunk:
                    f.write(chunk)
        return path
    except Exception:
        return None


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"

# ═══════════════════════════════════════════════════════════════════════════════
# Startup / Health
# ═══════════════════════════════════════════════════════════════════════════════

@app.on_event("startup")
async def startup():
    init_db()
    # ── Clean up stuck "running" jobs from previous server session ────────────
    # If the server was restarted mid-extraction, jobs stay "running" forever.
    # Mark them as "failed" on startup so they don't clog the UI.
    try:
        from datetime import datetime, timedelta
        from app.models.job import ExtractionJob
        db = SessionLocal()
        cutoff = datetime.utcnow() - timedelta(minutes=15)  # stuck > 15 min = failed
        stuck = db.query(ExtractionJob).filter(
            ExtractionJob.status == "running",
            ExtractionJob.created_at < cutoff,
        ).all()
        if stuck:
            for job in stuck:
                job.status = "failed"
                job.error  = "Extraction interrupted — server was restarted. Please re-run."
            db.commit()
            logger.info(f"[STARTUP] Cleaned up {len(stuck)} stuck extraction job(s)")
        db.close()
    except Exception as e:
        logger.warning(f"[STARTUP] Could not clean stuck jobs: {e}")
    logger.info("DOCPlus AI+ platform started")


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0", "platform": "DOCPlus AI+"}


@app.get("/")
async def root():
    return {
        "message": "DOCPlus AI+ Unified Platform API",
        "docs": "/docs",
        "workflow": "URL → /crawl-stream → /api/v1/documents/upload → /api/v1/extraction/run",
        "docplus_endpoints": {
            "crawl_stream": "GET /crawl-stream",
            "status": "GET /status",
            "filters": "GET /filters/options",
            "download_excel": "GET /download-excel",
            "download_zip": "GET /download-zip",
        },
        "doclens_endpoints": "/docs#/",
    }

# ═══════════════════════════════════════════════════════════════════════════════
# DocPlus Endpoints (discovery)
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/status")
def get_status():
    with _state_lock:
        return dict(_state)


@app.get("/filters/options")
def filter_options():
    return {
        "formats": [
            {"value": "pdf", "label": "PDF", "ext": ".pdf"},
            {"value": "word", "label": "Word", "ext": ".doc/.docx"},
            {"value": "excel", "label": "Excel", "ext": ".xls/.xlsx"},
            {"value": "ppt", "label": "PowerPoint", "ext": ".ppt/.pptx"},
        ],
        "doc_types": [
            {"value": "PSS", "label": "PSS – Product Specification Sheet"},
            {"value": "IOM", "label": "IOM – Installation, Operations & Maintenance"},
            {"value": "OWN", "label": "OWN – Owner's Manual / User Guide"},
            {"value": "SVM", "label": "SVM – Service Manual / Technical Manual"},
            {"value": "SVB", "label": "SVB – Service Bulletins"},
            {"value": "PCT", "label": "PCT – Product Catalog"},
            {"value": "PBR", "label": "PBR – Product Brochure"},
            {"value": "SUB", "label": "SUB – Submittal"},
            {"value": "WDG", "label": "WDG – Wiring Diagram"},
            {"value": "PLD", "label": "PLD – Parts List & Exploded Diagram"},
            {"value": "WTY", "label": "WTY – Warranty Statement"},
            {"value": "CCL", "label": "CCL – Commissioning Checklist"},
            {"value": "RCL", "label": "RCL – Recall Notices"},
            {"value": "SDS", "label": "SDS – Safety Data Sheet"},
            {"value": "CRT", "label": "CRT – Compliance & Certification"},
            {"value": "RUG", "label": "RUG – Retrofit & Upgrade Guides"},
        ],
    }


@app.get("/crawl-stream")
def crawl_stream(
    url: str,
    formats: Optional[str] = Query(None),
    doc_types: Optional[str] = Query(None),
):
    """SSE endpoint — streams DocPlus crawl progress in real time."""
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "URL must start with http:// or https://")

    wanted_formats   = [f.strip().lower() for f in formats.split(",")   if f.strip()] if formats   else []
    wanted_doc_types = [d.strip().upper() for d in doc_types.split(",") if d.strip()] if doc_types else []

    def generate():
        _set_state(running=True, phase="crawling", pages=0, pdf_found=0,
                   downloaded=0, total=0, progress=0, result=None, error=None)
        crawl_q: queue.Queue = queue.Queue()
        result_holder = [None]
        error_holder  = [None]

        def on_progress(pages, found):
            progress = min(int(pages / 2), 50)
            _set_state(pages=pages, pdf_found=found, progress=progress)
            crawl_q.put({"type": "progress", "phase": "crawling",
                         "pages": pages, "pdf_found": found, "progress": progress,
                         "message": f"Crawled {pages} pages — {found} document(s) found so far"})

        def run_crawl():
            try:
                links = crawl_website(url, progress_callback=on_progress)
                result_holder[0] = links
            except Exception as exc:
                error_holder[0] = str(exc)
            finally:
                crawl_q.put(None)

        threading.Thread(target=run_crawl, daemon=True).start()

        while True:
            try:
                item = crawl_q.get(timeout=120)
            except queue.Empty:
                error_holder[0] = "Crawl timed out after 120s."
                break
            if item is None:
                break
            yield _sse(item)

        if error_holder[0]:
            _set_state(running=False, phase="error", error=error_holder[0])
            yield _sse({"type": "error", "message": error_holder[0]})
            return

        raw_links = result_holder[0] or []
        if not raw_links:
            msg = (
                "No document links found on this website. "
                "Try the root URL (e.g. https://www.example.com/) instead of a sub-path, "
                "or check if the site requires JavaScript to load links."
            )
            _set_state(running=False, phase="error", error=msg)
            yield _sse({"type": "error", "message": msg})
            return

        classified = filter_links(raw_links, formats=wanted_formats, doc_types=wanted_doc_types)
        total_raw = len(raw_links)
        total = len(classified)

        with _state_lock:
            pages_final = _state["pages"]

        if total == 0:
            msg = (f"Found {total_raw} document(s) but none match your filters "
                   f"(formats: {wanted_formats or 'any'}, types: {wanted_doc_types or 'any'}).")
            _set_state(running=False, phase="error", error=msg)
            yield _sse({"type": "error", "message": msg})
            return

        _set_state(pdf_found=total, total=total, progress=50, phase="downloading")
        yield _sse({"type": "progress", "phase": "downloading", "pages": pages_final,
                    "pdf_found": total, "total_raw": total_raw, "downloaded": 0,
                    "total": total, "progress": 50})

        domain = urlparse(url).netloc
        parts = domain.replace("www.", "").split(".")
        name = parts[-2] if len(parts) >= 2 else parts[0]
        folder_path = os.path.join("downloads", name)
        os.makedirs(folder_path, exist_ok=True)

        downloaded_files = []
        for idx, item in enumerate(classified):
            link = item["url"]
            fmt  = item["format"]
            path = download_file(link, folder_path, fmt)
            if path:
                downloaded_files.append({
                    "name": os.path.basename(path), "path": path,
                    "format": fmt, "doc_type": item["doc_type"], "url": link,
                })
            pct = 50 + int(((idx + 1) / total) * 40)
            _set_state(downloaded=idx+1, progress=pct)
            yield _sse({"type": "progress", "phase": "downloading", "pages": pages_final,
                        "pdf_found": total, "downloaded": idx+1, "total": total, "progress": pct})

        _set_state(phase="packaging", progress=90)
        yield _sse({"type": "progress", "phase": "packaging", "pdf_found": total,
                    "downloaded": len(downloaded_files), "total": total, "progress": 90})

        try:
            excel_path = create_excel(classified, folder_path)
        except Exception as exc:
            excel_path = None
            logger.error(f"Excel creation failed: {exc}")

        result = {
            "success": True, "pdf_found": total, "total_raw": total_raw,
            "downloaded": len(downloaded_files), "pages": pages_final,
            "folder": folder_path, "excel_file": excel_path or "",
            "zip_ready": len(downloaded_files) > 0, "files": downloaded_files,
            "filters_applied": bool(wanted_formats or wanted_doc_types),
        }
        _set_state(running=False, phase="done", progress=100, result=result)
        yield _sse({"type": "done", "pdf_found": total, "total_raw": total_raw,
                    "downloaded": len(downloaded_files), "pages": pages_final,
                    "progress": 100, "excel_file": excel_path or "",
                    "zip_ready": len(downloaded_files) > 0, "folder": folder_path,
                    "filters_applied": bool(wanted_formats or wanted_doc_types),
                    "files": downloaded_files})

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no", "Connection": "keep-alive"})


@app.get("/download-file")
def download_file_proxy(url: str):
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "Invalid URL")
    try:
        r = req_lib.get(url, headers=DOWNLOAD_HEADERS, timeout=30, stream=True, allow_redirects=True)
        r.raise_for_status()
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch file: {e}")
    content_type = r.headers.get("content-type", "application/octet-stream").split(";")[0].strip()
    filename = url.split("/")[-1].split("?")[0] or "document"
    def stream():
        for chunk in r.iter_content(65536):
            if chunk:
                yield chunk
    return StreamingResponse(stream(), media_type=content_type,
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.get("/download-excel")
def download_excel():
    with _state_lock:
        result = _state.get("result")
    if not result or not result.get("excel_file"):
        raise HTTPException(404, "No Excel file available. Run a crawl first.")
    excel_path = result["excel_file"]
    if not os.path.exists(excel_path):
        raise HTTPException(404, "Excel file not found on disk.")
    def iter_file():
        with open(excel_path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk
    return StreamingResponse(iter_file(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{os.path.basename(excel_path)}"'})


@app.get("/download-zip")
def download_zip(folder: str = None):
    if folder:
        safe_folder = os.path.normpath(folder)
        if ".." in safe_folder or not os.path.isdir(safe_folder):
            raise HTTPException(404, f"Folder not found: {folder}")
        zipname = os.path.basename(safe_folder) + ".zip"
        def gen_folder_zip():
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                for root, dirs, files in os.walk(safe_folder):
                    for fname in files:
                        fpath = os.path.join(root, fname)
                        zf.write(fpath, os.path.relpath(fpath, safe_folder))
            buf.seek(0)
            while chunk := buf.read(65536):
                yield chunk
        return StreamingResponse(gen_folder_zip(), media_type="application/zip",
                                 headers={"Content-Disposition": f'attachment; filename="{zipname}"'})
    with _state_lock:
        result = _state.get("result")
    if not result or not result.get("files"):
        raise HTTPException(404, "No files available. Run a crawl first.")
    files = result["files"]
    result_folder = result.get("folder", "downloads")
    zipname = os.path.basename(result_folder) + ".zip"
    def gen_zip():
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in files:
                path = f.get("path", "")
                if os.path.exists(path):
                    zf.write(path, f.get("name", os.path.basename(path)))
        buf.seek(0)
        while chunk := buf.read(65536):
            yield chunk
    return StreamingResponse(gen_zip(), media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="{zipname}"'})


# ═══════════════════════════════════════════════════════════════════════════════
# Bridge Endpoint: Send discovered PDFs directly to DocLens AI
# ═══════════════════════════════════════════════════════════════════════════════

class SendToExtractionRequest(BaseModel):
    urls: List[str]
    local_paths: Optional[dict] = None   # {url: local_file_path} hints from crawl session


def _get_all_search_dirs() -> list:
    """Return all directories to search for locally cached PDFs."""
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    dirs = [
        os.path.join(backend_dir, "downloads"),
    ]
    # Walk up to find DocPlus downloads folder
    parent = os.path.dirname(backend_dir)            # DOCPlus AI/
    grandparent = os.path.dirname(parent)             # Desktop/DOCPlus⁺ AI/
    docplus_dl = os.path.join(grandparent, "DocPlus", "backend", "downloads")
    dirs.append(docplus_dl)
    # Also check sibling
    sibling_dl = os.path.join(parent, "..", "DocPlus", "backend", "downloads")
    dirs.append(os.path.normpath(sibling_dl))
    return dirs  # include non-existent dirs — search will skip them gracefully


def _find_local_file(raw_name: str, session_map: dict, search_dirs: list) -> str | None:
    """
    Try to find a locally cached file matching raw_name.
    1. Exact match in session_map
    2. Exact match in search_dirs
    3. Prefix match (URL filename is often truncated vs saved filename)
    """
    name_lower = raw_name.lower()
    stem = Path(raw_name).stem.lower()  # filename without extension

    # 1. Exact session match
    if name_lower in session_map:
        p = session_map[name_lower]
        if os.path.getsize(p) > 100:
            return p

    # Collect all local files for matching
    candidates = []
    for d in search_dirs:
        if not os.path.isdir(d):
            continue
        for root, _, files in os.walk(d):
            for fn in files:
                if fn.lower().endswith(('.pdf', '.doc', '.docx')):
                    candidates.append(os.path.join(root, fn))

    # 2. Exact filename match
    for cand in candidates:
        if os.path.basename(cand).lower() == name_lower:
            if os.path.getsize(cand) > 100:
                logger.info(f"Local exact hit: {cand}")
                return cand

    # 3. Prefix match — local file starts with URL stem
    for cand in candidates:
        fn_stem = Path(cand).stem.lower()
        if fn_stem.startswith(stem) or stem.startswith(fn_stem[:min(len(stem), 30)]):
            if os.path.getsize(cand) > 100:
                logger.info(f"Local prefix hit: {cand} (stem={stem})")
                return cand

    return None


@app.post("/bridge/send-to-doclens")
async def send_to_doclens(
    req: SendToExtractionRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
    x_guest_token: Optional[str] = Header(default=None),
):
    """
    Bridge: find PDFs locally (crawl session or DocPlus cache) and register
    in DocLens AI. Falls back to web download only if not found locally.
    Enforces guest PDF fetch limit when x-guest-token header is present.
    """
    if not req.urls:
        raise HTTPException(400, "No URLs provided")

    # ── Guest limit check ─────────────────────────────────────────────────────
    from app.models.guest import Guest as GuestModel
    guest_obj = None
    if x_guest_token:
        guest_obj = db.query(GuestModel).filter(GuestModel.session_token == x_guest_token).first()
        if guest_obj:
            remaining = guest_obj.pdf_remaining
            if remaining <= 0:
                raise HTTPException(403, {
                    "code":    "GUEST_PDF_LIMIT_REACHED",
                    "message": f"Trial limit reached. You have used all {guest_obj.pdf_fetch_limit} PDF fetches.",
                    "used":    guest_obj.pdf_fetched,
                    "limit":   guest_obj.pdf_fetch_limit,
                })
            # Trim request to remaining quota
            req.urls = req.urls[:remaining]

    from app.services.parser import parse_document

    def _parse_bg(did: str, fpath: str, mime: str):
        _db = SessionLocal()
        try:
            d = _db.query(Document).filter(Document.id == did).first()
            if not d: return
            d.status = "parsing"; _db.commit()
            parsed = parse_document(fpath, mime)
            d.parsed_data = parsed
            d.page_count = parsed.get("metadata", {}).get("page_count", 0)
            d.status = "parsed"; _db.commit()
        except Exception as exc:
            logger.error(f"Parse {did}: {exc}")
            try:
                d = _db.query(Document).filter(Document.id == did).first()
                if d: d.status = "error"; d.error_message = str(exc); _db.commit()
            except Exception: pass
        finally: _db.close()

    # Snapshot current session files
    session_map = {}
    with _state_lock:
        rs = _state.get("result") or {}
    for f in rs.get("files", []):
        p = f.get("path", "")
        if p and os.path.isfile(p):
            session_map[os.path.basename(p).lower()] = p

    # All local dirs to search
    search_dirs = _get_all_search_dirs()
    logger.info(f"Bridge search dirs: {search_dirs}")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    created, failed = [], []

    # Determine upload_source and batch_id for this crawl session
    # 1 URL → single, multiple URLs → batch with shared batch_id
    crawl_upload_source = "single" if len(req.urls) == 1 else "batch"
    crawl_batch_id      = str(uuid.uuid4()) if len(req.urls) > 1 else None

    for source_url in req.urls:
        raw_name = "document.pdf"
        try:
            raw_name = source_url.split("/")[-1].split("?")[0].strip() or "document.pdf"
            if not any(raw_name.lower().endswith(x)
                       for x in (".pdf",".doc",".docx",".xls",".xlsx",".ppt",".pptx")):
                raw_name += ".pdf"
            ext = Path(raw_name).suffix.lower() or ".pdf"
            doc_id = str(uuid.uuid4())
            dest = os.path.join(settings.UPLOAD_DIR, f"{doc_id}{ext}")

            src = None

            # 0. Caller-provided local path hint (fastest — from crawl session)
            if req.local_paths and source_url in req.local_paths:
                hint = req.local_paths[source_url]
                if hint and os.path.isfile(hint) and os.path.getsize(hint) > 100:
                    src = hint
                    logger.info(f"Local hint hit: {src}")

            # 1 & 2. Session map + local folder search (exact + prefix match)
            if not src:
                src = _find_local_file(raw_name, session_map, search_dirs)

            if src:
                shutil.copy2(src, dest)
            else:
                # 3. Web download — run in thread to avoid blocking async loop
                import asyncio
                from urllib.parse import urlparse as _up
                import warnings
                try:
                    import urllib3
                    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
                except Exception:
                    pass

                def _do_download():
                    _p = _up(source_url)
                    hdrs = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "application/pdf,application/octet-stream,*/*;q=0.9",
                        "Accept-Language": "en-US,en;q=0.9",
                        "Referer": f"{_p.scheme}://{_p.netloc}/",
                        "Connection": "keep-alive",
                    }
                    logger.info(f"Web download: {source_url}")
                    r = req_lib.get(
                        source_url, headers=hdrs,
                        timeout=60, stream=True,
                        allow_redirects=True, verify=False,
                    )
                    r.raise_for_status()
                    ct = r.headers.get("content-type", "").lower()
                    if "html" in ct and "pdf" not in ct:
                        raise ValueError(f"Server returned HTML instead of PDF (content-type: {ct})")
                    with open(dest, "wb") as fh:
                        for chunk in r.iter_content(65536):
                            if chunk:
                                fh.write(chunk)
                    size = os.path.getsize(dest)
                    if size < 500:
                        raise ValueError(f"Downloaded file too small ({size} bytes) — likely not a valid PDF")
                    return size

                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, _do_download)

            if not os.path.exists(dest) or os.path.getsize(dest) < 500:
                raise ValueError("File could not be saved. Try crawling the site again.")

            size = os.path.getsize(dest)
            doc = Document(
                id=doc_id,
                user_id=current_user.id if current_user else None,
                file_name=raw_name,
                file_path=dest,
                file_size=size,
                mime_type="application/pdf",
                status="uploaded",
                upload_source=crawl_upload_source,
                batch_id=crawl_batch_id,
            )
            db.add(doc)
            db.flush()
            db.commit()
            db.refresh(doc)
            background_tasks.add_task(_parse_bg, doc_id, dest, "application/pdf")
            created.append({"doc_id": doc_id, "filename": raw_name,
                            "url": source_url, "status": "uploaded", "size": size})
            logger.info(f"✓ Library: {raw_name} ({size} bytes)")

        except Exception as exc:
            logger.error(f"Bridge [{raw_name}]: {exc}")
            failed.append({"url": source_url, "error": str(exc)})

    # ── Update guest usage counter ────────────────────────────────────────────
    if guest_obj and len(created) > 0:
        guest_obj.pdf_fetched = (guest_obj.pdf_fetched or 0) + len(created)
        guest_obj.last_seen   = __import__('datetime').datetime.utcnow()
        db.commit()

    return {
        "created": created, "failed": failed,
        "total_created": len(created), "total_failed": len(failed),
        "message": f"Added {len(created)} to library. {len(failed)} failed.",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
