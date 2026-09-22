"""
monitors.py — Feature 1: Continuous Document Intelligence API

POST   /api/v1/monitors              Create a new monitored source
GET    /api/v1/monitors              List all monitored sources
GET    /api/v1/monitors/{id}         Get one monitored source + recent runs
PUT    /api/v1/monitors/{id}         Update a monitored source
DELETE /api/v1/monitors/{id}         Delete a monitored source + all runs

POST   /api/v1/monitors/{id}/run     Trigger an immediate run (async background)
POST   /api/v1/monitors/{id}/pause   Pause a monitor
POST   /api/v1/monitors/{id}/resume  Resume a paused monitor

GET    /api/v1/monitors/{id}/runs          List all runs for a source
GET    /api/v1/monitors/{id}/runs/latest   Get the most recent run (with changes)
GET    /api/v1/monitors/runs/recent        Get recent changes across all monitors (dashboard badge)
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user_optional
from app.models.monitor import MonitoredSource, MonitorRun
from app.services.monitor_service import compute_next_run
from app.services.scheduler import trigger_now

router = APIRouter(prefix="/monitors", tags=["Monitors"])


# ── Request / Response models ─────────────────────────────────────────────────

class MonitorCreate(BaseModel):
    name:          str   = Field(..., description="Human-readable label, e.g. 'Carrier HVAC'")
    url:           str   = Field(..., description="Seed URL to crawl")
    schedule:      str   = Field(default="daily",
                                  description="manual | hourly | daily | weekly")
    formats:       list  = Field(default_factory=list,
                                  description="['pdf','word',…] — empty = all formats")
    doc_types:     list  = Field(default_factory=list,
                                  description="['PSS','IOM',…] — empty = all types")
    auto_extract:  bool  = Field(default=False)
    schema_id:     Optional[str] = Field(default=None)
    provider:      Optional[str] = Field(default=None)
    provider_model:Optional[str] = Field(default=None)


class MonitorUpdate(BaseModel):
    name:          Optional[str]  = None
    url:           Optional[str]  = None
    schedule:      Optional[str]  = None
    formats:       Optional[list] = None
    doc_types:     Optional[list] = None
    auto_extract:  Optional[bool] = None
    schema_id:     Optional[str]  = None
    provider:      Optional[str]  = None
    provider_model:Optional[str]  = None


# ── Serialisers ───────────────────────────────────────────────────────────────

def _source_dict(s: MonitoredSource) -> dict:
    return {
        "id":                   s.id,
        "name":                 s.name,
        "url":                  s.url,
        "schedule":             s.schedule,
        "formats":              s.formats or [],
        "doc_types":            s.doc_types or [],
        "auto_extract":         bool(s.auto_extract),
        "schema_id":            s.schema_id,
        "provider":             s.provider,
        "status":               s.status,
        "error":                s.error,
        "last_run_at":          s.last_run_at.isoformat()  if s.last_run_at  else None,
        "next_run_at":          s.next_run_at.isoformat()  if s.next_run_at  else None,
        "created_at":           s.created_at.isoformat()   if s.created_at   else None,
        "total_docs_seen":      s.total_docs_seen     or 0,
        "last_new_count":       s.last_new_count      or 0,
        "last_changed_count":   s.last_changed_count  or 0,
        "last_removed_count":   s.last_removed_count  or 0,
    }


def _run_dict(r: MonitorRun, include_changes: bool = False) -> dict:
    d = {
        "id":               r.id,
        "source_id":        r.source_id,
        "run_at":           r.run_at.isoformat()  if r.run_at  else None,
        "duration_seconds": r.duration_seconds,
        "triggered_by":     r.triggered_by,
        "pages_crawled":    r.pages_crawled  or 0,
        "docs_found":       r.docs_found     or 0,
        "new_count":        r.new_count      or 0,
        "changed_count":    r.changed_count  or 0,
        "removed_count":    r.removed_count  or 0,
        "status":           r.status,
        "error":            r.error,
    }
    if include_changes:
        d["changes"] = r.changes or []
    return d


# ══════════════════════════════════════════════════════════════════════════════
# CRUD endpoints
# ══════════════════════════════════════════════════════════════════════════════

@router.post("")
async def create_monitor(
    body: MonitorCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_optional),
):
    """Create a new monitored source."""
    import uuid as _uuid

    # Validate schedule
    valid_schedules = {"manual", "hourly", "daily", "weekly"}
    if body.schedule not in valid_schedules:
        raise HTTPException(400, f"schedule must be one of {valid_schedules}")

    source = MonitoredSource(
        id             = str(_uuid.uuid4()),
        user_id        = current_user.id if current_user else None,
        name           = body.name.strip(),
        url            = body.url.strip(),
        schedule       = body.schedule,
        formats        = body.formats,
        doc_types      = body.doc_types,
        auto_extract   = body.auto_extract,
        schema_id      = body.schema_id,
        provider       = body.provider,
        provider_model = body.provider_model,
        status         = "active",
        # Set next_run_at so the scheduler picks it up on the first tick
        next_run_at    = compute_next_run(body.schedule) if body.schedule != "manual" else None,
    )
    db.add(source)
    db.commit()
    db.refresh(source)

    return {"message": "Monitor created", "monitor": _source_dict(source)}


@router.get("")
async def list_monitors(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_optional),
):
    """List all monitored sources for the current user."""
    query = db.query(MonitoredSource).order_by(MonitoredSource.created_at.desc())
    if current_user:
        query = query.filter(MonitoredSource.user_id == current_user.id)
    sources = query.all()
    return {"monitors": [_source_dict(s) for s in sources]}


@router.get("/runs/recent")
async def get_recent_changes(
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """
    Get the most recent changes across all monitors.
    Used by the Dashboard notification badge.
    Returns a flat list of change objects from completed runs in the last 7 days.
    """
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(days=7)

    runs = (
        db.query(MonitorRun)
        .filter(
            MonitorRun.status == "completed",
            MonitorRun.run_at >= since,
        )
        .order_by(MonitorRun.run_at.desc())
        .limit(50)
        .all()
    )

    all_changes = []
    for run in runs:
        for change in (run.changes or []):
            all_changes.append({
                **change,
                "run_id":    run.id,
                "source_id": run.source_id,
                "run_at":    run.run_at.isoformat() if run.run_at else None,
            })

    # Sort by run_at descending, cap at limit
    all_changes.sort(key=lambda c: c.get("run_at", ""), reverse=True)

    total_new     = sum(1 for c in all_changes if c.get("change_type") == "new")
    total_changed = sum(1 for c in all_changes if c.get("change_type") == "changed")
    total_removed = sum(1 for c in all_changes if c.get("change_type") == "removed")

    return {
        "changes":       all_changes[:limit],
        "total":         len(all_changes),
        "new_count":     total_new,
        "changed_count": total_changed,
        "removed_count": total_removed,
        "has_new":       total_new > 0 or total_changed > 0,
    }


@router.get("/{monitor_id}")
async def get_monitor(monitor_id: str, db: Session = Depends(get_db)):
    """Get a single monitored source with its 10 most recent runs."""
    source = db.query(MonitoredSource).filter(MonitoredSource.id == monitor_id).first()
    if not source:
        raise HTTPException(404, "Monitor not found")

    recent_runs = (
        db.query(MonitorRun)
        .filter(MonitorRun.source_id == monitor_id)
        .order_by(MonitorRun.run_at.desc())
        .limit(10)
        .all()
    )

    return {
        "monitor":     _source_dict(source),
        "recent_runs": [_run_dict(r, include_changes=True) for r in recent_runs],
    }


@router.put("/{monitor_id}")
async def update_monitor(
    monitor_id: str,
    body: MonitorUpdate,
    db: Session = Depends(get_db),
):
    """Update a monitored source."""
    source = db.query(MonitoredSource).filter(MonitoredSource.id == monitor_id).first()
    if not source:
        raise HTTPException(404, "Monitor not found")

    if body.name          is not None: source.name           = body.name.strip()
    if body.url           is not None: source.url            = body.url.strip()
    if body.formats       is not None: source.formats        = body.formats
    if body.doc_types     is not None: source.doc_types      = body.doc_types
    if body.auto_extract  is not None: source.auto_extract   = body.auto_extract
    if body.schema_id     is not None: source.schema_id      = body.schema_id
    if body.provider      is not None: source.provider       = body.provider
    if body.provider_model is not None: source.provider_model = body.provider_model

    if body.schedule is not None:
        valid = {"manual", "hourly", "daily", "weekly"}
        if body.schedule not in valid:
            raise HTTPException(400, f"schedule must be one of {valid}")
        source.schedule    = body.schedule
        source.next_run_at = compute_next_run(body.schedule) if body.schedule != "manual" else None

    db.commit()
    return {"message": "Monitor updated", "monitor": _source_dict(source)}


@router.delete("/{monitor_id}")
async def delete_monitor(monitor_id: str, db: Session = Depends(get_db)):
    """Delete a monitored source and all its run history."""
    source = db.query(MonitoredSource).filter(MonitoredSource.id == monitor_id).first()
    if not source:
        raise HTTPException(404, "Monitor not found")

    # Delete all runs first (SQLite has no FK cascade by default)
    db.query(MonitorRun).filter(MonitorRun.source_id == monitor_id).delete(synchronize_session=False)
    db.delete(source)
    db.commit()
    return {"deleted": monitor_id}


# ══════════════════════════════════════════════════════════════════════════════
# Action endpoints
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/{monitor_id}/run")
async def run_monitor_now(
    monitor_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Trigger an immediate monitor run in the background.
    Returns instantly — poll GET /{id}/runs/latest for progress.
    """
    source = db.query(MonitoredSource).filter(MonitoredSource.id == monitor_id).first()
    if not source:
        raise HTTPException(404, "Monitor not found")

    if source.status == "running":
        raise HTTPException(409, "This monitor is already running")

    # Dispatch via scheduler's trigger_now (creates own thread + event loop)
    trigger_now(monitor_id)

    return {
        "message":    "Monitor run started in background",
        "monitor_id": monitor_id,
        "status":     "running",
    }


@router.post("/{monitor_id}/pause")
async def pause_monitor(monitor_id: str, db: Session = Depends(get_db)):
    """Pause a monitor so the scheduler skips it."""
    source = db.query(MonitoredSource).filter(MonitoredSource.id == monitor_id).first()
    if not source:
        raise HTTPException(404, "Monitor not found")
    if source.status == "paused":
        return {"message": "Already paused", "monitor": _source_dict(source)}
    source.status = "paused"
    db.commit()
    return {"message": "Monitor paused", "monitor": _source_dict(source)}


@router.post("/{monitor_id}/resume")
async def resume_monitor(monitor_id: str, db: Session = Depends(get_db)):
    """Resume a paused monitor."""
    source = db.query(MonitoredSource).filter(MonitoredSource.id == monitor_id).first()
    if not source:
        raise HTTPException(404, "Monitor not found")
    source.status     = "active"
    source.next_run_at = compute_next_run(source.schedule) if source.schedule != "manual" else None
    source.error      = None
    db.commit()
    return {"message": "Monitor resumed", "monitor": _source_dict(source)}


# ══════════════════════════════════════════════════════════════════════════════
# Run history endpoints
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/{monitor_id}/runs")
async def list_runs(
    monitor_id: str,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """List run history for a monitored source."""
    source = db.query(MonitoredSource).filter(MonitoredSource.id == monitor_id).first()
    if not source:
        raise HTTPException(404, "Monitor not found")

    runs = (
        db.query(MonitorRun)
        .filter(MonitorRun.source_id == monitor_id)
        .order_by(MonitorRun.run_at.desc())
        .limit(limit)
        .all()
    )
    return {
        "monitor_id": monitor_id,
        "runs":       [_run_dict(r, include_changes=False) for r in runs],
    }


@router.get("/{monitor_id}/runs/latest")
async def get_latest_run(monitor_id: str, db: Session = Depends(get_db)):
    """
    Get the most recent run for a monitor — including full change list.
    Used by the UI to poll progress after triggering a run.
    """
    source = db.query(MonitoredSource).filter(MonitoredSource.id == monitor_id).first()
    if not source:
        raise HTTPException(404, "Monitor not found")

    run = (
        db.query(MonitorRun)
        .filter(MonitorRun.source_id == monitor_id)
        .order_by(MonitorRun.run_at.desc())
        .first()
    )
    if not run:
        return {
            "monitor_id":   monitor_id,
            "run":          None,
            "monitor_status": source.status,
        }

    return {
        "monitor_id":     monitor_id,
        "run":            _run_dict(run, include_changes=True),
        "monitor_status": source.status,
    }
