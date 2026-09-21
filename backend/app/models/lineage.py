"""
lineage.py — FieldLineage model for Feature 2: Data Lineage & Evidence Layer.

One row is written per extracted field per job.
This makes every value in every extraction fully traceable to its origin.
"""
from sqlalchemy import Column, String, Integer, Float, DateTime, Text, Index
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class FieldLineage(Base):
    __tablename__ = "field_lineage"

    # ── Identity ──────────────────────────────────────────────────────────────
    id             = Column(String, primary_key=True, default=gen_uuid)
    job_id         = Column(String, nullable=False, index=True)   # FK → extraction_jobs.id
    document_id    = Column(String, nullable=False, index=True)   # FK → documents.id
    schema_name    = Column(String, nullable=True)

    # ── Field identity ────────────────────────────────────────────────────────
    field_name     = Column(String, nullable=False)               # e.g. "ManufacturerName"
    field_path     = Column(String, nullable=True)                # e.g. "models[2].Capacity" for nested fields

    # ── Values ────────────────────────────────────────────────────────────────
    extracted_value   = Column(Text, nullable=True)               # raw extracted value (as string)
    normalized_value  = Column(Text, nullable=True)               # post-normalization value
    unit              = Column(String, nullable=True)             # e.g. "BTU", "kW", "V"

    # ── Provenance ────────────────────────────────────────────────────────────
    source_type    = Column(String, nullable=True)
    # Values: table | kv | text | text_pattern | ai:openai | ai:anthropic |
    #         ai:gemini | ai:groq | ai:grok | ai:perplexity | ai:emergence |
    #         landingai_ade | regex_pattern | fallback | heuristic_rescued

    source_label   = Column(String, nullable=True)
    # The column header, KV key, or label that matched.
    # e.g. "Column 'Manufacturer'" or "cooling capacity"

    source_text    = Column(Text, nullable=True)
    # The exact snippet from the document where the value was found (max ~500 chars).

    page_number    = Column(Integer, nullable=True)               # 1-based page number if known
    section        = Column(String, nullable=True)                # heading/section context if known

    # ── Quality ───────────────────────────────────────────────────────────────
    confidence     = Column(Float, nullable=True)                 # 0.0 – 1.0
    is_fallback    = Column(Integer, default=0)                   # 1 if value came from schema fallback
    has_error      = Column(Integer, default=0)                   # 1 if validation failed on this field

    # ── Extraction metadata ───────────────────────────────────────────────────
    ai_model          = Column(String, nullable=True)             # e.g. "gpt-4o-mini"
    ai_provider       = Column(String, nullable=True)             # e.g. "openai"
    extraction_date   = Column(DateTime, server_default=func.now())
    document_version  = Column(String, nullable=True)             # from document metadata if available

    # ── Indexes for fast queries ──────────────────────────────────────────────
    __table_args__ = (
        Index("ix_lineage_job_field",      "job_id",      "field_name"),
        Index("ix_lineage_doc_field",      "document_id", "field_name"),
        Index("ix_lineage_source_type",    "source_type"),
        Index("ix_lineage_confidence",     "confidence"),
    )
