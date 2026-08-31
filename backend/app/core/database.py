from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

_db_url = settings.DATABASE_URL
_is_sqlite = "sqlite" in _db_url

# Supabase / any external Postgres requires SSL
if not _is_sqlite and "sslmode" not in _db_url:
    _db_url = _db_url + ("&" if "?" in _db_url else "?") + "sslmode=require"

engine = create_engine(
    _db_url,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=True,
    pool_recycle=300 if not _is_sqlite else -1,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.models import document, schema, job, user, guest  # noqa — registers all models
    from app.models import guest_activity  # noqa — registers activity + access request tables
    Base.metadata.create_all(bind=engine)
    _apply_migrations()
    _seed_preset_schemas()


# ── Preset schema definitions ──────────────────────────────────────────────────
PRESET_SCHEMAS = [
    {
        "id":          "preset_product_literature",
        "name":        "Product Literature",
        "description": "Product manuals, spec sheets, brochures, datasheets",
        "domain":      "product_documentation",
        "icon":        "📄",
        "fields": [
            {"name": "source_file",             "type": "string", "required": True,
             "description": "Source document filename",
             "source_labels": ["file", "filename", "source", "document name"]},
            {"name": "manufacturer",            "type": "string", "required": True,
             "description": "Manufacturer or brand name (MFG)",
             "source_labels": ["manufacturer", "brand", "mfg", "mfr", "made by", "company", "vendor"]},
            {"name": "model_number",            "type": "string", "required": True,
             "description": "Model number or product code",
             "source_labels": ["model", "model number", "model no", "part number", "part no", "sku", "catalog number", "item number"]},
            {"name": "product_description",     "type": "string", "required": True,
             "description": "Product description as stated by the manufacturer",
             "source_labels": ["description", "product description", "product name", "product", "title", "overview"]},
            {"name": "product_literature_date", "type": "date",   "required": True,
             "description": "Publication or revision year (YR)",
             "source_labels": ["date", "publication date", "issue date", "revision date", "published", "year", "rev date"]},
            {"name": "product_line",            "type": "string", "required": True,
             "description": "Product line or product family (MFG)",
             "source_labels": ["product line", "product family", "series", "range", "line", "category", "collection"]},
        ],
    },
    {
        "id":          "preset_invoice",
        "name":        "Invoice",
        "description": "Invoices, bills, purchase orders, receipts",
        "domain":      "finance",
        "icon":        "🧾",
        "fields": [
            {"name": "invoice_number",   "type": "string",   "required": True,
             "description": "Invoice number or invoice ID",
             "source_labels": ["invoice number", "invoice no", "invoice #", "bill number", "po number", "order number"]},
            {"name": "invoice_date",     "type": "date",     "required": True,
             "description": "Date the invoice was issued",
             "source_labels": ["invoice date", "date", "issue date", "bill date", "dated"]},
            {"name": "vendor_name",      "type": "string",   "required": True,
             "description": "Vendor, supplier, or seller name",
             "source_labels": ["vendor", "vendor name", "supplier", "from", "seller", "billed from", "company", "sold by"]},
            {"name": "customer_bill_to", "type": "string",   "required": True,
             "description": "Customer or billing address",
             "source_labels": ["bill to", "customer", "client", "buyer", "ship to", "billed to", "sold to"]},
            {"name": "total_amount",     "type": "currency", "required": True,
             "description": "Total invoice amount",
             "source_labels": ["total", "total amount", "amount due", "grand total", "total due", "invoice total", "balance due"]},
            {"name": "due_date",         "type": "date",     "required": True,
             "description": "Payment due date",
             "source_labels": ["due date", "payment due", "pay by", "due", "net due", "terms"]},
        ],
    },
    {
        "id":          "preset_manual",
        "name":        "Manual / IOM",
        "description": "Installation, operation and maintenance manuals",
        "domain":      "technical",
        "icon":        "📖",
        "fields": [
            {"name": "document_title",   "type": "string", "required": True,
             "description": "Title of the manual",
             "source_labels": ["title", "document title", "manual title", "name"]},
            {"name": "manufacturer",     "type": "string", "required": True,
             "description": "Manufacturer name",
             "source_labels": ["manufacturer", "brand", "mfg", "company", "made by"]},
            {"name": "model_number",     "type": "string", "required": True,
             "description": "Model number or product code",
             "source_labels": ["model", "model number", "model no", "part number", "applies to"]},
            {"name": "document_date",    "type": "date",   "required": True,
             "description": "Publication or revision date",
             "source_labels": ["date", "publication date", "revision date", "issue date", "printed"]},
            {"name": "revision",         "type": "string", "required": False,
             "description": "Revision number or version",
             "source_labels": ["revision", "rev", "version", "edition", "release"]},
            {"name": "product_line",     "type": "string", "required": False,
             "description": "Product line or series",
             "source_labels": ["product line", "series", "range", "product family", "applies to"]},
        ],
    },
    {
        "id":          "preset_spec_sheet",
        "name":        "Spec Sheet",
        "description": "Technical specification sheets and datasheets",
        "domain":      "technical",
        "icon":        "📋",
        "fields": [
            {"name": "manufacturer",      "type": "string", "required": True,
             "description": "Manufacturer or brand name",
             "source_labels": ["manufacturer", "brand", "mfg", "company", "vendor"]},
            {"name": "model_number",      "type": "string", "required": True,
             "description": "Model number or part number",
             "source_labels": ["model", "model number", "part number", "sku", "item number", "cat no"]},
            {"name": "product_description","type": "string","required": True,
             "description": "Product description",
             "source_labels": ["description", "product", "product name", "title", "name"]},
            {"name": "specifications",    "type": "string", "required": True,
             "description": "Technical specifications summary",
             "source_labels": ["specifications", "specs", "technical data", "performance data", "ratings", "features"]},
            {"name": "certifications",    "type": "list",   "required": False,
             "description": "Certifications and compliance standards",
             "source_labels": ["certifications", "certified", "approvals", "listed", "complies", "standards", "ul", "ce"]},
            {"name": "product_line",      "type": "string", "required": False,
             "description": "Product line or series",
             "source_labels": ["product line", "series", "range", "family", "line"]},
        ],
    },
    {
        "id":          "preset_contract",
        "name":        "Contract / Agreement",
        "description": "Contracts, agreements, legal documents",
        "domain":      "legal",
        "icon":        "📜",
        "fields": [
            {"name": "contract_title",   "type": "string", "required": True,
             "description": "Title or name of the contract",
             "source_labels": ["agreement", "contract", "title", "subject"]},
            {"name": "parties",          "type": "list",   "required": True,
             "description": "Names of all parties involved",
             "source_labels": ["parties", "between", "party", "signatory", "contractor", "client", "vendor"]},
            {"name": "effective_date",   "type": "date",   "required": True,
             "description": "Contract start or effective date",
             "source_labels": ["effective date", "start date", "commencement date", "dated", "beginning"]},
            {"name": "expiry_date",      "type": "date",   "required": False,
             "description": "Contract expiry or termination date",
             "source_labels": ["expiry date", "expiration date", "end date", "termination date", "expires"]},
            {"name": "contract_value",   "type": "currency","required": False,
             "description": "Total contract value or amount",
             "source_labels": ["contract value", "total value", "amount", "consideration", "fee", "price"]},
            {"name": "governing_law",    "type": "string", "required": False,
             "description": "Governing law or jurisdiction",
             "source_labels": ["governing law", "jurisdiction", "law", "venue", "applicable law"]},
        ],
    },
    {
        "id":          "preset_report",
        "name":        "Report",
        "description": "Business reports, research reports, assessments",
        "domain":      "business",
        "icon":        "📊",
        "fields": [
            {"name": "report_title",     "type": "string", "required": True,
             "description": "Title of the report",
             "source_labels": ["title", "report title", "subject", "name"]},
            {"name": "author",           "type": "string", "required": True,
             "description": "Author, preparer, or organization",
             "source_labels": ["author", "prepared by", "written by", "company", "organization", "submitted by"]},
            {"name": "report_date",      "type": "date",   "required": True,
             "description": "Date the report was issued or published",
             "source_labels": ["date", "report date", "published", "issued", "dated", "submitted"]},
            {"name": "summary",          "type": "string", "required": True,
             "description": "Executive summary or abstract",
             "source_labels": ["summary", "executive summary", "abstract", "overview", "introduction"]},
            {"name": "key_findings",     "type": "list",   "required": True,
             "description": "Key findings, conclusions, or recommendations",
             "source_labels": ["findings", "conclusions", "recommendations", "results", "outcomes", "key points"]},
            {"name": "report_period",    "type": "string", "required": False,
             "description": "Reporting period or scope",
             "source_labels": ["period", "reporting period", "scope", "fiscal year", "quarter", "year"]},
        ],
    },
]


def _seed_preset_schemas():
    """
    Seed all preset schemas into the DB at startup.
    Each schema has a stable ID (preset_*) so extraction always finds it.
    Upserts — safe to run on every restart.
    Also keeps backward-compatible 'guest_fixed_schema' pointing to product_literature.
    """
    from app.models.schema import SchemaDefinition
    db = SessionLocal()
    try:
        created = 0
        updated = 0
        for preset in PRESET_SCHEMAS:
            existing = db.query(SchemaDefinition).filter(
                SchemaDefinition.id == preset["id"]
            ).first()
            if existing:
                existing.name           = preset["name"]
                existing.description    = preset["description"]
                existing.domain         = preset["domain"]
                existing.fields         = preset["fields"]
                existing.raw_definition = {"name": preset["name"], "fields": preset["fields"]}
                updated += 1
            else:
                s = SchemaDefinition(
                    id=preset["id"],
                    user_id=None,
                    name=preset["name"],
                    description=preset["description"],
                    version="1.0",
                    domain=preset["domain"],
                    fields=preset["fields"],
                    raw_definition={"name": preset["name"], "fields": preset["fields"]},
                )
                db.add(s)
                created += 1

        # Backward compat: keep 'guest_fixed_schema' as alias for product literature
        pl = next(p for p in PRESET_SCHEMAS if p["id"] == "preset_product_literature")
        legacy = db.query(SchemaDefinition).filter(
            SchemaDefinition.id == "guest_fixed_schema"
        ).first()
        if legacy:
            legacy.fields         = pl["fields"]
            legacy.name           = pl["name"]
            legacy.description    = pl["description"]
            legacy.raw_definition = {"name": pl["name"], "fields": pl["fields"]}
        else:
            db.add(SchemaDefinition(
                id="guest_fixed_schema",
                user_id=None,
                name=pl["name"],
                description=pl["description"],
                version="1.0",
                domain=pl["domain"],
                fields=pl["fields"],
                raw_definition={"name": pl["name"], "fields": pl["fields"]},
            ))

        # ── Universal Product Specification Schema ────────────────────────────
        UNIVERSAL_PRODUCT_SCHEMA_ID = "universal_product_specification_schema"
        upss_fields = [
            {"name": "ManufacturerName", "type": "string", "required": True,
             "description": "Full manufacturer or brand name exactly as printed. Do NOT abbreviate.",
             "source_labels": ["manufacturer", "brand", "mfg", "manufactured by", "company", "made by"]},
            {"name": "ProductDescription", "type": "string", "required": True,
             "description": "Complete product description — include the full sentence, not just keywords.",
             "source_labels": ["description", "product description", "product name", "title", "overview"]},
            {"name": "ProductLine", "type": "string",
             "description": "Product line, series, or family name (e.g. 'Master Electric Griddle', 'GWC Series 2')",
             "source_labels": ["product line", "series", "line", "product family", "range", "collection"]},
            {"name": "ProductLiteratureYear", "type": "integer",
             "description": "4-digit year the document was published or last revised. Look in header/footer/copyright.",
             "source_labels": ["year", "date", "publication date", "issue date", "rev date", "copyright", "revised"]},
            {"name": "ProductLiteratureID", "type": "string",
             "description": "Product literature ID, catalog number, or bulletin number",
             "source_labels": ["literature id", "catalog", "cat no", "publication id", "lit id", "bulletin", "pub no"]},
            {"name": "DocumentFormNumber", "type": "string",
             "description": "Document form number or reference code printed on the document (e.g. 'SS-54-B', 'Form No. W-501')",
             "source_labels": ["form number", "form no", "part number", "doc number", "document no", "ref no", "form"]},
            {
                "name": "models", "type": "list",
                "description": (
                    "Extract EVERY product model as a separate object. "
                    "Each row in ANY specification, ratings, or dimensions table = one model object. "
                    "Never merge rows. Never skip a row. If the same model appears with different "
                    "voltages/NEMA configs, create one object per electrical configuration."
                ),
                "source_labels": ["model", "models", "model number", "specifications", "spec table", "ratings", "dimensions"],
                "fields": [
                    {"name": "ModelNumber", "type": "string", "required": True,
                     "description": "Exact model number from the spec table, verbatim. Do not modify or truncate.",
                     "source_labels": ["model", "model number", "model no", "part number", "item no", "cat no"]},
                    {"name": "ShippingWeight", "type": "number",
                     "description": (
                         "Shipping/gross weight in lbs from DIMENSIONS table — the PACKAGED transport weight. "
                         "Look for 'Approx. Shipping Weight', 'Ship Wt', 'Gross Weight'. "
                         "IMPORTANT: This is DIFFERENT from installed/net/operating weight. "
                         "Return NULL if not explicitly labeled as shipping weight."
                     ),
                     "source_labels": ["shipping weight", "ship weight", "ship wt", "gross weight", "approx. shipping weight", "pkg weight"]},
                    {"name": "InstalledWeight", "type": "number",
                     "description": (
                         "Installed/net/operating weight in lbs — weight of the unit when in use, without packaging. "
                         "Look for 'Installed Weight', 'Net Weight', 'Operating Weight', or just 'Weight (lbs)'."
                     ),
                     "source_labels": ["installed weight", "net weight", "operating weight", "weight", "unit weight", "approx. weight"]},
                    {"name": "Length_Table", "type": "number",
                     "description": (
                         "Equipment length (front-to-back depth) in INCHES from spec TABLE only — not diagrams. "
                         "Convert fractions: 35-1/32 → 35.03125, 30-3/4 → 30.75. "
                         "If column is labeled 'Depth' or 'D', use that value."
                     ),
                     "source_labels": ["length", "l", "depth", "d", "length (in)", "depth (in)", "length inches"]},
                    {"name": "Width_Table", "type": "number",
                     "description": (
                         "Equipment width (left-to-right) in INCHES from spec TABLE only — not diagrams. "
                         "Convert fractions to decimals. Column labeled 'Width' or 'W'."
                     ),
                     "source_labels": ["width", "w", "width (in)", "width inches"]},
                    {"name": "Height_Table", "type": "number",
                     "description": "Equipment height in INCHES from spec TABLE only. Convert fractions to decimals.",
                     "source_labels": ["height", "h", "height (in)", "height inches"]},
                    {"name": "Diameter_Table", "type": "number",
                     "description": "Equipment diameter in INCHES from spec TABLE. Only for round/circular items. NULL if not applicable.",
                     "source_labels": ["diameter", "dia", "od", "diameter (in)"]},
                    {"name": "CordLength_ft", "type": "number",
                     "description": "Power cord length in FEET. Look for 'Cord Length', 'Supply Cord Length'. NULL if not present.",
                     "source_labels": ["cord length", "cord", "supply cord", "power cord", "cable length"]},
                    {"name": "NEMA_Config", "type": "string",
                     "description": "NEMA plug configuration (e.g. 'NEMA 15-50P', 'NEMA 6-20P'). Look in electrical specs.",
                     "source_labels": ["nema", "nema config", "plug", "receptacle", "plug type", "nema plug", "nema 15", "nema 6"]},
                    {"name": "MinimumCircuitAmps_MCA", "type": "number",
                     "description": "Minimum Circuit Ampacity in amps. Look for 'MCA', 'Min Circuit Amps', 'Minimum Circuit Ampacity'.",
                     "source_labels": ["mca", "min circuit amps", "minimum circuit", "ampacity", "min ampacity"]},
                    {"name": "MaximumOverCurrentProtection_MOP", "type": "number",
                     "description": "Max Over-Current Protection in amps. Look for 'MOP', 'MOCP', 'Max Overcurrent', 'Max Fuse'.",
                     "source_labels": ["mop", "mocp", "max over current", "maximum protection", "breaker", "max fuse", "max overcurrent"]},
                    {"name": "PowerSupplyConfiguration_Volts", "type": "string",
                     "description": "Full electrical supply spec: Volts/Hz/Phase (e.g. '208/60/3', '115/60/1', '115/208V'). Include all parts.",
                     "source_labels": ["volts", "voltage", "power supply", "electrical", "v/hz/ph", "supply", "208v", "240v", "115v"]},
                    {"name": "InputCapacity_BTUhr", "type": "number",
                     "description": (
                         "Gas/fuel input in BTU/hr. "
                         "If value is in MBH, multiply by 1000 (72 MBH = 72000). "
                         "Look for 'Input', 'Input BTU', 'Gas Input', 'Input Capacity'."
                     ),
                     "source_labels": ["input", "input capacity", "btu", "btu/hr", "input btuh", "mbh input", "gas input", "input mbh"]},
                    {"name": "OutputCapacity_BTUhr", "type": "number",
                     "description": (
                         "Heating output in BTU/hr. "
                         "If in MBH, multiply by 1000. "
                         "Look for 'Output', 'Heating Output', 'Net Output', 'Output Capacity'."
                     ),
                     "source_labels": ["output", "output capacity", "output btu", "heating output", "net output", "mbh output"]},
                    {"name": "Efficiency_AFUE_Percent", "type": "number",
                     "description": "Efficiency % (AFUE or thermal). Extract numeric value only (91.9 for 91.9%).",
                     "source_labels": ["efficiency", "afue", "thermal efficiency", "%", "eff", "afue %"]},
                    {"name": "FuelType", "type": "string",
                     "description": "Primary fuel/energy: 'Gas', 'Electric', 'Refrigerant', 'Steam', 'Oil'. Derive from context if needed.",
                     "source_labels": ["fuel", "fuel type", "energy type", "heat type", "electric", "gas", "refrigerant"]},
                    {"name": "GasType", "type": "string",
                     "description": "Gas/refrigerant type: 'Natural Gas', 'Propane', 'LP', 'R-404A', etc. For refrigeration use refrigerant name.",
                     "source_labels": ["gas type", "gas", "natural gas", "propane", "ng", "lp", "refrigerant", "r-404a", "r-410a"]},
                ],
            },
        ]

        existing_upss = db.query(SchemaDefinition).filter(SchemaDefinition.id == UNIVERSAL_PRODUCT_SCHEMA_ID).first()
        if existing_upss:
            existing_upss.fields         = upss_fields
            existing_upss.name           = "Universal Product Specification Schema"
            existing_upss.description    = "Extract ALL product models from any product PDF. Multi-record. Each model = one row."
            existing_upss.raw_definition = {"name": "Universal Product Specification Schema", "fields": upss_fields}
        else:
            db.add(SchemaDefinition(
                id=UNIVERSAL_PRODUCT_SCHEMA_ID,
                user_id=None,
                name="Universal Product Specification Schema",
                description="Extract ALL product models from HVAC/industrial PDFs. Multi-record table extraction.",
                version="1.0",
                domain="product_specification",
                fields=upss_fields,
                raw_definition={"name": "Universal Product Specification Schema", "fields": upss_fields},
            ))

        db.commit()
        print("[SEED] Universal Product Specification Schema seeded")

    except Exception as e:
        print(f"[SEED] Preset schema seed error: {e}")
        db.rollback()
    finally:
        db.close()


def _apply_migrations():
    """Safely add any missing columns without dropping existing data."""
    from sqlalchemy import text, inspect
    insp = inspect(engine)

    migrations = {
        "extraction_jobs": [
            ("batch_id",         "VARCHAR"),
            ("schema_id",        "VARCHAR"),
            ("schema_fields",    "JSON"),
            ("evidence",         "JSON"),
            ("validation_errors","JSON"),
            ("failure_log",      "JSON"),
            ("duration_seconds", "FLOAT"),
            ("sources",          "JSON"),
        ],
        "documents": [
            ("user_id",    "VARCHAR"),
            ("page_count", "INTEGER"),
        ],
        "extraction_batches": [
            ("user_id", "VARCHAR"),
        ],
        "users": [
            ("last_login", "TIMESTAMP"),
            ("is_admin",   "BOOLEAN DEFAULT FALSE"),
        ],
    }

    with engine.connect() as conn:
        for table, columns in migrations.items():
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            for col_name, col_type in columns:
                if col_name not in existing:
                    try:
                        conn.execute(text(
                            f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"
                        ))
                        conn.commit()
                    except Exception:
                        conn.rollback()
