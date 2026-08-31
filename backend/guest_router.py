"""
guest_router.py — Guest registration, session, and admin management endpoints.

POST /guests/register          — Register a new guest (or retrieve existing by email)
GET  /guests/me                — Get current guest profile + usage (by session token)
POST /guests/ping              — Update last_seen timestamp

GET  /admin/guests             — List all guests (admin only)
GET  /admin/guests/{id}        — Get specific guest
PUT  /admin/guests/{id}/limits — Update guest limits
DELETE /admin/guests/{id}      — Delete guest
POST /admin/guests/{id}/reset-usage — Reset guest usage counters
POST /admin/notify-test        — Test admin email notification
"""
from __future__ import annotations

import os
import uuid
import json
import smtplib
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi import UploadFile, File, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.guest import Guest
from app.models.user import User
from app.models.guest_activity import GuestActivity, GuestAccessRequest

router = APIRouter()

# ── Config ────────────────────────────────────────────────────────────────────
from admin_config import (
    ADMIN_EMAILS as ADMIN_EMAILS_SET,
    MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_SENDER_EMAIL,
    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
    NOTIFY_EMAIL as ADMIN_EMAIL,
    PLATFORM_NAME,
)


# ══════════════════════════════════════════════════════════════════════════════
# EMAIL — Microsoft Graph API (primary) with SMTP fallback
# ══════════════════════════════════════════════════════════════════════════════

def _build_html(guest: Guest) -> str:
    """Build the HTML email body for a new guest registration."""
    reg_time = guest.created_at.strftime('%Y-%m-%d %H:%M UTC') if guest.created_at else 'Just now'
    return f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#060b18;font-family:Arial,sans-serif">
  <div style="max-width:580px;margin:32px auto;background:#0d1526;border-radius:16px;
              padding:36px;border:1px solid rgba(255,255,255,0.1)">

    <!-- Header -->
    <div style="margin-bottom:28px">
      <div style="display:inline-block;background:linear-gradient(135deg,#2563eb,#7c3aed);
                  border-radius:12px;padding:10px 16px;margin-bottom:16px">
        <span style="color:#fff;font-weight:900;font-size:18px">DOCPlus AI<sup>+</sup></span>
      </div>
      <h2 style="color:#60a5fa;margin:0 0 4px;font-size:22px">New Guest Registration</h2>
      <p style="color:rgba(255,255,255,0.4);margin:0;font-size:13px">
        A new user has registered on {PLATFORM_NAME}
      </p>
    </div>

    <!-- Guest details -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4);font-size:13px;width:38%">Full Name</td>
        <td style="padding:10px 0;color:#ffffff;font-weight:700;font-size:14px">{guest.full_name}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4);font-size:13px">Email</td>
        <td style="padding:10px 0;color:#60a5fa;font-size:14px">{guest.email}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4);font-size:13px">Role</td>
        <td style="padding:10px 0;color:#e2e8f0;font-size:14px">{guest.current_role or '—'}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4);font-size:13px">Company</td>
        <td style="padding:10px 0;color:#e2e8f0;font-size:14px">{guest.company or '—'}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4);font-size:13px">Note</td>
        <td style="padding:10px 0;color:#e2e8f0;font-size:14px">{guest.note or '—'}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:rgba(255,255,255,0.4);font-size:13px">Registered</td>
        <td style="padding:10px 0;color:#e2e8f0;font-size:14px">{reg_time}</td>
      </tr>
    </table>

    <!-- Trial limits box -->
    <div style="background:rgba(37,99,235,0.1);border:1px solid rgba(37,99,235,0.25);
                border-radius:12px;padding:16px 20px;margin-bottom:24px">
      <p style="margin:0 0 8px;color:#93c5fd;font-size:12px;font-weight:700;
                text-transform:uppercase;letter-spacing:0.05em">Trial Limits Assigned</p>
      <div style="display:flex;gap:24px">
        <div>
          <span style="color:#60a5fa;font-size:22px;font-weight:900">{guest.pdf_fetch_limit}</span>
          <span style="color:rgba(255,255,255,0.5);font-size:12px;margin-left:4px">PDF fetches</span>
        </div>
        <div>
          <span style="color:#a78bfa;font-size:22px;font-weight:900">{guest.extraction_limit}</span>
          <span style="color:rgba(255,255,255,0.5);font-size:12px;margin-left:4px">extractions</span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <p style="color:rgba(255,255,255,0.2);font-size:11px;margin:0;text-align:center">
      {PLATFORM_NAME} · Automated notification · Do not reply to this email
    </p>
  </div>
</body>
</html>"""


def _get_graph_token() -> Optional[str]:
    """
    Obtain an OAuth 2.0 access token from Microsoft identity platform
    using client credentials flow (app-only, no user interaction).
    Returns the token string, or None if credentials not configured.
    """
    if not all([MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET]):
        return None

    url  = f"https://login.microsoftonline.com/{MS_TENANT_ID}/oauth2/v2.0/token"
    data = urllib.parse.urlencode({
        "grant_type":    "client_credentials",
        "client_id":     MS_CLIENT_ID,
        "client_secret": MS_CLIENT_SECRET,
        "scope":         "https://graph.microsoft.com/.default",
    }).encode("utf-8")

    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    with urllib.request.urlopen(req, timeout=15) as resp:
        payload = json.loads(resp.read())
        return payload.get("access_token")


def _send_via_graph(subject: str, html_body: str, to_email: str) -> None:
    """
    Send an email using Microsoft Graph API.
    POST https://graph.microsoft.com/v1.0/users/{sender}/sendMail
    """
    token = _get_graph_token()
    if not token:
        raise RuntimeError("Graph API credentials not configured")

    message = {
        "message": {
            "subject": subject,
            "body": {
                "contentType": "HTML",
                "content": html_body,
            },
            "toRecipients": [
                {"emailAddress": {"address": to_email}}
            ],
        },
        "saveToSentItems": "true",
    }

    url     = f"https://graph.microsoft.com/v1.0/users/{MS_SENDER_EMAIL}/sendMail"
    payload = json.dumps(message).encode("utf-8")
    req     = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type",  "application/json")

    with urllib.request.urlopen(req, timeout=20) as resp:
        # 202 Accepted = success (no body returned)
        if resp.status not in (200, 202):
            raise RuntimeError(f"Graph API returned HTTP {resp.status}")


def _send_via_smtp(subject: str, html_body: str, to_email: str) -> None:
    """Fallback: send via SMTP (Office 365 or Gmail)."""
    if not SMTP_USER or not SMTP_PASS:
        raise RuntimeError("SMTP credentials not configured")

    msg             = MIMEMultipart("alternative")
    msg["Subject"]  = subject
    msg["From"]     = SMTP_USER
    msg["To"]       = to_email
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_USER, to_email, msg.as_string())


def send_admin_notification(guest: Guest) -> None:
    """
    Send guest registration notification to admin.
    Tries Microsoft Graph API first, falls back to SMTP if Graph not configured.
    Logs outcome but never raises — email failure must not break registration.
    """
    if not ADMIN_EMAIL:
        print("[EMAIL] ADMIN_EMAIL not set — skipping notification")
        return

    subject  = f"[{PLATFORM_NAME}] New Guest: {guest.full_name} ({guest.email})"
    html     = _build_html(guest)
    method   = "none"

    try:
        # ── Try Graph API first ───────────────────────────────────────────────
        if MS_TENANT_ID and MS_CLIENT_ID and MS_CLIENT_SECRET:
            _send_via_graph(subject, html, ADMIN_EMAIL)
            method = "Graph API"
        # ── Fall back to SMTP ────────────────────────────────────────────────
        elif SMTP_USER and SMTP_PASS:
            _send_via_smtp(subject, html, ADMIN_EMAIL)
            method = "SMTP"
        else:
            print("[EMAIL] No email credentials configured — skipping notification")
            return

        print(f"[EMAIL] ✓ Admin notification sent via {method} → {ADMIN_EMAIL}")

    except Exception as exc:
        print(f"[EMAIL] ✗ Failed to send notification via {method}: {exc}")
        # If Graph failed but SMTP is configured, try SMTP as emergency fallback
        if method == "Graph API" and SMTP_USER and SMTP_PASS:
            try:
                _send_via_smtp(subject, html, ADMIN_EMAIL)
                print(f"[EMAIL] ✓ Fallback SMTP succeeded → {ADMIN_EMAIL}")
            except Exception as smtp_exc:
                print(f"[EMAIL] ✗ SMTP fallback also failed: {smtp_exc}")


# ── Request / Response models ─────────────────────────────────────────────────

class GuestRegisterRequest(BaseModel):
    first_name:   str
    middle_name:  Optional[str] = ""
    last_name:    str
    email:        str
    current_role: Optional[str] = ""
    company:      Optional[str] = ""
    note:         Optional[str] = ""


class GuestResponse(BaseModel):
    id:                  str
    email:               str
    first_name:          str
    middle_name:         str
    last_name:           str
    full_name:           str
    current_role:        str
    company:             str
    note:                str
    session_token:       str
    pdf_fetched:         int
    pdf_fetch_limit:     int
    pdf_remaining:       int
    extractions_used:    int
    extraction_limit:    int
    extraction_remaining:int
    is_returning:        bool
    created_at:          Optional[str]


class GuestLimitUpdate(BaseModel):
    pdf_fetch_limit:   Optional[int]  = None
    extraction_limit:  Optional[int]  = None
    is_active:         Optional[bool] = None
    upload_allowed:    Optional[bool] = None
    export_allowed:    Optional[bool] = None


def guest_to_response(g: Guest, is_returning: bool = False) -> dict:
    return {
        "id":                   g.id,
        "email":                g.email,
        "first_name":           g.first_name or "",
        "middle_name":          g.middle_name or "",
        "last_name":            g.last_name or "",
        "full_name":            g.full_name,
        "current_role":         g.current_role or "",
        "company":              g.company or "",
        "note":                 g.note or "",
        "session_token":        g.session_token or "",
        "pdf_fetched":          g.pdf_fetched,
        "pdf_fetch_limit":      g.pdf_fetch_limit,
        "pdf_remaining":        g.pdf_remaining,
        "extractions_used":     g.extractions_used,
        "extraction_limit":     g.extraction_limit,
        "extraction_remaining": g.extraction_remaining,
        "upload_allowed":       bool(g.upload_allowed),
        "export_allowed":       bool(g.export_allowed),
        "is_business_email":    bool(getattr(g, 'is_business_email', True)),
        "email_verified":       bool(getattr(g, 'email_verified', False)),
        "is_returning":         is_returning,
        "created_at":           g.created_at.isoformat() if g.created_at else None,
    }


# ── Helper: get guest from session token header ───────────────────────────────

def get_guest_from_token(
    x_guest_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[Guest]:
    if not x_guest_token:
        return None
    guest = db.query(Guest).filter(Guest.session_token == x_guest_token).first()
    return guest


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/guests/signin")
def guest_signin(req: dict, db: Session = Depends(get_db)):
    """
    Sign in an existing guest by email only. 
    NEVER creates a new account — returns 404 if email not registered.
    """
    email = (req.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Valid email address required")

    # Check admin emails first
    if ADMIN_EMAILS_SET and email in ADMIN_EMAILS_SET:
        admin_user = db.query(User).filter(User.email == email).first()
        if admin_user:
            from app.core.auth import create_access_token
            token = create_access_token(user_id=admin_user.id, email=admin_user.email)
            return {
                "is_admin": True,
                "token":    token,
                "user": {
                    "id":       admin_user.id,
                    "email":    admin_user.email,
                    "full_name":admin_user.full_name,
                    "is_admin": True,
                }
            }

    # Look up existing guest
    existing = db.query(Guest).filter(Guest.email == email).first()
    if not existing:
        raise HTTPException(404, "Email not registered. Please create an account using the registration form.")

    # Update session token if needed
    if not existing.session_token:
        existing.session_token = str(uuid.uuid4())
    existing.last_seen = datetime.utcnow()
    db.commit()

    return {"guest": guest_to_response(existing, is_returning=True), "is_returning": True}


@router.post("/guests/register")
def register_guest(req: GuestRegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new guest or retrieve an existing one by email.
    If email matches ADMIN_EMAILS_SET → returns admin session token.
    Returns session token for all subsequent requests.
    """
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Valid email address required")

    # ── Comprehensive email validation ────────────────────────────────────────
    domain = email.split("@")[-1].lower().strip()

    # Layer 1: Disposable / throwaway email blocker — expanded list
    DISPOSABLE_DOMAINS = {
        # Throwaway services
        "mailinator.com", "guerrillamail.com", "guerrillamailblock.com",
        "tempmail.com", "throwaway.email", "yopmail.com", "trashmail.com",
        "discard.email", "maildrop.cc", "fakeinbox.com", "getnada.com",
        "sharklasers.com", "spam4.me", "grr.la", "guerrillamail.info",
        "guerrillamail.biz", "guerrillamail.de", "guerrillamail.net",
        "guerrillamail.org", "getairmail.com", "mailnull.com", "spamgourmet.com",
        "trashmail.at", "trashmail.io", "trashmail.me", "trashmail.net",
        "trashmail.xyz", "tempinbox.com", "tempr.email", "temp-mail.org",
        "temp-mail.io", "mohmal.com", "mailtemp.info", "tempmailo.com",
        "mytemp.email", "anonbox.net", "inboxalias.com", "throwam.com",
        "spamhereplease.com", "mailbox52.ga", "safetymail.info", "spambox.us",
        "deadaddress.com", "spaml.de", "mail-temporaire.fr",
        # Obviously fake/test domains
        "fake.com", "test.com", "example.com", "example.org", "example.net",
        "test.org", "hh.com", "abc.com", "xyz.com", "asdf.com", "temp.com",
        "qwerty.com", "null.com", "noemail.com", "invalid.com", "nomail.com",
        "no-reply.com", "noreply.com", "donotreply.com",
    }
    if domain in DISPOSABLE_DOMAINS:
        raise HTTPException(400, f"Disposable or temporary email addresses are not accepted. Please use your work or personal email.")

    # Layer 2: MX record check — domain must have mail servers
    mx_host = None
    try:
        import dns.resolver
        mx_records = dns.resolver.resolve(domain, "MX", lifetime=5)
        if not mx_records:
            raise HTTPException(400, f"'{domain}' does not have mail servers. Please use a valid email address.")
        # Get the highest-priority MX host for SMTP check
        mx_host = sorted(mx_records, key=lambda r: r.preference)[0].exchange.to_text().rstrip(".")
    except ImportError:
        # dnspython not installed — skip MX check, rely on other layers
        pass
    except Exception as dns_error:
        error_str = str(dns_error).lower()
        error_type = type(dns_error).__name__
        if any(x in error_str for x in ["nxdomain", "no answer", "servfail", "does not contain"]) or \
           error_type in ("NoAnswer", "NXDOMAIN", "NoNameservers"):
            raise HTTPException(400, f"Email domain '{domain}' does not exist or cannot receive emails. Please use a valid email.")
        # Transient DNS error — allow through
        print(f"[EMAIL VALIDATION] DNS lookup error for {domain}: {dns_error} — allowing registration")

    # Layer 3: SMTP mailbox verification (non-intrusive RCPT TO check)
    # Connect to the mail server and check if the mailbox exists WITHOUT sending email
    # This is the most accurate way to detect working emails
    if mx_host:
        try:
            import smtplib
            smtp_verified = _verify_email_smtp(email, mx_host)
            if smtp_verified is False:
                # Definitively rejected by mail server
                raise HTTPException(400, f"Email address '{email}' does not exist or cannot receive emails. Please check and try again.")
            # smtp_verified == None means inconclusive (server blocked VRFY) — allow through
        except HTTPException:
            raise
        except Exception as smtp_err:
            # SMTP check failed (timeout, connection refused, etc.) — allow through
            print(f"[EMAIL VALIDATION] SMTP check failed for {email}: {smtp_err} — allowing registration")

    # Layer 4: Store email quality info (business vs free email) for admin insight
    FREE_EMAIL_PROVIDERS = {
        "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
        "live.com", "msn.com", "aol.com", "protonmail.com", "zoho.com",
        "yandex.com", "mail.com", "gmx.com", "inbox.com", "rediffmail.com",
        "mail.ru", "yahoo.co.uk", "yahoo.in", "hotmail.co.uk",
    }
    is_business_email = domain not in FREE_EMAIL_PROVIDERS
    # This info is stored when creating the guest — useful for sales pitch targeting

    # ── Admin email check ─────────────────────────────────────────────────────
    if ADMIN_EMAILS_SET and email in ADMIN_EMAILS_SET:
        # Find or create the admin User record
        admin_user = db.query(User).filter(User.email == email).first()
        if not admin_user:
            from passlib.context import CryptContext
            _pwd = CryptContext(schemes=["bcrypt"])
            admin_user = User(
                email=email,
                hashed_password=_pwd.hash("admin-token-no-password-needed"),
                full_name=f"{req.first_name} {req.last_name}".strip(),
                is_active=True,
                is_admin=True,
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
        else:
            # Ensure admin flag is set
            if not admin_user.is_admin:
                admin_user.is_admin = True
                db.commit()

        # Generate admin JWT token
        from app.core.auth import create_access_token
        token = create_access_token(user_id=admin_user.id, email=admin_user.email)

        return {
            "is_admin":  True,
            "token":     token,
            "user": {
                "id":       admin_user.id,
                "email":    admin_user.email,
                "full_name":admin_user.full_name,
                "is_admin": True,
            }
        }

    # ── Guest registration ────────────────────────────────────────────────────
    # Check if guest already exists (by email)
    existing = db.query(Guest).filter(Guest.email == email).first()
    if existing:
        # Return existing guest with their retained usage
        if not existing.session_token:
            existing.session_token = str(uuid.uuid4())
        existing.last_seen = datetime.utcnow()
        db.commit()
        return {"guest": guest_to_response(existing, is_returning=True), "is_returning": True}

    # Create new guest
    token = str(uuid.uuid4())
    # smtp_verified is set from Layer 3 check above (True/False/None)
    _smtp_result = locals().get('smtp_verified', None) if 'mx_host' in locals() and mx_host else None
    guest = Guest(
        id=str(uuid.uuid4()),
        email=email,
        first_name=req.first_name.strip(),
        middle_name=(req.middle_name or "").strip(),
        last_name=req.last_name.strip(),
        current_role=(req.current_role or "").strip(),
        company=(req.company or "").strip(),
        note=(req.note or "").strip(),
        session_token=token,
        pdf_fetched=0,
        extractions_used=0,
        pdf_fetch_limit=5,
        extraction_limit=2,
        # Email quality signals for sales outreach
        is_business_email=is_business_email if 'is_business_email' in locals() else True,
        email_verified=(_smtp_result is True),
    )
    db.add(guest)
    db.commit()
    db.refresh(guest)

    # Notify admin asynchronously (non-blocking)
    try:
        send_admin_notification(guest)
    except Exception:
        pass

    return {"guest": guest_to_response(guest, is_returning=False), "is_returning": False}


@router.get("/guests/me")
def get_guest_me(guest: Optional[Guest] = Depends(get_guest_from_token)):
    """Get current guest profile + usage by session token."""
    if not guest:
        raise HTTPException(401, "Invalid or missing guest session token")
    return guest_to_response(guest)


@router.post("/guests/ping")
def ping_guest(guest: Optional[Guest] = Depends(get_guest_from_token), db: Session = Depends(get_db)):
    """Update last_seen timestamp."""
    if not guest:
        raise HTTPException(401, "Invalid guest token")
    guest.last_seen = datetime.utcnow()
    db.commit()
    return {"ok": True}


# ── Admin endpoints ───────────────────────────────────────────────────────────

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(403, "Admin access required")
    return current_user


@router.get("/admin/guests")
def list_guests(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """List all registered guests with their usage stats."""
    guests = db.query(Guest).order_by(Guest.created_at.desc()).all()
    return {
        "guests": [guest_to_response(g) for g in guests],
        "total": len(guests),
        "stats": {
            "total_registered":    len(guests),
            "active_this_week":    sum(1 for g in guests if g.last_seen and (datetime.utcnow() - g.last_seen).days < 7),
            "total_pdfs_fetched":  sum(g.pdf_fetched for g in guests),
            "total_extractions":   sum(g.extractions_used for g in guests),
        }
    }


@router.get("/admin/guests/{guest_id}")
def get_guest(
    guest_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    g = db.query(Guest).filter(Guest.id == guest_id).first()
    if not g:
        raise HTTPException(404, "Guest not found")
    return guest_to_response(g)


@router.put("/admin/guests/{guest_id}/limits")
def update_guest_limits(
    guest_id: str,
    req: GuestLimitUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Admin: update guest trial limits or active status."""
    g = db.query(Guest).filter(Guest.id == guest_id).first()
    if not g:
        raise HTTPException(404, "Guest not found")
    if req.pdf_fetch_limit  is not None: g.pdf_fetch_limit  = req.pdf_fetch_limit
    if req.extraction_limit is not None: g.extraction_limit = req.extraction_limit
    if req.is_active        is not None: g.is_active        = req.is_active
    if req.upload_allowed   is not None: g.upload_allowed   = req.upload_allowed
    if req.export_allowed   is not None: g.export_allowed   = req.export_allowed
    db.commit()
    return guest_to_response(g)


@router.delete("/admin/guests/{guest_id}")
def delete_guest(
    guest_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    g = db.query(Guest).filter(Guest.id == guest_id).first()
    if not g:
        raise HTTPException(404, "Guest not found")
    db.delete(g)
    db.commit()
    return {"deleted": guest_id}


@router.post("/admin/guests/{guest_id}/reset-usage")
def reset_guest_usage(
    guest_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Admin: reset a guest's usage counters back to zero."""
    g = db.query(Guest).filter(Guest.id == guest_id).first()
    if not g:
        raise HTTPException(404, "Guest not found")
    g.pdf_fetched      = 0
    g.extractions_used = 0
    db.commit()
    return {"reset": guest_id, **guest_to_response(g)}


@router.post("/admin/notify-test")
def test_notification(_admin: User = Depends(require_admin)):
    """
    Admin: send a test email notification to verify Graph API / SMTP is working.
    """
    class _DummyGuest:
        full_name      = "Test Guest"
        email          = "test@example.com"
        current_role   = "Tester"
        company        = "DOCPlus AI+"
        note           = "This is a test notification"
        pdf_fetch_limit   = 5
        extraction_limit  = 2
        created_at     = datetime.utcnow()

    try:
        send_admin_notification(_DummyGuest())
        return {"ok": True, "message": f"Test notification sent to {ADMIN_EMAIL}"}
    except Exception as e:
        raise HTTPException(500, f"Notification failed: {e}")


# ── Admin LandingAI config for guest extraction ───────────────────────────────

class LandingAIConfigRequest(BaseModel):
    api_key:  str
    base_url: Optional[str] = ""


# ── Secure admin login with password ─────────────────────────────────────────

class AdminLoginRequest(BaseModel):
    email:    str
    password: str


@router.post("/admin/login")
def admin_login(req: AdminLoginRequest, db: Session = Depends(get_db)):
    """
    Secure admin login: verifies email is in ADMIN_EMAILS whitelist
    AND checks the password. Returns JWT token on success.
    """
    from admin_config import ADMIN_EMAILS as ADMIN_EMAILS_SET, ADMIN_PASSWORD_HASH, ADMIN_PASSWORD_PLAIN
    from app.core.auth import verify_password, hash_password, create_access_token

    email = req.email.strip().lower()

    # Check email is in admin whitelist
    if email not in ADMIN_EMAILS_SET:
        raise HTTPException(401, "Invalid credentials")

    # Load password hash — check saved file first, then env, then plaintext default
    import json as _json
    config_path = os.path.join(os.path.dirname(__file__), "admin_password.json")
    if os.path.exists(config_path):
        try:
            with open(config_path) as f:
                stored_hash = _json.load(f).get("password_hash", "")
        except Exception:
            stored_hash = ""
    else:
        stored_hash = ADMIN_PASSWORD_HASH.strip()

    # Verify password
    if stored_hash:
        if not verify_password(req.password, stored_hash):
            raise HTTPException(401, "Invalid credentials")
    else:
        if req.password != ADMIN_PASSWORD_PLAIN:
            raise HTTPException(401, "Invalid credentials")

    # Find or create admin User record
    admin_user = db.query(User).filter(User.email == email).first()
    if not admin_user:
        from passlib.context import CryptContext
        _pwd = CryptContext(schemes=["bcrypt"])
        admin_user = User(
            email=email,
            hashed_password=_pwd.hash(req.password),
            full_name="Admin",
            is_active=True,
            is_admin=True,
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
    else:
        if not admin_user.is_admin:
            admin_user.is_admin = True
            db.commit()

    token = create_access_token(user_id=admin_user.id, email=admin_user.email)
    return {
        "is_admin": True,
        "token":    token,
        "user": {
            "id":        admin_user.id,
            "email":     admin_user.email,
            "full_name": admin_user.full_name,
            "is_admin":  True,
        }
    }


@router.post("/admin/change-password")
def admin_change_password(
    req: dict,
    _admin: User = Depends(require_admin),
):
    """Admin: change the admin password. Saves new bcrypt hash to a local file."""
    import json as _json
    current_password = req.get("current_password", "").strip()
    new_password     = req.get("new_password", "").strip()

    if len(new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    # Verify current password
    from admin_config import ADMIN_PASSWORD_HASH, ADMIN_PASSWORD_PLAIN
    from app.core.auth import verify_password, hash_password

    config_path = os.path.join(os.path.dirname(__file__), "admin_password.json")
    if os.path.exists(config_path):
        try:
            with open(config_path) as f:
                stored_hash = _json.load(f).get("password_hash", "")
        except Exception:
            stored_hash = ""
    else:
        stored_hash = ADMIN_PASSWORD_HASH.strip()

    if stored_hash:
        if not verify_password(current_password, stored_hash):
            raise HTTPException(401, "Current password is incorrect")
    else:
        if current_password != ADMIN_PASSWORD_PLAIN:
            raise HTTPException(401, "Current password is incorrect")

    # Save new hash
    new_hash = hash_password(new_password)
    with open(config_path, "w") as f:
        _json.dump({"password_hash": new_hash}, f)

    return {"ok": True, "message": "Password updated successfully"}


@router.post("/admin/default-schema")
def set_default_schema(
    req: dict,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin: set the default schema for guests — stores full definition."""
    from app.models.schema import SchemaDefinition
    schema_id   = req.get("schema_id", "").strip()
    schema_name = req.get("schema_name", "").strip()
    schema_fields = req.get("fields", [])
    schema_desc   = req.get("description", "")
    if not schema_id:
        raise HTTPException(400, "schema_id is required")

    # If fields not provided or empty, look up from DB
    if not schema_fields:
        saved = db.query(SchemaDefinition).filter(SchemaDefinition.id == schema_id).first()
        if saved:
            schema_fields = saved.fields or []
            schema_name   = saved.name or schema_name
            schema_desc   = saved.description or schema_desc
            # Also try raw_definition
            if not schema_fields and saved.raw_definition:
                raw = saved.raw_definition
                if isinstance(raw, dict):
                    schema_fields = raw.get("fields", [])
                    if not schema_name:
                        schema_name = raw.get("name", schema_name)

    config_path = os.path.join(os.path.dirname(__file__), "default_schema_config.json")
    with open(config_path, "w") as f:
        json.dump({
            "schema_id":   schema_id,
            "schema_name": schema_name,
            "description": schema_desc,
            "fields":      schema_fields,
        }, f)
    return {"ok": True, "schema_id": schema_id, "schema_name": schema_name, "field_count": len(schema_fields)}


@router.get("/admin/default-schema")
def get_default_schema(_admin: User = Depends(require_admin)):
    """Admin: get the current default schema."""
    config_path = os.path.join(os.path.dirname(__file__), "default_schema_config.json")
    if not os.path.exists(config_path):
        return {"configured": False}
    try:
        with open(config_path) as f:
            cfg = json.load(f)
        return {"configured": True, **cfg}
    except Exception:
        return {"configured": False}


@router.get("/guests/default-schema")
def guest_default_schema():
    """Public: get the admin's default schema for guests (including full field definitions)."""
    config_path = os.path.join(os.path.dirname(__file__), "default_schema_config.json")
    if not os.path.exists(config_path):
        return {"configured": False}
    try:
        with open(config_path) as f:
            cfg = json.load(f)
        return {
            "configured":  True,
            "schema_id":   cfg.get("schema_id", ""),
            "schema_name": cfg.get("schema_name", ""),
            "description": cfg.get("description", ""),
            "fields":      cfg.get("fields", []),
        }
    except Exception:
        return {"configured": False}


@router.delete("/admin/default-schema")
def delete_default_schema(_admin: User = Depends(require_admin)):
    """Admin: remove the default schema."""
    config_path = os.path.join(os.path.dirname(__file__), "default_schema_config.json")
    try:
        if os.path.exists(config_path):
            os.remove(config_path)
    except Exception:
        pass
    return {"ok": True}


@router.post("/admin/sample-pdf")
async def set_sample_pdf(
    file: UploadFile = File(...),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin: upload a default sample PDF that guests can try without using their fetch quota."""
    from app.core.config import settings
    from app.models.document import Document
    import shutil as _shutil

    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(400, "Only PDF files are accepted as sample")

    # Save to uploads with a fixed known ID so it's always the same file
    sample_id   = "sample_demo_pdf"
    sample_path = os.path.join(settings.UPLOAD_DIR, "sample_demo.pdf")

    with open(sample_path, "wb") as f:
        _shutil.copyfileobj(file.file, f)

    size = os.path.getsize(sample_path)

    # Save config
    config_path = os.path.join(os.path.dirname(__file__), "sample_pdf_config.json")
    with open(config_path, "w") as f:
        json.dump({
            "filename": file.filename,
            "path":     sample_path,
            "size":     size,
        }, f)

    return {"ok": True, "filename": file.filename, "size": size,
            "message": "Sample PDF saved — guests can now use it for free"}


@router.get("/admin/sample-pdf")
def get_sample_pdf_info(_admin: User = Depends(require_admin)):
    """Admin: get current sample PDF info."""
    config_path = os.path.join(os.path.dirname(__file__), "sample_pdf_config.json")
    if not os.path.exists(config_path):
        return {"configured": False}
    try:
        with open(config_path) as f:
            cfg = json.load(f)
        return {"configured": True, **cfg}
    except Exception:
        return {"configured": False}


@router.delete("/admin/sample-pdf")
def delete_sample_pdf(_admin: User = Depends(require_admin)):
    """Admin: remove the sample PDF."""
    config_path = os.path.join(os.path.dirname(__file__), "sample_pdf_config.json")
    sample_path = os.path.join(os.path.dirname(__file__), "../uploads/sample_demo.pdf")
    try:
        if os.path.exists(config_path):
            os.remove(config_path)
        if os.path.exists(sample_path):
            os.remove(sample_path)
    except Exception:
        pass
    return {"ok": True}


@router.post("/guests/use-sample-pdf")
async def use_sample_pdf(
    background_tasks: BackgroundTasks,
    x_guest_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """
    Guest: add the admin's sample PDF to their library.
    Does NOT count against their PDF fetch quota.
    """
    from app.core.config import settings
    from app.models.document import Document
    from app.services.parser import parse_document
    from app.core.database import SessionLocal
    import shutil as _shutil

    config_path = os.path.join(os.path.dirname(__file__), "sample_pdf_config.json")
    if not os.path.exists(config_path):
        raise HTTPException(404, "No sample PDF configured by admin")

    with open(config_path) as f:
        cfg = json.load(f)

    sample_path = cfg.get("path", "")
    if not sample_path or not os.path.exists(sample_path):
        raise HTTPException(404, "Sample PDF file not found on server")

    # Resolve guest (optional — we just need user_id if logged in)
    guest_obj = None
    if x_guest_token:
        from app.models.guest import Guest as GuestModel
        guest_obj = db.query(GuestModel).filter(GuestModel.session_token == x_guest_token).first()

    # Copy sample to a new doc ID so each guest gets their own copy
    doc_id   = str(uuid.uuid4())
    dest     = os.path.join(settings.UPLOAD_DIR, f"{doc_id}.pdf")
    _shutil.copy2(sample_path, dest)
    size     = os.path.getsize(dest)

    # For guest sample PDFs, limit to first 20 pages to speed up parsing
    try:
        import fitz as _fitz
        _pdf = _fitz.open(dest)
        if _pdf.page_count > 20:
            _trimmed_path = dest.replace('.pdf', '_trimmed.pdf')
            _writer = _fitz.open()
            _writer.insert_pdf(_pdf, from_page=0, to_page=19)
            _writer.save(_trimmed_path)
            _writer.close()
            _pdf.close()
            import os as _os
            _os.replace(_trimmed_path, dest)
            size = _os.path.getsize(dest)
            logger.info(f"Trimmed sample PDF to 20 pages for faster guest parsing")
        else:
            _pdf.close()
    except Exception as e:
        logger.warning(f"Could not trim sample PDF: {e}")

    doc = Document(
        id=doc_id,
        user_id=None,   # no DB user — identified by guest_id in extraction_jobs
        file_name=cfg.get("filename", "sample_demo.pdf"),
        file_path=dest,
        file_size=size,
        mime_type="application/pdf",
        status="uploaded",
        upload_source="sample",
    )
    db.add(doc)
    db.commit()

    # Use the SAME background parser as admin documents
    from app.api.v1.endpoints.documents import _parse_in_background
    background_tasks.add_task(_parse_in_background, doc_id, dest, "application/pdf")

    return {
        "doc_id":   doc_id,
        "filename": cfg.get("filename", "sample_demo.pdf"),
        "status":   "uploaded",
        "message":  "Sample PDF added to your library — no quota used!",
    }


@router.get("/guests/sample-pdf-available")
def sample_pdf_available():
    """Public: check if admin has set a sample PDF (no auth required)."""
    config_path = os.path.join(os.path.dirname(__file__), "sample_pdf_config.json")
    if not os.path.exists(config_path):
        return {"available": False}
    try:
        with open(config_path) as f:
            cfg = json.load(f)
        return {
            "available": bool(cfg.get("path") and os.path.exists(cfg["path"])),
            "filename":  cfg.get("filename", ""),
        }
    except Exception:
        return {"available": False}
def set_landingai_config(
    req: LandingAIConfigRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Admin sets global LandingAI credentials used for all guest extractions."""
    import os, json
    config_path = os.path.join(os.path.dirname(__file__), "landingai_config.json")
    # Load existing config to preserve the full pool
    existing = {}
    if os.path.exists(config_path):
        try:
            with open(config_path) as f:
                existing = json.load(f)
        except Exception:
            pass
    # Update/add the primary key (slot 1) via single-key save
    # If the caller is using the old single-key API, update slot 1
    if req.api_key.strip():
        existing["api_key"]  = req.api_key.strip()
        existing["base_url"] = req.base_url.strip()
        # Also update in the pool
        pool = existing.get("api_keys", [])
        if not pool:
            pool = [{"key": req.api_key.strip(), "base_url": req.base_url.strip(), "active": True}]
        else:
            pool[0] = {"key": req.api_key.strip(), "base_url": req.base_url.strip(), "active": True}
        existing["api_keys"] = pool
    with open(config_path, "w") as f:
        json.dump(existing, f)
    return {"ok": True, "message": "LandingAI config saved for guest extractions"}


@router.post("/admin/landingai-config-pool")
def set_landingai_config_pool(
    req: dict,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """
    Admin sets a pool of up to 5 LandingAI API keys.
    Keys are tried in order — if one is exhausted/fails, the next is tried automatically.
    Request body: { api_keys: [{key, base_url, label?, active?}, ...] }
    """
    import os, json
    config_path = os.path.join(os.path.dirname(__file__), "landingai_config.json")
    api_keys = req.get("api_keys", [])
    if not isinstance(api_keys, list):
        from fastapi import HTTPException
        raise HTTPException(400, "api_keys must be a list")

    # Validate and clean up to 5 keys
    clean_keys = []
    for slot in api_keys[:5]:
        key = (slot.get("key") or "").strip()
        if key:
            clean_keys.append({
                "key":      key,
                "base_url": (slot.get("base_url") or "").strip(),
                "label":    (slot.get("label") or f"Key {len(clean_keys)+1}"),
                "active":   bool(slot.get("active", True)),
                "failed":   False,   # reset failure state when admin saves
            })

    # Build config — primary key is the first active one
    primary = next((k for k in clean_keys if k["active"]), clean_keys[0] if clean_keys else None)
    config = {
        "api_key":  primary["key"] if primary else "",
        "base_url": primary["base_url"] if primary else "",
        "api_keys": clean_keys,
    }
    with open(config_path, "w") as f:
        json.dump(config, f)
    return {"ok": True, "key_count": len(clean_keys), "message": f"{len(clean_keys)} LandingAI key(s) saved"}


@router.get("/admin/landingai-config")
def get_landingai_config(
    _admin: User = Depends(require_admin),
):
    """Get current LandingAI config (admin only, keys are masked)."""
    config = _load_landingai_config()
    pool   = config.get("api_keys", [])
    # Mask each key
    def mask(k):
        return f"{'*' * max(0, len(k)-4)}{k[-4:]}" if len(k) >= 4 else ("set" if k else "")

    # Single-key display (legacy)
    primary_key = config.get("api_key", "")
    return {
        "configured":      bool(primary_key),
        "api_key_masked":  mask(primary_key),
        "base_url":        config.get("base_url", ""),
        # Pool display
        "api_keys": [
            {
                "slot":      i + 1,
                "label":     k.get("label", f"Key {i+1}"),
                "masked":    mask(k.get("key", "")),
                "base_url":  k.get("base_url", ""),
                "active":    k.get("active", True),
                "failed":    k.get("failed", False),
                "has_key":   bool(k.get("key", "").strip()),
            }
            for i, k in enumerate(pool)
        ],
        "pool_size": len(pool),
    }


@router.get("/guests/landingai-available")
def guest_landingai_available():
    """Check if admin has configured LandingAI for guest use (no auth required)."""
    config = _load_landingai_config()
    return {"available": bool(config.get("api_key", "").strip())}


def _verify_email_smtp(email: str, mx_host: str) -> bool | None:
    """
    Verify an email address exists by connecting to its mail server.
    Uses SMTP RCPT TO command — no email is actually sent.

    Returns:
        True  — mailbox confirmed to exist
        False — mailbox confirmed to NOT exist (5xx response)
        None  — inconclusive (server doesn't support verification or timed out)
    """
    import smtplib
    import socket

    # Use a plausible sender for the EHLO/MAIL FROM
    probe_sender = "verify@docplusai.com"

    try:
        smtp = smtplib.SMTP(timeout=8)
        smtp.connect(mx_host, 25)
        smtp.ehlo_or_helo_if_needed()

        code, _ = smtp.mail(probe_sender)
        if code != 250:
            smtp.quit()
            return None  # Server didn't accept our MAIL FROM — inconclusive

        code, msg = smtp.rcpt(email)
        smtp.quit()

        msg_str = msg.decode("utf-8", errors="ignore").lower() if isinstance(msg, bytes) else str(msg).lower()

        if code == 250:
            return True   # Mailbox confirmed to exist
        elif code in (550, 551, 552, 553, 554):
            # 550 = no such user, 551 = user not local, etc.
            # BUT some servers return 550 for all addresses (catch-all blocks) — be careful
            if any(x in msg_str for x in ["no such user", "user unknown", "does not exist",
                                           "invalid recipient", "rejected", "mailbox not found"]):
                return False  # Definitively rejected
            return None  # Uncertain
        else:
            return None  # Inconclusive

    except (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected,
            ConnectionRefusedError, socket.timeout, OSError):
        return None  # Server unreachable — allow through


def _load_landingai_config() -> dict:
    """Load admin-configured LandingAI credentials (full pool)."""
    import os, json
    config_path = os.path.join(os.path.dirname(__file__), "landingai_config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path) as f:
                return json.load(f)
        except Exception:
            pass
    # Fallback to env vars
    return {
        "api_key":  os.getenv("LANDINGAI_API_KEY", ""),
        "base_url": os.getenv("LANDINGAI_BASE_URL", ""),
        "api_keys": [],
    }


def _get_next_active_key() -> tuple[str, str]:
    """
    Return (api_key, base_url) for the next available LandingAI key in the pool.
    Tries keys in order 1→5. Skips keys marked as failed.
    If a key fails during extraction, call _mark_key_failed(key) to mark it.
    Falls back to single api_key if no pool configured.
    """
    import os, json
    config = _load_landingai_config()
    pool   = config.get("api_keys", [])

    if pool:
        # Try each active, non-failed key in order
        for slot in pool:
            if slot.get("active", True) and not slot.get("failed", False):
                key = slot.get("key", "").strip()
                if key:
                    return key, slot.get("base_url", "") or config.get("base_url", "")
        # All keys failed or disabled — reset failures and try again from beginning
        # (prevent permanent lockout)
        for slot in pool:
            slot["failed"] = False
        _save_landingai_config(config)
        for slot in pool:
            key = slot.get("key", "").strip()
            if key and slot.get("active", True):
                return key, slot.get("base_url", "") or config.get("base_url", "")

    # Fallback to single key
    return config.get("api_key", ""), config.get("base_url", "")


def _mark_key_failed(failed_key: str) -> None:
    """
    Mark a specific API key as failed (quota exhausted or auth error).
    The system will skip it and use the next key in the pool.
    """
    import os, json
    config_path = os.path.join(os.path.dirname(__file__), "landingai_config.json")
    try:
        config = _load_landingai_config()
        pool   = config.get("api_keys", [])
        changed = False
        for slot in pool:
            if slot.get("key", "").strip() == failed_key.strip():
                slot["failed"] = True
                changed = True
        if changed:
            _save_landingai_config(config)
            logger.warning(f"[LANDINGAI] Key ...{failed_key[-6:]} marked as failed — trying next key")
    except Exception as e:
        logger.error(f"[LANDINGAI] Could not mark key as failed: {e}")


def _save_landingai_config(config: dict) -> None:
    """Save LandingAI config back to file."""
    import os, json
    config_path = os.path.join(os.path.dirname(__file__), "landingai_config.json")
    with open(config_path, "w") as f:
        json.dump(config, f)


# ── Guest extraction limit middleware ─────────────────────────────────────────

@router.get("/guests/fixed-schema")
def get_fixed_schema():
    """
    Deprecated — guests now use the admin-configured default schema.
    Returns the default schema if one is configured, otherwise empty.
    """
    config_path = os.path.join(os.path.dirname(__file__), "default_schema_config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path) as f:
                cfg = json.load(f)
            return {
                "id":          cfg.get("schema_id", ""),
                "name":        cfg.get("schema_name", "Default Schema"),
                "description": cfg.get("description", ""),
                "is_fixed":    False,
                "field_count": len(cfg.get("fields", [])),
                "fields":      cfg.get("fields", []),
            }
        except Exception:
            pass
    return {"id": "", "name": "", "description": "", "is_fixed": False, "field_count": 0, "fields": []}


@router.get("/guests/preset-schemas")
def get_preset_schemas():
    """Return all preset schemas available for guest trial users."""
    from app.core.database import PRESET_SCHEMAS
    return {
        "schemas": [
            {
                "id":          p["id"],
                "name":        p["name"],
                "description": p["description"],
                "domain":      p["domain"],
                "icon":        p["icon"],
                "field_count": len(p["fields"]),
                "fields":      p["fields"],
            }
            for p in PRESET_SCHEMAS
        ]
    }


@router.post("/guests/check-extraction")
def check_extraction_limit(
    x_guest_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Check if guest has remaining extractions. Called before running extraction."""
    if not x_guest_token:
        return {"is_guest": False, "can_extract": True}

    guest = db.query(Guest).filter(Guest.session_token == x_guest_token).first()
    if not guest:
        return {"is_guest": False, "can_extract": True}

    can_extract = guest.extraction_remaining > 0
    return {
        "is_guest":            True,
        "can_extract":         can_extract,
        "extractions_used":    guest.extractions_used,
        "extraction_limit":    guest.extraction_limit,
        "extraction_remaining":guest.extraction_remaining,
    }


@router.post("/guests/increment-extraction")
def increment_extraction(
    x_guest_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Called after successful extraction to increment guest counter."""
    if not x_guest_token:
        return {"ok": True}

    guest = db.query(Guest).filter(Guest.session_token == x_guest_token).first()
    if not guest:
        return {"ok": True}

    if guest.extraction_remaining <= 0:
        raise HTTPException(403, {
            "code":    "GUEST_EXTRACTION_LIMIT_REACHED",
            "message": f"Trial limit reached. You have used all {guest.extraction_limit} extractions.",
            "used":    guest.extractions_used,
            "limit":   guest.extraction_limit,
        })

    guest.extractions_used = (guest.extractions_used or 0) + 1
    guest.last_seen        = datetime.utcnow()
    db.commit()
    return {
        "ok":                  True,
        "extractions_used":    guest.extractions_used,
        "extraction_remaining":guest.extraction_remaining,
    }


@router.post("/guests/increment-pdf-fetch")
def increment_pdf_fetch(
    x_guest_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Called after each PDF is successfully sent to library, to increment the guest fetch counter."""
    if not x_guest_token:
        return {"ok": True}

    guest = db.query(Guest).filter(Guest.session_token == x_guest_token).first()
    if not guest:
        return {"ok": True}

    if guest.pdf_remaining <= 0:
        raise HTTPException(403, {
            "code":    "GUEST_PDF_FETCH_LIMIT_REACHED",
            "message": f"Trial limit reached. You have fetched all {guest.pdf_fetch_limit} PDFs.",
            "used":    guest.pdf_fetched,
            "limit":   guest.pdf_fetch_limit,
        })

    guest.pdf_fetched  = (guest.pdf_fetched or 0) + 1
    guest.last_seen    = datetime.utcnow()
    db.commit()
    return {
        "ok":          True,
        "pdf_fetched": guest.pdf_fetched,
        "pdf_remaining": guest.pdf_remaining,
    }


# ── Activity logging helper ───────────────────────────────────────────────────

def log_guest_activity(db: Session, guest_id: str, action: str, detail: str = ""):
    """Log a guest action to the activity table. Never raises."""
    try:
        entry = GuestActivity(
            id=str(uuid.uuid4()),
            guest_id=guest_id,
            action=action,
            detail=detail,
        )
        db.add(entry)
        db.commit()
    except Exception as e:
        print(f"[ACTIVITY] Failed to log: {e}")


# ── Log activity endpoint (called from frontend) ──────────────────────────────

class ActivityLogRequest(BaseModel):
    action: str
    detail: Optional[str] = ""


@router.post("/guests/log-activity")
def guest_log_activity(
    req: ActivityLogRequest,
    x_guest_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Frontend calls this to log guest actions (crawl_url, export_attempt, etc.)"""
    if not x_guest_token:
        return {"ok": True}
    guest = db.query(Guest).filter(Guest.session_token == x_guest_token).first()
    if not guest:
        return {"ok": True}
    log_guest_activity(db, guest.id, req.action, req.detail or "")
    return {"ok": True}


# ── Request more access endpoint ──────────────────────────────────────────────

class AccessRequestBody(BaseModel):
    request_type: str          # pdf_fetch | extraction | export | full_access
    note:         Optional[str] = ""


def _build_access_request_html(guest: Guest, req_type: str, note: str) -> str:
    type_labels = {
        "pdf_fetch":   "More PDF Fetches",
        "extraction":  "More Extractions",
        "export":      "Export Access",
        "full_access": "Full Platform Access",
    }
    label = type_labels.get(req_type, req_type)
    return f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#060b18;font-family:Arial,sans-serif">
  <div style="max-width:580px;margin:32px auto;background:#0d1526;border-radius:16px;
              padding:36px;border:1px solid rgba(255,255,255,0.1)">
    <div style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);
                border-radius:12px;padding:10px 16px;margin-bottom:16px">
      <span style="color:#fff;font-weight:900;font-size:18px">⚡ Access Request</span>
    </div>
    <h2 style="color:#fbbf24;margin:0 0 4px;font-size:22px">Guest Requesting More Access</h2>
    <p style="color:rgba(255,255,255,0.4);margin:0 0 24px;font-size:13px">
      A guest has reached their trial limit on {PLATFORM_NAME}
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4);font-size:13px;width:38%">Name</td>
        <td style="padding:10px 0;color:#ffffff;font-weight:700;font-size:14px">{guest.full_name}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4);font-size:13px">Email</td>
        <td style="padding:10px 0;color:#60a5fa;font-size:14px">{guest.email}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4);font-size:13px">Company</td>
        <td style="padding:10px 0;color:#e2e8f0;font-size:14px">{guest.company or '—'}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4);font-size:13px">Requesting</td>
        <td style="padding:10px 0;color:#fbbf24;font-weight:700;font-size:14px">{label}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4);font-size:13px">Current Usage</td>
        <td style="padding:10px 0;color:#e2e8f0;font-size:14px">
          PDFs: {guest.pdf_fetched}/{guest.pdf_fetch_limit} · Extractions: {guest.extractions_used}/{guest.extraction_limit}
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:rgba(255,255,255,0.4);font-size:13px">Note</td>
        <td style="padding:10px 0;color:#e2e8f0;font-size:14px">{note or '—'}</td>
      </tr>
    </table>
    <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);
                border-radius:12px;padding:16px 20px;margin-bottom:24px">
      <p style="margin:0;color:#fde68a;font-size:13px">
        Log in to the Admin Panel to approve this request and adjust the guest's limits.
      </p>
    </div>
    <p style="color:rgba(255,255,255,0.2);font-size:11px;margin:0;text-align:center">
      {PLATFORM_NAME} · Automated notification
    </p>
  </div>
</body>
</html>"""


@router.post("/guests/request-access")
def request_more_access(
    req: AccessRequestBody,
    x_guest_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Guest requests more access — saves to DB and emails admin."""
    if not x_guest_token:
        raise HTTPException(401, "Guest token required")

    guest = db.query(Guest).filter(Guest.session_token == x_guest_token).first()
    if not guest:
        raise HTTPException(401, "Invalid guest token")

    # Save request to DB
    access_req = GuestAccessRequest(
        id=str(uuid.uuid4()),
        guest_id=guest.id,
        request_type=req.request_type,
        note=(req.note or "").strip(),
        status="pending",
    )
    db.add(access_req)
    db.commit()

    # Log activity
    log_guest_activity(db, guest.id, "access_request", f"type={req.request_type} note={req.note}")

    # Email admin
    try:
        subject = f"[{PLATFORM_NAME}] Access Request: {guest.full_name} ({guest.email})"
        html    = _build_access_request_html(guest, req.request_type, req.note or "")
        if MS_TENANT_ID and MS_CLIENT_ID and MS_CLIENT_SECRET:
            _send_via_graph(subject, html, ADMIN_EMAIL)
        elif SMTP_USER and SMTP_PASS:
            _send_via_smtp(subject, html, ADMIN_EMAIL)
    except Exception as e:
        print(f"[EMAIL] Access request notification failed: {e}")

    return {
        "ok":      True,
        "message": f"Your request has been sent to the administrator at {ADMIN_EMAIL}. You'll be contacted at {guest.email}.",
        "request_id": access_req.id,
    }


# ── Admin: get activity log for a guest ──────────────────────────────────────

@router.get("/admin/guests/{guest_id}/activity")
def get_guest_activity(
    guest_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Admin: get full activity log for a specific guest."""
    activities = db.query(GuestActivity).filter(
        GuestActivity.guest_id == guest_id
    ).order_by(GuestActivity.created_at.desc()).limit(100).all()

    return {
        "guest_id": guest_id,
        "activities": [
            {
                "id":         a.id,
                "action":     a.action,
                "detail":     a.detail,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in activities
        ]
    }


# ── Admin: get all pending access requests ────────────────────────────────────

@router.get("/admin/access-requests")
def get_access_requests(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Admin: list all pending access requests with guest details."""
    requests = db.query(GuestAccessRequest).filter(
        GuestAccessRequest.status == "pending"
    ).order_by(GuestAccessRequest.created_at.desc()).all()

    result = []
    for r in requests:
        guest = db.query(Guest).filter(Guest.id == r.guest_id).first()
        result.append({
            "id":           r.id,
            "guest_id":     r.guest_id,
            "guest_name":   guest.full_name if guest else "Unknown",
            "guest_email":  guest.email if guest else "",
            "guest_company": guest.company if guest else "",
            "request_type": r.request_type,
            "note":         r.note,
            "status":       r.status,
            "created_at":   r.created_at.isoformat() if r.created_at else None,
            "current_usage": {
                "pdf_fetched":      guest.pdf_fetched if guest else 0,
                "pdf_fetch_limit":  guest.pdf_fetch_limit if guest else 5,
                "extractions_used": guest.extractions_used if guest else 0,
                "extraction_limit": guest.extraction_limit if guest else 2,
            } if guest else {}
        })

    return {"requests": result, "total": len(result)}


@router.post("/admin/access-requests/{request_id}/approve")
def approve_access_request(
    request_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Admin: approve an access request — doubles the guest's limits."""
    req = db.query(GuestAccessRequest).filter(GuestAccessRequest.id == request_id).first()
    if not req:
        raise HTTPException(404, "Request not found")

    guest = db.query(Guest).filter(Guest.id == req.guest_id).first()
    if not guest:
        raise HTTPException(404, "Guest not found")

    # Apply generous limits based on request type
    if req.request_type == "pdf_fetch":
        guest.pdf_fetch_limit = guest.pdf_fetch_limit + 10
    elif req.request_type == "extraction":
        guest.extraction_limit = guest.extraction_limit + 5
    elif req.request_type == "full_access":
        guest.pdf_fetch_limit  = 999
        guest.extraction_limit = 999
    # export is handled frontend-side via is_active flag for now

    req.status      = "approved"
    req.resolved_at = datetime.utcnow()
    db.commit()

    log_guest_activity(db, guest.id, "access_approved", f"type={req.request_type}")

    return {"ok": True, "guest": guest_to_response(guest)}


@router.post("/admin/access-requests/{request_id}/decline")
def decline_access_request(
    request_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Admin: decline an access request."""
    req = db.query(GuestAccessRequest).filter(GuestAccessRequest.id == request_id).first()
    if not req:
        raise HTTPException(404, "Request not found")
    req.status      = "declined"
    req.resolved_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# Guest persistent job history — jobs are stored forever until admin deletes
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/guests/my-jobs")
def get_guest_jobs(
    x_guest_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """
    Return all extraction jobs belonging to this guest session.
    Results are persisted in the DB and survive page refreshes / re-logins.
    """
    if not x_guest_token:
        return {"jobs": []}

    guest = db.query(Guest).filter(Guest.session_token == x_guest_token).first()
    if not guest:
        return {"jobs": []}

    from app.models.job import ExtractionJob
    jobs = (
        db.query(ExtractionJob)
        .filter(ExtractionJob.guest_id == guest.id)
        .order_by(ExtractionJob.created_at.desc())
        .all()
    )

    def _job_dict(j):
        result_data = j.result or {}
        # Normalise result data to the unified frontend shape
        # Backend stores: { result: {...fields...}, confidence: {...}, sources: {...}, records: [...] }
        nested_result = result_data.get("result") or {}
        fields        = nested_result if nested_result else {}
        records       = result_data.get("records") or None

        # Detect nested array-of-objects in fields (e.g. models, items)
        nested_arr_count = 0
        for v in fields.values():
            if isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict):
                nested_arr_count = len(v)
                break

        quality       = result_data.get("quality") or {}
        quality_score = (
            quality.get("score") if isinstance(quality, dict)
            else result_data.get("quality_score")
        )
        total_records = (
            result_data.get("total_records") or
            (len(records) if records else None) or
            (nested_arr_count if nested_arr_count else None)
        )
        return {
            "job_id":            j.id,
            "document_id":       j.document_id,
            "schema_name":       j.schema_name or "",
            "schema_id":         j.schema_id or "",
            "status":            j.status,
            "fields":            fields,
            "all_records":       records,
            "total_records":     total_records,
            "quality_score":     quality_score,
            "confidence_scores": result_data.get("confidence") or {},
            "source_references": result_data.get("sources") or {},
            "created_at":        j.created_at.isoformat() if j.created_at else None,
        }

    return {"jobs": [_job_dict(j) for j in jobs]}


# ── Admin: clear a guest's extraction data ────────────────────────────────────

@router.delete("/admin/guests/{guest_id}/data")
def clear_guest_data(
    guest_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """
    Admin: delete ALL extraction jobs and documents belonging to this guest.
    The guest account itself is preserved. Only data is removed.
    """
    from app.models.job import ExtractionJob
    from app.models.document import Document

    jobs_deleted = db.query(ExtractionJob).filter(
        ExtractionJob.guest_id == guest_id
    ).delete(synchronize_session=False)

    db.commit()

    return {
        "ok":           True,
        "guest_id":     guest_id,
        "jobs_deleted": jobs_deleted,
        "message":      f"Deleted {jobs_deleted} extraction job(s) for guest {guest_id}",
    }


# ── Admin: LandingAI credit usage stats ──────────────────────────────────────

@router.get("/admin/landingai-credits")
def get_landingai_credits(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """
    Return total LandingAI credits consumed across all extraction jobs,
    plus a per-day breakdown for the last 30 days.
    Credits are captured from the LandingAI API response metadata (credit_usage field).
    """
    from app.models.job import ExtractionJob
    from sqlalchemy import func as sqlfunc
    from datetime import datetime, timedelta

    # Total credits ever consumed
    total_row = db.query(sqlfunc.sum(ExtractionJob.credits_used)).scalar()
    total_credits = round(float(total_row or 0), 2)

    # Total jobs that used LandingAI
    landingai_jobs = db.query(ExtractionJob).filter(
        ExtractionJob.provider == "landingai",
        ExtractionJob.status   == "completed",
    ).count()

    # Last 30 days breakdown
    cutoff = datetime.utcnow() - timedelta(days=30)
    recent_jobs = (
        db.query(ExtractionJob)
        .filter(
            ExtractionJob.provider    == "landingai",
            ExtractionJob.status      == "completed",
            ExtractionJob.created_at  >= cutoff,
        )
        .order_by(ExtractionJob.created_at.desc())
        .all()
    )

    # Group by date
    daily: dict = {}
    for j in recent_jobs:
        day = j.created_at.strftime("%Y-%m-%d") if j.created_at else "unknown"
        daily[day] = round(daily.get(day, 0.0) + float(j.credits_used or 0), 2)

    # Cost estimate: $0.01 per credit
    cost_estimate_usd = round(total_credits * 0.01, 4)

    return {
        "total_credits_consumed": total_credits,
        "cost_estimate_usd":      cost_estimate_usd,
        "landingai_jobs_total":   landingai_jobs,
        "daily_breakdown":        [
            {"date": d, "credits": c}
            for d, c in sorted(daily.items(), reverse=True)
        ],
        "note": (
            "Credits are captured from LandingAI API response metadata after each extraction. "
            "For exact balance remaining, check your LandingAI dashboard at https://ade.landing.ai/settings/billing"
        ),
    }
