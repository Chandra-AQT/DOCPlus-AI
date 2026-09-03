"""
salesforce_service.py — Salesforce Web-to-Lead integration for DOCPlus AI+

Uses Salesforce Web-to-Lead POST endpoint — no OAuth, no credentials needed.
When a guest registers, a Lead is automatically created in Salesforce.

No environment variables required — org ID is hardcoded from the Web-to-Lead form.
"""
from __future__ import annotations

import os
import urllib.request
import urllib.parse
from typing import Optional
from loguru import logger


# ── Salesforce Web-to-Lead config ─────────────────────────────────────────────
SF_ORG_ID   = "00DHs00000P5yok"
SF_ENDPOINT = "https://webto.salesforce.com/servlet/servlet.WebToLead?encoding=UTF-8&orgId=00DHs00000P5yok"
SF_RET_URL  = os.getenv("FRONTEND_URL", "https://energetic-happiness-production-1c3f.up.railway.app") + "/guest-dashboard"

# Set to True to enable (change to False to disable without code change)
SF_ENABLED  = os.getenv("SF_ENABLED", "true").lower() != "false"


def is_configured() -> bool:
    """Web-to-Lead is always configured — no credentials needed."""
    return SF_ENABLED


def create_lead(guest) -> Optional[str]:
    """
    Create a Salesforce Lead via Web-to-Lead POST.
    No OAuth required — just POST to Salesforce's public endpoint.

    Returns "web-to-lead-ok" on success, None on failure.
    Never raises — lead creation must never break guest registration.
    """
    if not SF_ENABLED:
        logger.debug("[SALESFORCE] Web-to-Lead disabled — skipping")
        return None

    try:
        # Build description
        email_quality = []
        if getattr(guest, 'is_business_email', True):
            email_quality.append("Business email ✓")
        else:
            email_quality.append("Personal email")
        if getattr(guest, 'email_verified', False):
            email_quality.append("SMTP verified ✓")

        description = (
            f"Source: DOCPlus AI+ Trial\n"
            f"PDF Limit: {guest.pdf_fetch_limit} | Extraction Limit: {guest.extraction_limit}\n"
            f"Email: {', '.join(email_quality)}\n"
            f"Note: {guest.note or '—'}"
        )

        # Web-to-Lead form fields
        data = urllib.parse.urlencode({
            "oid":              SF_ORG_ID,
            "retURL":           SF_RET_URL,
            "recordType":       "012Hs000002G8opIAC",   # DOCPlus AI record type
            "recordTypeId":     "012Hs000002G8opIAC",   # same, both formats used by SF
            "first_name":       guest.first_name or "",
            "last_name":        guest.last_name  or "Unknown",
            "email":            guest.email,
            "company":          guest.company or guest.email.split("@")[1],
            "description":      description,
            "lead_source":      "DOCPlusAI",             # hardcoded as required
        }).encode("utf-8")

        req = urllib.request.Request(SF_ENDPOINT, data=data, method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")

        with urllib.request.urlopen(req, timeout=10) as resp:
            status = resp.status
            # Salesforce returns 200 and redirects to retURL on success
            logger.info(f"[SALESFORCE] ✓ Web-to-Lead submitted for {guest.email} (HTTP {status})")
            return "web-to-lead-ok"

    except Exception as exc:
        logger.error(f"[SALESFORCE] Web-to-Lead failed for {getattr(guest, 'email', '?')}: {exc}")
        return None


def update_lead_status(email: str, status: str = "Working - Contacted") -> bool:
    """
    Web-to-Lead doesn't support updates.
    For lead updates, the REST API would be needed.
    This is a no-op placeholder.
    """
    logger.debug(f"[SALESFORCE] Lead status update not supported via Web-to-Lead for {email}")
    return False


def test_web_to_lead() -> dict:
    """
    Send a test lead to Salesforce to verify the integration works.
    Call this from the admin test endpoint.
    """
    class _TestGuest:
        first_name = "DOCPlus"
        last_name  = "Test"
        email      = "test.lead@docplusai.com"
        company    = "DOCPlus AI Test"
        current_role = "Test"
        note       = "This is a test lead from DOCPlus AI+"
        pdf_fetch_limit   = 5
        extraction_limit  = 2
        is_business_email = True
        email_verified    = False

    result = create_lead(_TestGuest())
    return {
        "success": result is not None,
        "result":  result,
        "org_id":  SF_ORG_ID,
        "enabled": SF_ENABLED,
    }
