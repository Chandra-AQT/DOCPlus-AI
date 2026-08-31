"""
crawler_service.py — DOCPlus AI+ enhanced PDF discovery engine.

Improvements over v1:
- Detects PDFs by content-type header (catches CDN/redirect URLs with no .pdf extension)
- Also checks href patterns: ?type=pdf, inline PDF viewers, Google Drive, Dropbox links
- Follows same-domain redirects properly
- Strips query strings from domain comparison to avoid missing subpages
- Scans <script> and data attributes for PDF URLs (some sites embed them)
- Falls back to root domain if sub-path yields nothing in first pass
"""
import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, urlunparse
from concurrent.futures import ThreadPoolExecutor
import threading

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

DOCUMENT_EXTENSIONS = (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx")

# Regex to find PDF URLs embedded in JS / data attributes
PDF_URL_REGEX = re.compile(
    r'https?://[^\s"\'>]+\.(?:pdf|docx?|xlsx?|pptx?)(?:\?[^\s"\'<>]*)?',
    re.IGNORECASE
)

# Content-types that indicate a downloadable document
DOCUMENT_CONTENT_TYPES = (
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/octet-stream",
)


def _is_document_url(url: str) -> bool:
    """Check if a URL looks like a document by extension or known patterns."""
    path = urlparse(url).path.lower().split("?")[0]
    if any(path.endswith(ext) for ext in DOCUMENT_EXTENSIONS):
        return True
    # Patterns: ?file=..., /download/, /files/, /docs/, /media/
    patterns = ["/download/", "/files/", "/docs/", "/media/", "/assets/", "/uploads/",
                "?file=", "&file=", "type=pdf", "format=pdf", "filetype=pdf"]
    url_lower = url.lower()
    return any(p in url_lower for p in patterns)


def _verify_document_url(url: str, timeout: int = 8) -> bool:
    """HEAD request to confirm a URL serves a document by content-type."""
    try:
        r = requests.head(url, headers=HEADERS, timeout=timeout,
                         allow_redirects=True, verify=False)
        ct = r.headers.get("content-type", "").lower()
        cd = r.headers.get("content-disposition", "").lower()
        if any(t in ct for t in DOCUMENT_CONTENT_TYPES):
            return True
        if "attachment" in cd or ".pdf" in cd or ".doc" in cd:
            return True
        # If content-type is html but URL ends in .pdf it's likely a redirect wrapper
        path = urlparse(url).path.lower()
        if any(path.endswith(ext) for ext in DOCUMENT_EXTENSIONS):
            return True
        return False
    except Exception:
        # If HEAD fails, assume it's a document if extension matches
        path = urlparse(url).path.lower()
        return any(path.endswith(ext) for ext in DOCUMENT_EXTENSIONS)


def process_page(url, domain, visited_set, pdf_set, lock):
    """Crawl a single page — collect document links and internal page links."""
    try:
        response = requests.get(url, headers=HEADERS, timeout=20,
                                allow_redirects=True, verify=False)
        response.raise_for_status()

        content_type = response.headers.get("content-type", "").lower()

        # If this URL itself is a document, add it
        if any(t in content_type for t in ("application/pdf", "application/msword",
               "application/vnd.openxmlformats", "application/vnd.ms-excel")):
            with lock:
                pdf_set.add(url)
            return []

        if "text/html" not in content_type:
            return []

        html = response.text
        soup = BeautifulSoup(html, "html.parser")
        discovered_links = []

        # ── 1. Scan all <a href> tags ──────────────────────────────────────────
        for tag in soup.find_all("a", href=True):
            href = tag["href"].strip()
            if not href or href.startswith("mailto:") or href.startswith("tel:"):
                continue
            full_link = urljoin(url, href).split("#")[0].strip()
            if not full_link.startswith("http"):
                continue
            parsed = urlparse(full_link)
            link_domain = parsed.netloc.lower().replace("www.", "")
            base_domain  = domain.lower().replace("www.", "")

            if _is_document_url(full_link):
                with lock:
                    pdf_set.add(full_link)
            elif link_domain == base_domain or link_domain.endswith("." + base_domain):
                # Same domain or subdomain
                clean = urlunparse(parsed._replace(fragment=""))
                discovered_links.append(clean)

        # ── 2. Scan <iframe src> and <embed src> for inline PDFs ──────────────
        for tag in soup.find_all(["iframe", "embed", "object"], src=True):
            src = urljoin(url, tag["src"]).split("#")[0]
            if _is_document_url(src):
                with lock:
                    pdf_set.add(src)

        # ── 3. Scan <object data> ─────────────────────────────────────────────
        for tag in soup.find_all("object", data=True):
            data = urljoin(url, tag["data"]).split("#")[0]
            if _is_document_url(data):
                with lock:
                    pdf_set.add(data)

        # ── 4. Extract PDF URLs from raw HTML / JavaScript text ───────────────
        for match in PDF_URL_REGEX.finditer(html):
            found = match.group(0).strip("\"'")
            with lock:
                pdf_set.add(found)

        # ── 5. Check data-href, data-url, data-src attributes ─────────────────
        for tag in soup.find_all(True):
            for attr in ("data-href", "data-url", "data-src", "data-file",
                         "data-pdf", "data-link", "data-document"):
                val = tag.get(attr, "")
                if val and _is_document_url(val):
                    full = urljoin(url, val).split("#")[0]
                    with lock:
                        pdf_set.add(full)

        return list(set(discovered_links))

    except Exception as e:
        print(f"[CRAWL ERROR] {url}: {e}")
        return []


def crawl_website(start_url, max_pages=200, batch_size=10, max_workers=10,
                  progress_callback=None):
    """
    Crawl start_url and return a list of discovered document links.
    Falls back to crawling the root domain if the given sub-path yields nothing.
    """
    visited_set = set()
    pdf_set = set()
    lock = threading.Lock()

    parsed_start = urlparse(start_url)
    domain = parsed_start.netloc
    if not domain:
        raise ValueError("Invalid start URL")

    # Always start from the given URL, but if it yields nothing add root
    start_urls = [start_url]
    root_url = f"{parsed_start.scheme}://{domain}/"
    if root_url != start_url and not start_url.rstrip("/") == root_url.rstrip("/"):
        start_urls.append(root_url)

    queue = list(dict.fromkeys(start_urls))  # dedup, preserve order

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        while queue and len(visited_set) < max_pages:
            current_batch = []
            while queue and len(current_batch) < batch_size and len(visited_set) < max_pages:
                next_url = queue.pop(0)
                with lock:
                    if next_url not in visited_set:
                        visited_set.add(next_url)
                        current_batch.append(next_url)

            if not current_batch:
                continue

            results = list(executor.map(
                lambda u: process_page(u, domain, visited_set, pdf_set, lock),
                current_batch
            ))

            for links in results:
                for link in links:
                    with lock:
                        if link not in visited_set and link not in queue:
                            queue.append(link)

            if progress_callback:
                with lock:
                    progress_callback(len(visited_set), len(pdf_set))

    # Post-process: verify ambiguous URLs (those without clear extension)
    # that were found via JS scanning
    verified = set()
    ambiguous = []
    for url in pdf_set:
        path = urlparse(url).path.lower()
        if any(path.endswith(ext) for ext in DOCUMENT_EXTENSIONS):
            verified.add(url)
        else:
            ambiguous.append(url)

    # Verify ambiguous URLs via HEAD requests (batch, max 50)
    if ambiguous:
        def check(u):
            if _verify_document_url(u):
                with lock:
                    verified.add(u)
        with ThreadPoolExecutor(max_workers=8) as ex:
            list(ex.map(check, ambiguous[:50]))

    return list(verified)
