from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Any, Dict, Optional, List
import json
import uuid

from app.core.database import get_db
from app.core.auth import get_current_user_optional
from app.core.user_filter import filter_by_user, owned_by
from app.models.schema import SchemaDefinition
from app.models.user import User
from app.services.schema_utils import normalize_schema, validate_schema_definition

router = APIRouter(prefix="/schemas", tags=["Schemas"])


class SchemaCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    version: Optional[str] = "1.0"
    domain: Optional[str] = ""
    fields: List[Dict[str, Any]]
    record_mode: Optional[bool] = False
    record_anchor: Optional[str] = None
    domain_keywords: Optional[List[str]] = []
    reject_domain_mismatch: Optional[bool] = False


@router.post("")
async def create_schema(
    data: SchemaCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    raw = data.dict()
    validation = validate_schema_definition(raw)
    if not validation["valid"]:
        raise HTTPException(422, {"errors": validation["errors"]})
    normalized = normalize_schema(raw)
    schema_id = str(uuid.uuid4())
    schema = SchemaDefinition(
        id=schema_id,
        user_id=current_user.id if current_user else None,
        name=normalized["name"],
        description=normalized["description"],
        version=normalized["version"],
        domain=normalized.get("domain", ""),
        fields=normalized["fields"],
        record_mode=normalized.get("record_mode", False),
        record_anchor=normalized.get("record_anchor"),
        domain_keywords=normalized.get("domain_keywords", []),
        reject_domain_mismatch=normalized.get("reject_domain_mismatch", False),
        raw_definition=raw,
    )
    db.add(schema)
    db.commit()
    return {"id": schema_id, "name": schema.name, "field_count": len(schema.fields)}


@router.post("/upload")
async def upload_schema_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Upload a schema JSON file in ANY format.
    Accepts: our native format, JSON Schema, OpenAPI-style, flat key-value,
    array of field names, or any reasonable JSON structure.
    Auto-converts to internal format.
    """
    content = await file.read()
    try:
        raw = json.loads(content)
    except Exception:
        raise HTTPException(400, "Could not parse file as JSON. Make sure it is valid JSON.")

    # Auto-adapt any format to our internal schema format
    adapted = _adapt_any_schema(raw, file.filename or "uploaded_schema")

    normalized = normalize_schema(adapted)
    schema_id = str(uuid.uuid4())
    schema = SchemaDefinition(
        id=schema_id,
        user_id=current_user.id if current_user else None,
        name=normalized["name"],
        description=normalized.get("description", ""),
        version=normalized.get("version", "1.0"),
        domain=normalized.get("domain", ""),
        fields=normalized["fields"],
        record_mode=normalized.get("record_mode", False),
        record_anchor=normalized.get("record_anchor"),
        domain_keywords=normalized.get("domain_keywords", []),
        reject_domain_mismatch=normalized.get("reject_domain_mismatch", False),
        raw_definition=raw,  # keep original
    )
    db.add(schema)
    db.commit()
    return {
        "id": schema_id,
        "name": schema.name,
        "field_count": len(schema.fields),
        "adapted_from": _detect_format(raw),
    }


def _detect_format(raw: Any) -> str:
    """Detect what format the uploaded JSON is in."""
    if isinstance(raw, list):
        if raw and isinstance(raw[0], str):
            return "array_of_field_names"
        if raw and isinstance(raw[0], dict) and "name" in raw[0]:
            return "array_of_field_objects"
    if isinstance(raw, dict):
        if "fields" in raw and isinstance(raw["fields"], list):
            return "native_format"
        if "properties" in raw:
            return "json_schema"
        if "components" in raw or "paths" in raw:
            return "openapi"
        if "columns" in raw:
            return "columns_format"
        # flat dict of field_name: type or description
        if all(isinstance(v, (str, dict)) for v in raw.values()):
            return "flat_dict"
    return "unknown"


def _adapt_any_schema(raw: Any, filename: str) -> dict:
    """
    Convert ANY JSON schema format into our internal format.
    Handles every known variation:
      - JSON Schema draft 4/6/7/2019/2020 with "properties"
      - Nullable types: ["string", "null"], ["integer", "null"], ["array", "null"]
      - $schema, $defs, $ref, allOf, anyOf, oneOf wrappers
      - Our native format with "fields" list
      - Array of field name strings
      - Array of field objects
      - Flat dict {field_name: type_string}
      - Flat dict {field_name: {type, description}}
      - OpenAPI / Swagger components/definitions
      - columns array format
    """
    schema_name = filename.replace(".json", "").replace("_", " ").replace("-", " ")

    if not isinstance(raw, (dict, list)):
        return {"name": schema_name, "fields": []}

    # ── Helper: extract non-null base type from any type expression ───────────
    def _base_type(t: Any) -> str:
        """
        Resolve the actual base type from any JSON Schema type expression.
        Handles: "string", ["string","null"], ["null","integer"], "array", etc.
        """
        if not t:
            return "string"
        if isinstance(t, list):
            non_null = [x for x in t if str(x).lower().strip() != "null"]
            return str(non_null[0]).lower().strip() if non_null else "string"
        return str(t).lower().strip()

    # ── Helper: convert one JSON Schema field definition to our field dict ────
    def _convert_field(fname: str, fdef: Any, required_list: list) -> dict:
        """
        Recursively convert a JSON Schema property definition to our internal field.
        Handles: plain types, nullable types, arrays, arrays of objects,
                 nested objects, $ref (ignored), allOf/anyOf/oneOf (first entry used).
        """
        if not isinstance(fdef, dict):
            fdef = {}

        # Unwrap allOf / anyOf / oneOf — use first non-null schema
        for combiner in ("allOf", "anyOf", "oneOf"):
            if combiner in fdef:
                entries = [e for e in fdef[combiner] if isinstance(e, dict) and e.get("type") != "null"]
                if entries:
                    # Merge description from wrapper, rest from first entry
                    merged = dict(entries[0])
                    if fdef.get("description") and not merged.get("description"):
                        merged["description"] = fdef["description"]
                    if fdef.get("title") and not merged.get("title"):
                        merged["title"] = fdef["title"]
                    return _convert_field(fname, merged, required_list)

        ftype_raw = fdef.get("type", "string")
        base = _base_type(ftype_raw)
        desc = fdef.get("description") or fdef.get("title") or ""
        req  = fname in required_list

        # ── Array field ────────────────────────────────────────────────────────
        if base == "array":
            items = fdef.get("items")
            if isinstance(items, dict):
                items_base = _base_type(items.get("type", ""))
                # Array of objects → list[object] with sub-fields
                if items_base == "object" and "properties" in items:
                    sub_req = items.get("required", [])
                    sub_fields = [
                        _convert_field(sfname, sfdef, sub_req)
                        for sfname, sfdef in items["properties"].items()
                        if isinstance(sfdef, dict) or sfdef is None
                    ]
                    return {
                        "name": fname, "type": "list[object]",
                        "description": desc, "required": req,
                        "fields": sub_fields,
                    }
                # Array of scalars → list
                return {
                    "name": fname, "type": "list",
                    "description": desc, "required": req, "fields": [],
                }
            # Array with no items definition
            return {"name": fname, "type": "list", "description": desc, "required": req, "fields": []}

        # ── Object field ────────────────────────────────────────────────────────
        if base == "object" and "properties" in fdef:
            sub_req = fdef.get("required", [])
            sub_fields = [
                _convert_field(sfname, sfdef, sub_req)
                for sfname, sfdef in fdef["properties"].items()
                if isinstance(sfdef, dict) or sfdef is None
            ]
            return {
                "name": fname, "type": "object",
                "description": desc, "required": req,
                "fields": sub_fields,
            }

        # ── Scalar field ────────────────────────────────────────────────────────
        return {
            "name": fname,
            "type": _json_schema_type_to_ours(ftype_raw),
            "description": desc,
            "required": req,
            "fields": [],
        }

    # ── Format 1: Our native format — has "fields" list ──────────────────────
    if isinstance(raw, dict) and "fields" in raw and isinstance(raw["fields"], list):
        name = raw.get("name") or raw.get("title") or schema_name
        if not name:
            name = schema_name
        # Ensure each field has name and type; recursively fix list[object] sub-fields
        def _fix_native_field(f: dict) -> dict:
            if not isinstance(f, dict):
                return f
            if not f.get("type"):
                f["type"] = "string"
            # If it has sub-fields (list[object]), ensure they're also fixed
            if f.get("fields") and isinstance(f["fields"], list):
                f["fields"] = [_fix_native_field(sf) for sf in f["fields"]]
            return f
        fixed_fields = [_fix_native_field(f) for f in raw["fields"] if isinstance(f, dict)]
        return {
            "name": name,
            "description": raw.get("description", ""),
            "fields": fixed_fields,
        }

    # ── Format 2: JSON Schema — has "properties" (any draft) ─────────────────
    if isinstance(raw, dict) and "properties" in raw:
        required_fields = raw.get("required", [])
        fields = [
            _convert_field(fname, fdef, required_fields)
            for fname, fdef in raw["properties"].items()
        ]
        return {
            "name": raw.get("title") or raw.get("name") or schema_name,
            "description": raw.get("description", ""),
            "fields": fields,
        }

    # ── Format 2b: JSON Schema with $defs / definitions at top level ─────────
    if isinstance(raw, dict) and ("$defs" in raw or "definitions" in raw):
        defs = raw.get("$defs") or raw.get("definitions") or {}
        # Try to find a root schema reference or use the first definition
        if "$ref" in raw:
            ref_name = raw["$ref"].split("/")[-1]
            if ref_name in defs:
                return _adapt_any_schema(defs[ref_name], filename)
        if defs:
            first_name, first_def = next(iter(defs.items()))
            if "properties" in first_def:
                return _adapt_any_schema(first_def, first_name)

    # ── Format 3: Array of field name strings ─────────────────────────────────
    if isinstance(raw, list) and all(isinstance(x, str) for x in raw):
        return {
            "name": schema_name,
            "fields": [{"name": f.strip(), "type": "string", "description": "", "fields": []} for f in raw if f.strip()],
        }

    # ── Format 4: Array of field objects ─────────────────────────────────────
    if isinstance(raw, list) and all(isinstance(x, dict) for x in raw):
        fields = []
        for item in raw:
            fname = item.get("name") or item.get("field") or item.get("key") or item.get("column")
            if not fname:
                continue
            ftype_raw = item.get("type") or item.get("dataType") or "string"
            fields.append({
                "name": str(fname).strip(),
                "type": _json_schema_type_to_ours(ftype_raw),
                "description": item.get("description") or item.get("label") or item.get("title") or "",
                "required": bool(item.get("required", False)),
                "fields": [],
            })
        return {"name": schema_name, "description": "", "fields": fields}

    # ── Format 5: Flat dict {field_name: type_string} ─────────────────────────
    SKIP_KEYS = {"name", "version", "description", "domain", "title", "metadata",
                 "$schema", "$id", "$ref", "$defs", "definitions", "required", "additionalProperties"}
    if isinstance(raw, dict) and all(isinstance(v, str) for v in raw.values()):
        non_meta = {k: v for k, v in raw.items() if k not in SKIP_KEYS}
        if non_meta:
            return {
                "name": raw.get("name") or raw.get("title") or schema_name,
                "description": raw.get("description", ""),
                "fields": [
                    {"name": k, "type": _json_schema_type_to_ours(v), "description": "", "fields": []}
                    for k, v in non_meta.items()
                ],
            }

    # ── Format 6: Flat dict {field_name: {type, description}} ────────────────
    if isinstance(raw, dict) and all(isinstance(v, dict) for v in raw.values()):
        fields = []
        for fname, fdef in raw.items():
            if fname in SKIP_KEYS:
                continue
            ftype_raw = fdef.get("type") or fdef.get("dataType") or "string"
            fields.append({
                "name": fname,
                "type": _json_schema_type_to_ours(ftype_raw),
                "description": fdef.get("description") or fdef.get("label") or "",
                "required": bool(fdef.get("required", False)),
                "fields": [],
            })
        if fields:
            return {
                "name": raw.get("name") or schema_name,
                "description": raw.get("description", ""),
                "fields": fields,
            }

    # ── Format 7: OpenAPI / Swagger components ────────────────────────────────
    if isinstance(raw, dict) and ("components" in raw or "paths" in raw):
        schemas = (raw.get("components", {}).get("schemas", {}) or
                   raw.get("definitions", {}))
        if schemas:
            first_name, first_schema = next(iter(schemas.items()))
            return _adapt_any_schema(first_schema, first_name)

    # ── Format 8: columns array ───────────────────────────────────────────────
    if isinstance(raw, dict) and "columns" in raw:
        cols = raw["columns"]
        if isinstance(cols, list):
            fields = []
            for col in cols:
                if isinstance(col, str):
                    fields.append({"name": col, "type": "string", "description": "", "fields": []})
                elif isinstance(col, dict):
                    fname = col.get("name") or col.get("column") or col.get("field")
                    if fname:
                        fields.append({
                            "name": fname,
                            "type": _json_schema_type_to_ours(col.get("type", "string")),
                            "description": col.get("description", ""),
                            "fields": [],
                        })
            if fields:
                return {"name": raw.get("name") or schema_name, "description": "", "fields": fields}

    # ── Fallback: treat scalar top-level keys as field names ─────────────────
    if isinstance(raw, dict):
        fields = []
        for k, v in raw.items():
            if k in SKIP_KEYS:
                continue
            if isinstance(v, (str, int, float, bool, type(None))):
                fields.append({"name": k, "type": "string", "description": str(v) if v else "", "fields": []})
        if fields:
            return {
                "name": raw.get("name") or raw.get("title") or schema_name,
                "description": raw.get("description", ""),
                "fields": fields,
            }

    # Last resort
    return {"name": schema_name, "description": "", "fields": [{"name": "value", "type": "string", "description": "Extracted value", "fields": []}]}


def _json_schema_type_to_ours(t: Any) -> str:
    """
    Map JSON Schema / common type strings to our supported types.
    Handles:
      - plain string: "string", "integer", "array", etc.
      - nullable list: ["string", "null"], ["integer", "null"], ["array", "null"]
      - Python list passed directly (not stringified)
    """
    if not t:
        return "string"
    mapping = {
        "string": "string", "str": "string", "text": "string", "varchar": "string",
        "number": "number", "float": "number", "double": "number", "decimal": "number",
        "integer": "integer", "int": "integer", "long": "integer", "bigint": "integer",
        "boolean": "boolean", "bool": "boolean",
        "date": "date", "datetime": "date", "timestamp": "date",
        "currency": "currency", "money": "currency", "price": "currency",
        "email": "email",
        "phone": "phone", "tel": "phone", "telephone": "phone",
        "url": "url", "uri": "url", "link": "url",
        "array": "list", "list": "list",
        "object": "object", "dict": "object", "map": "object",
    }
    # Handle Python list directly: ["string", "null"] or ["integer", "null"]
    if isinstance(t, list):
        non_null = [x for x in t if str(x).lower() != "null"]
        if non_null:
            return mapping.get(str(non_null[0]).lower().strip(), "string")
        return "string"
    # Plain string
    t_str = str(t).lower().strip()
    # Handle JSON-stringified array type: '["string", "null"]'
    if t_str.startswith("["):
        try:
            import ast
            types = ast.literal_eval(t_str)
            if isinstance(types, list):
                non_null = [x for x in types if str(x).lower() != "null"]
                if non_null:
                    return mapping.get(str(non_null[0]).lower().strip(), "string")
        except Exception:
            pass
    return mapping.get(t_str, "string")


@router.post("/from-text")
async def schema_from_text(data: dict, db: Session = Depends(get_db)):
    """Accept any raw JSON dict and auto-adapt to schema format."""
    adapted = _adapt_any_schema(data, data.get("name", "imported_schema"))
    normalized = normalize_schema(adapted)
    schema_id = str(uuid.uuid4())
    schema = SchemaDefinition(
        id=schema_id,
        name=normalized["name"],
        description=normalized.get("description", ""),
        fields=normalized["fields"],
        raw_definition=data
    )
    db.add(schema)
    db.commit()
    return {"id": schema_id, "name": schema.name, "field_count": len(schema.fields)}


@router.post("/validate")
async def validate_schema(data: dict):
    return validate_schema_definition(data)


@router.get("")
async def list_schemas(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    query = db.query(SchemaDefinition).order_by(SchemaDefinition.created_at.desc())
    query = filter_by_user(query, current_user, SchemaDefinition)
    schemas = query.all()
    return {"schemas": [
        {
            "id": s.id,
            "name": s.name,
            "description": s.description,
            "domain": s.domain,
            "field_count": len(s.fields or []),
            "fields": s.fields or [],
            "record_mode": s.record_mode,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in schemas
    ]}


@router.get("/{schema_id}")
async def get_schema(schema_id: str, db: Session = Depends(get_db)):
    schema = db.query(SchemaDefinition).filter(SchemaDefinition.id == schema_id).first()
    if not schema:
        raise HTTPException(404, "Schema not found")
    return {
        "id": schema.id,
        "name": schema.name,
        "description": schema.description,
        "version": schema.version,
        "domain": schema.domain,
        "fields": schema.fields,
        "record_mode": schema.record_mode,
        "record_anchor": schema.record_anchor,
        "domain_keywords": schema.domain_keywords,
        "reject_domain_mismatch": schema.reject_domain_mismatch,
        "created_at": schema.created_at.isoformat() if schema.created_at else None
    }


@router.put("/{schema_id}")
async def update_schema(schema_id: str, data: SchemaCreate, db: Session = Depends(get_db)):
    schema = db.query(SchemaDefinition).filter(SchemaDefinition.id == schema_id).first()
    if not schema:
        raise HTTPException(404, "Schema not found")

    raw = data.dict()
    validation = validate_schema_definition(raw)
    if not validation["valid"]:
        raise HTTPException(422, {"errors": validation["errors"]})

    normalized = normalize_schema(raw)
    schema.name = normalized["name"]
    schema.description = normalized.get("description", "")
    schema.domain = normalized.get("domain", "")
    schema.fields = normalized["fields"]
    schema.record_mode = normalized.get("record_mode", False)
    schema.record_anchor = normalized.get("record_anchor")
    schema.domain_keywords = normalized.get("domain_keywords", [])
    schema.reject_domain_mismatch = normalized.get("reject_domain_mismatch", False)
    schema.raw_definition = raw
    db.commit()
    return {"id": schema_id, "name": schema.name}


@router.delete("/{schema_id}")
async def delete_schema(
    schema_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    schema = db.query(SchemaDefinition).filter(SchemaDefinition.id == schema_id).first()
    if not schema:
        raise HTTPException(404, "Schema not found")
    if not owned_by(current_user, schema):
        raise HTTPException(403, "Access denied")
    db.delete(schema)
    db.commit()
    return {"deleted": schema_id}


@router.get("/sample")
async def download_sample_schema():
    """Download a sample schema JSON file showing the correct format."""
    sample = {
        "name": "my_equipment_schema",
        "description": "Schema for extracting equipment specifications",
        "version": "1.0",
        "domain": "foodservice_equipment",
        "fields": [
            {
                "name": "manufacturer",
                "type": "string",
                "description": "Official manufacturer or brand name of the equipment"
            },
            {
                "name": "model_number",
                "type": "string",
                "description": "Exact model number as written in the document"
            },
            {
                "name": "product_description_mfg",
                "type": "string",
                "description": "Manufacturer product description"
            },
            {
                "name": "heat_type",
                "type": "string",
                "description": "Heating source: Electric, Gas, Induction, etc."
            },
            {
                "name": "width_in",
                "type": "number",
                "description": "Overall equipment width in inches"
            },
            {
                "name": "height_in",
                "type": "number",
                "description": "Overall equipment height in inches"
            },
            {
                "name": "length_in",
                "type": "number",
                "description": "Overall equipment depth/length in inches"
            },
            {
                "name": "shipping_weight_lbs",
                "type": "number",
                "description": "Shipping weight in pounds"
            },
            {
                "name": "nominal_output_heating_elec_kw",
                "type": "number",
                "description": "Nominal electric heating output in kW"
            },
            {
                "name": "power_supply_configuration_volts_hertz_phase",
                "type": "string",
                "description": "Power supply in Volts/Hz/Phase format e.g. 208/60/3"
            }
        ]
    }
    return JSONResponse(
        content=sample,
        headers={"Content-Disposition": "attachment; filename=sample_schema.json"}
    )
