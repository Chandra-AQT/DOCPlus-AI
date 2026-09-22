"""
scheduler.py — Feature 1: Continuous Document Intelligence

APScheduler-based background job runner for monitored sources.

Design decisions:
  - Uses BackgroundScheduler (thread-based, not asyncio) so it works
    alongside FastAPI's uvicorn event loop without conflict.
  - One APScheduler job per monitored source, keyed by source ID.
  - A "tick" job runs every 60 seconds and dispatches any sources whose
    next_run_at is in the past. This is simpler and more reliable than
    adding/removing individual APScheduler jobs dynamically.
  - Runs monitor_service.run_monitor() in a new asyncio event loop per
    thread (APScheduler runs jobs in a thread pool, not in the FastAPI loop).

Startup:
  call start_scheduler() from main.py @app.on_event("startup")

Shutdown:
  call stop_scheduler() from main.py @app.on_event("shutdown")
"""
from __future__ import annotations

import asyncio
import threading
from datetime import datetime

from loguru import logger

try:
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.interval import IntervalTrigger
    _APSCHEDULER_AVAILABLE = True
except ImportError:
    _APSCHEDULER_AVAILABLE = False
    logger.warning(
        "[SCHEDULER] APScheduler not installed — continuous monitoring disabled. "
        "Install with: pip install apscheduler"
    )

# ── Singleton scheduler instance ─────────────────────────────────────────────
_scheduler: "BackgroundScheduler | None" = None
_scheduler_lock = threading.Lock()


# ══════════════════════════════════════════════════════════════════════════════
# Public API
# ══════════════════════════════════════════════════════════════════════════════

def start_scheduler() -> None:
    """Start the background scheduler. Called once at app startup."""
    global _scheduler

    if not _APSCHEDULER_AVAILABLE:
        return

    with _scheduler_lock:
        if _scheduler is not None and _scheduler.running:
            return  # Already running

        _scheduler = BackgroundScheduler(
            job_defaults={
                "coalesce":        True,   # merge missed runs into one
                "max_instances":   1,      # never run the same job twice concurrently
                "misfire_grace_time": 300, # allow up to 5 min late
            },
            timezone="UTC",
        )

        # Single tick job — checks every 60 seconds which monitors are due
        _scheduler.add_job(
            func        = _tick,
            trigger     = IntervalTrigger(seconds=60),
            id          = "monitor_tick",
            name        = "Monitor Tick — dispatch due monitors",
            replace_existing = True,
        )

        _scheduler.start()
        logger.info("[SCHEDULER] Started — tick every 60s")


def stop_scheduler() -> None:
    """Gracefully stop the scheduler. Called at app shutdown."""
    global _scheduler
    with _scheduler_lock:
        if _scheduler and _scheduler.running:
            _scheduler.shutdown(wait=False)
            _scheduler = None
            logger.info("[SCHEDULER] Stopped")


def is_running() -> bool:
    """Return True if the scheduler is currently running."""
    return bool(_scheduler and _scheduler.running)


def trigger_now(source_id: str) -> bool:
    """
    Immediately dispatch a monitor run for the given source_id in a background thread.
    Used by the 'Run Now' button in the UI.
    Returns True if dispatched, False if scheduler is not running.
    """
    t = threading.Thread(
        target   = _run_source_sync,
        args     = (source_id, "manual"),
        daemon   = True,
        name     = f"monitor-manual-{source_id[:8]}",
    )
    t.start()
    logger.info(f"[SCHEDULER] Manual trigger: {source_id[:8]}")
    return True


# ══════════════════════════════════════════════════════════════════════════════
# Internal: tick + dispatch
# ══════════════════════════════════════════════════════════════════════════════

def _tick() -> None:
    """
    Called every 60 seconds by APScheduler.
    Finds all active monitors whose next_run_at is in the past and
    dispatches each one in its own daemon thread.
    """
    try:
        from app.core.database import SessionLocal
        from app.models.monitor import MonitoredSource

        db   = SessionLocal()
        now  = datetime.utcnow()

        try:
            due = db.query(MonitoredSource).filter(
                MonitoredSource.status     == "active",
                MonitoredSource.schedule   != "manual",
                MonitoredSource.next_run_at <= now,
            ).all()
        finally:
            db.close()

        if due:
            logger.info(f"[SCHEDULER] Tick — {len(due)} monitor(s) due")

        for source in due:
            t = threading.Thread(
                target = _run_source_sync,
                args   = (source.id, "scheduler"),
                daemon = True,
                name   = f"monitor-{source.id[:8]}",
            )
            t.start()

    except Exception as e:
        logger.error(f"[SCHEDULER] Tick error: {e}")


def _run_source_sync(source_id: str, triggered_by: str) -> None:
    """
    Run a monitor cycle synchronously in a background thread.
    Creates its own DB session and asyncio event loop.
    """
    from app.core.database import SessionLocal
    from app.services.monitor_service import run_monitor

    db = SessionLocal()
    try:
        # APScheduler runs in a thread — create a fresh event loop for async work
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(
                run_monitor(source_id, db, triggered_by=triggered_by)
            )
            logger.info(
                f"[SCHEDULER] {source_id[:8]} done — "
                f"new={result.get('new_count', 0)} "
                f"changed={result.get('changed_count', 0)} "
                f"removed={result.get('removed_count', 0)}"
            )
        finally:
            loop.close()
    except Exception as e:
        logger.error(f"[SCHEDULER] Run failed for {source_id[:8]}: {e}")
    finally:
        db.close()
