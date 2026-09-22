/**
 * MonitorsPage — Feature 1: Continuous Document Intelligence
 *
 * Sections:
 *   1. Header + "Add Monitor" button
 *   2. Monitor cards (list view) — status, last run, change counts
 *   3. Add / Edit modal
 *   4. Monitor detail panel — run history + change list
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Globe, Plus, Play, Pause, Trash2, RefreshCw, ChevronRight,
  CheckCircle2, AlertCircle, Clock, FileText, ArrowUpRight,
  Eye, Settings, X, Zap, Calendar, BarChart3, Activity,
  TrendingUp, AlertTriangle, ExternalLink
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'

const BASE = '/api/v1/monitors'

// ── Helpers ───────────────────────────────────────────────────────────────────
const SCHEDULES = [
  { value: 'manual',  label: 'Manual only'  },
  { value: 'hourly',  label: 'Every hour'   },
  { value: 'daily',   label: 'Daily'        },
  { value: 'weekly',  label: 'Weekly'       },
]

const FORMATS = [
  { value: 'pdf',   label: 'PDF'        },
  { value: 'word',  label: 'Word'       },
  { value: 'excel', label: 'Excel'      },
  { value: 'ppt',   label: 'PowerPoint' },
]

const DOC_TYPES = [
  'PSS','IOM','OWN','SVM','SVB','PCT','PBR','SUB',
  'WDG','PLD','WTY','CCL','RCL','SDS','CRT','RUG',
]

function statusColor(status) {
  if (status === 'active')  return '#22c55e'
  if (status === 'running') return '#60a5fa'
  if (status === 'paused')  return '#fbbf24'
  if (status === 'error')   return '#ef4444'
  return '#94a3b8'
}

function statusLabel(status) {
  if (status === 'active')  return 'Active'
  if (status === 'running') return 'Running…'
  if (status === 'paused')  return 'Paused'
  if (status === 'error')   return 'Error'
  return status
}

function changeTypeColor(type) {
  if (type === 'new')     return { color: '#34d399', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.25)',  label: '+ New'     }
  if (type === 'changed') return { color: '#fbbf24', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', label: '~ Changed'  }
  if (type === 'removed') return { color: '#f87171', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.25)',  label: '− Removed'  }
  return { color: '#94a3b8', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', label: type }
}

function relativeTime(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 2)   return 'just now'
  if (min < 60)  return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24)   return `${hr}h ago`
  const d = Math.floor(hr / 24)
  return `${d}d ago`
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
function MonitorModal({ monitor, onClose, onSaved }) {
  const editing = !!monitor
  const [form, setForm] = useState({
    name:         monitor?.name         || '',
    url:          monitor?.url          || '',
    schedule:     monitor?.schedule     || 'daily',
    formats:      monitor?.formats      || [],
    doc_types:    monitor?.doc_types    || [],
    auto_extract: monitor?.auto_extract || false,
    schema_id:    monitor?.schema_id    || '',
    provider:     monitor?.provider     || 'none',
  })
  const [schemas,  setSchemas]  = useState([])
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    api.get('/api/v1/schemas').then(r => setSchemas(r.data?.schemas || [])).catch(() => {})
  }, [])

  const toggle = (key, val) => {
    setForm(f => {
      const arr = [...(f[key] || [])]
      const idx = arr.indexOf(val)
      if (idx === -1) arr.push(val)
      else arr.splice(idx, 1)
      return { ...f, [key]: arr }
    })
  }

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required')
    if (!form.url.trim())  return toast.error('URL is required')
    if (!form.url.startsWith('http')) return toast.error('URL must start with http:// or https://')

    setSaving(true)
    try {
      if (editing) {
        const r = await api.put(`${BASE}/${monitor.id}`, form)
        toast.success('Monitor updated')
        onSaved(r.data.monitor)
      } else {
        const r = await api.post(BASE, form)
        toast.success('Monitor created')
        onSaved(r.data.monitor)
      }
      onClose()
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
              <Globe className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-sm font-black text-white">
              {editing ? 'Edit Monitor' : 'Add Monitor'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-all"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>

          {/* Name */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5"
              style={{ color: 'rgba(255,255,255,0.4)' }}>Monitor Name</label>
            <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
              placeholder="e.g. Carrier HVAC Datasheets"
              className="w-full text-sm rounded-xl px-3 py-2.5 outline-none transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
          </div>

          {/* URL */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5"
              style={{ color: 'rgba(255,255,255,0.4)' }}>Website URL</label>
            <input value={form.url} onChange={e => setForm(f => ({...f, url: e.target.value}))}
              placeholder="https://www.manufacturer.com/resources"
              className="w-full text-sm rounded-xl px-3 py-2.5 outline-none transition-all font-mono"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#60a5fa' }} />
          </div>

          {/* Schedule */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5"
              style={{ color: 'rgba(255,255,255,0.4)' }}>Check Schedule</label>
            <div className="grid grid-cols-4 gap-2">
              {SCHEDULES.map(s => (
                <button key={s.value} onClick={() => setForm(f => ({...f, schedule: s.value}))}
                  className="py-2 rounded-xl text-[11px] font-bold transition-all"
                  style={{
                    background: form.schedule === s.value ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${form.schedule === s.value ? 'rgba(37,99,235,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    color: form.schedule === s.value ? '#60a5fa' : 'rgba(255,255,255,0.45)',
                  }}>{s.label}</button>
              ))}
            </div>
          </div>

          {/* Formats */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5"
              style={{ color: 'rgba(255,255,255,0.4)' }}>File Formats <span style={{ color: 'rgba(255,255,255,0.25)' }}>(empty = all)</span></label>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map(f => (
                <button key={f.value} onClick={() => toggle('formats', f.value)}
                  className="px-3 py-1 rounded-lg text-[11px] font-bold transition-all"
                  style={{
                    background: form.formats.includes(f.value) ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${form.formats.includes(f.value) ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.08)'}`,
                    color: form.formats.includes(f.value) ? '#34d399' : 'rgba(255,255,255,0.4)',
                  }}>{f.label}</button>
              ))}
            </div>
          </div>

          {/* Doc types */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5"
              style={{ color: 'rgba(255,255,255,0.4)' }}>Document Types <span style={{ color: 'rgba(255,255,255,0.25)' }}>(empty = all)</span></label>
            <div className="flex flex-wrap gap-1.5">
              {DOC_TYPES.map(t => (
                <button key={t} onClick={() => toggle('doc_types', t)}
                  className="px-2.5 py-0.5 rounded-lg text-[10px] font-black transition-all"
                  style={{
                    background: form.doc_types.includes(t) ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${form.doc_types.includes(t) ? 'rgba(124,58,237,0.35)' : 'rgba(255,255,255,0.07)'}`,
                    color: form.doc_types.includes(t) ? '#c4b5fd' : 'rgba(255,255,255,0.35)',
                  }}>{t}</button>
              ))}
            </div>
          </div>

          {/* Auto-extract toggle */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white">Auto-extract on change</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Automatically run AI extraction on new or changed documents
                </p>
              </div>
              <button onClick={() => setForm(f => ({...f, auto_extract: !f.auto_extract}))}
                className="w-10 h-5 rounded-full transition-all shrink-0"
                style={{ background: form.auto_extract ? '#2563eb' : 'rgba(255,255,255,0.12)' }}>
                <div className="w-4 h-4 rounded-full bg-white transition-all mx-0.5"
                  style={{ transform: form.auto_extract ? 'translateX(20px)' : 'translateX(0)' }} />
              </button>
            </div>

            {form.auto_extract && (
              <div className="mt-3 space-y-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider block mb-1"
                    style={{ color: 'rgba(255,255,255,0.3)' }}>Schema</label>
                  <select value={form.schema_id}
                    onChange={e => setForm(f => ({...f, schema_id: e.target.value}))}
                    className="w-full text-xs rounded-lg px-3 py-2 outline-none"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}>
                    <option value="">Select schema…</option>
                    {schemas.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider block mb-1"
                    style={{ color: 'rgba(255,255,255,0.3)' }}>Provider</label>
                  <select value={form.provider}
                    onChange={e => setForm(f => ({...f, provider: e.target.value}))}
                    className="w-full text-xs rounded-lg px-3 py-2 outline-none"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}>
                    <option value="none">None (heuristic only)</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="gemini">Gemini</option>
                    <option value="groq">Groq</option>
                    <option value="landingai">LandingAI</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all hover:bg-white/[0.06]"
            style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-all hover:-translate-y-0.5 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Monitor'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Monitor card ──────────────────────────────────────────────────────────────
function MonitorCard({ monitor, onSelect, onEdit, onDelete, onTogglePause, onRunNow, selected }) {
  const sc = statusColor(monitor.status)
  const hasChanges = (monitor.last_new_count || 0) + (monitor.last_changed_count || 0) > 0

  return (
    <div onClick={() => onSelect(monitor.id)}
      className="rounded-2xl p-4 cursor-pointer transition-all hover:-translate-y-0.5 group"
      style={{
        background: selected ? 'rgba(37,99,235,0.1)' : '#0d1526',
        border: `1px solid ${selected ? 'rgba(37,99,235,0.35)' : 'rgba(255,255,255,0.07)'}`,
      }}>

      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${sc}15`, border: `1px solid ${sc}30` }}>
            <Globe className="w-4 h-4" style={{ color: sc }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{monitor.name}</p>
            <p className="text-[10px] font-mono truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {monitor.url}
            </p>
          </div>
        </div>
        {/* Status badge */}
        <span className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full"
          style={{ background: `${sc}15`, color: sc, border: `1px solid ${sc}30` }}>
          {monitor.status === 'running' && (
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 animate-pulse" style={{ background: sc }} />
          )}
          {statusLabel(monitor.status)}
        </span>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <span className="text-[10px] font-semibold capitalize" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {monitor.schedule}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {relativeTime(monitor.last_run_at)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <FileText className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {monitor.total_docs_seen || 0} docs seen
          </span>
        </div>
      </div>

      {/* Last run change summary */}
      {(monitor.last_new_count > 0 || monitor.last_changed_count > 0 || monitor.last_removed_count > 0) && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {monitor.last_new_count > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(34,197,94,0.12)', color: '#34d399', border: '1px solid rgba(34,197,94,0.25)' }}>
              +{monitor.last_new_count} new
            </span>
          )}
          {monitor.last_changed_count > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}>
              ~{monitor.last_changed_count} changed
            </span>
          )}
          {monitor.last_removed_count > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
              -{monitor.last_removed_count} removed
            </span>
          )}
        </div>
      )}

      {/* Error message */}
      {monitor.status === 'error' && monitor.error && (
        <div className="mb-3 px-3 py-2 rounded-lg text-[10px] truncate"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
          ⚠ {monitor.error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        onClick={e => e.stopPropagation()}>
        <button onClick={() => onRunNow(monitor.id)}
          disabled={monitor.status === 'running'}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:bg-white/[0.08] disabled:opacity-40"
          style={{ color: '#60a5fa', border: '1px solid rgba(37,99,235,0.2)' }}
          title="Run now">
          <Play className="w-3 h-3" /> Run Now
        </button>
        <button onClick={() => onTogglePause(monitor)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:bg-white/[0.08]"
          style={{ color: monitor.status === 'paused' ? '#34d399' : '#fbbf24', border: `1px solid ${monitor.status === 'paused' ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
          {monitor.status === 'paused'
            ? <><RefreshCw className="w-3 h-3" /> Resume</>
            : <><Pause className="w-3 h-3" /> Pause</>}
        </button>
        <button onClick={() => onEdit(monitor)}
          className="p-1.5 rounded-lg transition-all hover:bg-white/[0.08]"
          style={{ color: 'rgba(255,255,255,0.35)' }} title="Edit">
          <Settings className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onDelete(monitor.id)}
          className="p-1.5 rounded-lg transition-all hover:bg-red-500/[0.12]"
          style={{ color: 'rgba(255,255,255,0.25)' }} title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Detail panel — run history + change list ──────────────────────────────────
function MonitorDetail({ monitorId, onClose }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api.get(`${BASE}/${monitorId}`)
      setData(r.data)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [monitorId])

  useEffect(() => { load() }, [load])

  // Poll while monitor is running
  useEffect(() => {
    if (!data) return
    if (data.monitor?.status === 'running') {
      setPolling(true)
      const t = setTimeout(load, 3000)
      return () => clearTimeout(t)
    } else {
      setPolling(false)
    }
  }, [data, load])

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
    </div>
  )

  if (!data) return null

  const { monitor, recent_runs = [] } = data
  const latestRun  = recent_runs[0]
  const allChanges = latestRun?.changes || []

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="min-w-0">
          <p className="text-sm font-black text-white truncate">{monitor.name}</p>
          <p className="text-[10px] font-mono truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {monitor.url}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {polling && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: 'rgba(37,99,235,0.15)', color: '#60a5fa' }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 bg-blue-400 animate-pulse" />
              Running…
            </span>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-all"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Docs', value: monitor.total_docs_seen || 0, color: '#60a5fa' },
            { label: 'Last New',     value: monitor.last_new_count || 0,    color: '#34d399' },
            { label: 'Last Changed', value: monitor.last_changed_count || 0, color: '#fbbf24' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-3 text-center"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-lg font-black" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[9px] mt-0.5 font-bold uppercase tracking-wider"
                style={{ color: 'rgba(255,255,255,0.3)' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Latest run changes */}
        {latestRun && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest"
                style={{ color: 'rgba(255,255,255,0.3)' }}>Latest Run</span>
              <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {relativeTime(latestRun.run_at)} · {latestRun.pages_crawled} pages
                {latestRun.duration_seconds != null && ` · ${latestRun.duration_seconds}s`}
              </span>
              <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full font-bold"
                style={{
                  background: latestRun.status === 'completed' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  color: latestRun.status === 'completed' ? '#34d399' : '#f87171',
                }}>
                {latestRun.status}
              </span>
            </div>

            {allChanges.length === 0 ? (
              <div className="rounded-xl p-4 text-center"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <CheckCircle2 className="w-6 h-6 mx-auto mb-2" style={{ color: 'rgba(34,197,94,0.4)' }} />
                <p className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>No changes detected</p>
                <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  {latestRun.docs_found} document{latestRun.docs_found !== 1 ? 's' : ''} checked
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {allChanges.map((c, i) => {
                  const ct = changeTypeColor(c.change_type)
                  return (
                    <div key={i} className="rounded-xl px-3 py-2.5 flex items-center gap-3"
                      style={{ background: ct.bg, border: `1px solid ${ct.border}` }}>
                      <span className="text-[9px] font-black shrink-0 px-1.5 py-0.5 rounded"
                        style={{ background: `${ct.color}20`, color: ct.color }}>
                        {ct.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold truncate" style={{ color: 'rgba(255,255,255,0.8)' }}>
                          {c.filename}
                        </p>
                        <p className="text-[9px] font-mono truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          {c.doc_type && <span className="mr-2 text-purple-400">{c.doc_type}</span>}
                          {c.url}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.doc_id && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                            style={{ background: 'rgba(37,99,235,0.15)', color: '#60a5fa' }}>
                            In library
                          </span>
                        )}
                        {c.job_id && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                            style={{ background: 'rgba(124,58,237,0.15)', color: '#c4b5fd' }}>
                            Extracted
                          </span>
                        )}
                        <a href={c.url} target="_blank" rel="noopener noreferrer"
                          className="p-0.5 rounded hover:bg-white/[0.08] transition-all"
                          style={{ color: 'rgba(255,255,255,0.3)' }}
                          onClick={e => e.stopPropagation()}>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Run history */}
        {recent_runs.length > 1 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest mb-2"
              style={{ color: 'rgba(255,255,255,0.3)' }}>Run History</p>
            <div className="space-y-1.5">
              {recent_runs.slice(1).map(run => (
                <div key={run.id} className="rounded-xl px-3 py-2 flex items-center gap-3"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      {relativeTime(run.run_at)}
                    </p>
                    <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {run.docs_found} found · {run.new_count} new · {run.changed_count} changed
                      {run.duration_seconds != null && ` · ${run.duration_seconds}s`}
                    </p>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-bold shrink-0"
                    style={{
                      background: run.status === 'completed' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                      color: run.status === 'completed' ? '#34d399' : '#f87171',
                    }}>
                    {run.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {recent_runs.length === 0 && (
          <div className="rounded-xl p-6 text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <Activity className="w-8 h-8 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
            <p className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>No runs yet</p>
            <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
              Click "Run Now" to start the first crawl
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MonitorsPage() {
  const [monitors,       setMonitors]       = useState([])
  const [loading,        setLoading]        = useState(true)
  const [showModal,      setShowModal]      = useState(false)
  const [editingMonitor, setEditingMonitor] = useState(null)
  const [selectedId,     setSelectedId]     = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await api.get(BASE)
      setMonitors(r.data?.monitors || [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Poll running monitors every 5s
  useEffect(() => {
    const hasRunning = monitors.some(m => m.status === 'running')
    if (!hasRunning) return
    const t = setTimeout(load, 5000)
    return () => clearTimeout(t)
  }, [monitors, load])

  const handleSaved = (saved) => {
    setMonitors(ms => {
      const idx = ms.findIndex(m => m.id === saved.id)
      if (idx !== -1) {
        const copy = [...ms]; copy[idx] = saved; return copy
      }
      return [saved, ...ms]
    })
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this monitor and all its run history?')) return
    try {
      await api.delete(`${BASE}/${id}`)
      setMonitors(ms => ms.filter(m => m.id !== id))
      if (selectedId === id) setSelectedId(null)
      toast.success('Monitor deleted')
    } catch (e) { toast.error(e.message) }
  }

  const handleTogglePause = async (monitor) => {
    try {
      const endpoint = monitor.status === 'paused' ? 'resume' : 'pause'
      const r = await api.post(`${BASE}/${monitor.id}/${endpoint}`)
      handleSaved(r.data.monitor)
      toast.success(endpoint === 'resume' ? 'Monitor resumed' : 'Monitor paused')
    } catch (e) { toast.error(e.message) }
  }

  const handleRunNow = async (id) => {
    try {
      await api.post(`${BASE}/${id}/run`)
      toast.success('Monitor started — refreshing in a moment…')
      setMonitors(ms => ms.map(m => m.id === id ? { ...m, status: 'running' } : m))
      setTimeout(load, 3000)
    } catch (e) { toast.error(e.message) }
  }

  const activeCount = monitors.filter(m => m.status === 'active' || m.status === 'running').length
  const totalNew    = monitors.reduce((s, m) => s + (m.last_new_count || 0), 0)

  return (
    <div className="flex h-full overflow-hidden animate-fade-in">

      {/* Left panel — monitor list */}
      <div className="flex flex-col overflow-hidden"
        style={{
          width: selectedId ? 420 : '100%',
          maxWidth: selectedId ? 420 : undefined,
          borderRight: selectedId ? '1px solid rgba(255,255,255,0.07)' : 'none',
          transition: 'width 0.3s ease',
        }}>

        {/* Header */}
        <div className="px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-base font-black text-white">Monitors</h1>
            <button
              onClick={() => { setEditingMonitor(null); setShowModal(true) }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white transition-all hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
              <Plus className="w-3.5 h-3.5" /> Add Monitor
            </button>
          </div>
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {activeCount} active · {monitors.length} total
            {totalNew > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full font-bold text-[9px]"
                style={{ background: 'rgba(34,197,94,0.15)', color: '#34d399' }}>
                {totalNew} new docs detected
              </span>
            )}
          </p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>

          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
            </div>
          )}

          {!loading && monitors.length === 0 && (
            <div className="rounded-2xl p-10 text-center"
              style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.07)' }}>
              <Globe className="w-12 h-12 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.1)' }} />
              <p className="text-sm font-bold text-white/50 mb-1">No monitors yet</p>
              <p className="text-xs mb-5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Add a manufacturer website URL to start monitoring for new or changed documents
              </p>
              <button
                onClick={() => { setEditingMonitor(null); setShowModal(true) }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
                <Plus className="w-3.5 h-3.5 inline mr-1.5" /> Add First Monitor
              </button>
            </div>
          )}

          {monitors.map(m => (
            <MonitorCard
              key={m.id}
              monitor={m}
              selected={selectedId === m.id}
              onSelect={id => setSelectedId(id === selectedId ? null : id)}
              onEdit={mon => { setEditingMonitor(mon); setShowModal(true) }}
              onDelete={handleDelete}
              onTogglePause={handleTogglePause}
              onRunNow={handleRunNow}
            />
          ))}
        </div>
      </div>

      {/* Right panel — detail */}
      {selectedId && (
        <div className="flex-1 overflow-hidden" style={{ background: '#080d1c' }}>
          <MonitorDetail
            monitorId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <MonitorModal
          monitor={editingMonitor}
          onClose={() => { setShowModal(false); setEditingMonitor(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
