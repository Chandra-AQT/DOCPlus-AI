/**
 * EvidenceDrawer — Feature 2: Data Lineage & Evidence Layer
 *
 * A slide-in panel from the right that shows full provenance for one field.
 *
 * Usage:
 *   <EvidenceDrawer
 *     jobId="uuid"
 *     fieldName="ManufacturerName"
 *     fieldValue="Carrier"
 *     open={true}
 *     onClose={() => setOpen(false)}
 *   />
 *
 * The drawer fetches /api/v1/lineage/{job_id}/field/{field_name} on open.
 * Falls back gracefully if lineage is not available (older jobs).
 */
import { useEffect, useState, useCallback } from 'react'
import { X, Database, Table2, Hash, Cpu, AlertCircle, CheckCircle2, Copy, ExternalLink } from 'lucide-react'
import api from '../lib/api'
import { sourceCategory } from './SourceBadge'

// ── Source category config ────────────────────────────────────────────────────
const CAT_CONFIG = {
  table:     { color: '#34d399', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.25)',   icon: Table2,       label: 'Table'              },
  kv:        { color: '#60a5fa', bg: 'rgba(37,99,235,0.12)',   border: 'rgba(37,99,235,0.25)',   icon: Hash,         label: 'Key-Value Pair'     },
  ai:        { color: '#c4b5fd', bg: 'rgba(124,58,237,0.12)',  border: 'rgba(124,58,237,0.25)',  icon: Cpu,          label: 'AI Extraction'      },
  heuristic: { color: '#fbbf24', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)',  icon: Database,     label: 'Pattern / Heuristic'},
  fallback:  { color: '#94a3b8', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)',  icon: AlertCircle,  label: 'Default Value'      },
}

// ── Confidence pill ───────────────────────────────────────────────────────────
function ConfidencePill({ pct }) {
  if (pct == null) return null
  const p     = Math.round(pct)
  const color = p >= 80 ? '#22c55e' : p >= 60 ? '#eab308' : '#ef4444'
  const bg    = p >= 80 ? 'rgba(34,197,94,0.12)' : p >= 60 ? 'rgba(234,179,8,0.12)' : 'rgba(239,68,68,0.12)'
  return (
    <span className="text-xs font-black px-2 py-0.5 rounded-full tabular-nums"
      style={{ color, background: bg, border: `1px solid ${color}30` }}>
      {p}% confidence
    </span>
  )
}

// ── Confidence bar ────────────────────────────────────────────────────────────
function ConfBar({ pct }) {
  if (pct == null) return null
  const p     = Math.round(pct)
  const color = p >= 80 ? '#22c55e' : p >= 60 ? '#eab308' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${p}%`, background: color }} />
      </div>
      <span className="text-[10px] tabular-nums font-bold w-7 text-right" style={{ color }}>{p}%</span>
    </div>
  )
}

// ── Evidence row (one lineage entry) ─────────────────────────────────────────
function EvidenceRow({ row, index }) {
  const [copied, setCopied] = useState(false)
  const cat    = sourceCategory(row.source_type)
  const cfg    = CAT_CONFIG[cat] || CAT_CONFIG.fallback
  const Icon   = cfg.icon

  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { /* silent */ }
  }

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: `1px solid ${cfg.border}`, background: cfg.bg }}>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: `1px solid ${cfg.border}` }}>
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: cfg.color }} />
          <span className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
          {row.source_label && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
              {row.source_label}
            </span>
          )}
        </div>
        <ConfidencePill pct={row.confidence_pct} />
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 space-y-2.5">

        {/* Extracted value */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider mb-1"
            style={{ color: 'rgba(255,255,255,0.3)' }}>Extracted Value</p>
          <div className="flex items-start gap-2">
            <code className="text-xs font-semibold flex-1 break-all"
              style={{ color: '#e2e8f0' }}>
              {row.extracted_value ?? <span style={{ color: 'rgba(255,255,255,0.2)' }}>null</span>}
            </code>
            {row.extracted_value && (
              <button onClick={() => copyText(row.extracted_value)}
                className="shrink-0 p-1 rounded transition-all hover:bg-white/[0.08]"
                title="Copy value"
                style={{ color: copied ? '#34d399' : 'rgba(255,255,255,0.3)' }}>
                {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </button>
            )}
          </div>
          {row.unit && (
            <span className="text-[9px] px-1.5 py-0.5 rounded mt-1 inline-block"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#a78bfa' }}>
              unit: {row.unit}
            </span>
          )}
        </div>

        {/* Confidence bar */}
        {row.confidence_pct != null && (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider mb-1"
              style={{ color: 'rgba(255,255,255,0.3)' }}>Confidence</p>
            <ConfBar pct={row.confidence_pct} />
          </div>
        )}

        {/* Source text snippet */}
        {row.source_text && (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider mb-1"
              style={{ color: 'rgba(255,255,255,0.3)' }}>Source Text</p>
            <div className="rounded-lg px-3 py-2 text-[10px] leading-relaxed break-words"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace', maxHeight: 120, overflow: 'auto' }}>
              {row.source_text}
            </div>
          </div>
        )}

        {/* AI metadata */}
        {cat === 'ai' && (row.ai_provider || row.ai_model) && (
          <div className="flex items-center gap-3 flex-wrap">
            {row.ai_provider && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5"
                  style={{ color: 'rgba(255,255,255,0.3)' }}>Provider</p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded"
                  style={{ background: 'rgba(124,58,237,0.15)', color: '#c4b5fd' }}>
                  {row.ai_provider}
                </span>
              </div>
            )}
            {row.ai_model && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5"
                  style={{ color: 'rgba(255,255,255,0.3)' }}>Model</p>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded"
                  style={{ background: 'rgba(124,58,237,0.1)', color: '#a78bfa' }}>
                  {row.ai_model}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Page / section */}
        <div className="flex items-center gap-4 flex-wrap">
          {row.page_number != null && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5"
                style={{ color: 'rgba(255,255,255,0.3)' }}>Page</p>
              <span className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {row.page_number}
              </span>
            </div>
          )}
          {row.section && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5"
                style={{ color: 'rgba(255,255,255,0.3)' }}>Section</p>
              <span className="text-[10px] font-semibold truncate max-w-[200px] block"
                style={{ color: 'rgba(255,255,255,0.6)' }}>
                {row.section}
              </span>
            </div>
          )}
          {row.extraction_date && (
            <div className="ml-auto">
              <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5 text-right"
                style={{ color: 'rgba(255,255,255,0.2)' }}>Extracted</p>
              <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {new Date(row.extraction_date).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* Flags */}
        <div className="flex items-center gap-2 flex-wrap">
          {row.is_fallback && (
            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}>
              ⚠ Default value
            </span>
          )}
          {row.has_error && (
            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              ✗ Validation error
            </span>
          )}
          {row.document_version && (
            <span className="text-[9px] px-2 py-0.5 rounded font-mono"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)' }}>
              doc: {row.document_version}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Source summary strip ───────────────────────────────────────────────────────
function SourceSummary({ rows }) {
  const total = rows.length
  const counts = rows.reduce((acc, r) => {
    const cat = sourceCategory(r.source_type)
    acc[cat] = (acc[cat] || 0) + 1
    return acc
  }, {})

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {Object.entries(counts).map(([cat, count]) => {
        const cfg = CAT_CONFIG[cat] || CAT_CONFIG.fallback
        return (
          <span key={cat} className="text-[9px] px-2 py-0.5 rounded-full font-bold"
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
            {count} {cfg.label}
          </span>
        )
      })}
    </div>
  )
}

// ── Main drawer component ─────────────────────────────────────────────────────
export default function EvidenceDrawer({ jobId, fieldName, fieldValue, open, onClose }) {
  const [data,    setData]    = useState(null)   // lineage API response
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const fetchLineage = useCallback(async () => {
    if (!jobId || !fieldName) return
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await api.get(`/api/v1/lineage/${jobId}/field/${encodeURIComponent(fieldName)}`)
      setData(res.data)
    } catch (err) {
      // 404 = lineage not written yet (job predates feature, or no match)
      if (err?.response?.status === 404 || err?.message?.includes('404')) {
        setError('no_lineage')
      } else {
        setError('fetch_error')
      }
    } finally {
      setLoading(false)
    }
  }, [jobId, fieldName])

  // Fetch on open
  useEffect(() => {
    if (open && jobId && fieldName) fetchLineage()
  }, [open, jobId, fieldName, fetchLineage])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const rows = data?.rows || []
  const primary = data?.primary || null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col"
        style={{
          width:      380,
          maxWidth:   '92vw',
          background: 'rgba(8,13,28,0.98)',
          borderLeft: '1px solid rgba(255,255,255,0.1)',
          boxShadow:  '-20px 0 60px rgba(0,0,0,0.6)',
          transform:  open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-4 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
                <Database className="w-3 h-3 text-white" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: 'rgba(255,255,255,0.4)' }}>Evidence</span>
            </div>
            <p className="text-sm font-black text-white font-mono truncate">{fieldName}</p>
            {fieldValue != null && fieldValue !== '' && (
              <p className="text-xs mt-0.5 truncate font-semibold"
                style={{ color: '#60a5fa' }}>
                {String(fieldValue).slice(0, 80)}
              </p>
            )}
          </div>
          <button onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg transition-all hover:bg-white/[0.08] active:scale-95"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Loading evidence…</p>
            </div>
          )}

          {/* No lineage (older job or not found) */}
          {!loading && error === 'no_lineage' && (
            <div className="rounded-xl p-5 text-center"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.2)' }} />
              <p className="text-sm font-bold text-white/60 mb-1">No lineage available</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                This job predates the Evidence Layer. Re-run extraction to generate lineage.
              </p>
            </div>
          )}

          {/* Fetch error */}
          {!loading && error === 'fetch_error' && (
            <div className="rounded-xl p-4 flex items-start gap-3"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-red-400">Could not load evidence</p>
                <button onClick={fetchLineage}
                  className="text-[10px] mt-1 underline"
                  style={{ color: 'rgba(239,68,68,0.7)' }}>Retry</button>
              </div>
            </div>
          )}

          {/* Evidence rows */}
          {!loading && !error && rows.length > 0 && (
            <>
              {/* Summary strip */}
              {rows.length > 1 && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider mb-1.5"
                    style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {rows.length} source{rows.length !== 1 ? 's' : ''}
                  </p>
                  <SourceSummary rows={rows} />
                </div>
              )}

              {rows.map((row, i) => (
                <EvidenceRow key={row.id || i} row={row} index={i} />
              ))}
            </>
          )}

          {/* No rows returned but no error */}
          {!loading && !error && rows.length === 0 && data && (
            <div className="rounded-xl p-5 text-center"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <Database className="w-8 h-8 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
              <p className="text-sm font-bold text-white/50 mb-1">No evidence records</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                This field has no lineage rows stored.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-4 py-3 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between">
            <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
              Feature 2 · Data Lineage & Evidence Layer
            </p>
            <button onClick={onClose}
              className="text-[10px] px-3 py-1.5 rounded-lg font-bold transition-all hover:bg-white/[0.08]"
              style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
