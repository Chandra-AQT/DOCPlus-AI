/**
 * ResultsPage — Matches DocLens AI reference UI:
 * Left: PDF viewer | Right: extraction results with record tabs, confidence badges
 * Quality Score ring, Coverage/Confidence bars, field grid with source highlighting
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Download, Edit2, Save, X, ChevronRight, BarChart3, ZoomIn, ZoomOut,
  CheckCircle2, AlertCircle, Zap, Table2, FileText, ChevronLeft,
  ChevronDown, ExternalLink, RotateCcw, Grid3x3, List
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useWorkflow } from '../lib/store'
import api, { exportResults, getDocument } from '../lib/api'
import { downloadBlob } from '../lib/utils'
import { isAdmin, isGuest } from '../lib/auth'

// ── PDF Viewer (left panel) ───────────────────────────────────────────────────
function PdfViewer({ docId, highlightField }) {
  const canvasRef    = useRef(null)
  const overlayRef   = useRef(null)
  const [page,       setPage]       = useState(1)
  const [total,      setTotal]      = useState(1)
  const [scale,      setScale]      = useState(1.2)
  const [loading,    setLoading]    = useState(false)
  const [pdfDoc,     setPdfDoc]     = useState(null)
  const [fileUrl,    setFileUrl]    = useState(null)
  const [highlight,  setHighlight]  = useState(null) // { text, rects }
  const [searchMsg,  setSearchMsg]  = useState('')

  // Load document URL
  useEffect(() => {
    if (!docId) return
    getDocument(docId).then(d => {
      if (d?.file_path) {
        const url = `${BASE_URL}/uploads/${d.file_path.split(/[\\/]/).pop()}`
        setFileUrl(url)
      }
    }).catch(() => {})
  }, [docId])

  // Load PDF.js
  useEffect(() => {
    if (!fileUrl) return
    const loadPdf = async () => {
      try {
        setLoading(true)
        const pdfjsLib = window['pdfjs-dist/build/pdf']
        if (!pdfjsLib) return
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
        const pdf = await pdfjsLib.getDocument(fileUrl).promise
        setPdfDoc(pdf)
        setTotal(pdf.numPages)
        setLoading(false)
      } catch { setLoading(false) }
    }
    if (window['pdfjs-dist/build/pdf']) {
      loadPdf()
    } else {
      const s = document.createElement('script')
      s.id  = 'pdfjs-script'
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
      s.onload = loadPdf
      document.head.appendChild(s)
    }
  }, [fileUrl])

  // Render page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    let cancelled = false
    pdfDoc.getPage(page).then(pg => {
      if (cancelled) return
      const viewport = pg.getViewport({ scale })
      const canvas   = canvasRef.current
      canvas.width   = viewport.width
      canvas.height  = viewport.height
      const ctx = canvas.getContext('2d')
      pg.render({ canvasContext: ctx, viewport }).promise?.then(() => {
        // Draw highlights after render
        if (highlight && overlayRef.current) {
          const overlay = overlayRef.current
          overlay.innerHTML = ''
          overlay.style.width  = canvas.width + 'px'
          overlay.style.height = canvas.height + 'px'
          let firstDiv = null
          for (const rect of highlight.rects) {
            const div = document.createElement('div')
            // rect coordinates are in unscaled PDF units — apply scale here
            div.style.cssText = `
              position: absolute;
              left: ${rect.x * scale}px;
              top: ${rect.y * scale}px;
              width: ${Math.max(rect.w * scale, 50)}px;
              height: ${Math.max(rect.h * scale, 14)}px;
              background: rgba(251,191,36,0.3);
              border: 2px solid rgba(251,191,36,0.95);
              border-radius: 3px;
              pointer-events: none;
              box-shadow: 0 0 10px rgba(251,191,36,0.6);
            `
            overlay.appendChild(div)
            if (!firstDiv) firstDiv = div
          }
          // Scroll the first highlight into view
          if (firstDiv) {
            firstDiv.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }
      })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [pdfDoc, page, scale, highlight])

  // ── Search PDF text when highlightField changes ─────────────────────────────
  useEffect(() => {
    if (!pdfDoc || !highlightField) return
    const searchVal  = String(highlightField.value || highlightField.field || '').trim()
    if (!searchVal || searchVal.length < 2) return

    const searchAcrossPages = async () => {
      setSearchMsg(`Searching for "${searchVal.slice(0, 30)}"...`)
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        try {
          const pg      = await pdfDoc.getPage(p)
          const textContent = await pg.getTextContent()
          const viewport = pg.getViewport({ scale: 1 })
          const fullText = textContent.items.map(i => i.str).join(' ')

          if (fullText.toLowerCase().includes(searchVal.toLowerCase())) {
            // Find matching items and get their bounding boxes
            const rects = []
            for (const item of textContent.items) {
              const itemText = item.str
              if (itemText.toLowerCase().includes(searchVal.toLowerCase())) {
                // PDF coordinate system: origin bottom-left, Y increases upward
                // Canvas coordinate system: origin top-left, Y increases downward
                // tx[4] = x position, tx[5] = y position (from bottom)
                const tx = item.transform
                const fontH = Math.abs(tx[3]) || item.height || 12
                const x = tx[4]
                // Convert: canvas_y = page_height - pdf_y - font_height
                const y = viewport.height - tx[5] - fontH
                const w = item.width || searchVal.length * 7
                const h = fontH + 2
                rects.push({ x, y, w, h })
                if (rects.length >= 5) break
              }
            }
            if (rects.length > 0) {
              setPage(p)
              setHighlight({ text: searchVal, rects })
              setSearchMsg(`Found on page ${p}`)
              setTimeout(() => setSearchMsg(''), 3000)
              return
            }
          }
        } catch { /* skip page */ }
      }
      setSearchMsg(`"${searchVal.slice(0, 20)}" not found in PDF text`)
      setTimeout(() => setSearchMsg(''), 3000)
    }

    searchAcrossPages()
  }, [highlightField, pdfDoc])

  if (!docId) return (
    <div className="flex items-center justify-center h-full" style={{ color: 'rgba(255,255,255,0.2)' }}>
      <div className="text-center">
        <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p className="text-sm">No document selected</p>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-3 px-4 py-2.5 shrink-0"
        style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="p-1 rounded hover:bg-white/[0.08] disabled:opacity-30 transition-colors">
            <ChevronLeft className="w-4 h-4 text-white/50" />
          </button>
          <span className="text-xs tabular-nums px-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {page} / {total}
          </span>
          <button onClick={() => setPage(p => Math.min(total, p + 1))} disabled={page >= total}
            className="p-1 rounded hover:bg-white/[0.08] disabled:opacity-30 transition-colors">
            <ChevronRight className="w-4 h-4 text-white/50" />
          </button>
        </div>
        {searchMsg && (
          <span className="text-[10px] px-2 py-0.5 rounded flex-1 truncate"
            style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
            {searchMsg}
          </span>
        )}
        {highlight && (
          <button onClick={() => { setHighlight(null); setSearchMsg('') }}
            className="text-[10px] px-2 py-0.5 rounded shrink-0"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
            Clear ✕
          </button>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))}
            className="p-1 rounded hover:bg-white/[0.08] transition-colors">
            <ZoomOut className="w-3.5 h-3.5 text-white/40" />
          </button>
          <span className="text-[10px] tabular-nums w-9 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {Math.round(scale * 100)}%
          </span>
          <button onClick={() => setScale(s => Math.min(3, s + 0.2))}
            className="p-1 rounded hover:bg-white/[0.08] transition-colors">
            <ZoomIn className="w-3.5 h-3.5 text-white/40" />
          </button>
        </div>
      </div>

      {/* Canvas + highlight overlay */}
      <div className="flex-1 overflow-auto p-3" style={{ background: '#1a1f2e' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="relative mx-auto inline-block">
            <canvas ref={canvasRef}
              className="block rounded shadow-2xl"
              style={{ maxWidth: '100%' }} />
            <div ref={overlayRef}
              className="absolute inset-0 pointer-events-none"
              style={{ position: 'absolute', top: 0, left: 0 }} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Confidence badge ──────────────────────────────────────────────────────────
function ConfBadge({ score }) {
  if (score == null) return null
  const pct   = Math.round(score > 1 ? score : score * 100)
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : '#ef4444'
  const bg    = pct >= 80 ? 'rgba(34,197,94,0.12)' : pct >= 60 ? 'rgba(234,179,8,0.12)' : 'rgba(239,68,68,0.12)'
  return (
    <span className="text-[10px] font-black px-1.5 py-0.5 rounded tabular-nums ml-1"
      style={{ color, background: bg, border: `1px solid ${color}30` }}>
      {pct}%
    </span>
  )
}

// ── Quality Score bar ─────────────────────────────────────────────────────────
function QualityBar({ label, value, color }) {
  const pct = Math.min(100, Math.max(0, Math.round(value)))
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
        <span className="text-[10px] font-bold tabular-nums" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ── Single extraction job results panel ──────────────────────────────────────
function JobResultsPanel({ job, onUpdate, onHighlight }) {
  const [exporting,      setExporting]      = useState(false)
  const [viewMode,       setViewMode]       = useState('grid')  // 'grid' | 'list'
  // HITL: per-record, per-field validation state
  const [hitlState,      setHitlState]      = useState({}) // { [recIdx]: { [field]: 'pending'|'approved'|'rejected' } }
  const [fieldEdits,     setFieldEdits]     = useState({}) // { [recIdx]: { [field]: editedValue } }
  const [editingField,   setEditingField]   = useState(null) // { recIdx, key }

  const fields  = job.fields || {}
  const confs   = job.confidence_scores || {}
  const sources = job.source_references || {}

  // ── Multi-record support ─────────────────────────────────────────────────
  // all_records = LandingAI multi-record extraction (highest priority)
  // nested array = single-record result where a field is array-of-objects
  // flat = simple single-record result
  const allRecords = job.all_records || null

  // Detect any array-of-objects field in the flat result (schema-driven, no hardcoded names)
  const nestedArrayKey = !allRecords
    ? Object.keys(fields).find(k => Array.isArray(fields[k]) && fields[k].length > 0 && typeof fields[k][0] === 'object')
    : null
  const nestedArray = nestedArrayKey ? fields[nestedArrayKey] : null

  // Build the authoritative records array:
  // 1. From all_records (multi-record LandingAI result) — highest priority
  // 2. From any nested array-of-objects field (e.g. models, items, records…)
  // 3. From fields if it's an array (legacy)
  // 4. Single flat record
  const records = allRecords?.length > 0
    ? allRecords.map(r => ({ result: r.result || r, confidence: r.confidence || {} }))
    : nestedArray?.length > 0
      ? nestedArray.map(f => ({ result: f, confidence: {} }))
      : Array.isArray(fields) ? fields.map(f => ({ result: f, confidence: {} }))
      : [{ result: fields, confidence: confs }]

  const isMultiRecord = allRecords?.length > 0 || nestedArray?.length > 0 || records.length > 1

  // Column headers = union of all field names across all records
  const fieldKeys = allRecords
    ? [...new Set(allRecords.flatMap(r => Object.keys(r.result || {})))]
    : nestedArray
      ? [...new Set(nestedArray.flatMap(r => Object.keys(r || {})))]
      : Object.keys(fields)

  // Active record fields/confs (for single-record view and per-record stats)
  const [activeRecordIdx, setActiveRecordIdx] = useState(0)
  const activeRec   = records[activeRecordIdx] || records[0] || { result: {}, confidence: {} }
  const activeFields = activeRec.result  || {}
  const activeConfs  = activeRec.confidence || confs

  const filledCount = isMultiRecord
    ? (() => {
        // For multi-record: count total non-null cells across all records
        const allKeys = [...new Set(records.flatMap(r => Object.keys(r.result || {})))]
        return records.reduce((sum, r) =>
          sum + allKeys.filter(k => r.result?.[k] !== null && r.result?.[k] !== undefined && r.result?.[k] !== '').length, 0)
      })()
    : fieldKeys.filter(k => {
        const v = activeFields[k]; return v !== null && v !== undefined && v !== ''
      }).length

  // ── HITL helpers ─────────────────────────────────────────────────────────
  const getFieldState  = (recIdx, key) => hitlState[recIdx]?.[key] || 'pending'
  const setFieldState  = (recIdx, key, state) =>
    setHitlState(h => ({ ...h, [recIdx]: { ...(h[recIdx] || {}), [key]: state } }))
  const getFieldEdit   = (recIdx, key) => fieldEdits[recIdx]?.[key]
  const setFieldEdit   = (recIdx, key, val) =>
    setFieldEdits(e => ({ ...e, [recIdx]: { ...(e[recIdx] || {}), [key]: val } }))

  const hitlSummary = (recIdx) => {
    const recState = hitlState[recIdx] || {}
    const total    = fieldKeys.length
    const approved = Object.values(recState).filter(s => s === 'approved').length
    const rejected = Object.values(recState).filter(s => s === 'rejected').length
    return { total, approved, rejected, pending: total - approved - rejected }
  }

  // ── Value renderer — handles nested objects, arrays ──────────────────────
  // Any field that is an array-of-objects is shown in the spreadsheet table above,
  // not rendered inline here. This is schema-driven — no hardcoded field names.
  const renderValue = (val, key) => {
    if (val === null || val === undefined || val === '') return null
    // Skip inline rendering of any array-of-objects — shown in spreadsheet above
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object')
      return `[${val.length} record${val.length !== 1 ? 's' : ''} — see table above]`
    if (Array.isArray(val)) return val.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ')
    if (typeof val === 'object') {
      return (
        <div className="space-y-0.5 mt-0.5">
          {Object.entries(val).map(([k, v]) => (
            <div key={k} className="flex gap-1.5 text-[10px]">
              <span className="shrink-0 font-mono" style={{ color: '#a78bfa' }}>{k}:</span>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}
              </span>
            </div>
          ))}
        </div>
      )
    }
    return String(val)
  }

  // Confidence: use per-record confidence if available.
  // For nested array records (models[]), items don't have per-field confidence,
  // so we compute it from fill rate: filled fields ≈ 90% confident, null ≈ 0%.
  const avgConf = (() => {
    const confVals = Object.values(activeConfs)
    if (confVals.length > 0) {
      // Real confidence scores available
      return Math.round(confVals.reduce((a, b) => a + (b > 1 ? b : b * 100), 0) / confVals.length)
    }
    // No confidence scores — estimate from multi-record fill rate across all records
    if (records.length > 0) {
      const allKeys = [...new Set(records.flatMap(r => Object.keys(r.result || {})))]
      if (allKeys.length > 0) {
        const allVals = records.flatMap(r =>
          allKeys.map(k => (r.result?.[k] !== null && r.result?.[k] !== undefined && r.result?.[k] !== '') ? 90 : 0)
        )
        return Math.round(allVals.reduce((a, b) => a + b, 0) / allVals.length)
      }
    }
    // Fallback: estimate from field coverage  
    return coverage > 0 ? Math.min(90, coverage) : 0
  })()

  const coverageVal = fieldKeys.length > 0 ? Math.round((filledCount / fieldKeys.length) * 100) : 0
  const coverage = isMultiRecord
    ? (() => {
        const allKeys = [...new Set(records.flatMap(r => Object.keys(r.result || {})))]
        const totalCells = allKeys.length * records.length
        if (totalCells === 0) return 0
        const filledCells = records.reduce((sum, r) =>
          sum + allKeys.filter(k => r.result?.[k] !== null && r.result?.[k] !== undefined && r.result?.[k] !== '').length, 0)
        return Math.round((filledCells / totalCells) * 100)
      })()
    : coverageVal
  const quality  = job.quality_score ?? Math.round((coverage * 0.5 + avgConf * 0.5))

  const handleExport = async (fmt) => {
    // Block guests without export permission
    if (isGuest()) {
      const guestData = (() => { try { return JSON.parse(localStorage.getItem('docplus_guest') || '{}') } catch { return {} } })()
      if (!guestData.export_allowed) {
        toast('🔒 Export access required. Contact admin to enable downloads.', {
          icon: '⚠️',
          style: { background: '#1e2d4a', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' },
          duration: 5000,
        })
        return
      }
    }
    setExporting(true)
    try {
      const blob = await exportResults(job.job_id, fmt)
      downloadBlob(blob, `extraction_${job.job_id.slice(0, 8)}.${fmt === 'excel' ? 'xlsx' : fmt}`)
      toast.success(`Exported as ${fmt.toUpperCase()}`)
    } catch {
      if (fmt === 'json') {
        // Include nested models array if present
        const exportData = allRecords ? { ...job, all_records: allRecords } : job
        downloadBlob(new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }),
          `extraction_${job.job_id.slice(0, 8)}.json`)
        toast.success('Exported as JSON')
      } else {
        // ── Flatten helper — handles 3 shapes ─────────────────────────────
        // Shape 1: all_records[] (LandingAI top-level multi-record)
        // Shape 2: fields.models[] or any nested array-of-objects field
        // Shape 3: single flat record
        const buildRows = () => {
          // Shape 1
          if (allRecords?.length > 0) {
            const keys = [...new Set(allRecords.flatMap(r => Object.keys(r.result || r)))]
            return { keys, rows: allRecords.map(r => keys.map(k => r.result?.[k] ?? r[k] ?? '')) }
          }
          // Shape 2: find nested array-of-objects field
          const arrayKey = Object.keys(fields).find(k =>
            Array.isArray(fields[k]) && fields[k].length > 0 && typeof fields[k][0] === 'object'
          )
          if (arrayKey) {
            const headerFields = Object.entries(fields)
              .filter(([k]) => !Array.isArray(fields[k]))
              .map(([k, v]) => [k, v])
            const modelKeys = [...new Set(fields[arrayKey].flatMap(r => Object.keys(r)))]
            const allKeys   = [...headerFields.map(([k]) => k), ...modelKeys]
            const headerVals = headerFields.map(([, v]) => v)
            const rows = fields[arrayKey].map(rec =>
              [...headerVals, ...modelKeys.map(k => rec[k] ?? '')]
            )
            return { keys: allKeys, rows }
          }
          // Shape 3: flat
          const keys = Object.keys(fields)
          return { keys: ['field', 'value', 'confidence'], rows: keys.map(k => [
            k,
            String(fields[k] ?? ''),
            activeConfs[k] != null ? Math.round((activeConfs[k] > 1 ? activeConfs[k] : activeConfs[k] * 100)) + '%' : '',
          ])}
        }

        const { keys, rows } = buildRows()
        const csv = [keys, ...rows]
          .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
          .join('\n')
        downloadBlob(new Blob([csv], { type: 'text/csv' }), `extraction_${job.job_id.slice(0, 8)}.csv`)
        toast.success(`Exported ${rows.length} record(s) as CSV`)
      }
    }
    setExporting(false)
  }

  const qualColor = quality >= 80 ? '#22c55e' : quality >= 60 ? '#eab308' : '#ef4444'
  const qualGrade = quality >= 90 ? 'A' : quality >= 75 ? 'B' : quality >= 60 ? 'C' : quality >= 45 ? 'D' : 'F'

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Top bar ── */}
      <div className="px-5 py-3 shrink-0 flex items-center justify-between flex-wrap gap-2"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
            job.status === 'completed' ? 'bg-green-500/15' : 'bg-red-500/15'}`}>
            {job.status === 'completed'
              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
              : <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">{job.schema_name || 'Extraction'}
              {job.total_records > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-black"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#34d399' }}>
                  {job.total_records} records
                </span>
              )}
            </p>
            <p className="text-[10px] font-mono truncate" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {job.document_id?.slice(0, 20)}...
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
            <button onClick={() => setViewMode('grid')}
              className="p-1.5 transition-all"
              style={{ background: viewMode === 'grid' ? 'rgba(37,99,235,0.3)' : 'transparent' }}>
              <Grid3x3 className="w-3.5 h-3.5" style={{ color: viewMode === 'grid' ? '#60a5fa' : 'rgba(255,255,255,0.3)' }} />
            </button>
            <button onClick={() => setViewMode('list')}
              className="p-1.5 transition-all"
              style={{ background: viewMode === 'list' ? 'rgba(37,99,235,0.3)' : 'transparent', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
              <List className="w-3.5 h-3.5" style={{ color: viewMode === 'list' ? '#60a5fa' : 'rgba(255,255,255,0.3)' }} />
            </button>
          </div>
          {/* HITL save — export validated fields */}
          {Object.keys(hitlState).length > 0 && (
            <button onClick={() => {
              // Build validated result from approved/edited fields
              const validated = {}
              fieldKeys.forEach(k => {
                const edit = getFieldEdit(activeRecordIdx, k)
                if (getFieldState(activeRecordIdx, k) !== 'rejected') {
                  validated[k] = edit ?? activeFields[k]
                }
              })
              onUpdate(job.job_id, { fields: validated })
              toast.success('Validated fields saved')
            }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-white transition-all"
              style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
              <Save className="w-3 h-3" /> Save
            </button>
          )}
          {/* Export — blocked for guests without permission */}
          {isGuest() ? (() => {
            const guestData = (() => { try { return JSON.parse(localStorage.getItem('docplus_guest') || '{}') } catch { return {} } })()
            return guestData.export_allowed ? (
              ['excel', 'csv', 'json'].map(fmt => (
                <button key={fmt} onClick={() => handleExport(fmt)} disabled={exporting}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all hover:-translate-y-0.5"
                  style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', color: '#93c5fd' }}>
                  <Download className="w-3 h-3" />
                  {fmt === 'excel' ? 'Excel' : fmt.toUpperCase()}
                </button>
              ))
            ) : (
              <button
                onClick={() => toast('🔒 Export access required. Contact admin to enable downloads.', {
                  icon: '⚠️',
                  style: { background: '#1e2d4a', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' },
                  duration: 5000,
                })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:-translate-y-0.5"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24' }}>
                🔒 Request Export Access
              </button>
            )
          })() : (
            ['excel', 'csv', 'json'].map(fmt => (
              <button key={fmt} onClick={() => handleExport(fmt)} disabled={exporting}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all hover:-translate-y-0.5"
                style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', color: '#93c5fd' }}>
                <Download className="w-3 h-3" />
                {fmt === 'excel' ? 'Excel' : fmt.toUpperCase()}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Quality metrics ── */}
      {job.status === 'completed' && (
        <div className="px-5 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-start gap-5">
            {/* Quality ring */}
            <div className="shrink-0 flex flex-col items-center">
              <div className="relative w-14 h-14">
                <svg width="56" height="56" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                  <circle cx="28" cy="28" r="20" fill="none" stroke={qualColor} strokeWidth="5"
                    strokeDasharray={`${(quality / 100) * 125.6} 125.6`}
                    strokeLinecap="round" transform="rotate(-90 28 28)"
                    style={{ transition: 'stroke-dasharray 1s ease' }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-black" style={{ color: qualColor }}>{qualGrade}</span>
                </div>
              </div>
              <p className="text-[9px] mt-1 font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>Quality</p>
              <p className="text-base font-black" style={{ color: qualColor }}>{quality}</p>
            </div>

            {/* Bars */}
            <div className="flex-1 space-y-2 pt-1">
              <QualityBar label="Coverage"   value={coverage} color="#60a5fa" />
              <QualityBar label="Confidence" value={avgConf}  color="#a78bfa" />
              {sources && Object.keys(sources).length > 0 && (
                <QualityBar label="Source Quality"
                  value={Math.round(Object.values(sources).filter(s => s && s !== 'fallback').length / Math.max(1, Object.keys(sources).length) * 100)}
                  color="#34d399" />
              )}
            </div>

            {/* Stats */}
            <div className="shrink-0 flex flex-col gap-1.5 text-right">
              <div>
                <p className="text-base font-black text-white">
                  {isMultiRecord
                    ? `${records.length}`
                    : `${filledCount}/${fieldKeys.length}`}
                </p>
                <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {isMultiRecord ? 'Records' : 'Fields Filled'}
                </p>
              </div>
              {isMultiRecord && (
                <div>
                  <p className="text-base font-black text-white">{coverage}%</p>
                  <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Fill Rate</p>
                </div>
              )}
            </div>
          </div>

          {/* Success note */}
          {filledCount > 0 && (
            <div className="mt-2 flex items-center gap-2 text-[10px]"
              style={{ color: '#34d399' }}>
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              {filledCount} field{filledCount !== 1 ? 's' : ''} extracted successfully
            </div>
          )}
        </div>
      )}

      {/* ── Completed: DocLens AI style layout ── */}
      {job.status === 'failed' && (
        <div className="mx-5 mt-4 rounded-xl p-4"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p className="text-sm font-bold text-red-400 mb-1">Extraction Failed</p>
          <p className="text-xs text-red-400/70">{job.error || 'Unknown error occurred'}</p>
        </div>
      )}

      {job.status === 'completed' && fieldKeys.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-yellow-400/40" />
        </div>
      )}

      {job.status === 'completed' && fieldKeys.length > 0 && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">

          {/* Click-to-highlight hint */}
          {onHighlight && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px]"
              style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.15)', color: '#93c5fd' }}>
              <ExternalLink className="w-3 h-3 shrink-0" />
              Click <ExternalLink className="w-2.5 h-2.5 inline mx-0.5" /> on any cell to jump to its source in the PDF
            </div>
          )}

          {/* Document metadata — compact strip for multi-record, full grid for single */}
          {isMultiRecord ? (
            <div className="rounded-xl px-4 py-2.5 flex flex-wrap gap-x-6 gap-y-1.5"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {Object.entries(fields).filter(([, v]) => !Array.isArray(v) && typeof v !== 'object').map(([key, val]) => (
                <div key={key} className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono shrink-0" style={{ color: '#a78bfa' }}>{key}</span>
                  <span className="text-[10px] font-semibold truncate max-w-[200px]" style={{ color: 'rgba(255,255,255,0.75)' }}>
                    {val === null || val === undefined || val === '' ? '—' : String(val)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {/* ── Multi-record Spreadsheet table: rows = records, columns = schema fields ── */}
          {isMultiRecord && records.length > 0 && (() => {
            // Collect all field keys from all records — fully schema-driven, no hardcoded names
            const allModelKeys = [...new Set(records.flatMap(r => Object.keys(r.result || {})))]
            // Label for the array field (e.g. "models", "items", "records", etc.)
            const arrayLabel = nestedArrayKey || 'record'
            // Collect all null warnings across all records
            const allWarnings = records.flatMap((rec, ri) =>
              Object.keys(rec.result || {}).filter(k => rec.result[k] === null || rec.result[k] === undefined)
                .map(k => `${arrayLabel}[${ri}].${k}`)
            )
            return (
              <div>
                {/* Section header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    EXTRACTED RECORDS
                  </span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                    style={{ background: 'rgba(34,197,94,0.12)', color: '#34d399' }}>
                    {records.length} records
                  </span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                    style={{ background: 'rgba(124,58,237,0.12)', color: '#c4b5fd' }}>
                    {allModelKeys.length} fields
                  </span>
                </div>

                {/* Spreadsheet table */}
                <div className="rounded-xl overflow-auto"
                  style={{ border: '1px solid rgba(255,255,255,0.1)', maxHeight: '60vh' }}>
                  <table className="w-full text-xs border-collapse" style={{ minWidth: 'max-content' }}>

                    {/* Sticky header row */}
                    <thead className="sticky top-0 z-10">
                      <tr style={{ background: '#1e2d4a' }}>
                        <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap sticky left-0 z-20"
                          style={{ background: '#1e2d4a', borderRight: '2px solid rgba(255,255,255,0.1)', color: '#60a5fa', minWidth: 40 }}>
                          #
                        </th>
                        {allModelKeys.map(key => (
                          <th key={key} className="px-3 py-2.5 text-left font-bold whitespace-nowrap"
                            style={{ color: '#a78bfa', borderRight: '1px solid rgba(255,255,255,0.07)', minWidth: 100 }}>
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {records.map((rec, ri) => {
                        const rf  = rec.result || {}
                        const rc  = rec.confidence || {}
                        const isEvenRow = ri % 2 === 0
                        const rowBg = isEvenRow ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.015)'
                        return (
                          <tr key={ri}
                            style={{ background: rowBg, borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                            className="hover:bg-white/[0.04] transition-colors">

                            {/* Row number — sticky */}
                            <td className="px-3 py-2 text-center font-bold sticky left-0"
                              style={{ background: isEvenRow ? '#0d1526' : '#0a1020', borderRight: '2px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)', minWidth: 40 }}>
                              {ri + 1}
                            </td>

                            {allModelKeys.map(key => {
                              const raw   = rf[key]
                              const val   = getFieldEdit(ri, key) ?? raw
                              const conf  = rc[key]
                              const empty = val === null || val === undefined || val === ''
                              const pct   = conf != null ? Math.round(conf > 1 ? conf : conf * 100) : null
                              const cc    = pct != null ? (pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : '#ef4444') : null
                              const hitl  = getFieldState(ri, key)
                              const isEd  = editingField?.recIdx === ri && editingField?.key === key
                              const src   = sources?.[key]

                              const cellBg = hitl === 'approved' ? 'rgba(34,197,94,0.08)'
                                : hitl === 'rejected' ? 'rgba(239,68,68,0.08)'
                                : 'transparent'

                              return (
                                <td key={key} className="px-2 py-1.5 group"
                                  style={{ borderRight: '1px solid rgba(255,255,255,0.05)', background: cellBg, verticalAlign: 'middle' }}>
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {isEd ? (
                                      <input className="text-xs rounded px-1.5 py-0.5 outline-none w-full"
                                        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid #3b82f6', color: '#fff', minWidth: 80 }}
                                        defaultValue={String(val ?? '')} autoFocus
                                        onBlur={e => { setFieldEdit(ri, key, e.target.value); setEditingField(null) }}
                                        onKeyDown={e => { if (e.key === 'Enter') { setFieldEdit(ri, key, e.target.value); setEditingField(null) } if (e.key === 'Escape') setEditingField(null) }} />
                                    ) : (
                                      <span
                                        className={`text-xs flex-1 truncate ${empty ? 'italic' : ''} ${!empty && onHighlight ? 'cursor-pointer hover:text-yellow-300 transition-colors' : ''}`}
                                        style={{ color: empty ? 'rgba(255,255,255,0.2)' : '#e2e8f0', maxWidth: 160 }}
                                        onClick={() => !empty && onHighlight && onHighlight({ field: key, value: String(val), src })}
                                        title={!empty && onHighlight ? 'Click to highlight in PDF' : undefined}>
                                        {empty ? '—' : String(val)}
                                      </span>
                                    )}

                                    {/* Hover actions */}
                                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                      {src && src !== 'fallback' && !empty && onHighlight && (
                                        <button onClick={() => onHighlight({ field: key, src })}
                                          className="p-0.5 rounded" title="Source in PDF"
                                          style={{ color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.06)' }}>
                                          <ExternalLink className="w-2 h-2" />
                                        </button>
                                      )}
                                      <button onClick={() => { setFieldState(ri, key, hitl === 'approved' ? 'pending' : 'approved') }}
                                        className="p-0.5 rounded text-[9px] font-bold"
                                        style={{ color: hitl === 'approved' ? '#34d399' : 'rgba(255,255,255,0.25)', background: hitl === 'approved' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)' }}>✓</button>
                                      <button onClick={() => { setFieldState(ri, key, hitl === 'rejected' ? 'pending' : 'rejected') }}
                                        className="p-0.5 rounded text-[9px] font-bold"
                                        style={{ color: hitl === 'rejected' ? '#f87171' : 'rgba(255,255,255,0.25)', background: hitl === 'rejected' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)' }}>✗</button>
                                      <button onClick={() => setEditingField({ recIdx: ri, key })}
                                        className="p-0.5 rounded text-[9px]"
                                        style={{ color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)' }}>✎</button>
                                    </div>

                                    {/* Confidence bar at bottom of cell */}
                                    {pct != null && cc && (
                                      <span className="text-[8px] font-bold px-1 py-0.5 rounded shrink-0 tabular-nums"
                                        style={{ color: cc, background: `${cc}18` }}>{pct}%</span>
                                    )}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Warnings */}
                {allWarnings.length > 0 && (
                  <div className="mt-2 rounded-xl p-3"
                    style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <AlertCircle className="w-3 h-3 text-yellow-400 shrink-0" />
                      <span className="text-[10px] font-bold text-yellow-400">
                        {allWarnings.length} null value{allWarnings.length !== 1 ? 's' : ''} — not found in document
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {allWarnings.slice(0, 8).map(w => (
                        <code key={w} className="text-[9px] px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(245,158,11,0.1)', color: 'rgba(255,255,255,0.5)' }}>{w}</code>
                      ))}
                      {allWarnings.length > 8 && (
                        <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>+{allWarnings.length - 8} more</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Single record — Excel-style table ── */}
          {!isMultiRecord && (
            <div className="space-y-3">
              {/* Top-level scalar fields */}
              {fieldKeys.filter(k => {
                const v = activeFields[k]
                return !(Array.isArray(v) && v.length > 0 && typeof v[0] === 'object')
              }).length > 0 && (
                <div className="rounded-xl overflow-auto"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr style={{ background: '#1e2d4a' }}>
                        <th className="px-4 py-2.5 text-left font-bold whitespace-nowrap"
                          style={{ color: '#60a5fa', borderRight: '1px solid rgba(255,255,255,0.08)', minWidth: 140 }}>Field</th>
                        <th className="px-4 py-2.5 text-left font-bold"
                          style={{ color: '#a78bfa', borderRight: '1px solid rgba(255,255,255,0.08)' }}>Value</th>
                        <th className="px-4 py-2.5 text-left font-bold w-20"
                          style={{ color: '#34d399', borderRight: '1px solid rgba(255,255,255,0.08)' }}>Confidence</th>
                        <th className="px-4 py-2.5 text-left font-bold w-24"
                          style={{ color: '#fbbf24' }}>Validate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fieldKeys.filter(k => {
                        const v = activeFields[k]
                        return !(Array.isArray(v) && v.length > 0 && typeof v[0] === 'object')
                      }).map((key, i) => {
                        const val   = getFieldEdit(0, key) ?? activeFields[key]
                        const conf  = activeConfs[key]
                        const src   = sources[key]
                        const empty = val === null || val === undefined || val === ''
                        const pct   = conf != null ? Math.round(conf > 1 ? conf : conf * 100) : null
                        const cc    = pct != null ? (pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : '#ef4444') : null
                        const hitl  = getFieldState(0, key)
                        const isEd  = editingField?.recIdx === 0 && editingField?.key === key
                        const rowBg = hitl === 'approved' ? 'rgba(34,197,94,0.06)'
                          : hitl === 'rejected' ? 'rgba(239,68,68,0.06)'
                          : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'
                        return (
                          <tr key={key} className="group hover:bg-white/[0.04] transition-colors"
                            style={{ background: rowBg, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td className="px-4 py-2"
                              style={{ borderRight: '1px solid rgba(255,255,255,0.06)', color: '#a78bfa', fontFamily: 'monospace', fontWeight: 600 }}>
                              {key}
                            </td>
                            <td className="px-4 py-2" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                              {isEd ? (
                                <input className="w-full text-xs rounded px-2 py-1 outline-none"
                                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid #3b82f6', color: '#fff' }}
                                  defaultValue={String(val ?? '')} autoFocus
                                  onBlur={e => { setFieldEdit(0, key, e.target.value); setEditingField(null) }}
                                  onKeyDown={e => { if (e.key === 'Enter') { setFieldEdit(0, key, e.target.value); setEditingField(null) } if (e.key === 'Escape') setEditingField(null) }} />
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-xs ${empty ? 'italic' : 'font-semibold'} ${!empty && onHighlight ? 'cursor-pointer hover:text-yellow-300 transition-colors' : ''}`}
                                    style={{ color: empty ? 'rgba(255,255,255,0.25)' : '#e2e8f0' }}
                                    onClick={() => !empty && onHighlight && onHighlight({ field: key, value: Array.isArray(val) ? val.join(' ') : String(val), src })}
                                    title={!empty && onHighlight ? 'Click to highlight in PDF' : undefined}>
                                    {empty ? '—' : Array.isArray(val) ? val.join(', ') : String(val)}
                                  </span>
                                  {src && src !== 'fallback' && !empty && onHighlight && (
                                    <button onClick={() => onHighlight({ field: key, value: String(val), src })}
                                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity"
                                      style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)' }}>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                              {pct != null && cc ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded"
                                    style={{ color: cc, background: `${cc}15` }}>{pct}%</span>
                                  <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cc }} />
                                  </div>
                                </div>
                              ) : <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1">
                                <button onClick={() => setFieldState(0, key, hitl === 'approved' ? 'pending' : 'approved')}
                                  className="px-2 py-0.5 rounded text-[9px] font-bold transition-all"
                                  style={{ background: hitl === 'approved' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.04)', color: hitl === 'approved' ? '#34d399' : 'rgba(255,255,255,0.35)', border: `1px solid ${hitl === 'approved' ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.08)'}` }}>✓</button>
                                <button onClick={() => setFieldState(0, key, hitl === 'rejected' ? 'pending' : 'rejected')}
                                  className="px-2 py-0.5 rounded text-[9px] font-bold transition-all"
                                  style={{ background: hitl === 'rejected' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)', color: hitl === 'rejected' ? '#f87171' : 'rgba(255,255,255,0.35)', border: `1px solid ${hitl === 'rejected' ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.08)'}` }}>✗</button>
                                <button onClick={() => setEditingField({ recIdx: 0, key })}
                                  className="px-2 py-0.5 rounded text-[9px] font-bold transition-all"
                                  style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>✎</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Array-of-objects fields (e.g. models) — show as spreadsheet */}
              {fieldKeys.filter(k => {
                const v = activeFields[k]
                return Array.isArray(v) && v.length > 0 && typeof v[0] === 'object'
              }).map(arrayKey => {
                const arrayVal = activeFields[arrayKey]
                const allKeys  = [...new Set(arrayVal.flatMap(r => Object.keys(r)))]
                return (
                  <div key={arrayKey}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>{arrayKey}</span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                        style={{ background: 'rgba(34,197,94,0.12)', color: '#34d399' }}>
                        {arrayVal.length} records
                      </span>
                    </div>
                    <div className="rounded-xl overflow-auto" style={{ border: '1px solid rgba(255,255,255,0.1)', maxHeight: '60vh' }}>
                      <table className="w-full text-xs border-collapse" style={{ minWidth: 'max-content' }}>
                        <thead className="sticky top-0 z-10">
                          <tr style={{ background: '#1e2d4a' }}>
                            <th className="px-3 py-2.5 text-left font-bold sticky left-0 z-20"
                              style={{ background: '#1e2d4a', borderRight: '2px solid rgba(255,255,255,0.1)', color: '#60a5fa', minWidth: 40 }}>#</th>
                            {allKeys.map(k => (
                              <th key={k} className="px-3 py-2.5 text-left font-bold whitespace-nowrap"
                                style={{ color: '#a78bfa', borderRight: '1px solid rgba(255,255,255,0.07)', minWidth: 100 }}>{k}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {arrayVal.map((row, ri) => (
                            <tr key={ri} className="hover:bg-white/[0.04] transition-colors group"
                              style={{ background: ri % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <td className="px-3 py-2 text-center font-bold sticky left-0"
                                style={{ background: ri % 2 === 0 ? '#0d1526' : '#0a1020', borderRight: '2px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)' }}>
                                {ri + 1}
                              </td>
                              {allKeys.map(k => {
                                const v     = row[k]
                                const empty = v === null || v === undefined || v === ''
                                return (
                                  <td key={k} className="px-3 py-2" style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span className={`text-xs ${empty ? 'italic' : 'font-semibold'}`}
                                      style={{ color: empty ? 'rgba(255,255,255,0.2)' : '#e2e8f0' }}>
                                      {empty ? '—' : String(v)}
                                    </span>
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

    </div>
  )
}

// ── Main ResultsPage ──────────────────────────────────────────────────────────
export default function ResultsPage() {
  const navigate             = useNavigate()
  const [searchParams]       = useSearchParams()
  const batchParam           = searchParams?.get?.('batch') || null
  const { state, updateJob, addJob } = useWorkflow()
  const [activeJobIdx, setActiveJobIdx] = useState(0)
  const [exporting,    setExporting]    = useState(false)
  const [showPdf,      setShowPdf]      = useState(true)
  const [highlightField, setHighlightField] = useState(null)
  const [dbLoading,    setDbLoading]    = useState(false)

  // Load past jobs from DB on mount — use normalized shape
  useEffect(() => {
    if (state.extractionJobs.length > 0) return
    setDbLoading(true)
    api.get('/api/v1/extraction/admin/all?limit=50')
      .then(r => {
        const dbJobs = (r.data.jobs || []).map(j => ({
          job_id:            j.job_id,
          document_id:       j.document_id,
          schema_name:       j.schema_name,
          status:            j.status,
          fields:            j.fields || {},
          all_records:       j.all_records || null,
          total_records:     j.total_records || null,
          quality_score:     j.quality_score ?? j.quality,
          confidence_scores: j.confidence_scores || {},
          source_references: j.source_references || {},
          batch_run_id:      j.batch_run_id || '',
          error:             j.error,
        }))
        dbJobs.forEach(job => addJob(job))
      })
      .catch(() => {})
      .finally(() => setDbLoading(false))
  }, [])

  // If batch param given and we have no batch jobs yet, fetch from backend
  useEffect(() => {
    if (!batchParam) return
    const hasBatch = state.extractionJobs.some(j => j.batch_run_id === batchParam)
    if (hasBatch) return
    api.get(`/api/v1/extraction/batch/${batchParam}`)
      .then(r => {
        const batchJobs = (r.data.jobs || []).map(j => ({
          job_id:            j.job_id,
          document_id:       j.document_id,
          schema_name:       j.schema_name,
          status:            j.status,
          fields:            j.fields || {},
          all_records:       j.all_records || null,
          total_records:     j.total_records || null,
          quality_score:     j.quality_score,
          confidence_scores: j.confidence_scores || {},
          source_references: j.source_references || {},
          batch_run_id:      batchParam,
          error:             j.error,
        }))
        batchJobs.forEach(job => addJob(job))
      })
      .catch(() => {})
  }, [batchParam])

  // Load full result when a DB job has no fields yet
  const loadJobResult = async (jobId) => {
    try {
      const r    = await api.get(`/api/v1/extraction/run/${jobId}`)
      const data = r.data
      updateJob(jobId, {
        fields:            data.fields            || {},
        all_records:       data.all_records       || null,
        total_records:     data.total_records     || null,
        quality_score:     data.quality_score,
        confidence_scores: data.confidence_scores || {},
        source_references: data.source_references || {},
        batch_run_id:      data.batch_run_id      || '',
      })
    } catch { /* silent */ }
  }

  // Filter jobs by batch if batch param present; otherwise show all
  const allJobs   = state.extractionJobs
  const jobs      = batchParam
    ? allJobs.filter(j => j.batch_run_id === batchParam)
    : allJobs
  const activeJob = jobs[activeJobIdx] || jobs[0]
  const completed = jobs.filter(j => j.status === 'completed')

  // Reset activeJobIdx when batch changes
  useEffect(() => { setActiveJobIdx(0) }, [batchParam])

  // Load full result when switching to a job that came from DB (has empty fields)
  useEffect(() => {
    if (activeJob && Object.keys(activeJob.fields || {}).length === 0 && activeJob.status === 'completed') {
      loadJobResult(activeJob.job_id)
    }
  }, [activeJobIdx, batchParam])

  const exportAll = async (fmt) => {
    // Block guests without export permission
    if (isGuest()) {
      const guestData = (() => { try { return JSON.parse(localStorage.getItem('docplus_guest') || '{}') } catch { return {} } })()
      if (!guestData.export_allowed) {
        toast('🔒 Export access required. Contact admin to enable downloads.', {
          icon: '⚠️',
          style: { background: '#1e2d4a', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' },
          duration: 5000,
        })
        return
      }
    }
    setExporting(true)
    try {
      if (!completed.length) { toast.error('No completed extractions'); setExporting(false); return }

      if (fmt === 'json') {
        const data = completed.map(j => ({
          job_id:       j.job_id,
          schema:       j.schema_name,
          document_id:  j.document_id,
          batch_run_id: j.batch_run_id || '',
          fields:       j.fields,
          all_records:  j.all_records,
          quality_score: j.quality_score,
        }))
        downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
          batchParam ? `batch_${batchParam.slice(0,8)}.json` : 'all_extractions.json')
        toast.success(`Exported ${completed.length} job(s) as JSON`)
        setExporting(false)
        return
      }

      // CSV / Excel: combine all jobs into one file via backend export
      const results = await Promise.all(
        completed.map(async j => {
          try {
            const blob = await exportResults(j.job_id, 'csv')
            const text = await blob.text()
            const lines = text.trim().split('\n').filter(l => l.trim())
            // Prepend filename column to each data row
            const filename = j.fields?.filename || j.document_id?.slice(0, 12) || j.job_id?.slice(0, 8)
            const dataRows = lines.slice(1).map(row => `"${filename}",${row}`)
            return { header: `"Source File",${lines[0]}`, rows: dataRows }
          } catch { return null }
        })
      )

      const valid = results.filter(Boolean)
      if (!valid.length) { toast.error('Export failed — try again'); setExporting(false); return }

      const csv = [valid[0].header, ...valid.flatMap(v => v.rows)].join('\n')
      const filename = batchParam
        ? `batch_${batchParam.slice(0,8)}_${completed.length}docs.csv`
        : 'all_extractions.csv'
      downloadBlob(new Blob(['\ufeff' + csv], { type: 'text/csv' }), filename)
      toast.success(`Exported ${completed.length} PDF(s) — ${valid.flatMap(v => v.rows).length} total records`)

    } catch (e) { toast.error(e.message) }
    setExporting(false)
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (jobs.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto animate-fade-in">
        <h1 className="text-2xl font-black text-white mb-6">Extraction Results</h1>
        <div className="rounded-2xl p-14 text-center"
          style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <BarChart3 className="w-14 h-14 mx-auto mb-4 text-white/10" />
          <div className="text-white/40 text-base font-bold mb-1">No extraction results yet</div>
          <div className="text-white/25 text-sm mb-6">Run AI extraction on your documents to see results here</div>
          <button onClick={() => navigate('/extract')} className="btn btn-primary gap-2 px-6 py-3">
            <Zap className="w-4 h-4" /> Go to Extract
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full animate-fade-in overflow-hidden">

      {/* ── Header bar ── */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0 flex-wrap gap-3"
        style={{ background: 'rgba(8,13,28,0.8)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-sm font-black text-white">
              {batchParam ? `Batch Extraction — ${jobs.length} PDF${jobs.length !== 1 ? 's' : ''}` : 'Extraction Results'}
            </h1>
            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {jobs.length} job{jobs.length !== 1 ? 's' : ''} · {completed.length} completed
              {batchParam && <span className="ml-2 px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(124,58,237,0.15)', color: '#c4b5fd' }}>BATCH</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* PDF toggle */}
          <button onClick={() => setShowPdf(s => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={{
              background: showPdf ? 'rgba(37,99,235,0.2)' : 'rgba(255,255,255,0.04)',
              color: showPdf ? '#60a5fa' : 'rgba(255,255,255,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
            <FileText className="w-3.5 h-3.5" />
            {showPdf ? 'Hide PDF' : 'Show PDF'}
          </button>
          {/* Export all — locked for guests without permission */}
          {completed.length > 0 && (
            <>
              {isGuest() ? (
                (() => {
                  const limits = (() => { try { return JSON.parse(localStorage.getItem('docplus_guest') || '{}') } catch { return {} } })()
                  return limits.export_allowed ? (
                    <>
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>Export all:</span>
                      {['excel', 'csv', 'json'].map(fmt => (
                        <button key={fmt} onClick={() => exportAll(fmt)} disabled={exporting}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:-translate-y-0.5"
                          style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', color: '#93c5fd' }}>
                          <Download className="w-3 h-3" /> {fmt === 'excel' ? 'Excel' : fmt.toUpperCase()}
                        </button>
                      ))}
                    </>
                  ) : (
                    <span className="text-[10px] px-3 py-1.5 rounded-lg font-bold"
                      style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24', cursor: 'default' }}>
                      🔒 Export — Request Access
                    </span>
                  )
                })()
              ) : (
                  <>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
                      {batchParam && completed.length > 1 ? `Export all ${completed.length} PDFs:` : 'Export all:'}
                    </span>
                    {['excel', 'csv', 'json'].map(fmt => (
                      <button key={fmt} onClick={() => exportAll(fmt)} disabled={exporting}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:-translate-y-0.5"
                        style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', color: '#93c5fd' }}>
                        <Download className="w-3 h-3" /> {fmt === 'excel' ? 'Excel' : fmt.toUpperCase()}
                      </button>
                    ))}
                  </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Job tabs ── */}
      {jobs.length > 1 && (
        <div className="flex gap-1 px-4 py-2 overflow-x-auto shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(8,13,28,0.5)', scrollbarWidth: 'none' }}>
          {jobs.map((job, i) => {
            const active = activeJobIdx === i
            // In batch mode show filename; otherwise show schema name
            const rawLabel = batchParam
              ? (job.filename || job.schema_name || `PDF ${i + 1}`)
              : (job.schema_name || `Job ${i + 1}`)
            // Trim long names to keep tabs compact
            const label = rawLabel.length > 22 ? rawLabel.slice(0, 20) + '…' : rawLabel
            const statusColor = job.status === 'completed' ? '#22c55e' : job.status === 'failed' ? '#f87171' : '#fbbf24'
            return (
              <button key={job.job_id} onClick={() => setActiveJobIdx(i)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap"
                style={{
                  background: active ? 'rgba(37,99,235,0.2)' : 'rgba(255,255,255,0.03)',
                  color: active ? '#60a5fa' : 'rgba(255,255,255,0.45)',
                  border: active ? '1px solid rgba(37,99,235,0.3)' : '1px solid rgba(255,255,255,0.06)',
                }}>
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor }} />
                {batchParam && <FileText className="w-3 h-3 shrink-0 opacity-50" />}
                {label}
                {job.total_records > 0 && (
                  <span className="ml-1 text-[9px] px-1 py-0.5 rounded tabular-nums"
                    style={{ background: 'rgba(34,197,94,0.15)', color: '#34d399' }}>
                    {job.total_records}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Split pane ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left — PDF viewer */}
        {showPdf && activeJob && (
          <div className="w-2/5 shrink-0 border-r overflow-hidden flex flex-col"
            style={{ borderColor: 'rgba(255,255,255,0.07)', background: '#0a0f1e' }}>
            <PdfViewer docId={activeJob?.document_id} highlightField={highlightField} />
          </div>
        )}

        {/* Right — Results */}
        <div className="flex-1 overflow-hidden flex flex-col" style={{ background: '#080d1c' }}>
          {activeJob ? (
            <JobResultsPanel job={activeJob} onUpdate={updateJob} onHighlight={(h) => {
              setHighlightField(h)
              if (!showPdf) setShowPdf(true)
            }} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Select a job above</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
