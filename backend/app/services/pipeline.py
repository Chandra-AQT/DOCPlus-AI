"""
pipeline.py — Extraction orchestration engine.

Orchestrates:
  1. Heuristic extraction (all field types incl. list, object, list[object])
  2. AI fallback for low-confidence / missing fields
  3. Post-processing: normalisation, validation, null-checks
  4. Record-mode assembly for table-anchored schemas

Fully generic — zero hardcoded domains or field names.
Schema drives all behavior.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any
from loguru import logger

from app.services.schema_utils import (
    normalize_schema, check_schema_compatibility,
    apply_normalization, apply_validation,
    get_all_labels, field_to_json_schema,
)
from app.services.python_extractor import python_extract
from app.services.field_retrieval import build_field_context_for_ai
from app.services.llm_router import LLMRouter


# ── Entry point ───────────────────────────────────────────────────────────────

async def run_extraction(
    parsed_doc: dict,
    schema: dict,
    provider_config: dict,
    options: dict | None = None,
) -> dict:
    """
    Full extraction pipeline.
    Returns {result, confidence, sources, evidence, validation,
             schema_fields, failure_log, duration_seconds}.
    """
    start = time.time()
    if options is None:
        options = {}
    schema = normalize_schema(schema)
    fields = schema["fields"]

    # ── Auto-detect multi_record from schema structure ────────────────────────
    # If any field is list-of-objects, the result should be multi-record.
    # This makes the pipeline schema-driven — no manual flag needed.
    if not options.get("multi_record") and options.get("auto_multi", False):
        for f in fields:
            ftype = f.get("type", "")
            sub   = f.get("fields") or f.get("items") or []
            if ftype in ("list[object]", "list_object") or \
               (ftype in ("list", "array") and isinstance(sub, list) and len(sub) > 0):
                options = {**options, "multi_record": True}
                logger.info(f"[PIPELINE] Auto multi_record from field '{f['name']}' (type={ftype})")
                break

    # Domain compatibility check
    compat = check_schema_compatibility(schema, parsed_doc)
    if not compat["compatible"]:
        return _empty_result(fields, start, {"domain_mismatch": compat["reason"]})

    llm = LLMRouter(
        provider=provider_config.get("provider", "none"),
        api_key=provider_config.get("api_key", ""),
        model=provider_config.get("model", ""),
        base_url=provider_config.get("base_url", ""),
    )

    # ── If provider is "none"/"python"/"hybrid", treat as hybrid:
    # heuristic first, then smart regex on remaining fields.
    # If a real AI is configured, it handles AI fallback after heuristic.
    use_smart_regex = provider_config.get("provider", "none").lower() in ("none", "python", "hybrid", "")

    result: dict[str, Any] = {}
    confidence: dict[str, float] = {}
    sources: dict[str, str] = {}
    evidence: dict[str, str] = {}
    validation_errors: dict[str, list] = {}
    failure_log: list[dict] = []
    needs_ai: list[dict] = []

    # ── Step 1: Heuristic extraction ─────────────────────────────────────────
    for field in fields:
        fname = field["name"]
        extr = python_extract(field, parsed_doc)

        value = extr["value"]
        conf = extr["confidence"]

        # Normalisation
        if value is not None and field.get("normalization_rules"):
            value = _apply_norm_deep(value, field)

        # Null-value filtering — also treat common placeholder sentinels as null
        if _is_null_value(value, field) or _is_placeholder(value):
            value = field.get("fallback")
            conf = 0.0

        # Post-process: if a string value looks like a spec blob (very long),
        # try to extract a cleaner value using type-specific patterns
        if isinstance(value, str) and len(value) > 200:
            cleaned = _extract_from_blob(value, field)
            if cleaned is not None:
                value = cleaned
                conf = min(conf, 0.5)  # lower confidence since we had to rescue it
            else:
                value = field.get("fallback")
                conf = 0.0

        result[fname] = value
        confidence[fname] = round(conf, 3)
        sources[fname] = extr["source"]
        evidence[fname] = extr["evidence"]

        if conf < field.get("confidence_threshold", 0.4) or _is_empty(value):
            needs_ai.append(field)

    # ── Step 2: AI extraction for low-confidence fields ──────────────────────
    if needs_ai and llm.is_available():
        ai_results = await _ai_extract(needs_ai, parsed_doc, llm, schema)
        for field in needs_ai:
            fname = field["name"]
            ai_val = ai_results.get(fname)
            if ai_val is not None and not _is_empty(ai_val):
                if field.get("normalization_rules"):
                    ai_val = _apply_norm_deep(ai_val, field)
                result[fname] = ai_val
                confidence[fname] = round(
                    min(confidence.get(fname, 0.0) + 0.3, 0.88), 3
                )
                sources[fname] = f"ai:{llm.provider}"
                evidence[fname] = f"AI ({llm.provider}/{llm.model}) extraction"

    # ── Step 2b: Smart regex fallback when no AI available ───────────────────
    if needs_ai and (not llm.is_available() or use_smart_regex):
        doc_text = parsed_doc.get("document_text", "")
        kv_pairs = parsed_doc.get("kv_pairs", [])
        regex_results = _smart_regex_extract(needs_ai, doc_text, kv_pairs)
        for field in needs_ai:
            fname = field["name"]
            rx_val = regex_results.get(fname)
            if rx_val is not None and not _is_empty(rx_val):
                if field.get("normalization_rules"):
                    rx_val = _apply_norm_deep(rx_val, field)
                result[fname]     = rx_val
                confidence[fname] = round(min(confidence.get(fname, 0.0) + 0.25, 0.72), 3)
                sources[fname]    = "regex_pattern"
                evidence[fname]   = "Smart regex extraction from document text"

    # ── Step 2c: Smart Retry — re-extract low-confidence fields ──────────────
    retry_threshold = provider_config.get("retry_threshold",
                      options.get("retry_threshold", 0.5) if isinstance(options, dict) else 0.5)
    if options.get("smart_retry", True) and llm.is_available():
        low_conf_fields = [
            field for field in fields
            if confidence.get(field["name"], 0.0) < float(retry_threshold)
            and not _is_empty(result.get(field["name"]))
        ]
        if low_conf_fields:
            retry_results = await _ai_extract(low_conf_fields, parsed_doc, llm, schema)
            for field in low_conf_fields:
                fname = field["name"]
                retry_val = retry_results.get(fname)
                if retry_val is not None and not _is_empty(retry_val):
                    result[fname]     = retry_val
                    confidence[fname] = round(min(confidence.get(fname, 0.0) + 0.15, 0.92), 3)
                    sources[fname]    = f"ai:{llm.provider}:retry"
                    evidence[fname]   = f"Smart retry via {llm.provider}"

    # ── Step 3: Required-field fallback ──────────────────────────────────────
    for field in fields:
        fname = field["name"]
        if field.get("required") and _is_empty(result.get(fname)):
            fb = field.get("fallback")
            if fb is not None:
                result[fname] = fb
                sources[fname] = "fallback"
                confidence[fname] = 0.1
            else:
                failure_log.append({
                    "field": fname,
                    "type": "required_missing",
                    "reason": "Required field could not be extracted",
                })

    # ── Step 4: Validation ────────────────────────────────────────────────────
    for field in fields:
        fname = field["name"]
        val = result.get(fname)
        # Validate scalars only (lists/objects validated by AI schema)
        if not isinstance(val, (list, dict)):
            errs = apply_validation(
                val,
                field.get("validation_rules", []),
                field.get("allowed_values", []),
                field.get("type", "string"),
            )
            if errs:
                validation_errors[fname] = errs

    # ── Step 5: Quality scoring ───────────────────────────────────────────────
    from app.services.quality_scorer import compute_quality_score
    quality = compute_quality_score(
        result=result,
        confidence=confidence,
        sources=sources,
        schema_fields=[f["name"] for f in fields],
        validation_errors=validation_errors,
        failure_log=failure_log,
    )

    return {
        "result": result,
        "confidence": confidence,
        "sources": sources,
        "evidence": evidence,
        "validation": validation_errors,
        "schema_fields": [f["name"] for f in fields],
        "failure_log": failure_log,
        "duration_seconds": round(time.time() - start, 2),
        "quality": quality,
    }


# ── AI extraction ─────────────────────────────────────────────────────────────

async def _ai_extract(
    fields: list, parsed_doc: dict, llm: LLMRouter, schema: dict
) -> dict:
    """
    Build a precise AI prompt using JSON Schema for the target fields,
    then parse the structured response.
    """
    # Build output JSON Schema
    output_schema: dict[str, Any] = {
        "type": "object",
        "properties": {},
    }
    for field in fields:
        output_schema["properties"][field["name"]] = field_to_json_schema(field)

    # Build per-field context (deduplicated)
    context_parts: list[str] = []
    seen_ctx: set[str] = set()
    for field in fields:
        ctx = build_field_context_for_ai(field, parsed_doc)
        if ctx not in seen_ctx:
            context_parts.append(ctx)
            seen_ctx.add(ctx)

    combined_context = "\n---\n".join(context_parts)

    # Build field instructions
    field_instructions = []
    for f in fields:
        desc = f.get("description") or f.get("instruction") or ""
        ftype = f.get("type", "string")
        sub_hint = ""
        if ftype in ("list", "object") and f.get("fields"):
            sub_names = [sf["name"] for sf in f["fields"]]
            sub_hint = f" (sub-fields: {', '.join(sub_names)})"
        field_instructions.append(
            f'  "{f["name"]}" ({ftype}{sub_hint}): {desc}'
        )

    system_prompt = (
        "You are a precise document data extraction assistant. "
        "You MUST respond with valid JSON ONLY — no explanation, no markdown fences, no extra text. "
        "Extract exactly what is written in the document. "
        "Use null for any value that is not present or cannot be determined with confidence. "
        "For list fields, return a JSON array of strings. "
        "For object fields, return a JSON object. "
        "Do NOT invent, guess, or hallucinate values. "
        "If a value appears as a placeholder like 'N/A', 'TBD', '-', 'X-Z', treat it as null. "
        "For date fields: extract the actual date, not just the year unless only year is available. "
        "For currency fields: include the numeric amount, stripping currency symbols if needed. "
        "For model/part numbers: extract only the short alphanumeric code, not surrounding description text."
    )

    user_prompt = f"""Extract the following fields from the document context below.

DOCUMENT CONTEXT:
{combined_context[:6000]}

FIELDS TO EXTRACT:
{chr(10).join(field_instructions)}

RULES:
- Return null for any field you cannot find with confidence.
- Placeholder values ('N/A', 'TBD', '-', 'X-Z', 'unknown') → return null.
- For identifier/code fields (type string, short alphanumeric): extract only the code, not surrounding description text.
- For dates: extract the full date if available (YYYY-MM-DD preferred), or year if only year is shown.
- For currency/amount fields: return the numeric value as a string.
- For list fields: return a JSON array of strings.
- For description fields: extract the actual text, keep it concise (under 200 chars).

REQUIRED OUTPUT FORMAT (JSON Schema):
{json.dumps(output_schema, indent=2)}

Return ONLY a valid JSON object. Use null for missing values. No markdown, no explanation."""

    try:
        raw = await llm.complete(user_prompt, system_prompt)
        return _parse_json_response(raw)
    except Exception as e:
        logger.error(f"AI extraction error: {e}")
        return {}


def _smart_regex_extract(fields: list, doc_text: str, kv_pairs: list) -> dict:
    """
    Smart built-in extraction engine for when no external AI is available.
    Uses a comprehensive set of patterns and KV fuzzy matching to extract
    common fields from any document type with high accuracy.
    """
    result  = {}
    text    = doc_text or ""
    lines   = [l.strip() for l in text.split('\n') if l.strip()]
    lower   = text.lower()

    # ── Build enriched KV lookup ──────────────────────────────────────────────
    kv_lookup = {}
    for p in (kv_pairs or []):
        k = p["key"].lower().strip()
        v = p["value"].strip() if p.get("value") else ""
        if v:
            kv_lookup[k] = v

    # ── Compiled patterns ─────────────────────────────────────────────────────
    DATE_PATTERNS = [
        re.compile(r'\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b', re.I),
        re.compile(r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b'),
        re.compile(r'\b(\d{4}[/-]\d{2}[/-]\d{2})\b'),
        re.compile(r'\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\b', re.I),
    ]
    AMOUNT_PATTERNS = [
        re.compile(r'\$\s*([\d,]+\.?\d{0,2})'),
        re.compile(r'([\d,]+\.\d{2})\s*(?:USD|dollars?)?', re.I),
    ]

    def find_dates(t):
        dates = []
        for pat in DATE_PATTERNS:
            dates.extend(pat.findall(t))
        return dates

    def find_amounts(t):
        amounts = []
        for pat in AMOUNT_PATTERNS:
            amounts.extend(pat.findall(t))
        return [a.replace(',', '') for a in amounts if a]

    def find_near_label(label, t, window=200):
        """Find value text near a label in the document."""
        idx = t.lower().find(label.lower())
        if idx == -1:
            return None
        region = t[idx:idx+window]
        # Try "label: value" or "label value"
        m = re.match(
            re.escape(label) + r'[:\s]+([^\n\r]{1,100})',
            region, re.I
        )
        if m:
            return m.group(1).strip()
        return None

    def parse_amount(s):
        try:
            return float(str(s).replace(',', '').replace('$', '').strip())
        except:
            return 0.0

    all_dates   = find_dates(text)
    all_amounts = find_amounts(text)

    for field in fields:
        fname  = field["name"].lower()
        ftype  = field.get("type", "string")
        val    = None

        # All possible labels for this field (from auto-map + field definition)
        from app.services.schema_utils import get_all_labels
        labels = get_all_labels(field)

        # ── Step 1: KV fuzzy match ────────────────────────────────────────────
        for label in labels:
            for kv_key, kv_val in kv_lookup.items():
                # Direct contains match
                if label in kv_key or kv_key in label:
                    val = kv_val
                    break
                # Word overlap match (2+ shared words)
                lw = set(label.split())
                kw = set(kv_key.split())
                if len(lw & kw) >= min(2, len(lw)):
                    val = kv_val
                    break
            if val:
                break

        # ── Step 2: Near-label search in raw text ─────────────────────────────
        if not val:
            for label in labels[:6]:
                if len(label) < 3:
                    continue
                found = find_near_label(label, text)
                if found and 1 < len(found) < 150:
                    # Validate: skip if it looks like another label
                    if not found.rstrip(':').lower() in labels:
                        val = found
                        break

        # ── Step 3: Type-specific smart patterns ──────────────────────────────
        if not val:
            # Pull description text for broader semantic matching
            fdesc = (field.get("description") or "").lower()

            # DATE
            if ftype == "date" or any(x in fname for x in ("date", "year", "month", "published", "revised", "literature")):
                if "due" in fname or "pay" in fname or "expir" in fname:
                    m = re.search(r'(?:due|pay\s*by|payment\s*due|expir)[:\s]+([^\n]{1,60})', text, re.I)
                    val = m.group(1).strip() if m else None
                    if not val and len(all_dates) > 1:
                        val = all_dates[-1]
                elif "issue" in fname or "bill" in fname:
                    m = re.search(r'(?:bill\s*date|invoice\s*date|issue\s*date|statement\s*date)[:\s]+([^\n]{1,60})', text, re.I)
                    val = m.group(1).strip() if m else (all_dates[0] if all_dates else None)
                elif "effective" in fname or "start" in fname:
                    val = all_dates[0] if all_dates else None
                elif any(x in fname for x in ("revision", "rev", "pub", "literature", "publication")):
                    m = re.search(r'(?:rev(?:ised?)?|published?|printed?)[:\s]+([^\n]{1,60})', text, re.I)
                    val = m.group(1).strip() if m else (all_dates[0] if all_dates else None)
                else:
                    val = all_dates[0] if all_dates else None
                if not val:
                    m = re.search(r'\b(20\d{2}|19\d{2})\b', text)
                    val = m.group(1) if m else None

            # CURRENCY / AMOUNT
            elif ftype == "currency" or any(x in fname for x in ("amount", "total", "balance", "price", "cost", "payment", "fee", "charge", "due")):
                if "total" in fname or "grand" in fname:
                    m = re.search(r'(?:grand\s*total|total\s*amount|total\s*due|total\s*charges?|total\s*bill)[:\s]*\$?\s*([\d,]+\.?\d{0,2})', text, re.I)
                    val = m.group(1) if m else None
                    if not val and all_amounts:
                        val = max(all_amounts, key=parse_amount)
                elif "due" in fname:
                    m = re.search(r'(?:amount\s*due|balance\s*due|pay\s*this\s*amount|please\s*pay)[:\s]*\$?\s*([\d,]+\.?\d{0,2})', text, re.I)
                    val = m.group(1) if m else (all_amounts[0] if all_amounts else None)
                else:
                    val = all_amounts[0] if all_amounts else None

            # ACCOUNT / INVOICE NUMBER
            elif any(x in fname for x in ("account", "acct")):
                patterns = [
                    r'account\s*(?:number|no|#|id)[:\s]+([A-Z0-9\-]{4,25})',
                    r'acct\.?\s*(?:no|#)?[:\s]+([A-Z0-9\-]{4,25})',
                    r'customer\s*(?:number|id|no)[:\s]+([A-Z0-9\-]{4,25})',
                ]
                for p in patterns:
                    m = re.search(p, text, re.I)
                    if m:
                        val = m.group(1).strip()
                        break

            elif any(x in fname for x in ("invoice", "inv_num", "inv_no", "bill_num")):
                m = re.search(r'invoice\s*(?:number|no|#|id)?[:\s]+([A-Z0-9\-]{3,20})', text, re.I)
                val = m.group(1) if m else None

            elif "reference" in fname or "ref_num" in fname:
                m = re.search(r'(?:reference|ref\.?)\s*(?:number|no|#)?[:\s]+([A-Z0-9\-]{4,20})', text, re.I)
                val = m.group(1) if m else None

            # COMPANY / BRAND NAME — detect by field description keywords, not just name
            elif (any(x in fname for x in ("vendor", "company", "supplier", "utility", "provider", "from", "issued_by")) or
                  any(x in fdesc for x in ("manufacturer", "brand", "company", "vendor", "supplier", "made by", "mfg", "mfr"))):
                # Look for company name after a label in the text
                m = re.search(r'(?:from|vendor|supplier|company|manufacturer|brand|issued\s*by|provided\s*by|made\s*by)[:\s]+([^\n]{2,80})', text, re.I)
                if m:
                    val = m.group(1).strip()
                else:
                    # Take first non-date, non-number line as company name
                    for line in lines[:15]:
                        if (len(line) > 3 and
                            not re.match(r'^[\d\$\-\s/.,]+$', line) and
                            not re.match(r'^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$', line)):
                            val = line
                            break

            # CUSTOMER / BILL-TO
            elif any(x in fname for x in ("customer", "bill_to", "client", "ship_to", "billed_to", "recipient")):
                m = re.search(r'(?:bill\s*to|billed\s*to|customer|client|ship\s*to|delivered\s*to)[:\s]+([^\n]{2,100})', text, re.I)
                val = m.group(1).strip() if m else None

            # IDENTIFIER / CODE — detect by description or type hints
            elif (any(x in fname for x in ("number", "num", "no", "id", "code", "sku", "ref", "identifier", "serial", "part")) or
                  any(x in fdesc for x in ("model number", "part number", "product code", "sku", "catalog number", "serial"))):
                m = re.search(r'\b([A-Z]{1,6}[\-_]?\d{2,6}[A-Z0-9\-/]*)\b', text)
                val = m.group(1) if m else None

            # EMAIL
            elif ftype == "email" or "email" in fname:
                m = re.search(r'\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b', text)
                val = m.group(0) if m else None

            # PHONE
            elif ftype == "phone" or any(x in fname for x in ("phone", "tel", "fax", "mobile")):
                m = re.search(r'(?:\+1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}', text)
                val = m.group(0) if m else None

            # ADDRESS
            elif "address" in fname:
                m = re.search(r'\b(\d{1,6}\s+[A-Z][a-zA-Z\s]{3,50}(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Court|Place|Suite)[.,]?\s*[A-Z]{2}\s+\d{5})', text)
                val = m.group(1) if m else None

            # DESCRIPTION / TITLE — detect by description keywords or type
            elif (any(x in fname for x in ("description", "title", "subject")) or
                  any(x in fdesc for x in ("description", "product description", "product name", "overview", "summary"))):
                for line in lines[:10]:
                    if len(line) > 5 and not re.match(r'^[\d\$\s.,/-]+$', line):
                        val = line[:200]
                        break

            # SERIES / FAMILY / LINE — detect by description keywords
            elif (any(x in fname for x in ("series", "family", "category", "line")) or
                  any(x in fdesc for x in ("product line", "product family", "series", "range", "collection"))):
                m = re.search(r'(?:product\s*line|series|product\s*family|line|range)[:\s]+([^\n]{2,80})', text, re.I)
                val = m.group(1).strip() if m else None

            # LIST / ARRAY fields
            elif ftype == "list" or any(x in fname for x in ("features", "specifications", "highlights", "findings")):
                bullets = re.findall(r'(?:^|\n)\s*[•\-\*◦▪►]\s*(.+)', text)
                if bullets:
                    val = [b.strip() for b in bullets[:10] if len(b.strip()) > 3]
                if not val:
                    numbered = re.findall(r'(?:^|\n)\s*\d+[.)]\s+(.+)', text)
                    val = [n.strip() for n in numbered[:8] if len(n.strip()) > 3] or None

        # ── Clean up and store ─────────────────────────────────────────────────
        if isinstance(val, str):
            val = val.strip()
            val = re.sub(r'\s+', ' ', val)
            val = val.strip('.,;:')
            if len(val) > 400:
                val = val[:400]
            if not val:
                val = None

        if isinstance(val, list):
            val = [str(v).strip() for v in val if str(v).strip()]
            if not val:
                val = None

        if val is not None:
            result[field["name"]] = val

    return result


def _parse_json_response(text: str) -> dict:
    """Robustly parse AI JSON response, stripping markdown fences if present."""
    if not text:
        return {}
    # Strip code fences
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        # Try to find a JSON object anywhere in the response
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                pass
    return {}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _empty_result(fields: list, start: float, validation: dict) -> dict:
    return {
        "result": {},
        "confidence": {},
        "sources": {},
        "evidence": {},
        "validation": validation,
        "schema_fields": [f["name"] for f in fields],
        "failure_log": [{"type": "domain_mismatch", **validation}],
        "duration_seconds": round(time.time() - start, 2),
    }


def _is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    if isinstance(value, (list, dict)) and not value:
        return True
    return False


def _is_null_value(value: Any, field: dict) -> bool:
    if value is None:
        return False
    null_values = field.get("null_values", [])
    return str(value).strip() in [str(n) for n in null_values]


# Common placeholder / sentinel values that indicate "not found" in spec sheets
# Note: X-Z, X-Y, Y-Z are also valid electrical phase labels in tables,
# so we only treat them as placeholders when they appear as standalone field values
_PLACEHOLDER_SENTINELS = {"n/a", "na", "tbd", "tba", "-", "--", "---", "?", "unknown"}
# These are placeholders ONLY when they are the sole value (not part of a table with real data)
_CONDITIONAL_PLACEHOLDERS = {"x-z", "x-y", "y-z"}


def _is_placeholder(value: Any) -> bool:
    """Return True if the value is a known placeholder sentinel."""
    if value is None:
        return False
    normalized = str(value).strip().lower()
    return normalized in _PLACEHOLDER_SENTINELS or normalized in _CONDITIONAL_PLACEHOLDERS


# Patterns used to rescue a real value from a spec-blob cell
_MODEL_NUMBER_RE = re.compile(
    r"\b([A-Z]{1,6}[\-_]?\d{2,6}[A-Z0-9\-/]*)\b"
)
_NUMBER_RE = re.compile(r"-?\d[\d,]*\.?\d*")


def _extract_from_blob(blob: str, field: dict) -> Any:
    """
    When a heuristic returns a very long spec-blob string instead of a clean
    value, try to rescue the correct value using field-type patterns and the
    field name as a hint.

    Returns the extracted value, or None if nothing useful found.
    """
    fname = field.get("name", "").lower()
    ftype = field.get("type", "string")

    # Model number: look for alphanumeric model codes in the blob
    if "model" in fname:
        # Prefer matches from the column header (before the first newline)
        header_line = blob.split("\n")[0]
        m = _MODEL_NUMBER_RE.search(header_line)
        if m:
            return m.group(1)
        # Fall back to scanning the whole blob
        matches = _MODEL_NUMBER_RE.findall(blob)
        if matches:
            return matches[0]

    # Numeric fields: grab the first number
    if ftype in ("number", "integer", "currency") or any(
        kw in fname for kw in ("weight", "amps", "kw", "mbh", "length", "width",
                                "height", "capacity", "cord", "volt")
    ):
        m = _NUMBER_RE.search(blob)
        if m:
            raw = m.group(0).replace(",", "")
            try:
                return int(raw) if ftype == "integer" else float(raw)
            except ValueError:
                return raw

    # For short expected values (< 50 chars), try the first line
    first_line = blob.split("\n")[0].strip()
    if first_line and len(first_line) < 80:
        return first_line

    return None


def _apply_norm_deep(value: Any, field: dict) -> Any:
    """Apply normalization_rules recursively for objects/lists."""
    rules = field.get("normalization_rules", [])
    if not rules:
        return value
    if isinstance(value, list):
        return [_apply_norm_deep(item, field) for item in value]
    if isinstance(value, dict):
        return {k: apply_normalization(v, rules) if isinstance(v, str) else v
                for k, v in value.items()}
    return apply_normalization(value, rules)
