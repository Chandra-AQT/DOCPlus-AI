"""
lineage_writer.py — Feature 2: Data Lineage & Evidence Layer

Takes the output of run_extraction() and writes one FieldLineage row
per extracted field per job into the field_lineage table.

Called automatically after every successful extraction.
Failures here are non-fatal — logged but never raise to the caller.

Handles all field structures:
  - Scalar fields        (string, number, date, …)
  - list fields          (flat array of values)
  - object fields        (single nested dict)
  - list[object] fields  (table rows — one lineage row per record per sub-field)
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from typing import Any

from loguru import logger
from sqlalchemy.orm import Session

from app.models.lineage import FieldLineage


# ── Unit detection ─────────────────────────────────────────────────────────────
# Attempt to pull a unit suffix out of the raw evidence / value string.
# e.g.  "36,000 BTU/hr"  → "BTU/hr"
#       "415 V"           → "V"
#       "32 dB"           → "dB"
_UNIT_PATTERNS = re.compile(
    r"\b(BTU/?hr?|kW|W|V|A|Hz|dB|lbs?|kg|in|ft|mm|cm|m|°[CF]|%|psi|gpm|cfm|rpm|kPa)\b",
    re.IGNORECASE,
)


def _detect_unit(value: Any, evidence: str) -> str | None:
    """Return the first unit found in the value string or evidence snippet."""
    for text in (str(value), evidence or ""):
        m = _UNIT_PATTERNS.search(text)
        if m:
            return m.group(1)
    return None


# ── Source parsing ─────────────────────────────────────────────────────────────

def _parse_source(source_str: str) -> tuple[str, str | None]:
    """
    Split a source string into (source_type, ai_provider).

    Examples:
      "table"          → ("table", None)
      "ai:openai"      → ("ai:openai", "openai")
      "ai:openai:retry"→ ("ai:openai", "openai")
      "kv"             → ("kv", None)
    """
    if not source_str:
        return ("fallback", None)
    parts = source_str.split(":")
    if parts[0] == "ai" and len(parts) >= 2:
        return (f"ai:{parts[1]}", parts[1])
    return (source_str, None)


# ── Label extraction from evidence string ─────────────────────────────────────

def _extract_source_label(evidence: str) -> str | None:
    """
    Pull a human-readable source label from the evidence string.
    Evidence examples:
      "Column 'Manufacturer'"           → "Manufacturer"
      "KV key: cooling capacity"        → "cooling capacity"
      "AI (openai/gpt-4o-mini) extraction" → None  (keep full evidence as source_text)
    """
    if not evidence:
        return None
    m = re.match(r"Column '([^']+)'", evidence)
    if m:
        return m.group(1)
    m = re.match(r"KV key[:\s]+(.+)", evidence, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return None


# ── Core writer ────────────────────────────────────────────────────────────────

def write_lineage(
    db: Session,
    *,
    job_id: str,
    document_id: str,
    schema_name: str,
    schema_fields: list[dict],
    extraction_result: dict,
    confidence: dict,
    sources: dict,
    evidence: dict,
    validation_errors: dict,
    ai_model: str | None = None,
    document_version: str | None = None,
) -> int:
    """
    Write field-level lineage rows for one completed extraction job.

    Returns the number of rows written.
    Failures are caught and logged — never raised to the caller.
    """
    rows_written = 0
    now = datetime.utcnow()

    try:
        result = extraction_result or {}
        conf   = confidence or {}
        srcs   = sources or {}
        evid   = evidence or {}
        verr   = validation_errors or {}

        # Build a field-name → field-definition lookup
        field_defs: dict[str, dict] = {}
        for f in (schema_fields or []):
            if isinstance(f, dict):
                field_defs[f.get("name", "")] = f

        for field_name, raw_value in result.items():
            field_def    = field_defs.get(field_name, {})
            source_str   = srcs.get(field_name, "fallback")
            evidence_str = evid.get(field_name, "")
            conf_val     = conf.get(field_name, 0.0)
            has_err      = 1 if field_name in verr else 0
            is_fallback  = 1 if source_str == "fallback" else 0

            source_type, ai_provider_from_src = _parse_source(source_str)
            source_label = _extract_source_label(evidence_str)

            # Resolve AI model / provider
            resolved_ai_model    = ai_model if ai_provider_from_src else None
            resolved_ai_provider = ai_provider_from_src

            ftype = field_def.get("type", "string")

            # ── Nested: list[object] ──────────────────────────────────────────
            if isinstance(raw_value, list) and raw_value and isinstance(raw_value[0], dict):
                sub_fields = field_def.get("fields", [])
                sub_field_defs = {sf.get("name", ""): sf for sf in sub_fields}

                for rec_idx, record in enumerate(raw_value):
                    if not isinstance(record, dict):
                        continue
                    for sub_field_name, sub_val in record.items():
                        sub_def = sub_field_defs.get(sub_field_name, {})
                        unit = _detect_unit(sub_val, "")
                        row = FieldLineage(
                            id               = str(uuid.uuid4()),
                            job_id           = job_id,
                            document_id      = document_id,
                            schema_name      = schema_name,
                            field_name       = sub_field_name,
                            field_path       = f"{field_name}[{rec_idx}].{sub_field_name}",
                            extracted_value  = _serialise(sub_val),
                            normalized_value = _serialise(sub_val),
                            unit             = unit,
                            source_type      = source_type,
                            source_label     = source_label,
                            source_text      = evidence_str[:500] if evidence_str else None,
                            page_number      = None,
                            section          = None,
                            confidence       = conf_val,
                            is_fallback      = is_fallback,
                            has_error        = 0,
                            ai_model         = resolved_ai_model,
                            ai_provider      = resolved_ai_provider,
                            extraction_date  = now,
                            document_version = document_version,
                        )
                        db.add(row)
                        rows_written += 1

            # ── Nested: object (single dict) ──────────────────────────────────
            elif isinstance(raw_value, dict):
                sub_fields = field_def.get("fields", [])
                sub_field_defs = {sf.get("name", ""): sf for sf in sub_fields}

                for sub_field_name, sub_val in raw_value.items():
                    unit = _detect_unit(sub_val, "")
                    row = FieldLineage(
                        id               = str(uuid.uuid4()),
                        job_id           = job_id,
                        document_id      = document_id,
                        schema_name      = schema_name,
                        field_name       = sub_field_name,
                        field_path       = f"{field_name}.{sub_field_name}",
                        extracted_value  = _serialise(sub_val),
                        normalized_value = _serialise(sub_val),
                        unit             = unit,
                        source_type      = source_type,
                        source_label     = source_label,
                        source_text      = evidence_str[:500] if evidence_str else None,
                        page_number      = None,
                        section          = None,
                        confidence       = conf_val,
                        is_fallback      = is_fallback,
                        has_error        = 0,
                        ai_model         = resolved_ai_model,
                        ai_provider      = resolved_ai_provider,
                        extraction_date  = now,
                        document_version = document_version,
                    )
                    db.add(row)
                    rows_written += 1

            # ── Flat list ─────────────────────────────────────────────────────
            elif isinstance(raw_value, list):
                serialised = json.dumps(raw_value) if raw_value else None
                row = FieldLineage(
                    id               = str(uuid.uuid4()),
                    job_id           = job_id,
                    document_id      = document_id,
                    schema_name      = schema_name,
                    field_name       = field_name,
                    field_path       = field_name,
                    extracted_value  = serialised,
                    normalized_value = serialised,
                    unit             = None,
                    source_type      = source_type,
                    source_label     = source_label,
                    source_text      = evidence_str[:500] if evidence_str else None,
                    page_number      = None,
                    section          = None,
                    confidence       = conf_val,
                    is_fallback      = is_fallback,
                    has_error        = has_err,
                    ai_model         = resolved_ai_model,
                    ai_provider      = resolved_ai_provider,
                    extraction_date  = now,
                    document_version = document_version,
                )
                db.add(row)
                rows_written += 1

            # ── Scalar ────────────────────────────────────────────────────────
            else:
                unit = _detect_unit(raw_value, evidence_str)
                row = FieldLineage(
                    id               = str(uuid.uuid4()),
                    job_id           = job_id,
                    document_id      = document_id,
                    schema_name      = schema_name,
                    field_name       = field_name,
                    field_path       = field_name,
                    extracted_value  = _serialise(raw_value),
                    normalized_value = _serialise(raw_value),
                    unit             = unit,
                    source_type      = source_type,
                    source_label     = source_label,
                    source_text      = evidence_str[:500] if evidence_str else None,
                    page_number      = None,
                    section          = None,
                    confidence       = conf_val,
                    is_fallback      = is_fallback,
                    has_error        = has_err,
                    ai_model         = resolved_ai_model,
                    ai_provider      = resolved_ai_provider,
                    extraction_date  = now,
                    document_version = document_version,
                )
                db.add(row)
                rows_written += 1

        db.commit()
        logger.info(f"[LINEAGE] Wrote {rows_written} lineage rows for job {job_id}")

    except Exception as exc:
        logger.error(f"[LINEAGE] Failed to write lineage for job {job_id}: {exc}")
        try:
            db.rollback()
        except Exception:
            pass

    return rows_written


# ── Multi-record variant ───────────────────────────────────────────────────────

def write_lineage_multi(
    db: Session,
    *,
    job_id: str,
    document_id: str,
    schema_name: str,
    records: list[dict],
    ai_model: str | None = None,
    document_version: str | None = None,
) -> int:
    """
    Write lineage for multi-record extractions (LandingAI / list[object] results).

    Each record is a dict:
      {
        "result":     {"ModelNumber": "ABC-120", "Capacity": 36000, ...},
        "confidence": {"ModelNumber": 0.95, ...},
        "sources":    {"ModelNumber": "table", ...},
        "evidence":   {"ModelNumber": "Column 'Model'", ...},
      }

    Returns total rows written.
    """
    total = 0
    for rec in records:
        total += write_lineage(
            db,
            job_id           = job_id,
            document_id      = document_id,
            schema_name      = schema_name,
            schema_fields    = [],   # scalar fields only at this level
            extraction_result= rec.get("result", {}),
            confidence       = rec.get("confidence", {}),
            sources          = rec.get("sources", {}),
            evidence         = rec.get("evidence", {}),
            validation_errors= rec.get("validation", {}),
            ai_model         = ai_model,
            document_version = document_version,
        )
    return total


# ── Helper ─────────────────────────────────────────────────────────────────────

def _serialise(value: Any) -> str | None:
    """Convert any value to a string for storage. None stays None."""
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return str(value)
