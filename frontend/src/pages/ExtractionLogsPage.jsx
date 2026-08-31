/**
 * ExtractionLogsPage — Admin view of all extraction jobs.
 * Shows Job ID, Schema, Status, Quality, Provider, Duration, Created
 * Actions: View results, Re-extract, Delete
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, Trash2, Eye, Zap, Copy, ChevronUp, ChevronDown,
  CheckCircle2, AlertCircle, Clock, BarChart3, Filter
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useWorkflow } from '../lib/store'

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    completed:  { color: '#34d399', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.25)',   icon: '✓', label: 'Completed' },
    failed:     { color: '#f87171', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)',   icon: '✗', label: 'Failed'    },
    running:    { color: '#60a5fa', bg: 'rgba(37,99,235,0.12)',   border: 'rgba(37,99,235,0.25)',   icon: '↺', label: 'Running'   },
    cancelled:  { color: '#9ca3af', bg: 'rgba(156,163,175,0.1)',  border: 'rgba(156,163,175,0.2)',  icon: '○', label: 'Cancelled' },
    pending:    { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)',   icon: '◌', label: 'Pending'   },
  }
  const c = cfg[status] || cfg.pending
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      <span>{c.icon}</span>{c.label}
    </span>
  )
}

// ── Quality grade ring ────────────────────────────────────────────────────────
function QualityBadge({ score }) {
  if (score == null) return <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444'
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F'
  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black"
        style={{ background: `${color}20`, border: `2px solid ${color}50`, color }}>
        {grade}
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color }}>{score}</span>
    </div>
  )
}

// ── Provider pill ─────────────────────────────────────────────────────────────
function ProviderPill({ provider }) {
  const cfg = {
    landingai: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
    openai:    { color: '#34d399', bg: 'rgba(34,197,94,0.1)'   },
    none:      { color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  }
  const c = cfg[provider] || cfg.none
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded"
      style={{ background: c.bg, color: c.color }}>
      {provider || 'none'}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ExtractionLogsPage() {
  const navigate             = useNavigate()
  const { addJob }           = useWorkflow()
  const [jobs,       setJobs]       = useState([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(false)
  const [filter,     setFilter]     = useState('')      // status filter
  const [sortBy,     setSortBy]     = useState('created_at')
  const [sortDir,    setSortDir]    = useState('desc')
  const [search,     setSearch]     = useState('')
  const [selected,   setSelected]   = useState(new Set()) // selected job IDs
  const [bulkLoading,setBulkLoading]= useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: 200 })
      if (filter) params.set('status', filter)
      const r = await api.get(`/api/v1/extraction/admin/all?${params}`)
      setJobs(r.data.jobs || [])
      setTotal(r.data.total || 0)
    } catch (e) { toast.error('Failed to load: ' + e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [filter])

  const deleteJob = async (jobId, filename) => {
    if (!window.confirm(`Delete extraction job for "${filename}"?`)) return
    try {
      await api.delete(`/api/v1/extraction/admin/${jobId}`)
      toast.success('Job deleted')
      load()
    } catch (e) { toast.error(e.message) }
  }

  // Group jobs into extraction runs for display.
  // Rule: jobs sharing the same batch_run_id = one extraction run.
  // Old jobs with no batch_run_id: group by same schema + same minute of creation
  //   (multiple PDFs extracted at the same time = same run).
  // Single old jobs stay as single-row runs.
  const groupedRows = (() => {
    const filtered = jobs
      .filter(j => !search ||
        j.filename?.toLowerCase().includes(search.toLowerCase()) ||
        j.schema_name?.toLowerCase().includes(search.toLowerCase()) ||
        j.job_id?.startsWith(search))
      .filter(j => !filter || j.status === filter)

    // Sort by date desc before grouping
    const sorted = [...filtered].sort((a, b) =>
      new Date(b.created_at || 0) - new Date(a.created_at || 0)
    )

    const batches = {}   // batch_run_id → jobs[]
    const timeBuckets = {}  // schema+minute → jobs[]   (for old jobs without batch_run_id)

    for (const j of sorted) {
      if (j.batch_run_id) {
        if (!batches[j.batch_run_id]) batches[j.batch_run_id] = []
        batches[j.batch_run_id].push(j)
      } else {
        // Bucket key: schema + truncated minute so jobs extracted in same minute group together
        const minute = j.created_at ? j.created_at.slice(0, 16) : j.job_id  // "2026-08-20T10:27"
        const key    = `${j.schema_name || ''}|${minute}`
        if (!timeBuckets[key]) timeBuckets[key] = []
        timeBuckets[key].push(j)
      }
    }

    // Convert both maps to unified row objects
    const toRow = (groupKey, groupJobs, isBatchGroup) => {
      const allDone    = groupJobs.every(j => j.status === 'completed')
      const anyFailed  = groupJobs.some(j => j.status === 'failed')
      const anyRunning = groupJobs.some(j => j.status === 'running')
      const status     = anyRunning ? 'running' : anyFailed ? 'failed' : allDone ? 'completed' : 'pending'
      const totalRecs  = groupJobs.reduce((s, j) => s + (j.total_records || j.records || 0), 0)
      const qualJobs   = groupJobs.filter(j => j.quality_score != null || j.quality != null)
      const avgQuality = qualJobs.length > 0
        ? Math.round(qualJobs.reduce((s, j) => s + (j.quality_score ?? j.quality ?? 0), 0) / qualJobs.length)
        : null
      const isBatch = groupJobs.length > 1 || isBatchGroup
      return {
        _isBatch:     isBatch,
        _groupKey:    groupKey,
        batch_run_id: groupJobs[0]?.batch_run_id || groupKey,
        job_id:       isBatch ? groupKey : groupJobs[0]?.job_id,
        schema_name:  groupJobs[0]?.schema_name || '',
        status,
        provider:     groupJobs[0]?.provider || '',
        records:      totalRecs || null,
        quality:      avgQuality,
        doc_count:    groupJobs.length,
        filenames:    groupJobs.map(j => j.filename).filter(Boolean),
        created_at:   groupJobs[0]?.created_at || null,
        jobs:         groupJobs,
        // For single-PDF runs, expose the raw job for direct view
        _singleJob:   groupJobs.length === 1 ? groupJobs[0] : null,
      }
    }

    const rows = [
      ...Object.entries(batches).map(([key, bJobs]) => toRow(key, bJobs, true)),
      ...Object.entries(timeBuckets).map(([key, bJobs]) => toRow(key, bJobs, false)),
    ]

    // Sort all rows by created_at desc
    rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))

    return rows
  })()

  const displayed = groupedRows

  // ── Multi-select helpers ────────────────────────────────────────────────
  const allIds        = displayed.map(j => j.job_id)
  const allSelected   = allIds.length > 0 && allIds.every(id => selected.has(id))
  const someSelected  = allIds.some(id => selected.has(id))

  const toggleOne = (id) => setSelected(s => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(allIds))
  }

  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selected.size} selected job(s)?`)) return
    setBulkLoading(true)
    let deleted = 0
    for (const id of selected) {
      try { await api.delete(`/api/v1/extraction/admin/${id}`); deleted++ } catch {}
    }
    setSelected(new Set())
    toast.success(`Deleted ${deleted} job(s)`)
    load()
    setBulkLoading(false)
  }

  const bulkView = async () => {
    const ids = [...selected]
    if (!ids.length) return
    // Load and view first selected job
    await viewJob(displayed.find(j => j.job_id === ids[0]))
  }

  const viewJob = async (j) => {
    try {
      const r    = await api.get(`/api/v1/extraction/run/${j.job_id}`)
      const data = r.data
      addJob({
        job_id:            data.job_id,
        document_id:       data.document_id,
        schema_name:       data.schema_name || j.schema_name,
        status:            data.status || j.status,
        fields:            data.fields            || {},
        all_records:       data.all_records       || null,
        total_records:     data.total_records     || null,
        quality_score:     data.quality_score     ?? j.quality,
        confidence_scores: data.confidence_scores || {},
        source_references: data.source_references || {},
        batch_run_id:      data.batch_run_id      || j.batch_run_id || '',
        error:             data.error             || j.error,
      })
      // Navigate with batch context if available
      const batchId = data.batch_run_id || j.batch_run_id
      navigate(batchId ? `/results?batch=${batchId}` : '/results')
    } catch (e) {
      toast.error('Could not load job result: ' + e.message)
    }
  }

  const copyId = (id) => {
    navigator.clipboard.writeText(id).then(() => toast.success('Job ID copied'))
  }

  const SortIcon = ({ col }) => (
    <button onClick={() => { setSortBy(col); setSortDir(d => sortBy === col ? (d === 'asc' ? 'desc' : 'asc') : 'desc') }}
      className="ml-1 opacity-40 hover:opacity-100 transition-opacity">
      {sortBy === col
        ? sortDir === 'desc' ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronUp className="w-3 h-3 inline" />
        : <ChevronDown className="w-3 h-3 inline opacity-30" />}
    </button>
  )

  // Summary stats
  const completed = jobs.filter(j => j.status === 'completed').length
  const failed    = jobs.filter(j => j.status === 'failed').length
  const credits   = jobs.reduce((s, j) => s + (j.credits_used || 0), 0)

  return (
    <div className="p-6 max-w-screen-xl mx-auto animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Extraction Logs</h1>
          <p className="text-white/40 text-sm mt-0.5">
            {displayed.length} extraction run{displayed.length !== 1 ? 's' : ''}
            {' · '}{displayed.filter(r => r.status === 'completed').length} completed
            {' · '}{jobs.length} total jobs
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn btn-secondary gap-2">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Total Runs',    val: displayed.length,                                              icon: '📋', color: '#60a5fa' },
          { label: 'Completed',     val: displayed.filter(r => r.status === 'completed').length,        icon: '✅', color: '#34d399' },
          { label: 'Failed',        val: displayed.filter(r => r.status === 'failed').length,           icon: '❌', color: '#f87171' },
          { label: 'Credits Used',  val: credits.toFixed(1),                                            icon: '⚡', color: '#fbbf24' },
        ].map(s => (
          <div key={s.label} className="card p-4 flex items-center gap-3">
            <span className="text-2xl">{s.icon}</span>
            <div>
              <p className="text-xl font-black" style={{ color: s.color }}>{s.val}</p>
              <p className="text-xs text-white/40">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          className="input text-sm flex-1 min-w-[200px] max-w-xs"
          placeholder="Search by filename, schema, job ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-1.5">
          {['', 'completed', 'failed', 'running', 'pending'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background: filter === s ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.04)',
                color: filter === s ? '#fff' : 'rgba(255,255,255,0.5)',
                border: filter === s ? 'none' : '1px solid rgba(255,255,255,0.08)',
              }}>
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bulk action bar — appears when items selected ── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-4"
          style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.25)' }}>
          <span className="text-sm font-bold text-blue-300">
            {selected.size} selected
          </span>
          <div className="flex gap-2 ml-auto">
            <button onClick={bulkView} disabled={bulkLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black text-white transition-all hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
              <Eye className="w-3.5 h-3.5" /> View First
            </button>
            <button onClick={bulkDelete} disabled={bulkLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black text-white transition-all hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
              {bulkLoading
                ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Deleting...</>
                : <><Trash2 className="w-3.5 h-3.5" /> Delete {selected.size}</>}
            </button>
            <button onClick={() => setSelected(new Set())}
              className="p-2 rounded-lg text-xs font-bold transition-all hover:bg-white/[0.08]"
              style={{ color: 'rgba(255,255,255,0.5)' }}>
              ✕ Clear
            </button>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-16 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="p-16 text-center">
            <BarChart3 className="w-14 h-14 mx-auto mb-4 text-white/10" />
            <p className="text-white/40 font-bold mb-1">No extraction jobs found</p>
            <p className="text-white/25 text-sm">Run extractions from the Extract page to see them here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {/* Select-all */}
                  <th className="px-4 py-3.5 w-10">
                    <input type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded cursor-pointer accent-blue-500"
                    />
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-white/40 uppercase tracking-wider">
                    Run Type <SortIcon col="doc_count" />
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-white/40 uppercase tracking-wider">
                    Document
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-white/40 uppercase tracking-wider">
                    Schema <SortIcon col="schema_name" />
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-white/40 uppercase tracking-wider">
                    Status <SortIcon col="status" />
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-white/40 uppercase tracking-wider">
                    Quality <SortIcon col="quality" />
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-white/40 uppercase tracking-wider">
                    Provider
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-white/40 uppercase tracking-wider">
                    Records
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-white/40 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-white/40 uppercase tracking-wider">
                    Created <SortIcon col="created_at" />
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-white/40 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((j, i) => {
                  const isSelected = selected.has(j.job_id)
                  const isBatch    = j._isBatch

                  const handleClick = () => {
                    if (j._singleJob) {
                      // Single-PDF extraction — load directly
                      viewJob(j._singleJob)
                    } else {
                      // Multi-PDF batch — load all jobs and navigate with batch context
                      j.jobs.forEach(bj => addJob({
                        job_id:            bj.job_id,
                        document_id:       bj.document_id,
                        filename:          bj.filename,
                        schema_name:       bj.schema_name,
                        status:            bj.status,
                        fields:            bj.fields || {},
                        all_records:       bj.all_records || null,
                        total_records:     bj.total_records || null,
                        quality_score:     bj.quality_score ?? bj.quality,
                        confidence_scores: bj.confidence_scores || {},
                        source_references: bj.source_references || {},
                        batch_run_id:      j.batch_run_id,
                        error:             bj.error,
                      }))
                      navigate(`/results?batch=${j.batch_run_id}`)
                    }
                  }

                  return (
                  <tr key={j.job_id}
                    className="hover:bg-white/[0.025] transition-colors cursor-pointer"
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: isSelected
                        ? 'rgba(37,99,235,0.07)'
                        : isBatch ? 'rgba(124,58,237,0.04)' : undefined,
                    }}
                    onClick={handleClick}>

                    {/* Checkbox */}
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <input type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(j.job_id)}
                        className="w-4 h-4 rounded cursor-pointer accent-blue-500"
                      />
                    </td>

                    {/* ID / Run badge */}
                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      {isBatch ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(124,58,237,0.2)', color: '#c4b5fd' }}>
                            BATCH · {j.doc_count} PDFs
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(37,99,235,0.15)', color: '#60a5fa' }}>
                            1 PDF
                          </span>
                          <button onClick={() => copyId(j._singleJob?.job_id || j.job_id)}
                            className="p-0.5 rounded hover:bg-white/[0.08] text-white/20 hover:text-white/50"
                            title="Copy job ID">
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Document(s) */}
                    <td className="px-5 py-3.5 max-w-[200px]">
                      {isBatch ? (
                        <div className="space-y-0.5">
                          {j.filenames.slice(0, 2).map((f, fi) => (
                            <p key={fi} className="text-xs text-white/70 truncate">{f}</p>
                          ))}
                          {j.filenames.length > 2 && (
                            <p className="text-[10px] text-white/35">+{j.filenames.length - 2} more</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs font-semibold text-white/80 truncate" title={j.filename}>{j.filename || '—'}</p>
                      )}
                    </td>

                    {/* Schema */}
                    <td className="px-5 py-3.5 max-w-[160px]">
                      <p className="text-xs text-white/60 truncate" title={j.schema_name}>{j.schema_name || '—'}</p>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      <StatusBadge status={j.status} />
                    </td>

                    {/* Quality */}
                    <td className="px-5 py-3.5">
                      <QualityBadge score={j.quality} />
                    </td>

                    {/* Provider */}
                    <td className="px-5 py-3.5">
                      <ProviderPill provider={j.provider} />
                    </td>

                    {/* Records */}
                    <td className="px-5 py-3.5 text-xs text-white/50 text-center">
                      {j.records ?? '—'}
                    </td>

                    {/* Owner */}
                    <td className="px-5 py-3.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                        style={{
                          background: j.guest_id ? 'rgba(99,102,241,0.12)' : 'rgba(37,99,235,0.1)',
                          color:      j.guest_id ? '#a5b4fc'                : '#60a5fa',
                        }}>
                        {j.guest_id ? 'Guest' : 'Admin'}
                      </span>
                    </td>

                    {/* Created */}
                    <td className="px-5 py-3.5 text-xs text-white/35 whitespace-nowrap">
                      {j.created_at ? (
                        <>
                          <p>{new Date(j.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Kolkata' })}</p>
                          <p>{new Date(j.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone:'Asia/Kolkata' })}</p>
                        </>
                      ) : '—'}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button onClick={handleClick}
                          title="View results"
                          className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-blue-400 transition-colors">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {/* Reset button for stuck RUNNING jobs */}
                        {j.status === 'running' && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              for (const bj of j.jobs) {
                                if (bj.status === 'running') {
                                  try { await api.post(`/api/v1/extraction/admin/${bj.job_id}/reset`) } catch {}
                                }
                              }
                              toast.success('Job reset — you can re-run the extraction')
                              load()
                            }}
                            title="Reset stuck job"
                            className="p-1.5 rounded-lg hover:bg-white/[0.08] text-yellow-400/60 hover:text-yellow-400 transition-colors">
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            const label = isBatch ? `${j.doc_count} jobs in this batch` : j.filenames[0] || 'this job'
                            if (!window.confirm(`Delete ${label}?`)) return
                            for (const bj of j.jobs) {
                              try { await api.delete(`/api/v1/extraction/admin/${bj.job_id}`) } catch {}
                            }
                            toast.success(`Deleted ${j.jobs.length} job(s)`)
                            load()
                          }}
                          title="Delete"
                          className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Row count */}
      {displayed.length > 0 && (
        <p className="text-xs text-white/30 mt-3 text-right">
          Showing {displayed.length} extraction run{displayed.length !== 1 ? 's' : ''} ({jobs.length} total jobs)
        </p>
      )}
    </div>
  )
}
