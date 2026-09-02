"""
admin_config.py — Admin email whitelist + email notification configuration.

Email is sent via Microsoft Graph API (OAuth 2.0 client credentials).
This is the modern, secure approach for Microsoft 365 / Outlook accounts.
No passwords stored — uses Azure App credentials only.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO SET UP (one-time, ~10 minutes):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to https://portal.azure.com
2. Search "App registrations" → New registration
   - Name: DOCPlus AI Notifications
   - Account type: Single tenant
   - Click Register
3. Copy "Application (client) ID"  → MS_CLIENT_ID
4. Copy "Directory (tenant) ID"    → MS_TENANT_ID
5. Go to "Certificates & secrets" → New client secret
   - Description: docplus-email
   - Expires: 24 months
   - Copy the VALUE (shown only once!) → MS_CLIENT_SECRET
6. Go to "API permissions" → Add a permission
   → Microsoft Graph → Application permissions
   → Search "Mail.Send" → Add it
   → Click "Grant admin consent for [your org]"

Then set these environment variables (or add to .env file):
   MS_TENANT_ID     = your-tenant-id
   MS_CLIENT_ID     = your-client-id
   MS_CLIENT_SECRET = your-client-secret
   MS_SENDER_EMAIL  = chandra.paidimukkala@aquarient.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
import os

# ── Admin email whitelist ──────────────────────────────────────────────────────
# These emails receive full admin access automatically at registration.
ADMIN_EMAILS = {
    "chandra.paidimukkala@aquarient.com",   # Primary admin
    "vamshi.ranjole@aquarient.com",         # Admin
    "saideep.seelam@aquarient.com",         # Admin
    "srujana.dogga@aquarient.com",          # Admin
}

# ── Admin password (bcrypt hash) ──────────────────────────────────────────────
# Set via environment variable ADMIN_PASSWORD_HASH (generated with hash_password())
# Default: "Admin@2024!" — change this immediately via Admin Panel → Security
ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH", "")
ADMIN_PASSWORD_PLAIN = os.getenv("ADMIN_PASSWORD", "Admin@2024!")  # fallback plaintext if hash not set

# ── Microsoft Graph API config ────────────────────────────────────────────────
MS_TENANT_ID     = os.getenv("MS_TENANT_ID",     "")   # Azure Directory (tenant) ID
MS_CLIENT_ID     = os.getenv("MS_CLIENT_ID",     "")   # Azure App (client) ID
MS_CLIENT_SECRET = os.getenv("MS_CLIENT_SECRET", "")   # Azure client secret value
MS_SENDER_EMAIL  = os.getenv("MS_SENDER_EMAIL",  "chandra.paidimukkala@aquarient.com")

# ── Notification target ───────────────────────────────────────────────────────
NOTIFY_EMAIL  = "chandra.paidimukkala@aquarient.com"
PLATFORM_NAME = "DOCPlus AI+"

# ── Legacy SMTP (kept as fallback — not used if Graph API is configured) ───────
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.office365.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
