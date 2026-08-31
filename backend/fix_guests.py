"""
fix_guests.py — Clean up accidental guest records
Run: python fix_guests.py
"""
import sqlite3, os

DB = os.path.join(os.path.dirname(__file__), "docplus_ai.db")
conn = sqlite3.connect(DB)

print("Current guests:")
rows = conn.execute("SELECT id, first_name, last_name, email, created_at FROM guests ORDER BY created_at DESC").fetchall()
for r in rows:
    print(f"  {r[1]} {r[2]} | {r[3]} | {r[4]}")

# Remove accidental "Returning User" records (first_name='Returning', last_name='User')
deleted = conn.execute("""
    DELETE FROM guests WHERE first_name='Returning' AND last_name='User'
""")
conn.commit()
print(f"\nDeleted {deleted.rowcount} accidental 'Returning User' record(s)")

# Remove duplicate emails — keep only the OLDEST (first registered)
dups = conn.execute("""
    SELECT email, COUNT(*) as cnt FROM guests GROUP BY email HAVING cnt > 1
""").fetchall()
for email, cnt in dups:
    print(f"\nDuplicate email: {email} ({cnt} records)")
    # Keep the oldest, delete the rest
    deleted2 = conn.execute("""
        DELETE FROM guests WHERE email=? AND id NOT IN (
            SELECT id FROM guests WHERE email=? ORDER BY created_at ASC LIMIT 1
        )
    """, (email, email))
    conn.commit()
    print(f"  Deleted {deleted2.rowcount} duplicate(s)")

print("\nFinal guests:")
rows = conn.execute("SELECT first_name, last_name, email, created_at FROM guests ORDER BY created_at DESC").fetchall()
for r in rows:
    print(f"  {r[0]} {r[1]} | {r[2]} | {r[3]}")

conn.close()
print("\nDone.")
