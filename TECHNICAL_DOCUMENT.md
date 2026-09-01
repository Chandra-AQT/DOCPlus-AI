# DOCPlus AI⁺ — Technical Architecture & Platform Documentation
**Aquarient Technologies LLC**
**Version 1.0 — September 2026**
**Repository: https://github.com/Chandra-AQT/DOCPlus-AI**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview & Architecture](#2-system-overview--architecture)
3. [Technology Stack](#3-technology-stack)
4. [Backend Architecture](#4-backend-architecture)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Database Design](#6-database-design)
7. [API Reference](#7-api-reference)
8. [AI Extraction Pipeline](#8-ai-extraction-pipeline)
9. [Schema System](#9-schema-system)
10. [Guest Portal & Access Control](#10-guest-portal--access-control)
11. [Authentication & Security](#11-authentication--security)
12. [LandingAI Integration & Key Pool](#12-landingai-integration--key-pool)
13. [Email Validation System](#13-email-validation-system)
14. [Batch Processing & Export](#14-batch-processing--export)
15. [Admin Panel Features](#15-admin-panel-features)
16. [Extraction Logs & Job Management](#16-extraction-logs--job-management)
17. [PDF Discovery (DocPlus)](#17-pdf-discovery-docplus)
18. [Performance & Reliability](#18-performance--reliability)
19. [Deployment & Configuration](#19-deployment--configuration)
20. [Future Roadmap](#20-future-roadmap)

---

## 1. Executive Summary

**DOCPlus AI⁺** is a unified AI-powered document intelligence platform built by Aquarient Technologies LLC. It merges two capabilities into one product:

- **DocPlus** — Web crawler that discovers PDF and document files from any website URL
- **DocLens AI** — AI extraction engine that reads structured data from any PDF using customizable schemas

The platform allows users to:
1. Discover PDFs by crawling any website URL
2. Upload PDFs directly
3. Define what data to extract using a schema (any JSON format)
4. Run AI extraction using LandingAI, OpenAI, Claude, Gemini, Groq, or built-in heuristics
5. View results in a spreadsheet with click-to-highlight PDF source
6. Export to Excel, CSV, or JSON

**Key differentiator**: Schema-driven extraction — the platform extracts exactly the fields the user defines, with support for nested array-of-objects (e.g. extracting all model variants from a product spec sheet), not a fixed set of fields.

---

## 2. System Overview & Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     DOCPlus AI⁺ Platform                        │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  React/Vite  │    │  FastAPI     │    │  SQLite DB       │  │
│  │  Frontend    │◄──►│  Backend     │◄──►│  (docplus_ai.db) │  │
│  │  Port 5173   │    │  Port 8000   │    │                  │  │
│  └──────────────┘    └──────┬───────┘    └──────────────────┘  │
│                             │                                    │
│                    ┌────────▼────────┐                          │
│                    │  AI Providers   │                          │
│                    │ ┌─────────────┐ │                          │
│                    │ │ LandingAI   │ │  ← Primary (key pool)   │
│                    │ │ OpenAI GPT4 │ │  ← Fallback options      │
│                    │ │ Claude      │ │                          │
│                    │ │ Gemini      │ │                          │
│                    │ │ Groq        │ │                          │
│                    │ │ Built-in    │ │  ← Free heuristics       │
│                    │ └─────────────┘ │                          │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
URL / File Upload
      │
      ▼
[PDF Discovery/Upload] ──► [Python Parser (PyMuPDF/pdfplumber)]
                                    │
                                    ▼
                           [Parsed Data stored in DB]
                           {markdown, tables, kv_pairs, chunks}
                                    │
                                    ▼
                        [Schema Selection / Upload]
                        {fields: [{name, type, description}]}
                                    │
                                    ▼
                        [AI Extraction Pipeline]
                        1. Heuristic extraction
                        2. LandingAI ADE (primary)
                        3. OpenAI/Claude/Gemini fallback
                        4. Smart regex fallback
                                    │
                                    ▼
                        [Extraction Result stored in DB]
                        {result: {field: value}, confidence, sources}
                                    │
                                    ▼
                        [Results Page: Spreadsheet + PDF Viewer]
                        [Export: Excel / CSV / JSON]
```

---

## 3. Technology Stack

### Backend
| Component | Technology | Version |
|---|---|---|
| Framework | FastAPI | 0.104+ |
| Language | Python | 3.12 |
| ORM | SQLAlchemy | 2.0 |
| Database | SQLite | 3.x |
| PDF Parsing | PyMuPDF (fitz) + pdfplumber | Latest |
| AI: LandingAI | landingai-ade | 1.12.0 |
| AI: OpenAI | openai | Latest |
| AI: Anthropic | anthropic | Latest |
| AI: Gemini | google-generativeai | Latest |
| AI: Groq | groq | Latest |
| Web Crawling | requests + BeautifulSoup4 | Latest |
| Email DNS | dnspython | Latest |
| Auth | python-jose + passlib + bcrypt | Latest |
| Logging | loguru | Latest |
| Server | uvicorn | Latest |

### Frontend
| Component | Technology | Version |
|---|---|---|
| Framework | React | 18 |
| Build Tool | Vite | 5 |
| Styling | Tailwind CSS | 3 |
| Routing | React Router | 6 |
| HTTP Client | Axios | Latest |
| PDF Viewer | PDF.js (CDN) | 3.11.174 |
| File Upload | react-dropzone | Latest |
| Icons | Lucide React | Latest |
| Notifications | react-hot-toast | Latest |
| State | React Context + useReducer | Built-in |

---

## 4. Backend Architecture

### Directory Structure
```
backend/
├── main.py                    # FastAPI app entry point, DocPlus discovery endpoints
├── guest_router.py            # Guest registration, session, admin management
├── admin_config.py            # Admin email, SMTP, Microsoft Graph config
├── migrate_db.py              # Safe DB migrations runner
├── landingai_config.json      # LandingAI key pool (up to 5 keys) — gitignored
├── default_schema_config.json # Admin-set default schema for guests — gitignored
├── sample_pdf_config.json     # Admin-set sample PDF for guests — gitignored
└── app/
    ├── api/
    │   └── v1/
    │       ├── router.py              # Mounts all sub-routers
    │       └── endpoints/
    │           ├── auth.py            # JWT login/register
    │           ├── documents.py       # Upload, parse, list documents
    │           ├── schemas.py         # Schema CRUD + universal parser
    │           ├── extraction.py      # Run extraction, get results
    │           ├── export.py          # Excel/CSV/JSON export
    │           ├── jobs.py            # Job history
    │           ├── batch.py           # Batch operations
    │           ├── compare.py         # Compare extractions
    │           ├── chat.py            # AI chat about document
    │           ├── intelligence.py    # Auto-generate schemas
    │           └── webcrawl.py        # Web crawl via API
    ├── core/
    │   ├── auth.py           # JWT token creation/verification
    │   ├── config.py         # Settings (upload dir, JWT secret)
    │   ├── database.py       # SQLAlchemy setup, preset schemas
    │   └── user_filter.py    # Row-level security helpers
    ├── models/
    │   ├── document.py       # Document model
    │   ├── job.py            # ExtractionJob, ExtractionBatch models
    │   ├── schema.py         # SchemaDefinition model
    │   ├── user.py           # Admin User model
    │   ├── guest.py          # Guest model (trial users)
    │   └── guest_activity.py # Activity log, access requests
    └── services/
        ├── parser.py          # PDF parsing (PyMuPDF + pdfplumber)
        ├── pipeline.py        # Extraction orchestration
        ├── landingai_service.py # LandingAI ADE integration
        ├── llm_router.py      # LLM provider abstraction
        ├── schema_utils.py    # Schema normalization/validation
        ├── schema_generator.py # Auto-generate schema from document
        ├── quality_scorer.py  # Extraction quality scoring
        ├── smart_retry.py     # Smart retry with context expansion
        ├── vision_parser.py   # Vision-based PDF parsing
        ├── field_retrieval.py # Heuristic field extraction
        ├── python_extractor.py # Rule-based extraction
        └── web_crawler.py     # Website PDF discovery
```

### Key Design Decisions

**1. Synchronous extraction** — extraction runs synchronously in the request handler. This works well for PDFs up to ~100 pages. For very large documents, the 5-minute timeout is enforced at the HTTP client level.

**2. Job persistence** — every extraction is stored in `extraction_jobs` with full result JSON. The frontend can reload any past result without re-running.

**3. Schema as code** — schemas are stored as normalized Python dicts `{name, fields: [{name, type, description, fields: [...]}]}`. The `list[object]` type recursively carries sub-fields for nested extraction.

**4. Multi-engine fallback** — the pipeline tries: heuristic → AI → smart regex → fallback value. Each step fills in what the previous step missed.

---

## 5. Frontend Architecture

### Directory Structure
```
frontend/src/
├── App.jsx              # Routes: admin, guest, public
├── main.jsx             # React entry point
├── index.css            # Global Tailwind + custom CSS
├── components/
│   ├── Layout.jsx           # Admin sidebar navigation
│   ├── GuestBanner.jsx      # Trial usage banner
│   ├── GuestTour.jsx        # Onboarding tour for guests
│   ├── GuestHelpButton.jsx  # Floating help button
│   ├── RobotMascot.jsx      # Animated robot SVG mascot
│   ├── RequestAccessModal.jsx # Guest request more access modal
│   ├── DocumentViewer.jsx   # PDF viewer component
│   └── workflow/            # Multi-step extraction workflow steps
├── pages/
│   ├── LandingPage.jsx      # Public homepage
│   ├── GuestRegistrationPage.jsx # Guest signup
│   ├── GuestDashboard.jsx   # Guest home
│   ├── GuestWizard.jsx      # Guest extraction wizard
│   ├── AdminLoginPage.jsx   # Admin password login
│   ├── AdminPage.jsx        # Full admin panel
│   ├── DashboardPage.jsx    # Admin dashboard
│   ├── DocumentLibraryPage.jsx # Document management
│   ├── ExtractionPage.jsx   # Multi-step extraction wizard
│   ├── ExtractionLogsPage.jsx # Job history grouped by run
│   ├── ResultsPage.jsx      # Results with PDF viewer
│   ├── SchemasPage.jsx      # Schema management
│   └── DiscoverPage.jsx     # Web crawl discovery
└── lib/
    ├── api.js      # Axios client + all API functions
    ├── auth.js     # Auth state helpers
    ├── store.js    # Global state (Context + useReducer)
    └── utils.js    # Date formatting (IST), file utilities
```

### State Management

The app uses React Context with `useReducer` — no external state library. The `WorkflowProvider` wraps the entire app and holds:

```javascript
{
  library: [],           // Loaded documents
  extractionJobs: [],    // All extraction results (in-memory + DB)
  schema: null,          // Currently selected schema
  providerConfig: {},    // AI engine + API key
  crawlHistory: [],      // Last 10 crawled URLs
  selectedDocIds: [],    // Documents selected for extraction
}
```

Extraction jobs are persisted in the DB and loaded on mount. The `extractionJobs` array serves as the in-memory cache.

### Routing

```
/                    → LandingPage (public)
/login               → GuestRegistrationPage
/guest-dashboard     → GuestDashboard
/guest-wizard        → GuestWizard
/guest-results       → ResultsPage (guest mode)
/admin-login         → AdminLoginPage
/dashboard           → DashboardPage (admin)
/library             → DocumentLibraryPage (admin)
/extract             → ExtractionPage (admin)
/results             → ResultsPage (admin)
/logs                → ExtractionLogsPage (admin)
/schemas             → SchemasPage (admin)
/discover            → DiscoverPage (admin)
/admin               → AdminPage (admin panel)
```

---

## 6. Database Design

### Schema (SQLite)

```sql
-- Admin users
CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  hashed_password TEXT,
  full_name      TEXT,
  is_active      BOOLEAN DEFAULT 1,
  is_admin       BOOLEAN DEFAULT 0,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Documents (uploaded or crawled PDFs)
CREATE TABLE documents (
  id             TEXT PRIMARY KEY,
  user_id        TEXT,
  file_name      TEXT NOT NULL,
  file_path      TEXT NOT NULL,
  file_size      INTEGER,
  mime_type      TEXT,
  status         TEXT DEFAULT 'uploaded',  -- uploaded|parsing|parsed|error
  parsed_data    JSON,                      -- {markdown, tables, kv_pairs, chunks}
  page_count     INTEGER,
  upload_source  TEXT DEFAULT 'single',    -- single|batch|sample|crawl
  batch_id       TEXT,                     -- groups batch-uploaded files
  error_message  TEXT,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Extraction schemas
CREATE TABLE schema_definitions (
  id             TEXT PRIMARY KEY,
  user_id        TEXT,
  name           TEXT NOT NULL,
  description    TEXT,
  version        TEXT DEFAULT '1.0',
  domain         TEXT,
  fields         JSON NOT NULL,            -- normalized field array
  raw_definition JSON,                     -- original uploaded JSON
  record_mode    BOOLEAN DEFAULT 0,
  record_anchor  TEXT,
  domain_keywords JSON,
  reject_domain_mismatch BOOLEAN DEFAULT 0,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME
);

-- Extraction jobs
CREATE TABLE extraction_jobs (
  id               TEXT PRIMARY KEY,
  user_id          TEXT,
  guest_id         TEXT,                   -- for guest-owned jobs
  document_id      TEXT NOT NULL,
  schema_name      TEXT,
  schema_id        TEXT,
  batch_run_id     TEXT,                   -- groups jobs from same extraction run
  status           TEXT DEFAULT 'pending', -- pending|running|completed|failed
  provider         TEXT,                   -- landingai|openai|anthropic|none...
  model            TEXT,
  result           JSON,                   -- full extraction result
  error            TEXT,
  error_message    TEXT,
  schema_fields    JSON,
  credits_used     REAL DEFAULT 0,
  duration_seconds REAL,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME
);

-- Guest users (trial accounts)
CREATE TABLE guests (
  id                  TEXT PRIMARY KEY,
  email               TEXT UNIQUE NOT NULL,
  first_name          TEXT NOT NULL,
  middle_name         TEXT,
  last_name           TEXT NOT NULL,
  current_role        TEXT,
  company             TEXT,
  note                TEXT,
  pdf_fetched         INTEGER DEFAULT 0,
  extractions_used    INTEGER DEFAULT 0,
  pdf_fetch_limit     INTEGER DEFAULT 5,
  extraction_limit    INTEGER DEFAULT 2,
  upload_allowed      BOOLEAN DEFAULT 0,
  export_allowed      BOOLEAN DEFAULT 0,
  is_business_email   BOOLEAN DEFAULT 1,   -- for sales lead targeting
  email_verified      BOOLEAN DEFAULT 0,   -- SMTP RCPT TO confirmed
  session_token       TEXT,
  is_active           BOOLEAN DEFAULT 1,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen           DATETIME
);

-- Guest activity log
CREATE TABLE guest_activities (
  id         TEXT PRIMARY KEY,
  guest_id   TEXT NOT NULL,
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Guest access requests (more PDFs/extractions/export)
CREATE TABLE guest_access_requests (
  id           TEXT PRIMARY KEY,
  guest_id     TEXT NOT NULL,
  request_type TEXT NOT NULL,             -- pdf_fetch|extraction|export|full_access
  note         TEXT,
  status       TEXT DEFAULT 'pending',    -- pending|approved|declined
  resolved_at  DATETIME,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | Admin JWT login |
| POST | `/api/v1/auth/register` | Create admin user |
| POST | `/admin/login` | Admin password login (secure) |
| POST | `/admin/change-password` | Change admin password |

### Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/documents` | List all documents |
| POST | `/api/v1/documents/upload` | Upload single document |
| POST | `/api/v1/documents/upload/batch` | Upload multiple documents |
| GET | `/api/v1/documents/{id}` | Get document details |
| DELETE | `/api/v1/documents/{id}` | Delete document |
| POST | `/api/v1/documents/{id}/reparse` | Re-parse document |

### Schemas

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/schemas` | List schemas |
| POST | `/api/v1/schemas` | Create schema |
| POST | `/api/v1/schemas/upload` | Upload JSON schema file (any format) |
| GET | `/api/v1/schemas/{id}` | Get schema |
| PUT | `/api/v1/schemas/{id}` | Update schema |
| DELETE | `/api/v1/schemas/{id}` | Delete schema |

### Extraction

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/extraction/run` | Run extraction (returns result immediately) |
| GET | `/api/v1/extraction/run/{job_id}` | Get extraction result |
| DELETE | `/api/v1/extraction/run/{job_id}` | Delete job |
| GET | `/api/v1/extraction/admin/all` | List all jobs with full results |
| GET | `/api/v1/extraction/batch/{batch_run_id}` | Get all jobs in a batch run |
| DELETE | `/api/v1/extraction/admin/{job_id}` | Admin delete job |
| POST | `/api/v1/extraction/admin/{job_id}/reset` | Reset stuck RUNNING job |

### Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/export/{job_id}/excel` | Export as Excel |
| GET | `/api/v1/export/{job_id}/csv` | Export as CSV |
| GET | `/api/v1/export/{job_id}/json` | Export as JSON |

### Guest Portal

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/guests/register` | Register new guest |
| POST | `/guests/signin` | Sign in existing guest |
| GET | `/guests/me` | Get current guest profile |
| POST | `/guests/ping` | Update last_seen |
| POST | `/guests/use-sample-pdf` | Use admin sample PDF (no quota) |
| GET | `/guests/default-schema` | Get admin-set default schema |
| GET | `/guests/landingai-available` | Check if LandingAI configured |
| GET | `/guests/sample-pdf-available` | Check if sample PDF available |
| POST | `/guests/increment-extraction` | Increment extraction counter |
| POST | `/guests/check-extraction` | Check extraction limit |
| POST | `/guests/request-access` | Request more access |
| GET | `/guests/my-jobs` | Get guest's extraction jobs |

### Admin Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/guests` | List all guests |
| PUT | `/admin/guests/{id}/limits` | Update guest limits/permissions |
| DELETE | `/admin/guests/{id}` | Delete guest |
| POST | `/admin/guests/{id}/reset-usage` | Reset guest usage counters |
| GET | `/admin/guests/{id}/activity` | Guest activity log |
| POST | `/admin/default-schema` | Set default schema for guests |
| POST | `/admin/sample-pdf` | Upload sample PDF for guests |
| POST | `/admin/landingai-config` | Set single LandingAI key (legacy) |
| POST | `/admin/landingai-config-pool` | Set up to 5 LandingAI keys |
| GET | `/admin/landingai-config` | Get LandingAI config (masked) |
| GET | `/admin/landingai-credits` | LandingAI credit usage stats |
| GET | `/admin/access-requests` | List pending access requests |
| POST | `/admin/access-requests/{id}/approve` | Approve access request |

### DocPlus Discovery

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/crawl-stream` | SSE stream: crawl website for PDFs |
| POST | `/bridge/send-to-doclens` | Send crawled PDF to DocLens |
| GET | `/status` | Current crawl status |
| GET | `/download-excel` | Download crawl results Excel |
| GET | `/download-zip` | Download crawled files ZIP |

---

## 8. AI Extraction Pipeline

### Overview

The extraction pipeline in `app/services/pipeline.py` runs in 5 stages:

```
Stage 1: Heuristic extraction
  → Label matching against document KV pairs
  → Table column matching
  → Pattern-based text extraction
  → Schema-aware label normalization

Stage 2: AI extraction (for low-confidence fields)
  → Builds LLM prompt with field descriptions
  → Sends to configured provider
  → Parses JSON response

Stage 2b: Smart regex fallback (if no AI)
  → Type-aware patterns (date, currency, email, phone)
  → Field description semantic matching
  → Context window search

Stage 3: Required field fallback
  → Apply fallback values for required fields
  → Log missing required fields

Stage 4: Validation
  → Type checking
  → Allowed values validation
  → Pattern matching

Stage 5: Quality scoring
  → Coverage (% fields filled)
  → Confidence average
  → Source quality weights
  → Penalty for missing required fields
```

### LandingAI Multi-Record Extraction

For schemas with `list[object]` fields (e.g. `models: [{ModelNumber, ShippingWeight, ...}]`):

1. Schema is converted to JSON Schema format for the LandingAI API
2. The `list[object]` field becomes `{"type": "array", "items": {"type": "object", "properties": {...}}}`
3. LandingAI returns `{ManufacturerName: "...", models: [{ModelNumber: "X", ...}, ...]}`
4. Result stored as single-record with nested array
5. Frontend detects array-of-objects dynamically and renders spreadsheet

### Key Pool Rotation

```python
def _get_next_active_key():
    """Try keys in order 1→5, skipping failed ones."""
    config = _load_landingai_config()
    pool = config.get("api_keys", [])
    for slot in pool:
        if slot.get("active") and not slot.get("failed"):
            key = slot.get("key", "").strip()
            if key:
                return key, slot.get("base_url", "")
    return config.get("api_key", ""), config.get("base_url", "")

# In extraction endpoint:
async def _landingai_with_key_rotation(fn, ...):
    for attempt in range(5):
        try:
            return await fn(api_key=current_key, ...)
        except Exception as e:
            if any(code in str(e).lower() for code in ["401","402","403","quota","credit"]):
                _mark_key_failed(current_key)
                current_key, _ = _get_next_active_key()
            else:
                raise
```

---

## 9. Schema System

### Supported Input Formats

The schema parser in `app/api/v1/endpoints/schemas.py` accepts **any** JSON format:

| Format | Example |
|--------|---------|
| JSON Schema draft 4/6/7/2019/2020 | `{"properties": {"name": {"type": "string"}}}` |
| Nullable types | `{"type": ["string", "null"]}` |
| allOf / anyOf / oneOf | `{"allOf": [{"type": "string"}]}` |
| Our native format | `{"fields": [{"name": "x", "type": "string"}]}` |
| Array of field names | `["field1", "field2", "field3"]` |
| Array of field objects | `[{"name": "x", "type": "string", "description": "..."}]` |
| Flat type dict | `{"field_name": "string"}` |
| OpenAPI / Swagger | `{"components": {"schemas": {...}}}` |
| Columns format | `{"columns": ["col1", "col2"]}` |

### Internal Field Format

All schemas are normalized to:

```json
{
  "name": "Schema Name",
  "description": "What this schema extracts",
  "fields": [
    {
      "name": "ManufacturerName",
      "type": "string",
      "description": "Full legal name of manufacturer",
      "required": true,
      "fields": []
    },
    {
      "name": "models",
      "type": "list[object]",
      "description": "All product model variants",
      "required": true,
      "fields": [
        {"name": "ModelNumber",    "type": "string", "required": true,  "fields": []},
        {"name": "ShippingWeight", "type": "number", "required": false, "fields": []},
        {"name": "Height_Table",   "type": "number", "required": false, "fields": []}
      ]
    }
  ]
}
```

### Supported Field Types

`string`, `number`, `integer`, `boolean`, `date`, `currency`, `email`, `phone`, `url`, `list`, `list[object]`, `object`

---

## 10. Guest Portal & Access Control

### Registration Flow

```
User fills form (name, email, company, role)
         │
         ▼
Layer 1: Format validation
         │
         ▼
Layer 2: Disposable email check (50+ blocked domains)
         │
         ▼
Layer 3: MX record DNS check (domain must have mail servers)
         │
         ▼
Layer 4: SMTP RCPT TO verification (mailbox existence check)
         │
         ▼
Layer 5: Email quality classification (business vs personal)
         │
         ▼
Guest account created with:
  - session_token (UUID, no password)
  - pdf_fetch_limit: 5
  - extraction_limit: 2
  - is_business_email: true/false
  - email_verified: true/false
         │
         ▼
Admin email notification sent
```

### Guest Limits

| Resource | Default Limit | Admin Can Change |
|----------|---------------|-----------------|
| PDF fetches | 5 | Yes, unlimited |
| Extractions | 2 | Yes, unlimited |
| Upload own files | No | Toggle per guest |
| Export results | No | Toggle per guest |

### Permission Matrix

| Feature | Guest (no permission) | Guest (with permission) | Admin |
|---------|----------------------|------------------------|-------|
| Discover PDFs | ✓ (up to 5) | ✓ (up to limit) | ✓ unlimited |
| Extract | ✓ (up to 2) | ✓ (up to limit) | ✓ unlimited |
| Upload files | ✗ | ✓ if upload_allowed | ✓ |
| Export results | 🔒 Request Access | ✓ | ✓ |
| View schemas | ✓ (admin default only) | ✓ | ✓ (full CRUD) |
| Admin panel | ✗ | ✗ | ✓ |

---

## 11. Authentication & Security

### Admin Authentication

- Email must be in `ADMIN_EMAILS` whitelist (set via environment variable)
- Password stored as bcrypt hash in `admin_password.json`
- Default password: `Admin@2024!` (must be changed on first login)
- JWT token issued on successful login (HS256, 7-day expiry)
- All admin routes protected by `require_admin` dependency

```python
@router.post("/admin/login")
def admin_login(req: AdminLoginRequest, db: Session):
    # 1. Check email in whitelist
    # 2. Verify bcrypt hash
    # 3. Return JWT token
```

### Guest Authentication

- Guests use session tokens (UUIDs) — no passwords
- Token passed in `X-Guest-Token` header on all guest requests
- Tokens never expire but can be revoked by admin (delete guest)

### Security Features

- Admin emails hardcoded in `admin_config.py` — not changeable at runtime
- API keys (LandingAI, etc.) never stored in frontend — injected server-side
- CORS configured for `*` (development) — should be restricted in production
- All file uploads validated for type and size
- SQL queries use SQLAlchemy ORM (no raw SQL injection risk)
- Secret key for JWT in `app/core/config.py` — should use env var in production

---

## 12. LandingAI Integration & Key Pool

### API Integration

LandingAI ADE (Agentic Document Extraction) uses two REST endpoints:

**Single-record extraction:**
```
POST https://ade.landing.ai/v1/extract
Files: markdown (text/markdown)
Data: schema (JSON), strict (false)
Returns: {extraction: {...fields...}, extraction_metadata: {...}}
```

**Multi-record (wrapped):**
```
POST https://ade.landing.ai/v1/extract
Data: schema = {
  "type": "object",
  "properties": {
    "records": {
      "type": "array",
      "items": {field_schema}
    }
  }
}
Returns: {extraction: {records: [{...}, ...]}}
```

### Schema Conversion

Our internal `list[object]` schema is converted to LandingAI JSON Schema format:

```python
def _schema_to_ade_format(schema):
    for field in schema["fields"]:
        if field["type"] == "list[object]":
            sub_props = {sf["name"]: {"type": ..., "description": ...} 
                        for sf in field["fields"]}
            properties[field["name"]] = {
                "type": "array",
                "items": {"type": "object", "properties": sub_props},
                "description": field["description"]
            }
```

### Key Pool Config File

`backend/landingai_config.json` (gitignored):
```json
{
  "api_key": "primary_key",
  "base_url": "production",
  "api_keys": [
    {"key": "key1", "base_url": "production", "label": "Primary", "active": true, "failed": false},
    {"key": "key2", "base_url": "eu-west-1",  "label": "EU Backup", "active": true, "failed": false},
    {"key": "",     "base_url": "",            "label": "Key 3",    "active": false, "failed": false},
    {"key": "",     "base_url": "",            "label": "Key 4",    "active": false, "failed": false},
    {"key": "",     "base_url": "",            "label": "Key 5",    "active": false, "failed": false}
  ]
}
```

---

## 13. Email Validation System

### 4-Layer Validation

**Layer 1 — Disposable Email Blocklist (50+ domains)**
Immediately blocks: mailinator.com, guerrillamail.com, tempmail.com, yopmail.com, throwaway.email, and 45+ more.

**Layer 2 — MX Record DNS Check**
```python
import dns.resolver
mx_records = dns.resolver.resolve(domain, "MX", lifetime=5)
mx_host = sorted(mx_records, key=lambda r: r.preference)[0].exchange.to_text()
```
Rejects domains that don't have mail servers (e.g. `hh.com`, invented domains).

**Layer 3 — SMTP RCPT TO Verification**
```python
smtp = smtplib.SMTP(timeout=8)
smtp.connect(mx_host, 25)
smtp.ehlo_or_helo_if_needed()
smtp.mail("verify@docplusai.com")
code, msg = smtp.rcpt(email)
# 250 = mailbox exists, 550 = no such user
```
No email is sent. Only probes if the mailbox accepts mail.

**Layer 4 — Email Quality Classification**
```python
FREE_EMAIL_PROVIDERS = {"gmail.com", "yahoo.com", "hotmail.com", ...}
is_business_email = domain not in FREE_EMAIL_PROVIDERS
```

### Sales Lead Export

Admin Panel → Guest Management → "📊 Export Leads" downloads a CSV:
```csv
Name,Email,Company,Role,Extractions Used,Registered,Email Verified
John Smith,john@acme.com,Acme Corp,Engineer,2,01 Sep 2026,Yes
```
Only business email guests included. Used for B2B outreach.

---

## 14. Batch Processing & Export

### Batch Run Concept

When a user selects N PDFs and clicks "Extract", all N jobs share a `batch_run_id`:

```javascript
const batchRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2,8)}`
// e.g. "run_1725123456789_a3f9k2"

// Each job payload includes:
{ document_id: docId, schema_id: ..., batch_run_id: batchRunId }
```

### Batch Results Navigation

- After extraction: navigates to `/results?batch=run_xxx`
- ResultsPage reads `?batch=` query param
- Filters `extractionJobs` to only the batch's jobs
- Shows PDF tab switcher: `📄 file1.pdf` | `📄 file2.pdf` | `📄 file3.pdf`
- Each tab shows that PDF's results with full spreadsheet
- "Export all N PDFs" → one combined CSV with "Source File" column

### Combined Export CSV Format

```csv
"Source File","ManufacturerName","models[ModelNumber]","models[ShippingWeight]",...
"furnace_spec.pdf","Nortek Global HVAC","B6BV-000K-B-10","90",...
"furnace_spec.pdf","Nortek Global HVAC","B6BV-000K-B-15","90",...
"air_handler.pdf","Williamson","GS80-60","116",...
```

### Export Formats

| Format | Structure | Use Case |
|--------|-----------|----------|
| Excel (.xlsx) | Backend-generated via openpyxl | Spreadsheet import |
| CSV | Flattened rows, one per record | Data processing |
| JSON | Full nested structure | API/programmatic use |

---

## 15. Admin Panel Features

### Dashboard Tabs

1. **AI Config** — LandingAI key pool, sample PDF, default guest schema
2. **Guest Management** — All guests with live usage, limits, permissions
3. **Access Requests** — Pending requests from guests needing more access
4. **Security** — Change admin password
5. **Notifications** — Email config (MS Graph / SMTP)

### Guest Management Table

Each guest row shows:
- Full name, email
- `🏢 Business` / `Personal` badge
- `✓ Verified` badge (SMTP-confirmed mailbox)
- PDF fetch: `2/5`
- Extractions: `1/2`
- Upload toggle (off by default)
- Export toggle (off by default)
- Actions: Edit limits, Reset usage, Activity log, Delete

### Access Request Flow

1. Guest hits limit → clicks "Request More Access"
2. Request saved to DB + email sent to admin
3. Admin sees it in Access Requests tab
4. Admin approves → limits automatically increased
5. Guest's next request uses new limits

---

## 16. Extraction Logs & Job Management

### Grouping Logic

Jobs are displayed as **extraction runs**, not individual jobs:

```javascript
// Jobs with same batch_run_id → one BATCH row
// Old jobs without batch_run_id → grouped by schema + same minute
const timeBucket = `${schema_name}|${created_at.slice(0,16)}`
```

### Run Row Display

| Type | Label | Documents | Action |
|------|-------|-----------|--------|
| 1 PDF | `1 PDF` (blue) | filename.pdf | Click → Results |
| N PDFs | `BATCH · N PDFs` (purple) | file1, file2... | Click → Results with tabs |

### Job Status Lifecycle

```
pending → running → completed
                 ↘ failed
```

**Stuck job handling:**
- On startup: any job in `running` for >15 minutes → auto-set to `failed`
- Manual: `↺` button in logs page → calls `POST /admin/{job_id}/reset`
- Message: "Extraction interrupted — server was restarted. Please re-run."

---

## 17. PDF Discovery (DocPlus)

### Crawl Flow

```
User enters URL
      │
      ▼
GET /crawl-stream (Server-Sent Events)
      │
      ▼
crawl_website(url) → BeautifulSoup scraping
  - Finds all <a href> links
  - Detects PDF/Word/Excel/PPT extensions
  - Follows pagination (up to 200 pages)
      │
      ▼
filter_links(links, formats, doc_types)
  - Format filter: pdf|word|excel|ppt
  - Doc type filter: PSS|IOM|OWN|SVM|SDS|...
      │
      ▼
download_file(link, folder, format)
  - Downloads to downloads/{domain}/
  - Checks file size > 500 bytes
      │
      ▼
SSE: {type: "done", files: [{name, path, url, format, doc_type}]}
      │
      ▼
User selects PDFs → POST /bridge/send-to-doclens
  - Copies file to uploads/ directory
  - Creates Document record
  - Queues background parsing
```

### Document Types Supported

| Code | Full Name |
|------|-----------|
| PSS | Product Specification Sheet |
| IOM | Installation, Operations & Maintenance |
| OWN | Owner's Manual |
| SVM | Service Manual |
| SVB | Service Bulletins |
| PCT | Product Catalog |
| PBR | Product Brochure |
| SUB | Submittal |
| WDG | Wiring Diagram |
| SDS | Safety Data Sheet |
| WTY | Warranty Statement |

---

## 18. Performance & Reliability

### Parsing Performance

| PDF Size | Parser | Time |
|----------|--------|------|
| 1-5 pages | PyMuPDF | < 1 second |
| 5-20 pages | PyMuPDF + pdfplumber | 1-3 seconds |
| 20-50 pages | Full pipeline | 3-10 seconds |
| 50+ pages | Background task | 10-60 seconds |

### Extraction Performance

| Engine | Typical Time | Quality |
|--------|-------------|---------|
| Built-in heuristic | < 1 second | Medium |
| LandingAI ADE | 10-60 seconds | High |
| OpenAI GPT-4o | 15-30 seconds | High |
| Claude 3.5 | 15-30 seconds | High |

### Reliability Features

- **Startup cleanup**: Stuck RUNNING jobs auto-resolved
- **Key rotation**: LandingAI quota exhaustion auto-fallback
- **Timeout**: 5-minute HTTP timeout on LandingAI calls
- **Retry**: 2 attempts with 5-second gap on timeout
- **Chunking**: Large PDFs split into 80K-char chunks, extracted in parallel
- **Deduplication**: Multi-record results deduplicated by primary key
- **Fallback chain**: LandingAI → Smart Regex → Heuristic → NULL

---

## 19. Deployment & Configuration

### Prerequisites

```
Python 3.12+
Node.js 18+
Git
```

### Quick Start

```bash
# 1. Clone
git clone https://github.com/Chandra-AQT/DOCPlus-AI.git
cd "DOCPlus AI"

# 2. Backend setup
cd backend
pip install -r requirements.txt
python migrate_db.py
python main.py  # starts on port 8000

# 3. Frontend setup (new terminal)
cd frontend
npm install
npm run dev  # starts on port 5173
```

### Environment Configuration

Create `backend/.env`:
```env
# Required
SECRET_KEY=your-jwt-secret-key-here

# Admin
ADMIN_EMAIL=admin@yourcompany.com

# Optional: LandingAI (or set via Admin Panel)
LANDINGAI_API_KEY=your-key-here
LANDINGAI_BASE_URL=production

# Optional: Microsoft Graph for emails
MS_TENANT_ID=
MS_CLIENT_ID=
MS_CLIENT_SECRET=
MS_SENDER_EMAIL=

# Optional: SMTP fallback
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

### `admin_config.py` Setup

```python
ADMIN_EMAILS = {"chandra.paidimukkala@aquarient.com"}
PLATFORM_NAME = "DOCPlus AI+"
NOTIFY_EMAIL  = "chandra.paidimukkala@aquarient.com"
```

### `start.bat` (Windows)

```bat
@echo off
start "" cmd /k "cd backend && python main.py"
start "" cmd /k "cd frontend && npm run dev"
```

### Production Considerations

1. Replace SQLite with PostgreSQL for multi-user production
2. Set `CORS allow_origins` to specific domains
3. Use environment variables for all secrets (no hardcoding)
4. Add rate limiting on guest registration endpoint
5. Use nginx reverse proxy in front of uvicorn
6. Enable HTTPS with SSL certificates
7. Set up log rotation for uvicorn logs
8. Regular DB backups

---

## 20. Future Roadmap

### Short Term (Q4 2026)
- [ ] PostgreSQL migration for production scalability
- [ ] Email OTP verification for guests (replace SMTP probe)
- [ ] Webhook notifications when extraction completes
- [ ] Scheduled extractions (cron-based)
- [ ] Schema version history

### Medium Term (Q1 2027)
- [ ] Multi-tenant architecture (multiple admin accounts)
- [ ] API key authentication for programmatic access
- [ ] Bulk document processing queue (Celery/Redis)
- [ ] OCR support for scanned PDFs (Tesseract integration)
- [ ] Document comparison (diff two extraction results)

### Long Term (Q2-Q3 2027)
- [ ] Mobile app (React Native)
- [ ] Chrome extension for one-click PDF extraction
- [ ] Custom AI model fine-tuning on domain documents
- [ ] Real-time collaboration on extraction results
- [ ] Marketplace for schemas (share/sell schemas)
- [ ] White-label / OEM version for enterprise customers

---

## Appendix A: Key File Descriptions

| File | Purpose |
|------|---------|
| `backend/main.py` | App entry point, DocPlus crawler endpoints, startup cleanup |
| `backend/guest_router.py` | All guest + admin management endpoints (1500+ lines) |
| `backend/app/services/pipeline.py` | Core 5-stage extraction orchestrator |
| `backend/app/services/landingai_service.py` | LandingAI API client, key pool, deduplication |
| `backend/app/services/schema_utils.py` | Schema normalization, field type handling |
| `backend/app/api/v1/endpoints/schemas.py` | Universal JSON schema parser |
| `backend/app/api/v1/endpoints/extraction.py` | Extraction endpoint, batch support, job management |
| `frontend/src/pages/ResultsPage.jsx` | Results display: spreadsheet, PDF viewer, export |
| `frontend/src/pages/GuestWizard.jsx` | Guest 4-step extraction wizard |
| `frontend/src/pages/AdminPage.jsx` | Full admin panel with all management features |
| `frontend/src/pages/ExtractionLogsPage.jsx` | Grouped extraction run history |

---

## Appendix B: Schema Examples

### Simple Flat Schema
```json
{
  "name": "Invoice Schema",
  "fields": [
    {"name": "invoice_number", "type": "string",   "description": "Invoice ID"},
    {"name": "vendor_name",    "type": "string",   "description": "Vendor or supplier name"},
    {"name": "total_amount",   "type": "currency", "description": "Total invoice amount"},
    {"name": "due_date",       "type": "date",     "description": "Payment due date"}
  ]
}
```

### Nested Array Schema (Product Specs)
```json
{
  "name": "Universal Product Specification Schema",
  "fields": [
    {"name": "ManufacturerName",    "type": "string",  "required": true},
    {"name": "ProductDescription",  "type": "string",  "required": true},
    {"name": "ProductLiteratureYear","type": "integer", "required": false},
    {
      "name": "models",
      "type": "list[object]",
      "description": "All product models in the document",
      "required": true,
      "fields": [
        {"name": "ModelNumber",      "type": "string", "required": true},
        {"name": "ShippingWeight",   "type": "number", "required": false},
        {"name": "Length_Table",     "type": "number", "required": false},
        {"name": "Width_Table",      "type": "number", "required": false},
        {"name": "Height_Table",     "type": "number", "required": false},
        {"name": "MCA",              "type": "number", "required": false},
        {"name": "AFUE_Percent",     "type": "number", "required": false}
      ]
    }
  ]
}
```

---

*Document prepared by Kiro AI — Aquarient Technologies LLC*
*DOCPlus AI⁺ v1.0 — September 2026*
*Repository: https://github.com/Chandra-AQT/DOCPlus-AI*
