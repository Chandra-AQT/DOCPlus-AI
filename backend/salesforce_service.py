"""
salesforce_service.py — Salesforce CRM integration for DOCPlus AI+

When a guest registers, automatically creates a Lead in Salesforce with:
  - Name, Email, Company, Title (role)
  - Lead Source: "DOCPlus AI+ Trial"
  - Description: usage limits + email quality signals
  - Custom fields: is_business_email, email_verified

Uses OAuth 2.0 Username-Password flow (best for server-to-server).

Setup:
  1. Salesforce Setup → Apps → App Manager → New Connected App
  2. Enable OAuth, add scopes: api, refresh_token
  3. Copy Consumer Key → SF_CLIENT_ID
  4. Copy Consumer Secret → SF_CLIENT_SECRET
  5. SF_USERNAME = your Salesforce login email
  6. SF_PASSWORD = your password + security token (no space)
     e.g. if password=MyPass123 and token=XYZ → SF_PASSWORD=MyPass123XYZ
  7. Set environment variables in Railway backend service

Environment variables:
  SF_CLIENT_ID     = Connected App Consumer Key
  SF_CLIENT_SECRET = Connected App Consumer Secret
  SF_USERNAME      = Salesforce login email
  SF_PASSWORD      = password + security_token (concatenated)
  SF_DOMAIN        = login.salesforce.com  (or test.salesforce.com for sandbox)
"""
from __future__ import annotations

import os
import json
import urllib.request
import urllib.parse
from typing import Optional
from loguru import logger


# ── Config from environment variables ────────────────────────────────────────

SF_CLIENT_ID     = os.getenv("SF_CLIENT_ID",     "")
SF_CLIENT_SECRET = os.getenv("SF_CLIENT_SECRET", "")
SF_USERNAME      = os.getenv("SF_USERNAME",      "")
SF_PASSWORD      = os.getenv("SF_PASSWORD",      "")
SF_DOMAIN        = os.getenv("SF_DOMAIN",        "login.salesforce.com")


def is_configured() -> bool:
    """Return True only if all required Salesforce credentials are set."""
    return bool(SF_CLIENT_ID and SF_CLIENT_SECRET and SF_USERNAME and SF_PASSWORD)


# ── Authentication ────────────────────────────────────────────────────────────

_token_cache: dict = {}   # { "access_token": "...", "instance_url": "..." }


def _get_access_token() -> tuple[str, str]:
    """
    Obtain Salesforce access token via OAuth 2.0 Username-Password flow.
    Returns (access_token, instance_url).
    Caches token in memory — refreshes on 401.
    """
    global _token_cache

    if _token_cache.get("access_token"):
        return _token_cache["access_token"], _token_cache["instance_url"]

    token_url = f"https://{SF_DOMAIN}/services/oauth2/token"

    data = urllib.parse.urlencode({
        "grant_type":    "password",
        "client_id":     SF_CLIENT_ID,
        "client_secret": SF_CLIENT_SECRET,
        "username":      SF_USERNAME,
        "password":      SF_PASSWORD,
    }).encode("utf-8")

    req = urllib.request.Request(token_url, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("Accept", "application/json")

    with urllib.request.urlopen(req, timeout=15) as resp:
        payload = json.loads(resp.read())

    access_token  = payload["access_token"]
    instance_url  = payload["instance_url"]

    _token_cache = {"access_token": access_token, "instance_url": instance_url}
    logger.info(f"[SALESFORCE] Authenticated → {instance_url}")
    return access_token, instance_url


def _clear_token_cache():
    global _token_cache
    _token_cache = {}


# ── Lead creation ─────────────────────────────────────────────────────────────

def create_lead(guest) -> Optional[str]:
    """
    Create a Salesforce Lead from a Guest registration.

    Returns the Salesforce Lead ID on success, None on failure.
    Never raises — lead creation failure must not break guest registration.

    Args:
        guest: Guest model instance (has email, first_name, last_name, company,
               current_role, note, is_business_email, email_verified)
    """
    if not is_configured():
        logger.debug("[SALESFORCE] Not configured — skipping Lead creation")
        return None

    try:
        access_token, instance_url = _get_access_token()
        lead_id = _create_lead_api(guest, access_token, instance_url)
        logger.info(f"[SALESFORCE] ✓ Lead created: {lead_id} for {guest.email}")
        return lead_id

    except urllib.error.HTTPError as e:
        if e.code == 401:
            # Token expired — clear cache and retry once
            logger.warning("[SALESFORCE] Token expired — refreshing and retrying")
            _clear_token_cache()
            try:
                access_token, instance_url = _get_access_token()
                lead_id = _create_lead_api(guest, access_token, instance_url)
                logger.info(f"[SALESFORCE] ✓ Lead created (retry): {lead_id}")
                return lead_id
            except Exception as retry_err:
                logger.error(f"[SALESFORCE] Retry failed: {retry_err}")
                return None
        else:
            body = e.read().decode("utf-8", errors="ignore") if hasattr(e, "read") else str(e)
            logger.error(f"[SALESFORCE] HTTP {e.code} creating Lead: {body[:300]}")
            return None

    except Exception as exc:
        logger.error(f"[SALESFORCE] Lead creation failed for {guest.email}: {exc}")
        return None


def _create_lead_api(guest, access_token: str, instance_url: str) -> str:
    """Make the actual Salesforce REST API call to create a Lead."""

    # Build description from guest data
    email_quality = []
    if getattr(guest, 'is_business_email', True):
        email_quality.append("Business email ✓")
    else:
        email_quality.append("Personal email")
    if getattr(guest, 'email_verified', False):
        email_quality.append("SMTP verified ✓")

    description_parts = [
        f"Source: DOCPlus AI+ Trial Registration",
        f"PDF Fetch Limit: {guest.pdf_fetch_limit}",
        f"Extraction Limit: {guest.extraction_limit}",
        f"Email Quality: {', '.join(email_quality)}",
    ]
    if guest.note:
        description_parts.append(f"Note: {guest.note}")

    # Salesforce Lead payload
    lead_data = {
        "FirstName":   guest.first_name or "",
        "LastName":    guest.last_name  or "Unknown",
        "Email":       guest.email,
        "Company":     guest.company   or guest.email.split("@")[1] or "Unknown",
        "Title":       guest.current_role or "",
        "LeadSource":  "Web",
        "Status":      "Open - Not Contacted",
        "Description": "\n".join(description_parts),
        # Standard fields for lead scoring
        "Rating":      "Hot" if getattr(guest, 'is_business_email', False) else "Warm",
    }

    # Remove empty strings to avoid Salesforce validation errors
    lead_data = {k: v for k, v in lead_data.items() if v != ""}

    url     = f"{instance_url}/services/data/v59.0/sobjects/Lead"
    payload = json.dumps(lead_data).encode("utf-8")

    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("Authorization", f"Bearer {access_token}")
    req.add_header("Content-Type",  "application/json")
    req.add_header("Accept",        "application/json")

    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read())

    if not result.get("success"):
        errors = result.get("errors", [])
        raise RuntimeError(f"Salesforce rejected Lead: {errors}")

    return result["id"]


# ── Lead update (when guest upgrades to full access) ─────────────────────────

def update_lead_status(email: str, status: str = "Working - Contacted") -> bool:
    """
    Update an existing Salesforce Lead status by email.
    Called when admin grants full_access to a guest.
    Returns True on success.
    """
    if not is_configured():
        return False

    try:
        access_token, instance_url = _get_access_token()

        # Query for the Lead by email
        query = urllib.parse.quote(f"SELECT Id FROM Lead WHERE Email = '{email}' LIMIT 1")
        query_url = f"{instance_url}/services/data/v59.0/query?q={query}"

        req = urllib.request.Request(query_url, method="GET")
        req.add_header("Authorization", f"Bearer {access_token}")
        req.add_header("Accept",        "application/json")

        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())

        records = result.get("records", [])
        if not records:
            logger.debug(f"[SALESFORCE] No Lead found for {email}")
            return False

        lead_id = records[0]["Id"]

        # Update the Lead status
        update_url  = f"{instance_url}/services/data/v59.0/sobjects/Lead/{lead_id}"
        update_data = json.dumps({"Status": status, "Rating": "Hot"}).encode("utf-8")

        req = urllib.request.Request(update_url, data=update_data, method="PATCH")
        req.add_header("Authorization", f"Bearer {access_token}")
        req.add_header("Content-Type",  "application/json")

        with urllib.request.urlopen(req, timeout=10) as resp:
            pass  # 204 No Content on success

        logger.info(f"[SALESFORCE] ✓ Lead {lead_id} updated to '{status}' for {email}")
        return True

    except Exception as exc:
        logger.error(f"[SALESFORCE] Lead update failed for {email}: {exc}")
        return False
