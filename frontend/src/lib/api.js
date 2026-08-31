import axios from 'axios'

export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export const DOCLENS_BASE = `${BASE_URL}/api/v1`

const api = axios.create({ baseURL: BASE_URL, timeout: 300000 })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('docplus_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  // Include guest session token for limit enforcement
  const guestRaw = localStorage.getItem('docplus_guest')
  if (guestRaw) {
    try {
      const g = JSON.parse(guestRaw)
      if (g?.session_token) cfg.headers['X-Guest-Token'] = g.session_token
    } catch {}
  }
  return cfg
})

api.interceptors.response.use(
  r => r,
  err => {
    const status = err.response?.status
    const msg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Request failed'
    // Don't propagate 404s for optional admin config endpoints — they just mean "not configured yet"
    const url = err.config?.url || ''
    const silentUrls = ['/admin/default-schema', '/admin/sample-pdf', '/admin/landingai-config', '/admin/landingai-credits']
    if (status === 404 && silentUrls.some(u => url.includes(u))) {
      return Promise.reject(new Error(msg))  // re-throw but won't toast since callers have .catch
    }
    return Promise.reject(new Error(msg))
  }
)

export default api

// ── DocPlus Discovery ─────────────────────────────────────────────────────────
export const getFilterOptions  = () => api.get('/filters/options').then(r => r.data)
export const getCrawlStatus    = () => api.get('/status').then(r => r.data)
export const getExcelUrl       = () => `${BASE_URL}/download-excel`
export const getZipUrl         = (folder) => folder ? `${BASE_URL}/download-zip?folder=${encodeURIComponent(folder)}` : `${BASE_URL}/download-zip`
export const getFileProxyUrl   = (url) => `${BASE_URL}/download-file?url=${encodeURIComponent(url)}`
export const sendToDoclens     = (urls) => api.post('/bridge/send-to-doclens', { urls }).then(r => r.data)

// ── DocLens AI Documents ──────────────────────────────────────────────────────
export const listDocuments     = () => api.get('/api/v1/documents').then(r => r.data)
export const uploadDocument    = (file) => { const fd = new FormData(); fd.append('file', file); return api.post('/api/v1/documents/upload', fd).then(r => r.data) }
export const uploadBatch       = (files) => { const fd = new FormData(); files.forEach(f => fd.append('files', f)); return api.post('/api/v1/documents/upload/batch', fd).then(r => r.data) }
export const getDocument       = (id) => api.get(`/api/v1/documents/${id}`).then(r => r.data)
export const deleteDocument    = (id) => api.delete(`/api/v1/documents/${id}`).then(r => r.data)

// ── DocLens AI Schemas ────────────────────────────────────────────────────────
export const listSchemas       = () => api.get('/api/v1/schemas').then(r => r.data)
export const createSchema      = (data) => api.post('/api/v1/schemas', data).then(r => r.data)
export const getSchema         = (id) => api.get(`/api/v1/schemas/${id}`).then(r => r.data)
export const updateSchema      = (id, data) => api.put(`/api/v1/schemas/${id}`, data).then(r => r.data)
export const deleteSchema      = (id) => api.delete(`/api/v1/schemas/${id}`).then(r => r.data)
export const uploadSchemaFile  = (file) => { const fd = new FormData(); fd.append('file', file); return api.post('/api/v1/schemas/upload', fd).then(r => r.data) }
export const generateSchema    = (data) => api.post('/api/v1/schemas/from-text', data).then(r => r.data)

// ── DocLens AI Extraction ─────────────────────────────────────────────────────
export const runExtraction = (payload) => api.post('/api/v1/extraction/run', payload).then(r => r.data)
export const getExtraction = (jobId)  => api.get(`/api/v1/extraction/run/${jobId}`).then(r => r.data)
export const listExtractions = (docId) => api.get(`/api/v1/extraction/document/${docId}`).then(r => r.data)

// ── DocLens AI Export ─────────────────────────────────────────────────────────
export const exportResults = (jobId, format) => {
  // Use GET routes: /api/v1/export/{job_id}/{format}
  const fmt = format === 'excel' ? 'excel' : format  // excel | csv | json
  return api.get(`/api/v1/export/${jobId}/${fmt}`, { responseType: 'blob' }).then(r => r.data)
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login    = (u, p) => api.post('/api/v1/auth/login', { username: u, password: p }).then(r => r.data)
export const register = (u, p, e) => api.post('/api/v1/auth/register', { username: u, password: p, email: e }).then(r => r.data)

// ── Guest activity logging ────────────────────────────────────────────────────
export const logGuestActivity = (action, detail = '') =>
  api.post('/guests/log-activity', { action, detail }).catch(() => {}) // fire-and-forget, never throw

// ── Guest preset schemas ──────────────────────────────────────────────────────
export const getPresetSchemas = () => api.get('/guests/preset-schemas').then(r => r.data)

// ── Guest persistent jobs ─────────────────────────────────────────────────────
export const getGuestJobs = () => api.get('/guests/my-jobs').then(r => r.data)
