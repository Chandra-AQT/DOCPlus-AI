"""
migrate_db.py — Safe database migrations for DOCPlus AI+
Run this whenever new columns are added to models.
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "docplus_ai.db")

migrations = [
    # (table, column, definition)
    ("guests",          "upload_allowed",     "BOOLEAN DEFAULT 0"),
    ("guests",          "export_allowed",     "BOOLEAN DEFAULT 0"),
    ("guests",          "full_access",        "BOOLEAN DEFAULT 0"),
    ("guests",          "is_business_email",  "BOOLEAN DEFAULT 1"),
    ("guests",          "email_verified",     "BOOLEAN DEFAULT 0"),
    ("extraction_jobs", "guest_id",           "TEXT DEFAULT NULL"),
    ("extraction_jobs", "schema_fields",      "TEXT DEFAULT NULL"),
    ("extraction_jobs", "credits_used",       "REAL DEFAULT 0"),
    ("extraction_jobs", "batch_run_id",       "TEXT DEFAULT NULL"),
    ("documents",       "upload_source",      "TEXT DEFAULT 'single'"),
    ("documents",       "batch_id",           "TEXT DEFAULT NULL"),

    # ── Feature 2: Data Lineage & Evidence Layer ──────────────────────────────
    # field_lineage is created by SQLAlchemy create_all on first run.
    # These entries handle upgrades on existing databases where the table
    # already exists but may be missing a column added in a later release.
    ("field_lineage",   "id",               "TEXT DEFAULT NULL"),
    ("field_lineage",   "job_id",           "TEXT DEFAULT NULL"),
    ("field_lineage",   "document_id",      "TEXT DEFAULT NULL"),
    ("field_lineage",   "schema_name",      "TEXT DEFAULT NULL"),
    ("field_lineage",   "field_name",       "TEXT DEFAULT NULL"),
    ("field_lineage",   "field_path",       "TEXT DEFAULT NULL"),
    ("field_lineage",   "extracted_value",  "TEXT DEFAULT NULL"),
    ("field_lineage",   "normalized_value", "TEXT DEFAULT NULL"),
    ("field_lineage",   "unit",             "TEXT DEFAULT NULL"),
    ("field_lineage",   "source_type",      "TEXT DEFAULT NULL"),
    ("field_lineage",   "source_label",     "TEXT DEFAULT NULL"),
    ("field_lineage",   "source_text",      "TEXT DEFAULT NULL"),
    ("field_lineage",   "page_number",      "INTEGER DEFAULT NULL"),
    ("field_lineage",   "section",          "TEXT DEFAULT NULL"),
    ("field_lineage",   "confidence",       "REAL DEFAULT NULL"),
    ("field_lineage",   "is_fallback",      "INTEGER DEFAULT 0"),
    ("field_lineage",   "has_error",        "INTEGER DEFAULT 0"),
    ("field_lineage",   "ai_model",         "TEXT DEFAULT NULL"),
    ("field_lineage",   "ai_provider",      "TEXT DEFAULT NULL"),
    ("field_lineage",   "extraction_date",  "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
    ("field_lineage",   "document_version", "TEXT DEFAULT NULL"),
]

def column_exists(conn, table, column):
    cursor = conn.execute(f"PRAGMA table_info({table})")
    cols = [row[1] for row in cursor.fetchall()]
    return column in cols

def run_migrations():
    print(f"Database: {DB_PATH}")
    if not os.path.exists(DB_PATH):
        print("Database not found — will be created on first run")
        return

    conn = sqlite3.connect(DB_PATH)
    applied = 0
    skipped = 0

    for table, column, definition in migrations:
        # Skip if the table doesn't exist yet (e.g. field_lineage before first run)
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
        )
        if not cursor.fetchone():
            print(f"  SKIP  {table}.{column} — table does not exist yet (created on first run)")
            skipped += 1
            continue

        if column_exists(conn, table, column):
            print(f"  SKIP  {table}.{column} — already exists")
            skipped += 1
        else:
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
                conn.commit()
                print(f"  OK    {table}.{column} {definition} — added")
                applied += 1
            except Exception as e:
                print(f"  WARN  {table}.{column} — {e}")
                skipped += 1

    # Fix existing documents that have NULL upload_source
    # Logic: if multiple docs were uploaded within the same second → they are 'batch'
    # Otherwise → 'single'
    
    # First set all NULL to 'single' as baseline
    conn.execute(
        "UPDATE documents SET upload_source = 'single' WHERE upload_source IS NULL OR upload_source = ''"
    )
    conn.commit()
    
    # Find timestamps where more than 1 document was created at the same time (batch indicator)
    # SQLite stores datetime as text — truncate to the minute to group near-simultaneous uploads
    batch_fix = conn.execute("""
        UPDATE documents 
        SET upload_source = 'batch'
        WHERE upload_source = 'single'
        AND strftime('%Y-%m-%d %H:%M', created_at) IN (
            SELECT strftime('%Y-%m-%d %H:%M', created_at)
            FROM documents
            WHERE upload_source = 'single'
            GROUP BY strftime('%Y-%m-%d %H:%M', created_at)
            HAVING COUNT(*) > 1
        )
    """)
    conn.commit()
    if batch_fix.rowcount > 0:
        print(f"  FIXED {batch_fix.rowcount} document(s) reclassified as 'batch' (uploaded at same time)")
    
    # Report final counts
    counts = conn.execute(
        "SELECT upload_source, COUNT(*) FROM documents GROUP BY upload_source"
    ).fetchall()
    for src, cnt in counts:
        print(f"  INFO  documents with upload_source='{src}': {cnt}")

    conn.close()
    print(f"\nDone: {applied} applied, {skipped} skipped")

if __name__ == "__main__":
    run_migrations()
