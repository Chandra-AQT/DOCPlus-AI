import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Zap, FileText, Code2, BookOpen, Layers3,
  CheckCircle2, AlertCircle, Clock, Table2,
  Hash, AlignLeft, BarChart3
} from 'lucide-react'
import { useWorkflow } from '../lib/store'
import api from '../lib/api'

// ── Strip ADE anchor tags and fix spaced-out characters ──────────────────────
function cleanMarkdown(md) {
  if (!md) return ''
  let text = md
    .replace(/<a\s+id=['"][^'"]*['"]\s*><\/a>/gi, '')
    .replace(/<a\s+id=['"][^'"]*['"]\s*\/>/gi, '')
    .trim()

  // Fix "S p a c e d   o u t" character extraction artifact
  // Split into lines, fix each line independently
  const lines = text.split('\n')
  const fixed = lines.map(line => {
    const stripped = line.trim()
    if (stripped.length < 4) return line
    // Check if it looks like spaced characters: "U n d e r s t a n d i n g"
    // Pattern: non-space, space, non-space repeating
    const chars = stripped.split('')
    const spacesAtOdd = chars.filter((c, i) => i % 2 === 1 && c === ' ').length
    const totalOdd = Math.max(1, Math.floor(chars.length / 2))
    if (spacesAtOdd / totalOdd > 0.65) {
      // Remove every-other space
      return stripped.replace(/ (?=\S)/g, '').replace(/(?<=\S) /g, ' ')
        // simpler: remove spaces between single chars
        .replace(/\b(\w) (\w)\b/g, '$1$2')
        .replace(/(\w) (\w) (\w)/g, '$1$2$3')
    }
    return line
  })
  return fixed.join('\n').replace(/[ \t]{2,}/g, ' ').trim()
}

// ── Parse HTML table string → 2D array ───────────────────────────────────────
function parseHtmlTable(html) {
  try {
    const div = document.createElement('div')
    div.innerHTML = html
    return Array.from(div.querySelectorAll('tr'))
      .map(tr => Array.from(tr.querySelectorAll('th,td')).map(td => td.textContent.trim()))
      .filter(r => r.some(c => c))
  } catch { return [] }
}

// ── Rendered table grid ───────────────────────────────────────────────────────
function TableGrid({ rows }) {
  if (!rows.length) return null
  const isHeaderRow = rows[0] && rows[0].some(c => c)
  const header = isHeaderRow ? rows[0] : []
  const body   = isHeaderRow ? rows.slice(1) : rows
  return (
    <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid rgba(167,139,250,0.25)', maxHeight: 280 }}>
      <table className="text-xs w-full border-collapse">
        {header.length > 0 && (
          <thead>
            <tr style={{ background: 'rgba(167,139,250,0.18)' }}>
              {header.map((cell, ci) => (
                <th key={ci} className="px-2 py-1.5 text-left font-bold whitespace-nowrap"
                  style={{ borderBottom: '1px solid rgba(167,139,250,0.25)', color: '#c4b5fd' }}>
                  {cell || '—'}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1 whitespace-nowrap"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)' }}>
                  {cell || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Chunk content renderer ────────────────────────────────────────────────────
function ChunkContent({ chunk }) {
  const text = chunk.text || ''
  if (chunk.type === 'table') {
    // Try parse as HTML table first
    const rows = parseHtmlTable(text)
    if (rows.length > 0) return <TableGrid rows={rows} />
    // Fallback: markdown pipe table
    const lines = text.split('\n').filter(l => l.includes('|') && l.trim())
    if (lines.length > 1) {
      const parsed = lines
        .filter(l => !/^[\s|:-]+$/.test(l))   // skip separator rows
        .map(l => l.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1))
        .filter(r => r.length > 0)
      if (parsed.length > 0) return <TableGrid rows={parsed} />
    }
    // Raw fallback
    return <pre className="text-xs text-white/50 whitespace-pre-wrap overflow-x-auto">{text}</pre>
  }
  // Regular text
  return (
    <div className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {text.length > 400 ? text.slice(0, 400) + '…' : text}
    </div>
  )
}

// ── Confidence badge ──────────────────────────────────────────────────────────
function ConfBadge({ score }) {
  if (score == null) return null
  const pct   = Math.round(score > 1 ? score : score * 100)
  const color = pct >= 80 ? '#86efac' : pct >= 50 ? '#fde047' : '#fca5a5'
  const bg    = pct >= 80 ? 'rgba(34,197,94,0.15)' : pct >= 50 ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)'
  return (
    <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded"
      style={{ color, background: bg }}>{pct}%</span>
  )
}

// ── PDF page renderer with highlight drawn on canvas ─────────────────────────
function PdfPageCanvas({ url, page, zoom = 1, highlightBox = null }) {
  const canvasRef  = useRef(null)
  const [pdfjsLib, setPdfjsLib] = useState(null)
  const [pdfDoc,   setPdfDoc]   = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const renderTask = useRef(null)

  // Load PDF.js from CDN
  useEffect(() => {
    if (window.pdfjsLib) { setPdfjsLib(window.pdfjsLib); return }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      setPdfjsLib(window.pdfjsLib)
    }
    script.onerror = () => setError('Failed to load PDF renderer')
    document.head.appendChild(script)
  }, [])

  // Load PDF doc
  useEffect(() => {
    if (!pdfjsLib || !url) return
    setLoading(true); setError(null)
    pdfjsLib.getDocument({ url, withCredentials: false })
      .promise
      .then(doc => { setPdfDoc(doc); setLoading(false) })
      .catch(e  => { setError('Failed to load PDF: ' + e.message); setLoading(false) })
  }, [pdfjsLib, url])

  // Render page + draw highlight in one pass
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    if (renderTask.current) { renderTask.current.cancel(); renderTask.current = null }
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')

    pdfDoc.getPage(page).then(pdfPage => {
      const viewport = pdfPage.getViewport({ scale: zoom * 1.5 })
      canvas.width  = viewport.width
      canvas.height = viewport.height
      const task = pdfPage.render({ canvasContext: ctx, viewport })
      renderTask.current = task
      return task.promise.then(() => {
        // Draw highlight ON TOP of rendered PDF
        if (highlightBox && Array.isArray(highlightBox) && highlightBox.length === 4) {
          const [x0, y0, x1, y1] = highlightBox
          const px = x0 * canvas.width
          const py = y0 * canvas.height
          const pw = (x1 - x0) * canvas.width
          const ph = (y1 - y0) * canvas.height
          // Cyan glow border
          ctx.save()
          ctx.shadowColor = 'rgba(0,220,255,0.9)'
          ctx.shadowBlur  = 16
          ctx.strokeStyle = 'rgb(0,220,255)'
          ctx.lineWidth   = 3
          ctx.fillStyle   = 'rgba(0,40,80,0.35)'
          ctx.fillRect(px, py, pw, ph)
          ctx.strokeRect(px, py, pw, ph)
          // Second pass for glow
          ctx.shadowBlur  = 24
          ctx.lineWidth   = 1.5
          ctx.strokeStyle = 'rgba(100,240,255,0.5)'
          ctx.strokeRect(px - 2, py - 2, pw + 4, ph + 4)
          ctx.restore()
        }
      })
    }).catch(() => {})
  }, [pdfDoc, page, zoom, highlightBox])

  if (error) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
      <AlertCircle className="w-8 h-8 text-red-400" />
      <div className="text-red-400/70 text-xs text-center">{error}</div>
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="text-xs text-blue-400 hover:text-blue-300 underline mt-1">
        Open PDF directly →
      </a>
    </div>
  )

  if (loading || !pdfjsLib) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin mx-auto mb-2" />
        <div className="text-white/30 text-xs">{!pdfjsLib ? 'Loading renderer...' : 'Rendering PDF...'}</div>
      </div>
    </div>
  )

  return (
    <div className="flex items-start justify-center overflow-auto h-full p-4">
      <canvas ref={canvasRef}
        style={{ display: 'block', maxWidth: '100%', borderRadius: 4,
                 boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} />
    </div>
  )
}


// ── Main viewer ───────────────────────────────────────────────────────────────
export default function DocumentViewer({ docId, onClose, onRunExtraction }) {
  const navigate = useNavigate()
  const { set }  = useWorkflow()

  const [doc,        setDoc]        = useState(null)
  const [chunks,     setChunks]     = useState([])
  const [markdown,   setMarkdown]   = useState('')
  const [extractions,setExtractions]= useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)

  const [tab,        setTab]        = useState('chunks')
  const [page,       setPage]       = useState(1)
  const [zoom,       setZoom]       = useState(1)
  const [activeChunk,setActiveChunk]= useState(null)
  const [highlightBox,setHighlightBox] = useState(null)
  const [filterType, setFilterType] = useState('all')
  const [showConf,   setShowConf]   = useState(true)

  const load = useCallback(async () => {
    if (!docId) return
    setLoading(true); setError(null)
    try {
      const [dRes, cRes, mRes, eRes] = await Promise.all([
        api.get(`/api/v1/documents/${docId}`),
        api.get(`/api/v1/parse/${docId}/chunks`).catch(() => ({ data: { chunks: [] } })),
        api.get(`/api/v1/parse/${docId}/markdown`).catch(() => ({ data: { markdown: '' } })),
        api.get(`/api/v1/extraction/document/${docId}`).catch(() => ({ data: { extractions: [] } })),
      ])
      setDoc(dRes.data)
      // Normalise chunks — keep each parser block as its own chunk
      const raw = cRes.data.chunks || []
      const normalised = raw.map(c => ({
        ...c,
        text: cleanMarkdown(c.markdown || c.text || c.content || ''),
        displayPage: c.page != null
          ? c.page + 1
          : c.grounding?.page != null
          ? c.grounding.page + 1
          : null,
        confidence: c.confidence != null
          ? c.confidence
          : c.grounding?.confidence != null
          ? c.grounding.confidence
          : null,
      }))
      // Filter out empty/whitespace-only chunks
      setChunks(normalised.filter(c => c.text && c.text.trim().length > 1))
      setMarkdown(cleanMarkdown(mRes.data.markdown || ''))
      setExtractions(eRes.data.extractions || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [docId])

  useEffect(() => { load() }, [load])

  // ESC to close
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const totalPages = doc?.page_count || 1
  const chunkTypes = ['all', ...new Set(chunks.map(c => c.type).filter(Boolean))]
  const filtered   = filterType === 'all' ? chunks : chunks.filter(c => c.type === filterType)

  // Build PDF URL — file is always stored as {doc_id}.ext in uploads/
  const pdfUrl = (() => {
    if (!doc) return null
    // Preferred: derive from file_path which is like ./uploads\{uuid}.pdf
    const fp = (doc.file_path || '').replace(/\\/g, '/')
    // Extract just the filename
    const fname = fp.split('/').filter(Boolean).pop()
    if (fname) return `http://localhost:8000/uploads/${fname}`
    // Fallback: use doc id
    return `http://localhost:8000/uploads/${doc.id}.pdf`
  })()

  const handleRunExtraction = () => {
    if (onRunExtraction) {
      onRunExtraction(docId)
      onClose?.()
      return
    }
    set({ selectedDocIds: [docId] })
    onClose?.()
    navigate('/extract')
  }

  const chunkListRef = useRef(null)

  const clickChunk = (chunk, i) => {
    setActiveChunk(i)
    const p = chunk.displayPage
    if (p) setPage(p)
    // Set highlight bounding box from grounding.box
    const grounding = chunk.grounding
    if (grounding?.box) {
      const b = grounding.box
      // box can be {left, top, right, bottom} dict OR [x0,y0,x1,y1] array
      if (Array.isArray(b) && b.length === 4) {
        setHighlightBox(b)
      } else if (b && typeof b === 'object' && 'left' in b) {
        setHighlightBox([b.left, b.top, b.right, b.bottom])
      } else {
        setHighlightBox(null)
      }
    } else {
      setHighlightBox(null)
    }
    // Scroll active chunk into view
    setTimeout(() => {
      const el = chunkListRef.current?.querySelector(`[data-chunk-idx="${i}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }

  if (!docId) return null

  return (
    <div className="fixed inset-0 z-[60] flex flex-col"
      style={{ background: '#060b18' }}>

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 shrink-0"
        style={{ background: 'rgba(8,13,28,0.98)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <FileText className="w-4 h-4 text-blue-400 shrink-0" />
        <span className="font-bold text-white text-sm truncate flex-1 min-w-0">
          {doc?.file_name || '...'}
        </span>
        {doc?.status && (
          <span className={`badge shrink-0 ${doc.status === 'parsed' ? 'badge-green' : 'badge-yellow'}`}>
            {doc.status}
          </span>
        )}
        {doc && (
          <span className="text-xs text-white/25 shrink-0 hidden sm:block">
            {doc.page_count} pages · {chunks.length} chunks ·{' '}
            {doc.parse_metadata?.table_count || 0} tables
          </span>
        )}
        <button onClick={handleRunExtraction}
          className="btn btn-primary gap-2 text-xs shrink-0" style={{ padding: '7px 14px' }}>
          <Zap className="w-3.5 h-3.5" /> Run Extraction
        </button>
        <button onClick={async () => {
          try {
            await api.post(`/api/v1/documents/${docId}/reparse`)
            setTimeout(() => load(), 2000)
          } catch(e) {}
        }}
          className="btn btn-secondary gap-1.5 text-xs shrink-0" style={{ padding: '7px 10px' }}>
          ↺ Re-parse
        </button>
        <button onClick={onClose}
          className="btn btn-secondary gap-1.5 text-xs shrink-0" style={{ padding: '7px 12px' }}>
          <X className="w-3.5 h-3.5" /> Close
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-red-400 text-sm">{error}</div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">

          {/* ── LEFT: PDF ─────────────────────────────────────────── */}
          <div className="flex flex-col" style={{ width: '50%', borderRight: '1px solid rgba(255,255,255,0.07)' }}>

            {/* Chunk source indicator */}
            {activeChunk != null && (
              <div className="flex items-center gap-2 px-4 py-2 shrink-0 text-xs"
                style={{ background: 'rgba(37,99,235,0.12)', borderBottom: '1px solid rgba(37,99,235,0.2)' }}>
                <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <span className="text-blue-300">
                  Showing source text · page {page} · <span style={{ color: '#60a5fa' }}>highlighted</span>
                </span>
                <button onClick={() => setActiveChunk(null)}
                  className="ml-auto text-white/30 hover:text-white/60">Clear</button>
              </div>
            )}

            {/* PDF toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 shrink-0"
              style={{ background: 'rgba(15,23,42,0.8)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => { setPage(p => Math.max(1, p - 1)); setHighlightBox(null) }} disabled={page <= 1}
                className="p-1.5 rounded hover:bg-white/[0.08] text-white/40 hover:text-white disabled:opacity-30">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-white/50 tabular-nums w-16 text-center">
                {page} / {totalPages}
              </span>
              <button onClick={() => { setPage(p => Math.min(totalPages, p + 1)); setHighlightBox(null) }} disabled={page >= totalPages}
                className="p-1.5 rounded hover:bg-white/[0.08] text-white/40 hover:text-white disabled:opacity-30">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <div className="flex-1" />
              <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.2).toFixed(1)))}
                className="p-1.5 rounded hover:bg-white/[0.08] text-white/40 hover:text-white">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-white/30 w-10 text-center tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button onClick={() => setZoom(z => Math.min(2, +(z + 0.2).toFixed(1)))}
                className="p-1.5 rounded hover:bg-white/[0.08] text-white/40 hover:text-white">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              {pdfUrl && (
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-white/30 hover:text-white/60 ml-1">Open ↗</a>
              )}
            </div>

            {/* PDF canvas */}
            <div className="flex-1 overflow-hidden" style={{ background: '#11182a' }}>
              {pdfUrl
                ? <PdfPageCanvas url={pdfUrl} page={page} zoom={zoom} highlightBox={highlightBox} />
                : (
                  <div className="flex flex-col items-center justify-center h-full gap-2">
                    <FileText className="w-12 h-12 text-white/10" />
                    <div className="text-white/20 text-sm">PDF preview unavailable</div>
                    <div className="text-white/10 text-xs font-mono">{doc?.file_path}</div>
                  </div>
                )
              }
            </div>
          </div>

          {/* ── RIGHT: Content ────────────────────────────────────── */}
          <div className="flex flex-col" style={{ width: '50%' }}>

            {/* Tab + confidence toggle */}
            <div className="flex items-center gap-1 px-4 py-2 shrink-0"
              style={{ background: 'rgba(15,23,42,0.8)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {[
                { id: 'chunks',   icon: Layers3,  label: `Chunks (${chunks.length})` },
                { id: 'markdown', icon: BookOpen,  label: 'Markdown' },
                { id: 'json',     icon: Code2,     label: 'JSON' },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    tab === t.id
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                  }`}>
                  <t.icon className="w-3 h-3" />
                  {t.label}
                </button>
              ))}
              <button onClick={() => setShowConf(s => !s)}
                className={`ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  showConf
                    ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                    : 'text-white/30 hover:text-white/60 hover:bg-white/[0.04]'
                }`}>
                <BarChart3 className="w-3 h-3" />
                Confidence
              </button>
            </div>

            {/* Chunk hint */}
            {tab === 'chunks' && (
              <div className="px-4 py-2 text-xs text-white/30 shrink-0"
                style={{ background: 'rgba(37,99,235,0.06)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                Click any chunk to jump to its location in the PDF
                {activeChunk != null && (
                  <button onClick={() => setActiveChunk(null)}
                    className="ml-3 text-blue-400 hover:text-blue-300">Clear</button>
                )}
              </div>
            )}

            {/* Content area */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Chunks ─────────────────────────────────────────── */}
              {tab === 'chunks' && (
                <>
                  {/* Type filter */}
                  <div className="flex flex-wrap gap-1.5 px-4 py-2.5 sticky top-0 z-10"
                    style={{ background: '#060b18', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {chunkTypes.map(t => (
                      <button key={t} onClick={() => setFilterType(t)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold capitalize ${
                          filterType === t
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/25'
                            : 'text-white/25 hover:text-white/50 hover:bg-white/[0.04]'
                        }`}>{t}</button>
                    ))}
                    <span className="ml-auto text-[11px] text-white/15 self-center">
                      {filtered.length} chunk{filtered.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Chunk list */}
                  <div ref={chunkListRef}>
                  {filtered.map((chunk, i) => {
                    const isActive  = activeChunk === i
                    const pageNum   = chunk.displayPage
                    return (
                      <div key={i}
                        data-chunk-idx={i}
                        onClick={() => clickChunk(chunk, i)}
                        className="cursor-pointer transition-all"
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: isActive ? 'rgba(37,99,235,0.15)' : 'transparent',
                          borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
                          margin: isActive ? '4px 8px' : '0',
                          borderRadius: isActive ? '8px' : '0',
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.025)' }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>

                        {/* Meta row */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-mono text-[11px] text-white/25 w-5 shrink-0">{i + 1}</span>
                          <span className="text-[11px] font-semibold capitalize px-1.5 py-0.5 rounded"
                            style={{
                              color: chunk.type === 'table' ? '#a78bfa' : chunk.type === 'title' ? '#34d399' : '#60a5fa',
                              background: chunk.type === 'table' ? 'rgba(167,139,250,0.12)' : chunk.type === 'title' ? 'rgba(52,211,153,0.12)' : 'rgba(96,165,250,0.12)',
                            }}>
                            {chunk.type || 'text'}
                          </span>
                          {showConf && <ConfBadge score={chunk.confidence} />}
                          {pageNum && (
                            <span className="ml-auto font-mono text-[11px] px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>
                              p.{pageNum}
                            </span>
                          )}
                        </div>

                        {/* Text/table content */}
                        <div className="ml-7 mt-1">
                          <ChunkContent chunk={chunk} />
                        </div>
                      </div>
                    )
                  })}
                  {filtered.length === 0 && (
                    <div className="py-12 text-center text-white/20 text-sm">No chunks</div>
                  )}
                  </div>
                </>
              )}

              {/* ── Markdown ────────────────────────────────────────── */}
              {tab === 'markdown' && (
                <div className="p-5">
                  {markdown
                    ? <pre className="text-xs text-white/65 whitespace-pre-wrap leading-relaxed font-mono">{markdown}</pre>
                    : <div className="text-white/20 text-sm text-center py-12">No markdown content</div>
                  }
                </div>
              )}

              {/* ── JSON ────────────────────────────────────────────── */}
              {tab === 'json' && (
                <div className="p-5">
                  <pre className="text-xs text-green-400/75 font-mono whitespace-pre-wrap leading-relaxed">
                    {JSON.stringify({
                      id: doc?.id, file_name: doc?.file_name,
                      page_count: doc?.page_count, status: doc?.status,
                      chunk_count: chunks.length,
                      table_count: doc?.parse_metadata?.table_count,
                      sample_chunks: filtered.slice(0, 5).map(c => ({
                        type: c.type,
                        text: (c.text || '').slice(0, 80),
                        page: c.page,
                        confidence: c.confidence,
                      })),
                    }, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* ── Extraction history ────────────────────────────────── */}
            <div className="shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-4 py-3"
                style={{ background: 'rgba(8,13,28,0.9)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full"
                    style={{ background: extractions.length ? '#3b82f6' : 'rgba(255,255,255,0.15)' }} />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-white/30">
                    EXTRACTION HISTORY
                  </span>
                </div>

                {extractions.length === 0 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/25">Not yet extracted</span>
                    <button onClick={handleRunExtraction}
                      className="btn btn-primary gap-1.5 text-xs" style={{ padding: '7px 14px' }}>
                      <Zap className="w-3 h-3" /> Run Extraction Now →
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {extractions.slice(0, 3).map(e => (
                      <div key={e.job_id} className="flex items-center justify-between py-2 px-3 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center gap-2">
                          {e.status === 'completed'
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                            : e.status === 'failed'
                            ? <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                            : <Clock className="w-3.5 h-3.5 text-yellow-400" />
                          }
                          <span className="text-xs text-white/65">{e.schema_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`badge text-[10px] ${
                            e.status === 'completed' ? 'badge-green' :
                            e.status === 'failed' ? 'badge-red' : 'badge-yellow'
                          }`}>{e.status}</span>
                          {e.status === 'completed' && (
                            <button onClick={() => { onClose?.(); navigate('/results') }}
                              className="text-xs text-blue-400 hover:text-blue-300 font-semibold">
                              View →
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <button onClick={handleRunExtraction}
                      className="btn btn-primary gap-1.5 text-xs w-full justify-center mt-1"
                      style={{ padding: '7px' }}>
                      <Zap className="w-3 h-3" /> Run New Extraction →
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
