/**
 * auth.js — Session management for DOCPlus AI+
 * Two session types:
 *   - Admin: JWT token stored in localStorage (from /api/v1/auth/login)
 *   - Guest: UUID token stored in localStorage (from /guests/register)
 */
import api from './api'

const GUEST_KEY = 'docplus_guest'
const ADMIN_KEY = 'docplus_token'

// ── Guest session ──────────────────────────────────────────────────────────

export function saveGuestSession(guest) {
  localStorage.setItem(GUEST_KEY, JSON.stringify(guest))
}

export function getGuestSession() {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY) || 'null') }
  catch { return null }
}

export function clearGuestSession() {
  localStorage.removeItem(GUEST_KEY)
}

export function getGuestToken() {
  const g = getGuestSession()
  return g?.session_token || null
}

// ── Admin session ──────────────────────────────────────────────────────────

export function saveAdminToken(token) {
  localStorage.setItem(ADMIN_KEY, token)
}

export function getAdminToken() {
  return localStorage.getItem(ADMIN_KEY) || null
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_KEY)
}

// ── Session type ───────────────────────────────────────────────────────────

export function getSessionType() {
  if (getAdminToken()) return 'admin'
  if (getGuestToken()) return 'guest'
  return null
}

export function isAdmin() { return getSessionType() === 'admin' }
export function isGuest() { return getSessionType() === 'guest' }
export function isLoggedIn() { return getSessionType() !== null }

// Guest with full platform access — shows admin sidebar but NOT admin panel
export function isFullAccessGuest() {
  if (!isGuest()) return false
  const g = getGuestSession()
  return bool(g?.full_access)
}

// Helper — works like Boolean() but handles undefined/null
function bool(v) { return v === true || v === 1 || v === 'true' }

// ── Guest registration ─────────────────────────────────────────────────────

export async function registerGuest(data) {
  const res = await api.post('/guests/register', data)
  const payload = res.data

  // Admin email detected — save JWT token
  if (payload.is_admin && payload.token) {
    saveAdminToken(payload.token)
    // Also store admin user info
    localStorage.setItem('docplus_admin_user', JSON.stringify(payload.user))
    return { ...payload, sessionType: 'admin' }
  }

  // Guest registration
  const guest = payload.guest
  saveGuestSession(guest)
  return { ...payload, sessionType: 'guest' }
}

// ── Refresh guest usage from server ───────────────────────────────────────

export async function refreshGuestUsage() {
  const token = getGuestToken()
  if (!token) return null
  try {
    const res = await api.get('/guests/me', {
      headers: { 'X-Guest-Token': token }
    })
    saveGuestSession(res.data)
    return res.data
  } catch {
    return null
  }
}

// ── Guest limit helpers ────────────────────────────────────────────────────

export function getGuestLimits() {
  const g = getGuestSession()
  if (!g) return null
  return {
    pdfFetched:          g.pdf_fetched          || 0,
    pdfLimit:            g.pdf_fetch_limit       || 5,
    pdfRemaining:        g.pdf_remaining         || 0,
    extractionsUsed:     g.extractions_used      || 0,
    extractionLimit:     g.extraction_limit      || 2,
    extractionRemaining: g.extraction_remaining  || 0,
    uploadAllowed:       g.upload_allowed        || false,
    exportAllowed:       g.export_allowed        || false,
    fullAccess:          g.full_access           || false,
  }
}

export function canFetchPdf() {
  if (isAdmin()) return true
  const l = getGuestLimits()
  return l ? l.pdfRemaining > 0 : false
}

export function canExtract() {
  if (isAdmin()) return true
  const l = getGuestLimits()
  return l ? l.extractionRemaining > 0 : false
}

// ── Logout ─────────────────────────────────────────────────────────────────

export function logout() {
  clearGuestSession()
  clearAdminToken()
  window.location.href = '/'
}

// ── Per-user persistent storage (Admin only) ─────────────────────────────────
// API keys and settings are persisted per admin account email.
// Guests do NOT get persistence — their session is temporary.

export function getUserStorageKey(suffix) {
  // Only persist for admin users
  if (!isAdmin()) return null
  const adminUser = JSON.parse(localStorage.getItem('docplus_admin_user') || '{}')
  const email = adminUser?.email || 'admin'
  const safeEmail = email.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
  return `docplus_${safeEmail}_${suffix}`
}

export function saveUserData(key, value) {
  const storageKey = getUserStorageKey(key)
  if (!storageKey) return  // guests → skip
  try {
    localStorage.setItem(storageKey, JSON.stringify(value))
  } catch {}
}

export function loadUserData(key, defaultVal = null) {
  const storageKey = getUserStorageKey(key)
  if (!storageKey) return defaultVal  // guests → return default
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw) : defaultVal
  } catch {
    return defaultVal
  }
}

export function clearUserData(key) {
  const storageKey = getUserStorageKey(key)
  if (!storageKey) return
  try {
    localStorage.removeItem(storageKey)
  } catch {}
}
