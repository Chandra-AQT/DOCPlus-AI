"""
fix_sample_docs.py — Remove guest sample PDF documents from the DB
that were incorrectly showing in the admin library.
Run once: python fix_sample_docs.py
"""
import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), "docplus_ai.db")
conn = sqlite3.connect(DB_PATH)

# Find sample docs (null user_id, filename contains 'sample')
rows = conn.execute("""
    SELECT id, file_name, file_path, upload_source
    FROM documents
    WHERE user_id IS NULL
    AND (file_name LIKE '%sample%' OR upload_source = 'sample')
    ORDER BY created_at DESC
""").fetchall()

print(f"Found {len(rows)} sample/guest document(s):")
for r in rows:
    print(f"  [{r[3]}] {r[1]} ({r[0][:12]}...)")

if rows:
    # Mark them as 'sample' so admin filter excludes them
    updated = conn.execute("""
        UPDATE documents SET upload_source = 'sample'
        WHERE user_id IS NULL
        AND (file_name LIKE '%sample%' OR upload_source = 'sample')
    """)
    conn.commit()
    print(f"\nMarked {updated.rowcount} document(s) as upload_source='sample'")
    print("These will now be hidden from the admin Document Library.")
else:
    print("No sample documents found.")

conn.close()
print("\nDone.")
