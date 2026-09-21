"""
lineage.py — Feature 2: Data Lineage & Evidence Layer API endpoints.

GET  /api/v1/lineage/{job_id}
     Full field-level lineage for one extraction job.
     Used by the frontend Evidence drawer.

GET  /api/v1/lineage/{job_id}/field/{field_name}
     Lineage for a single named field within a job.
     Used by click-to-source on individual cells.

GET  /api/v1/lineage/document/{document_id}
     All lineage rows ever written for a document (across all jobs).
     Useful for audit trails.

GET  /api/v1/lineage/summary/{job_id}
     Aggregated per-source-type counts for a job.
     Used by the source breakdown badge in the Results header.

DELETE /api/v1/lineage/{job_id}
     Remove all lineage rows for a job (called when a job is deleted).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from collections import defaultdict

from app.core.database import get_db
from app.models.lineage import FieldLineage

router = APIRouter(prefix="/lineage", tags=["Lineage"])


# ── Response shape helpers ─────────────────────────────────────────────────────

def _row_to_dict(row: FieldLineage) -> dict:
    return {
        "id":               row.id,
        "job_id":           row.job_id,
        "document_id":      row.document_id,
        "schema_name":      row.schema_name,
        "field_name":       row.field_name,
        "field_path":       row.field_path,
        "extracted_value":  row.extracted_value,
        "normalized_value": row.normalized_value,
        "unit":             row.unit,
        "source_type":      row.source_type,
        "source_label":     row.source_label,
        "source_text":      row.source_text,
        "page_number":      row.page_number,
        "section":          row.section,
        "confidence":       row.confidence,
        "confidence_pct":   round((row.confidence or 0) * 100),
        "is_fallback":      bool(row.is_fallback),
        "has_error":        bool(row.has_error),
        "ai_model":         row.ai_model,
        "ai_provider":      row.ai_provider,
        "extraction_date":  row.extraction_date.isoformat() if row.extraction_date else None,
        "document_version": row.document_version,
        # UI helpers
        "source_category":  _source_category(row.source_type),
        "source_label_display": _source_label_display(row),
    }


def _source_category(source_type: str | None) -> str:
    """Map source_type to a UI category: table | kv | ai | heuristic | fallback."""
    if not source_type:
        return "fallback"
    s = source_type.lower()
    if s == "table":
        return "table"
    if s in ("kv",):
        return "kv"
    if s.startswith("ai:") or s in ("landingai_ade",):
        return "ai"
    if s in ("fallback",):
        return "fallback"
    # text, text_pattern, regex_pattern, heuristic_rescued, chunk
    return "heuristic"


def _source_label_display(row: FieldLineage) -> str:
    """Human-readable one-line source description for the UI badge."""
    cat = _source_category(row.source_type)
    label = row.source_label or ""

    if cat == "table":
        return f"Table · {label}" if label else "Table"
    if cat == "kv":
        return f"Key-Value · {label}" if label else "Key-Value pair"
    if cat == "ai":
        provider = (row.ai_provider or "AI").title()
        model = row.ai_model or ""
        return f"{provider} · {model}" if model else provider
    if cat == "fallback":
        return "Default fallback"
    return label or row.source_type or "Heuristic"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{job_id}")
async def get_job_lineage(job_id: str, db: Session = Depends(get_db)):
    """
    Return all field-level lineage rows for one extraction job.
    Response is structured as a dict keyed by field_name for fast frontend lookup.
    """
    rows = (
        db.query(FieldLineage)
        .filter(FieldLineage.job_id == job_id)
        .order_by(FieldLineage.field_path)
        .all()
    )

    if not rows:
        # Return empty structure — not a 404, the job may just have no lineage yet
        return {
            "job_id":        job_id,
            "total_fields":  0,
            "by_field":      {},
            "all_rows":      [],
            "summary":       _empty_summary(),
        }

    # Group by field_name (multiple rows per field when list[object])
    by_field: dict[str, list] = defaultdict(list)
    for row in rows:
        by_field[row.field_name].append(_row_to_dict(row))

    summary = _compute_summary(rows)

    return {
        "job_id":       job_id,
        "total_fields": len(by_field),
        "total_rows":   len(rows),
        "by_field":     dict(by_field),
        "all_rows":     [_row_to_dict(r) for r in rows],
        "summary":      summary,
    }


@router.get("/{job_id}/field/{field_name}")
async def get_field_lineage(
    job_id: str,
    field_name: str,
    db: Session = Depends(get_db),
):
    """
    Return lineage rows for a single named field within a job.
    For scalar fields this is one row.
    For list[object] fields this is one row per record/sub-field.
    """
    rows = (
        db.query(FieldLineage)
        .filter(
            FieldLineage.job_id == job_id,
            FieldLineage.field_name == field_name,
        )
        .order_by(FieldLineage.field_path)
        .all()
    )

    if not rows:
        raise HTTPException(
            404,
            f"No lineage found for field '{field_name}' in job '{job_id}'. "
            "Lineage is written after extraction completes."
        )

    return {
        "job_id":     job_id,
        "field_name": field_name,
        "rows":       [_row_to_dict(r) for r in rows],
        "count":      len(rows),
        # Convenience: top row for scalar display
        "primary":    _row_to_dict(rows[0]),
    }


@router.get("/document/{document_id}")
async def get_document_lineage(
    document_id: str,
    field_name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Return all lineage rows for a document across all jobs.
    Optionally filter by field_name.
    Useful for audit trails and version comparison.
    """
    query = db.query(FieldLineage).filter(FieldLineage.document_id == document_id)
    if field_name:
        query = query.filter(FieldLineage.field_name == field_name)

    rows = query.order_by(FieldLineage.extraction_date.desc()).limit(500).all()

    return {
        "document_id": document_id,
        "total_rows":  len(rows),
        "rows":        [_row_to_dict(r) for r in rows],
    }


@router.get("/summary/{job_id}")
async def get_lineage_summary(job_id: str, db: Session = Depends(get_db)):
    """
    Aggregated source breakdown for one job.
    Used by the Results page header to show the source quality badge.
    """
    rows = db.query(FieldLineage).filter(FieldLineage.job_id == job_id).all()
    if not rows:
        return {"job_id": job_id, **_empty_summary()}

    return {"job_id": job_id, **_compute_summary(rows)}


@router.delete("/{job_id}")
async def delete_job_lineage(job_id: str, db: Session = Depends(get_db)):
    """Remove all lineage rows for a job. Called when the job itself is deleted."""
    deleted = (
        db.query(FieldLineage)
        .filter(FieldLineage.job_id == job_id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"job_id": job_id, "deleted_rows": deleted}


# ── Summary helpers ────────────────────────────────────────────────────────────

def _compute_summary(rows: list[FieldLineage]) -> dict:
    total = len(rows)
    by_source: dict[str, int] = defaultdict(int)
    by_category: dict[str, int] = defaultdict(int)
    confidence_sum = 0.0
    confidence_count = 0
    fallback_count = 0
    error_count = 0

    for row in rows:
        src = row.source_type or "fallback"
        cat = _source_category(src)
        by_source[src] += 1
        by_category[cat] += 1
        if row.confidence is not None:
            confidence_sum += row.confidence
            confidence_count += 1
        if row.is_fallback:
            fallback_count += 1
        if row.has_error:
            error_count += 1

    avg_confidence = (confidence_sum / confidence_count) if confidence_count else 0.0

    return {
        "total_fields":    total,
        "avg_confidence":  round(avg_confidence, 3),
        "avg_confidence_pct": round(avg_confidence * 100),
        "fallback_count":  fallback_count,
        "error_count":     error_count,
        "by_source":       dict(by_source),
        "by_category":     dict(by_category),
        # Percentages for the UI donut chart
        "by_category_pct": {
            k: round(v / total * 100) for k, v in by_category.items()
        } if total else {},
    }


def _empty_summary() -> dict:
    return {
        "total_fields":       0,
        "avg_confidence":     0.0,
        "avg_confidence_pct": 0,
        "fallback_count":     0,
        "error_count":        0,
        "by_source":          {},
        "by_category":        {},
        "by_category_pct":    {},
    }
