"""
update_default_schema.py — Update default_schema_config.json with the latest
Universal Product Specification Schema from the DB (after re-uploading).
Run: python update_default_schema.py
"""
import json, sqlite3, os

DB  = os.path.join(os.path.dirname(__file__), "docplus_ai.db")
CFG = os.path.join(os.path.dirname(__file__), "default_schema_config.json")

conn = sqlite3.connect(DB)
rows = conn.execute(
    "SELECT id, name, fields, description FROM schema_definitions "
    "ORDER BY created_at DESC LIMIT 20"
).fetchall()

print("All schemas in DB:")
for r in rows:
    fields = json.loads(r[2]) if r[2] else []
    print(f"  [{r[0][:8]}] {r[1]} — {len(fields)} fields")
    if fields:
        for f in fields[:3]:
            print(f"      {f.get('name')} ({f.get('type')})")

conn.close()

# Ask which schema to use
print("\nEnter the schema ID prefix (first 8 chars) to set as default, or press Enter to use the first one:")
choice = input().strip()

conn = sqlite3.connect(DB)
if choice:
    row = conn.execute(
        "SELECT id, name, fields, description FROM schema_definitions WHERE id LIKE ?",
        (choice + '%',)
    ).fetchone()
else:
    row = conn.execute(
        "SELECT id, name, fields, description FROM schema_definitions ORDER BY created_at DESC LIMIT 1"
    ).fetchone()
conn.close()

if not row:
    print("Schema not found!")
    exit(1)

schema_id, schema_name, fields_json, desc = row
fields = json.loads(fields_json) if fields_json else []

config = {
    "schema_id":   schema_id,
    "schema_name": schema_name,
    "description": desc or "",
    "fields":      fields,
}
json.dump(config, open(CFG, 'w'), indent=2)

print(f"\nSaved to default_schema_config.json:")
print(f"  Name:   {schema_name}")
print(f"  Fields: {len(fields)}")
for f in fields:
    sub = f.get('fields', [])
    print(f"  - {f['name']} ({f['type']}){' ['+str(len(sub))+' sub-fields]' if sub else ''}")
