"""
fix_batch.py — Fix documents uploaded at the same time: mark them as 'batch'
Run once: python fix_batch.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "docplus_ai.db")

conn = sqlite3.connect(DB_PATH)

# Find all minutes where more than 1 single-source doc was created
# Those were uploaded together = batch
result = conn.execute("""
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
print(f"Fixed {result.rowcount} document(s) → upload_source='batch'")

print("\nCurrent document sources:")
rows = conn.execute(
    "SELECT file_name, upload_source, created_at FROM documents ORDER BY created_at DESC LIMIT 20"
).fetchall()
for name, src, ts in rows:
    print(f"  [{src:8}]  {name}  ({ts})")

conn.close()
print("\nDone.")
