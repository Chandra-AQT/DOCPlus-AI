"""
extraction.py — Schema-driven extraction API endpoint.

POST /api/v1/extraction/run
  Run extraction against an already-parsed document + schema definition.

POST /api/v1/extraction/run-inline
  Upload a document + schema in one request (parse + extract in one shot).

GET  /api/v1/extraction/{job_id}
  Retrieve a previous extraction result.

DELETE /api/v1/extraction/{job_id}
  Remove an extraction record.

The schema passed here is fully generic — see schema_utils.py for the
supported field types (string, number, integer, boolean, date, currency,
email, phone, url, list, object, list[object]).
"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Header
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Any, Optional
import json, shutil, os

from app.core.config import settings
from app.core.database import get_db
from app.core.auth import get_current_user_optional
from loguru import logger
from app.models.document import Document
from app.models.job import ExtractionJob
from app.models.schema import SchemaDefinition
from app.services.parser import parse_document
from app.services.pipeline import run_extraction

router = APIRouter(prefix="/extraction", tags=["Extraction"])


# ── LandingAI key-pool rotation helper ───────────────────────────────────────

async def _landingai_with_key_rotation(fn, markdown: str, schema: dict,
                                        api_key: str, environment: str) -> dict:
    """
    Call a LandingAI extraction function with automatic key rotation.
    If the current key fails with a quota/auth error, marks it as failed
    and retries with the next available key from the pool (up to 5 attempts).
    """
    import sys, os as _os
    _backend_dir = _os.path.abspath(
        _os.path.join(_os.path.dirname(__file__), '..', '..', '..', '..')
    )
    if _backend_dir not in sys.path:
        sys.path.insert(0, _backend_dir)

    QUOTA_ERRORS = ("402", "401", "403", "payment", "quota", "credit", "billing",
                    "insufficient", "unauthorized", "forbidden", "plan")
    MAX_KEY_ATTEMPTS = 5
    last_error = None

    for attempt in range(MAX_KEY_ATTEMPTS):
        current_key = api_key if attempt == 0 else None

        # On retry, get next available key from pool
        if attempt > 0:
            try:
                from guest_router import _get_next_active_key
                current_key, environment = _get_next_active_key()
                if not current_key:
                    logger.warning("[LANDINGAI] No more keys in pool to try")
                    break
                logger.info(f"[LANDINGAI] Retrying with next pool key ...{current_key[-6:]} (attempt {attempt+1})")
            except Exception:
                break

        try:
            result = await fn(markdown=markdown, schema=schema,
                              api_key=current_key, environment=environment)
            return result
        except Exception as e:
            err_str = str(e).lower()
            last_error = e
            # Check if this is a quota/auth error — if so, mark key and try next
            if any(code in err_str for code in QUOTA_ERRORS):
                logger.warning(f"[LANDINGAI] Key ...{(current_key or '')[-6:]} quota/auth error: {e}")
                try:
                    from guest_router import _mark_key_failed
                    _mark_key_failed(current_key or api_key)
                except Exception:
                    pass
                # Continue to next key
                continue
            else:
                # Non-quota error (network, timeout etc.) — don't rotate, just raise
                raise

    # All keys exhausted
    if last_error:
        raise last_error
    raise RuntimeError("All LandingAI API keys exhausted or failed")


# ── Request/Response models ───────────────────────────────────────────────────

class ProviderConfig(BaseModel):
    provider: str = Field(default="none",
        description=(
            "Extraction engine: "
            "openai | chatgpt | anthropic | gemini | groq | grok | emergence | "
            "ollama | landingai | python | hybrid | none. "
            "'python' = heuristic only. "
            "'hybrid' = heuristic + AI fallback. "
            "'none' = heuristic only (no AI)."
        ))
    api_key: str = Field(default="", description="API key (BYOK — not stored after request)")
    model: str = Field(default="", description="Model name (leave empty for provider default)")
    base_url: str = Field(default="",
        description="Base URL: Ollama endpoint, xAI base URL, Emergence base URL, or Landing AI environment")


class ExtractionRequest(BaseModel):
    document_id: str = Field(...,
        description="ID of an already-parsed document")
    schema_id: Optional[str] = Field(default=None,
        description="ID of a saved schema (from POST /api/v1/schemas). Use this OR 'schema'.")
    schema: Optional[dict] = Field(default=None,
        description="Inline extraction schema. Use this OR 'schema_id'.")
    provider_config: ProviderConfig = Field(default_factory=ProviderConfig)
    options: dict = Field(default_factory=dict,
        description="Optional overrides: {confidence_threshold, max_retries, ...}")
    batch_run_id: Optional[str] = Field(default=None,
        description="Shared ID for grouping multiple jobs from the same extraction run")


class InlineExtractionRequest(BaseModel):
    schema: dict = Field(...,
        description="Extraction schema")
    provider_config: ProviderConfig = Field(default_factory=ProviderConfig)
    options: dict = Field(default_factory=dict)


# ── Schema helpers ────────────────────────────────────────────────────────────

def _schema_has_array_field(schema: dict) -> bool:
    """Return True if schema contains a list-of-objects field → multi-record extraction."""
    for f in schema.get("fields", []):
        ftype = f.get("type", "")
        sub   = f.get("fields") or f.get("items") or []
        if ftype in ("list[object]", "list_object"):
            return True
        if ftype in ("list", "array") and isinstance(sub, list) and len(sub) > 0:
            return True
    return False


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/run")
async def run_extraction_endpoint(
    req: ExtractionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_optional),
    x_guest_token: str = Header(default=None),
):
    """
    Run extraction on an already-parsed document.
    Provide either 'schema_id' (reference a saved schema) or 'schema' (inline definition).
    Returns the full extraction result immediately (synchronous).
    """
    # Resolve guest_id from token header (for persistent storage)
    guest_id = None
    if x_guest_token:
        from app.models.guest import Guest as GuestModel
        g = db.query(GuestModel).filter(GuestModel.session_token == x_guest_token).first()
        if g:
            guest_id = g.id
    # Resolve schema — prefer schema_id over inline schema
    if req.schema_id:
        saved = db.query(SchemaDefinition).filter(SchemaDefinition.id == req.schema_id).first()
        if not saved:
            # Resolve preset schema IDs from in-memory definitions (no DB needed)
            from app.core.database import PRESET_SCHEMAS
            lookup_id = req.schema_id
            if lookup_id == "guest_fixed_schema":
                lookup_id = "preset_product_literature"
            preset = next((p for p in PRESET_SCHEMAS if p["id"] == lookup_id), None)
            if preset:
                schema_dict = {"name": preset["name"], "fields": preset["fields"]}
                schema_name = preset["name"]
                logger.info(f"[SCHEMA] Resolved preset '{req.schema_id}' → '{preset['name']}' from memory")
            else:
                raise HTTPException(404, f"Schema '{req.schema_id}' not found.")
        else:
            schema_name = saved.name
            # Build schema_dict in our internal {name, fields:[]} format.
            # Priority:
            #  1. saved.fields if it has list[object] fields WITH sub-fields (fully normalized)
            #  2. raw_definition re-adapted through _adapt_any_schema (recovers sub-fields)
            #  3. saved.fields as-is (flat schema, no nested objects)
            from app.api.v1.endpoints.schemas import _adapt_any_schema

            def _fields_are_complete(fields):
                """True if all list/list[object] fields have their sub-fields populated."""
                for f in (fields or []):
                    if f.get('type') in ('list', 'list[object]', 'array'):
                        if not f.get('fields'):
                            return False
                return True

            if saved.fields and len(saved.fields) > 0 and _fields_are_complete(saved.fields):
                # Normalized fields are complete — use directly
                schema_dict = {
                    "name":        saved.name,
                    "description": saved.description or "",
                    "fields":      saved.fields,
                }
            elif saved.raw_definition:
                # Re-adapt from original — recovers all sub-fields
                schema_dict = _adapt_any_schema(saved.raw_definition, saved.name or "schema")
                if not schema_dict.get("name"):
                    schema_dict["name"] = saved.name
            elif saved.fields:
                # Use whatever we have
                schema_dict = {
                    "name":        saved.name,
                    "description": saved.description or "",
                    "fields":      saved.fields,
                }
            else:
                schema_dict = {"name": saved.name, "description": "", "fields": []}

            logger.info(f"[SCHEMA] Loaded '{saved.name}': {len(schema_dict.get('fields', []))} fields")
    elif req.schema:
        # Inline schema from frontend — may be in any format
        # If it already has "fields" key → use directly (wizard sends pre-adapted fields)
        # Otherwise run through the adapter
        if req.schema.get("fields"):
            schema_dict = req.schema
        else:
            from app.api.v1.endpoints.schemas import _adapt_any_schema
            schema_dict = _adapt_any_schema(req.schema, req.schema.get("name", "inline"))
        schema_name = schema_dict.get("name") or req.schema.get("name", "inline")
        logger.info(f"[SCHEMA] Inline schema '{schema_name}': {len(schema_dict.get('fields', []))} fields")
    else:
        raise HTTPException(400, "Provide either 'schema_id' or 'schema'.")
    doc = db.query(Document).filter(Document.id == req.document_id).first()
    if not doc:
        raise HTTPException(404, f"Document '{req.document_id}' not found.")
    if doc.status != "parsed" or not doc.parsed_data:
        raise HTTPException(400, f"Document not parsed. Status: {doc.status}")

    job_id = str(uuid.uuid4())
    job = ExtractionJob(
        id=job_id,
        user_id=current_user.id if current_user else None,
        guest_id=guest_id,
        document_id=req.document_id,
        schema_name=schema_name,
        schema_id=req.schema_id,
        status="running",
        provider=req.provider_config.provider,
        model=req.provider_config.model,
        batch_run_id=req.batch_run_id or None,
    )
    db.add(job)
    db.commit()

    try:
        provider = req.provider_config.provider.lower()

        # ── Guest LandingAI injection — uses key pool with auto-fallback ─────────
        # If provider is landingai but no key provided, pick the next active key
        # from the admin-configured pool (up to 5 keys). If a key fails due to
        # quota/auth errors, it's marked as failed and the next key is tried.
        if provider == 'landingai' and not req.provider_config.api_key:
            try:
                # Import pool helpers from guest_router
                import sys, os as _os
                _backend_dir = _os.path.abspath(
                    _os.path.join(_os.path.dirname(__file__), '..', '..', '..', '..')
                )
                if _backend_dir not in sys.path:
                    sys.path.insert(0, _backend_dir)
                from guest_router import _get_next_active_key
                _key, _url = _get_next_active_key()
                if _key:
                    req.provider_config.api_key  = _key
                    req.provider_config.base_url = _url or 'production'
                    logger.info(f"[LANDINGAI] Injected key from pool: ...{_key[-6:]}")
                else:
                    # Try env var as last resort
                    _env_key = _os.getenv('LANDINGAI_API_KEY', '')
                    if _env_key:
                        req.provider_config.api_key  = _env_key
                        req.provider_config.base_url = _os.getenv('LANDINGAI_BASE_URL', 'production')
                        logger.info("[LANDINGAI] Injected LANDINGAI_API_KEY from environment")
                    else:
                        logger.warning("[LANDINGAI] No active keys in pool — falling back to heuristic")
                        req.provider_config.provider = 'none'
                        provider = 'none'
            except Exception as _e:
                logger.warning(f"[LANDINGAI] Key pool load failed: {_e} — falling back to heuristic")
                req.provider_config.provider = 'none'
                provider = 'none'
            except Exception as _e:
                logger.warning(f"[LANDINGAI] Config load failed: {_e} — falling back to heuristic")
                req.provider_config.provider = 'none'
                provider = 'none'

        if provider == "landingai":
            from app.services.landingai_service import (
                extract_with_landingai, extract_multi_with_landingai,
                parse_with_landingai
            )
            if not req.provider_config.api_key:
                raise HTTPException(400, "Landing AI requires an api_key in provider_config.")

            environment = req.provider_config.base_url or "production"
            vision_parse = req.options.get("vision_parse", False)
            markdown = doc.parsed_data.get("markdown", "")

            # Schema-driven extraction mode decision:
            # - If schema has a top-level list[object] field (e.g. "models"), use SINGLE-record mode.
            #   LandingAI handles the array natively — it returns { header_fields..., models: [{...},...] }
            #   The UI then detects the nested array-of-objects and renders it as a spreadsheet.
            # - If multi_record flag is explicitly set (no list[object] in schema), use MULTI mode
            #   which wraps the result in a records[] array.
            has_list_object_field = any(
                f.get("type") in ("list[object]", "list_object") or
                (f.get("type") in ("list", "array") and isinstance(f.get("fields"), list) and len(f.get("fields", [])) > 0)
                for f in schema_dict.get("fields", [])
            )
            explicit_multi = req.options.get("multi_record", False)
            multi_record = (
                explicit_multi and not has_list_object_field
            ) or (
                req.options.get("auto_multi", False) and not has_list_object_field and _schema_has_array_field(schema_dict)
            )
            logger.info(f"[LANDINGAI] has_list_object={has_list_object_field}, explicit_multi={explicit_multi}, multi_record={multi_record}")

            logger.info(f"[LANDINGAI] Starting extraction: doc={req.document_id[:8]}, multi={multi_record}, markdown_len={len(markdown)}, env={environment}")

            if not markdown or len(markdown.strip()) < 50:
                logger.warning(f"[LANDINGAI] Document markdown is too short ({len(markdown)} chars) — document may not be properly parsed")
                raise HTTPException(400, f"Document markdown is too short ({len(markdown)} chars). Re-upload and re-parse the document.")

            if vision_parse:
                # User explicitly enabled vision mode — always use LandingAI vision parser
                try:
                    logger.info(f"Vision mode enabled — parsing with LandingAI vision: {doc.file_path}")
                    from app.services.vision_parser import vision_parse_document
                    vision_markdown = await vision_parse_document(
                        file_path=doc.file_path,
                        provider="landingai",
                        api_key=req.provider_config.api_key,
                        base_url=environment,
                    )
                    if vision_markdown:
                        markdown = vision_markdown
                        logger.info(f"Vision markdown: {len(markdown)} chars")
                except Exception as e:
                    logger.warning(f"Vision parse failed, using stored markdown: {e}")
            else:
                # Auto-detect: only re-parse if diagram values are image-only
                import re as _re
                has_dimensions_label = bool(_re.search(r'DIMENSIONS?:', markdown, _re.IGNORECASE))
                has_dimension_numbers = bool(_re.search(
                    r'\d+[-\s]\d+/\d+["\']?|\b\d{1,3}\.\d{1,4}["\']?\s*(?:in|inch|")',
                    markdown
                ))
                file_path = doc.file_path
                import os
                if has_dimensions_label and not has_dimension_numbers and file_path and os.path.exists(file_path):
                    try:
                        logger.info(f"Diagram-only PDF detected, re-parsing with LandingAI vision: {file_path}")
                        landingai_parsed = await parse_with_landingai(
                            file_path=file_path,
                            api_key=req.provider_config.api_key,
                            environment=environment,
                        )
                        markdown = landingai_parsed.get("markdown", "")
                    except Exception as e:
                        logger.warning(f"LandingAI vision parse failed, using stored markdown: {e}")

            if multi_record:
                extraction = await _landingai_with_key_rotation(
                    fn=extract_multi_with_landingai,
                    markdown=markdown, schema=schema_dict,
                    api_key=req.provider_config.api_key, environment=environment,
                )
            else:
                extraction = await _landingai_with_key_rotation(
                    fn=extract_with_landingai,
                    markdown=markdown, schema=schema_dict,
                    api_key=req.provider_config.api_key, environment=environment,
                )
            logger.info(f"[LANDINGAI] Extraction done: result_keys={list(extraction.keys())}, result_fields={list(extraction.get('result', {}).keys()) if 'result' in extraction else 'N/A'}, records={extraction.get('total_records', 'N/A')}")
        else:
            vision_parse = req.options.get("vision_parse", False)
            multi_record = req.options.get("multi_record", False) or \
                           (req.options.get("auto_multi", False) and _schema_has_array_field(schema_dict))

            if vision_parse and provider in ("openai", "chatgpt", "anthropic", "gemini"):
                # Vision mode for non-LandingAI providers
                try:
                    import os
                    if doc.file_path and os.path.exists(doc.file_path):
                        logger.info(f"Vision mode enabled for {provider} — parsing PDF as images")
                        from app.services.vision_parser import vision_parse_document
                        vision_markdown = await vision_parse_document(
                            file_path=doc.file_path,
                            provider=provider,
                            api_key=req.provider_config.api_key,
                            model=req.provider_config.model,
                        )
                        if vision_markdown:
                            # Merge vision markdown with existing parsed data
                            existing_markdown = doc.parsed_data.get("markdown", "")
                            merged_parsed = dict(doc.parsed_data)
                            merged_parsed["markdown"] = existing_markdown + "\n\n<!-- VISION PARSE -->\n\n" + vision_markdown
                            extraction = await run_extraction(
                                parsed_doc=merged_parsed,
                                schema=schema_dict,
                                provider_config=req.provider_config.dict(),
                                options=req.options,
                            )
                        else:
                            extraction = await run_extraction(
                                parsed_doc=doc.parsed_data,
                                schema=schema_dict,
                                provider_config=req.provider_config.dict(),
                                options=req.options,
                            )
                    else:
                        extraction = await run_extraction(
                            parsed_doc=doc.parsed_data,
                            schema=schema_dict,
                            provider_config=req.provider_config.dict(),
                            options=req.options,
                        )
                except Exception as e:
                    logger.warning(f"Vision parse failed for {provider}: {e}, falling back to text")
                    extraction = await run_extraction(
                        parsed_doc=doc.parsed_data,
                        schema=schema_dict,
                        provider_config=req.provider_config.dict(),
                        options=req.options,
                    )
            else:
                extraction = await run_extraction(
                    parsed_doc=doc.parsed_data,
                    schema=schema_dict,
                    provider_config=req.provider_config.dict(),
                    options=req.options,
                )
        job.status = "completed"
        job.result = extraction
        # Capture LandingAI credit usage from response metadata
        try:
            _meta = extraction.get("metadata") or {}
            _credits = _meta.get("credit_usage") or extraction.get("credit_usage") or 0
            if _credits:
                job.credits_used = float(_credits)
        except Exception:
            pass
        db.commit()
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        logger.error(f"Extraction failed:\n{error_detail}")
        job.status = "failed"
        job.error = str(e) or type(e).__name__
        db.commit()
        raise HTTPException(500, f"Extraction failed: {type(e).__name__}: {e}")

    return {
        "job_id":      job_id,
        "document_id": req.document_id,
        "schema_name": schema_name,
        "status":      "completed",
        # Normalized fields the frontend expects
        "fields":            extraction.get("result", {}),
        "confidence_scores": extraction.get("confidence", {}),
        "source_references": extraction.get("sources", {}),
        "all_records":       extraction.get("records") or None,
        "total_records":     extraction.get("total_records") or None,
        "quality_score":     (extraction.get("quality") or {}).get("score") if isinstance(extraction.get("quality"), dict) else extraction.get("quality_score"),
        # Keep raw extraction for DB/export use
        **{k: v for k, v in extraction.items() if k not in ("result","confidence","sources","records","quality")},
    }


@router.post("/run-inline")
async def run_inline_extraction(
    schema: str = Form(..., description="JSON string of extraction schema"),
    file: UploadFile = File(...),
    provider: str = Form(default="none"),
    api_key: str = Form(default=""),
    model: str = Form(default=""),
    base_url: str = Form(default=""),
    db: Session = Depends(get_db),
):
    """
    Upload a document + schema and get extraction results in one shot.
    Parses the document then immediately runs extraction.
    """
    # Parse schema
    try:
        schema_dict = json.loads(schema)
    except Exception:
        raise HTTPException(400, "Invalid JSON in 'schema' field.")

    # Save uploaded file
    doc_id = str(uuid.uuid4())
    ext = Path(file.filename or "file.bin").suffix
    fpath = os.path.join(settings.UPLOAD_DIR, f"{doc_id}{ext}")
    with open(fpath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Parse document
    try:
        parsed = parse_document(fpath, file.content_type or "")
    except Exception as e:
        raise HTTPException(500, f"Document parsing failed: {e}")

    # Save document record
    doc = Document(
        id=doc_id,
        file_name=file.filename,
        file_path=fpath,
        file_size=os.path.getsize(fpath),
        mime_type=file.content_type or "application/octet-stream",
        status="parsed",
        parsed_data=parsed,
        page_count=parsed["metadata"].get("page_count", 1),
    )
    db.add(doc)
    db.commit()

    # Run extraction
    provider_config = {
        "provider": provider, "api_key": api_key,
        "model": model, "base_url": base_url,
    }
    job_id = str(uuid.uuid4())
    job = ExtractionJob(
        id=job_id,
        document_id=doc_id,
        schema_name=schema_dict.get("name", "inline"),
        status="running",
    )
    db.add(job)
    db.commit()

    try:
        extraction = await run_extraction(
            parsed_doc=parsed,
            schema=schema_dict,
            provider_config=provider_config,
            options={},
        )
        job.status = "completed"
        job.result = extraction
        db.commit()
    except Exception as e:
        job.status = "failed"
        job.error = str(e)
        db.commit()
        raise HTTPException(500, f"Extraction failed: {e}")

    return {
        "job_id": job_id,
        "document_id": doc_id,
        "schema_name": schema_dict.get("name", "inline"),
        "status": "completed",
        "parse_metadata": parsed["metadata"],
        **extraction,
    }


@router.get("/run/{job_id}")
async def get_extraction_result(job_id: str, db: Session = Depends(get_db)):
    """Retrieve a previous extraction result by job ID."""
    job = db.query(ExtractionJob).filter(ExtractionJob.id == job_id).first()
    if not job:
        raise HTTPException(404, f"Extraction job '{job_id}' not found.")

    result = job.result or {}
    records = result.get("records") or []
    nested_result = result.get("result", {}) or {}
    fields = nested_result if nested_result else {}
    confidence_scores = result.get("confidence") or {}
    source_references = result.get("sources") or {}
    quality = result.get("quality") or {}
    qs = quality.get("score") if isinstance(quality, dict) else result.get("quality_score")

    # Count total records
    nested_arr_count = 0
    for v in fields.values():
        if isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict):
            nested_arr_count = len(v)
            break
    total_records = result.get("total_records") or len(records) or nested_arr_count or None

    return {
        "job_id":            job.id,
        "document_id":       job.document_id,
        "schema_name":       job.schema_name,
        "schema_id":         job.schema_id or "",
        "status":            job.status,
        "provider":          job.provider or "",
        "error":             getattr(job, 'error', None),
        "total_records":     total_records,
        "quality_score":     qs,
        "fields":            fields,
        "confidence_scores": confidence_scores,
        "source_references": source_references,
        "all_records":       records if records else None,
        "created_at":        job.created_at.isoformat() if job.created_at else None,
    }


@router.delete("/run/{job_id}")
async def delete_extraction(job_id: str, db: Session = Depends(get_db)):
    job = db.query(ExtractionJob).filter(ExtractionJob.id == job_id).first()
    if not job:
        raise HTTPException(404, f"Extraction job '{job_id}' not found.")
    db.delete(job)
    db.commit()
    return {"deleted": job_id}


@router.get("/document/{doc_id}")
async def list_extractions_for_document(doc_id: str, db: Session = Depends(get_db)):
    """List all extraction jobs for a given document."""
    jobs = db.query(ExtractionJob).filter(ExtractionJob.document_id == doc_id).all()
    return {
        "document_id": doc_id,
        "extractions": [
            {
                "job_id": j.id,
                "schema_name": j.schema_name,
                "status": j.status,
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
            for j in jobs
        ],
    }


# ── Admin: List all extraction jobs ──────────────────────────────────────────

@router.get("/admin/all")
async def list_all_extractions(
    limit: int = 200,
    offset: int = 0,
    status: str = None,
    db: Session = Depends(get_db),
):
    """Admin: list all extraction jobs with full metadata, newest first."""
    from app.models.document import Document

    q = db.query(ExtractionJob)
    if status:
        q = q.filter(ExtractionJob.status == status)
    total = q.count()
    jobs  = q.order_by(ExtractionJob.created_at.desc()).offset(offset).limit(limit).all()

    def _job_dict(j):
        doc = db.query(Document).filter(Document.id == j.document_id).first()
        filename = doc.file_name if doc else (j.document_id[:16] + "..." if j.document_id else "—")
        result   = j.result or {}
        records  = result.get("records") or []
        # Detect nested array-of-objects in result.result (e.g. models, items)
        nested_result = result.get("result", {}) or {}
        nested_arr_key = next(
            (k for k, v in nested_result.items()
             if isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict)),
            None
        )
        nested_arr = nested_result.get(nested_arr_key, []) if nested_arr_key else []
        total_records = (result.get("total_records") or
                         len(records) or len(nested_arr) or None)
        quality  = result.get("quality") or {}
        qs = quality.get("score") if isinstance(quality, dict) else result.get("quality_score")

        # Normalize fields for frontend: merge result.result into job-level fields
        # The frontend uses job.fields, job.confidence_scores, job.all_records
        # Backend stores: { result: {field: value}, confidence: {...}, records: [...] }
        fields           = nested_result if nested_result else {}
        confidence_scores = result.get("confidence") or {}
        source_references = result.get("sources") or {}
        all_records      = records if records else None

        return {
            "job_id":            j.id,
            "document_id":       j.document_id,
            "filename":          filename,
            "schema_name":       j.schema_name or "",
            "schema_id":         j.schema_id or "",
            "status":            j.status,
            "provider":          j.provider or "",
            "records":           total_records,
            "total_records":     total_records,
            "quality":           qs,
            "quality_score":     qs,
            "credits_used":      j.credits_used or 0,
            "duration_s":        j.duration_seconds,
            "user_id":           j.user_id,
            "guest_id":          j.guest_id,
            "error":             j.error or getattr(j, 'error_message', None),
            "created_at":        j.created_at.isoformat() if j.created_at else None,
            "batch_run_id":      getattr(j, 'batch_run_id', None) or "",
            # Full result data for ResultsPage rendering
            "fields":            fields,
            "confidence_scores": confidence_scores,
            "source_references": source_references,
            "all_records":       all_records,
        }

    return {
        "total": total,
        "jobs":  [_job_dict(j) for j in jobs],
    }


@router.get("/batch/{batch_run_id}")
async def get_batch_jobs(
    batch_run_id: str,
    db: Session = Depends(get_db),
):
    """Get all extraction jobs belonging to a specific batch run."""
    from app.models.document import Document

    jobs = (
        db.query(ExtractionJob)
        .filter(ExtractionJob.batch_run_id == batch_run_id)
        .order_by(ExtractionJob.created_at.asc())
        .all()
    )

    def _job_dict(j):
        doc = db.query(Document).filter(Document.id == j.document_id).first()
        filename = doc.file_name if doc else (j.document_id[:16] + "..." if j.document_id else "—")
        result   = j.result or {}
        records  = result.get("records") or []
        nested_result = result.get("result", {}) or {}
        nested_arr_key = next(
            (k for k, v in nested_result.items()
             if isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict)), None
        )
        nested_arr = nested_result.get(nested_arr_key, []) if nested_arr_key else []
        total_records = result.get("total_records") or len(records) or len(nested_arr) or None
        quality = result.get("quality") or {}
        qs = quality.get("score") if isinstance(quality, dict) else result.get("quality_score")
        fields = nested_result if nested_result else {}
        return {
            "job_id":            j.id,
            "document_id":       j.document_id,
            "filename":          filename,
            "schema_name":       j.schema_name or "",
            "schema_id":         j.schema_id or "",
            "status":            j.status,
            "provider":          j.provider or "",
            "total_records":     total_records,
            "quality_score":     qs,
            "batch_run_id":      getattr(j, 'batch_run_id', None) or "",
            "created_at":        j.created_at.isoformat() if j.created_at else None,
            "fields":            fields,
            "confidence_scores": result.get("confidence") or {},
            "source_references": result.get("sources") or {},
            "all_records":       records if records else None,
            "error":             j.error or getattr(j, 'error_message', None),
        }

    return {
        "batch_run_id": batch_run_id,
        "jobs": [_job_dict(j) for j in jobs],
        "total": len(jobs),
        "schema_name": jobs[0].schema_name if jobs else "",
        "created_at": jobs[0].created_at.isoformat() if jobs else None,
    }


@router.delete("/admin/{job_id}")
async def admin_delete_extraction(job_id: str, db: Session = Depends(get_db)):
    """Admin: delete an extraction job."""
    job = db.query(ExtractionJob).filter(ExtractionJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    db.delete(job)
    db.commit()
    return {"deleted": job_id}


@router.post("/admin/{job_id}/reset")
async def admin_reset_extraction(job_id: str, db: Session = Depends(get_db)):
    """Admin: reset a stuck 'running' job to 'failed' so it can be re-run."""
    job = db.query(ExtractionJob).filter(ExtractionJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status not in ("running", "pending"):
        raise HTTPException(400, f"Job is '{job.status}' — only running/pending jobs can be reset")
    job.status = "failed"
    job.error  = "Manually reset — was stuck in running state."
    db.commit()
    return {"reset": job_id, "status": "failed"}


# ── Schema field type reference ───────────────────────────────────────────────

@router.get("/field-types")
async def get_field_types():
    """Return supported field types and their schema options."""
    return {
        "scalar_types": [
            "string", "number", "integer", "boolean",
            "date", "currency", "email", "phone", "url",
        ],
        "complex_types": {
            "list": {
                "description": "A list of scalar values (strings by default).",
                "example": {
                    "name": "features",
                    "type": "list",
                    "source_labels": ["features", "standard features"],
                },
            },
            "list[object]": {
                "description": (
                    "A list of structured objects extracted from table rows "
                    "or repeated document sections. Define sub-fields in 'fields'."
                ),
                "example": {
                    "name": "line_items",
                    "type": "list",
                    "fields": [
                        {"name": "model", "type": "string",
                         "table_labels": ["model", "part number"]},
                        {"name": "quantity", "type": "integer",
                         "table_labels": ["qty", "quantity"]},
                        {"name": "price", "type": "currency",
                         "table_labels": ["price", "unit price"]},
                    ],
                },
            },
            "object": {
                "description": (
                    "A single structured object with named sub-fields. "
                    "Each sub-field is extracted independently."
                ),
                "example": {
                    "name": "contact_information",
                    "type": "object",
                    "fields": [
                        {"name": "address", "type": "string",
                         "source_labels": ["address"]},
                        {"name": "phone", "type": "phone",
                         "source_labels": ["phone", "tel"]},
                        {"name": "fax", "type": "phone",
                         "source_labels": ["fax"]},
                    ],
                },
            },
        },
        "field_options": {
            "source_labels": "Text labels to search for in document body",
            "table_labels": "Column headers to match in tables",
            "document_labels": "Section headings or document-level labels",
            "preferred_sources": "Search order: table | kv | text",
            "required": "Raise failure_log entry if not found",
            "fallback": "Default value when field cannot be extracted",
            "normalization_rules": "Post-processing: strip | uppercase | lowercase | title_case | normalize_date | remove_currency | digits_only",
            "validation_rules": "Validation: not_empty | numeric | positive | min_length:N | max_length:N | email",
            "confidence_threshold": "Below this confidence (0.0–1.0), AI fallback is triggered",
            "null_values": "Values to treat as null (e.g. ['N/A', '-', ''])",
        },
    }
