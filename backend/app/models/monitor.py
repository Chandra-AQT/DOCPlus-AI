"""
monitor.py — Feature 1: Continuous Document Intelligence

Two models:

MonitoredSource
  Represents a manufacturer website URL that DOCPlus watches on a schedule.
  Each run crawls the URL, detects changes, downloads new/changed docs,
  and optionally re-runs extraction.

MonitorRun
  One record per execution of a monitored source.
  Stores what was found, what changed, and any errors.
"""
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, JSON, Index
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class MonitoredSource(Base):
    __tablename__ = "monitored_sources"

    # ── Identity ──────────────────────────────────────────────────────────────
    id          = Column(String, primary_key=True, default=gen_uuid)
    user_id     = Column(String, nullable=True, index=True)
    name        = Column(String, nullable=False)          # e.g. "Carrier HVAC Docs"
    url         = Column(String, nullable=False)          # seed URL to crawl

    # ── Filter settings (mirror DocPlus discovery filters) ────────────────────
    formats     = Column(JSON, default=list)              # ["pdf", "word", …]
    doc_types   = Column(JSON, default=list)              # ["PSS", "IOM", …]

    # ── Schedule ──────────────────────────────────────────────────────────────
    # schedule values: "manual" | "hourly" | "daily" | "weekly"
    schedule    = Column(String, default="daily")
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)

    # ── Auto-extraction ───────────────────────────────────────────────────────
    # If schema_id is set, newly discovered / changed docs are automatically
    # parsed and extracted using that schema after download.
    auto_extract   = Column(Boolean, default=False)
    schema_id      = Column(String, nullable=True)        # FK → schemas.id
    provider       = Column(String, nullable=True)        # e.g. "landingai"
    provider_model = Column(String, nullable=True)

    # ── Status ────────────────────────────────────────────────────────────────
    # status values: "active" | "paused" | "error" | "running"
    status      = Column(String, default="active")
    error       = Column(Text, nullable=True)             # last error message if any

    # ── Stats (denormalised from latest run for fast dashboard display) ────────
    total_docs_seen = Column(Integer, default=0)          # cumulative unique docs ever found
    last_new_count  = Column(Integer, default=0)          # new docs in last run
    last_changed_count = Column(Integer, default=0)       # changed docs in last run
    last_removed_count = Column(Integer, default=0)       # removed docs in last run

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_monitor_source_user",   "user_id"),
        Index("ix_monitor_source_status", "status"),
        Index("ix_monitor_source_next",   "next_run_at"),
    )


class MonitorRun(Base):
    __tablename__ = "monitor_runs"

    # ── Identity ──────────────────────────────────────────────────────────────
    id        = Column(String, primary_key=True, default=gen_uuid)
    source_id = Column(String, nullable=False, index=True)  # FK → monitored_sources.id

    # ── Execution metadata ────────────────────────────────────────────────────
    run_at           = Column(DateTime, server_default=func.now())
    duration_seconds = Column(Float, nullable=True)
    triggered_by     = Column(String, default="scheduler")  # "scheduler" | "manual"

    # ── Crawl results ─────────────────────────────────────────────────────────
    pages_crawled = Column(Integer, default=0)
    docs_found    = Column(Integer, default=0)     # total unique docs in this crawl

    # ── Change counts ─────────────────────────────────────────────────────────
    new_count     = Column(Integer, default=0)
    changed_count = Column(Integer, default=0)
    removed_count = Column(Integer, default=0)

    # ── Change detail ─────────────────────────────────────────────────────────
    # JSON list of change objects:
    # [
    #   {
    #     "url":         "https://…/datasheet.pdf",
    #     "filename":    "datasheet.pdf",
    #     "change_type": "new" | "changed" | "removed",
    #     "old_hash":    "md5…" | null,
    #     "new_hash":    "md5…" | null,
    #     "doc_id":      "uuid" | null,   # Document record ID if downloaded
    #     "job_id":      "uuid" | null,   # ExtractionJob ID if auto-extracted
    #     "format":      "pdf" | …,
    #     "doc_type":    "PSS" | …,
    #   },
    #   …
    # ]
    changes = Column(JSON, default=list)

    # ── Snapshot ──────────────────────────────────────────────────────────────
    # Full URL→hash map from this run.
    # Stored so the next run can diff against it.
    # { "https://…/file.pdf": "md5hash", … }
    snapshot = Column(JSON, default=dict)

    # ── Status ────────────────────────────────────────────────────────────────
    # status values: "running" | "completed" | "failed"
    status = Column(String, default="running")
    error  = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_monitor_run_source",    "source_id"),
        Index("ix_monitor_run_run_at",    "run_at"),
        Index("ix_monitor_run_status",    "status"),
    )
