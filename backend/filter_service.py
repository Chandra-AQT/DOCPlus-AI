"""
filter_service.py — DocPlus document type classifier (unchanged from DocPlus).
Classifies URLs by format and document type using keyword matching.
"""
import re
from urllib.parse import urlparse

FORMAT_EXTENSIONS = {
    "pdf":   [".pdf"],
    "word":  [".doc", ".docx"],
    "excel": [".xls", ".xlsx"],
    "ppt":   [".ppt", ".pptx"],
}
ALL_FORMATS = list(FORMAT_EXTENSIONS.keys())

DOC_TYPE_PATTERNS = [
    ("PSS", [r"product.?spec", r"\bpss\b", r"spec.?sheet", r"specification.?sheet", r"technical.?spec", r"product.?data.?sheet"]),
    ("IOM", [r"\biom\b", r"install.{0,20}operation", r"install.{0,20}maintenance", r"installation.{0,20}manual", r"operation.{0,20}manual", r"maintenance.{0,20}manual", r"install.?guide"]),
    ("OWN", [r"\bown\b", r"owner.?manual", r"owners.?manual", r"user.?guide", r"user.?manual", r"operator.?guide", r"homeowner"]),
    ("SVM", [r"\bsvm\b", r"service.?manual", r"technical.?manual", r"tech.?manual", r"field.?service"]),
    ("SVB", [r"\bsvb\b", r"service.?bulletin", r"technical.?bulletin", r"service.?notice", r"field.?notice"]),
    ("PCT", [r"\bpct\b", r"product.?catalog", r"catalogue", r"catalog(?!ue)", r"full.?line.?catalog", r"parts.?catalog"]),
    ("PBR", [r"\bpbr\b", r"brochure", r"product.?brochure", r"flyer", r"sell.?sheet", r"marketing.?material"]),
    ("SUB", [r"\bsub\b", r"submittal", r"submittal.?sheet", r"cut.?sheet", r"approval.?drawing"]),
    ("WDG", [r"\bwdg\b", r"wiring.?diagram", r"wiring.?schematic", r"electrical.?diagram", r"schematic.?diagram", r"electrical.?schematic"]),
    ("PLD", [r"\bpld\b", r"parts.?list", r"exploded.?diagram", r"parts.?diagram", r"exploded.?view", r"parts.?breakdown"]),
    ("WTY", [r"\bwty\b", r"warranty", r"limited.?warranty", r"warranty.?statement", r"warranty.?card"]),
    ("CCL", [r"\bccl\b", r"commission.{0,20}checklist", r"startup.?checklist", r"startup.?procedure", r"commissioning"]),
    ("RCL", [r"\brcl\b", r"recall", r"safety.?notice", r"recall.?notice", r"product.?recall"]),
    ("SDS", [r"\bsds\b", r"safety.?data.?sheet", r"material.?safety", r"\bmsds\b", r"refrigerant.?safety", r"hazard.?data"]),
    ("CRT", [r"\bcrt\b", r"compliance", r"certification", r"ahri", r"energy.?star", r"ul.?listing", r"doe.?certif", r"rated.?performance"]),
    ("RUG", [r"\brug\b", r"retrofit", r"upgrade.?guide", r"conversion.?kit", r"retrofit.?guide", r"upgrade.?kit"]),
]

_COMPILED_PATTERNS = [
    (code, [re.compile(p, re.IGNORECASE) for p in patterns])
    for code, patterns in DOC_TYPE_PATTERNS
]


def detect_format(url: str) -> str | None:
    """Return the format key for a URL, or None if not a supported format."""
    path = urlparse(url).path.lower().split("?")[0]
    # Check path extension first
    for fmt, exts in FORMAT_EXTENSIONS.items():
        if any(path.endswith(ext) for ext in exts):
            return fmt
    # Check query string for format hints (e.g. ?format=pdf, ?type=pdf)
    qs = urlparse(url).query.lower()
    if any(hint in qs for hint in ("format=pdf", "type=pdf", "filetype=pdf", "ext=pdf")):
        return "pdf"
    # Check if "pdf" appears in the URL path (CDN/redirect patterns)
    url_lower = url.lower()
    if "/pdf/" in url_lower or "/pdfs/" in url_lower:
        return "pdf"
    return None


def detect_format_relaxed(url: str) -> str:
    """Like detect_format but returns 'pdf' as default for ambiguous URLs
    (used when the crawler has already confirmed it's a document)."""
    fmt = detect_format(url)
    return fmt if fmt else "pdf"


def detect_doc_type(url: str) -> str:
    for code, compiled in _COMPILED_PATTERNS:
        for pattern in compiled:
            if pattern.search(url):
                return code
    return "OTHER"


def filter_links(links, formats=None, doc_types=None):
    wanted_formats   = {f.lower() for f in formats}   if formats   else set()
    wanted_doc_types = {d.upper() for d in doc_types} if doc_types else set()
    results = []
    for url in links:
        # Use relaxed detection — crawler already confirmed these are documents
        fmt = detect_format(url)
        if fmt is None:
            fmt = detect_format_relaxed(url)   # default to pdf for ambiguous verified URLs
        if wanted_formats and fmt not in wanted_formats:
            continue
        doc_type = detect_doc_type(url)
        if wanted_doc_types and doc_type not in wanted_doc_types:
            continue
        filename = url.split("/")[-1].split("?")[0] or "document"
        if not any(filename.lower().endswith(ext) for ext in (".pdf",".doc",".docx",".xls",".xlsx",".ppt",".pptx")):
            filename = filename + (".pdf" if fmt == "pdf" else f".{fmt}" if fmt else ".pdf")
        results.append({"url": url, "filename": filename, "format": fmt, "doc_type": doc_type})
    results.sort(key=lambda x: (x["doc_type"] == "OTHER", x["filename"].lower()))
    return results
