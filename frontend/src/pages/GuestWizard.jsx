/**
 * GuestWizard — Simplified 4-step wizard for guest users.
 * Replaces the complex multi-page layout with one clean page.
 *
 * Step 1: Get PDF   (upload file OR enter URL to discover)
 * Step 2: Schema    (pick document type — big cards)
 * Step 3: Extract   (one click, with engine auto-selected)
 * Step 4: Results   (see extracted fields, export)
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import {
  Upload, Globe, FileText, Zap, BarChart3, CheckCircle2,
  ChevronRight, ChevronLeft, Loader2, ArrowRight, Download,
  RefreshCw, AlertCircle, LogOut, Sparkles, Lock, Eye,
  ZoomIn, ZoomOut
} from 'lucide-react'
import { useWorkflow } from '../lib/store'
import api, {
  listDocuments, uploadBatch, runExtraction,
  exportResults, BASE_URL, logGuestActivity, getGuestJobs
} from '../lib/api'
import { downloadBlob } from '../lib/utils'
import {
  getGuestSession, getGuestLimits, getGuestToken,
  refreshGuestUsage, logout, isGuest
} from '../lib/auth'
import RequestAccessModal from '../components/RequestAccessModal'
import DocumentViewer from '../components/DocumentViewer'

// ── Step pill ─────────────────────────────────────────────────────────────────
function StepPill({ n, label, active, done }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-black transition-all"
        style={{
          background: done   ? 'rgba(34,197,94,0.2)'  : active ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.06)',
          color:      done   ? '#34d399'               : active ? '#fff'                                    : 'rgba(255,255,255,0.3)',
          border:     active ? '2px solid rgba(124,58,237,0.5)' : 'none',
          boxShadow:  active ? '0 0 16px rgba(37,99,235,0.4)'   : 'none',
        }}>
        {done ? '✓' : n}
      </div>
      <span className="text-xs font-bold hidden sm:block"
        style={{ color: active ? '#fff' : done ? '#34d399' : 'rgba(255,255,255,0.3)' }}>
        {label}
      </span>
    </div>
  )
}

// ── Confidence bar ────────────────────────────────────────────────────────────
function ConfBar({ score }) {
  if (score == null) return null
  const pct   = Math.round(score > 1 ? score : score * 100)
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : '#ef4444'
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold tabular-nums px-1 py-0.5 rounded"
        style={{ color, background: `${color}18` }}>{pct}%</span>
      <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Guest PDF Viewer (inline, same as Results page) ──────────────────────────
function GuestPdfViewer({ docId, highlightField }) {
  const canvasRef   = useRef(null)
  const overlayRef  = useRef(null)
  const [page,      setPage]      = useState(1)
  const [total,     setTotal]     = useState(1)
  const [scale,     setScale]     = useState(1.2)
  const [pdfDoc,    setPdfDoc]    = useState(null)
  const [fileUrl,   setFileUrl]   = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [searchMsg, setSearchMsg] = useState('')

  useEffect(() => {
    if (!docId) return
    api.get(`/api/v1/documents/${docId}`).then(d => {
      if (d.data?.file_path) {
        const fname = d.data.file_path.replace(/\\/g, '/').split('/').pop()
        setFileUrl(`${BASE_URL}/uploads/${fname}`)
      }
    }).catch(() => {})
  }, [docId])

  useEffect(() => {
    if (!fileUrl) return
    setLoading(true)
    const load = async () => {
      try {
        if (!window.pdfjsLib) {
          await new Promise((res, rej) => {
            const s = document.createElement('script')
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
            s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res() }
            s.onerror = rej
            document.head.appendChild(s)
          })
        }
        const pdf = await window.pdfjsLib.getDocument(fileUrl).promise
        setPdfDoc(pdf); setTotal(pdf.numPages); setLoading(false)
      } catch { setLoading(false) }
    }
    load()
  }, [fileUrl])

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    pdfDoc.getPage(page).then(pg => {
      const vp = pg.getViewport({ scale })
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      pg.render({ canvasContext: ctx, viewport: vp }).promise?.catch(() => {})
    }).catch(() => {})
  }, [pdfDoc, page, scale])

  // Search PDF for highlighted field value
  useEffect(() => {
    if (!pdfDoc || !highlightField) return
    const searchVal = String(highlightField.value || highlightField.field || '').trim()
    if (!searchVal || searchVal.length < 2) return
    const search = async () => {
      setSearchMsg(`Searching for "${searchVal.slice(0, 25)}"...`)
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        try {
          const pg = await pdfDoc.getPage(p)
          const tc = await pg.getTextContent()
          const vp = pg.getViewport({ scale: 1 })
          const full = tc.items.map(i => i.str).join(' ')
          if (full.toLowerCase().includes(searchVal.toLowerCase())) {
            const rects = []
            for (const item of tc.items) {
              if (item.str.toLowerCase().includes(searchVal.toLowerCase())) {
                const tx = item.transform
                const fontH = Math.abs(tx[3]) || 12
                rects.push({ x: tx[4], y: vp.height - tx[5] - fontH, w: item.width || 80, h: fontH + 2 })
                if (rects.length >= 3) break
              }
            }
            if (rects.length > 0) {
              setPage(p)
              setTimeout(() => {
                if (!canvasRef.current || !overlayRef.current) return
                const canvas = canvasRef.current
                const overlay = overlayRef.current
                overlay.innerHTML = ''
                overlay.style.width = canvas.width + 'px'
                overlay.style.height = canvas.height + 'px'
                rects.forEach(r => {
                  const div = document.createElement('div')
                  div.style.cssText = `position:absolute;left:${r.x * scale}px;top:${r.y * scale}px;width:${Math.max(r.w * scale, 50)}px;height:${Math.max(r.h * scale, 14)}px;background:rgba(251,191,36,0.3);border:2px solid rgba(251,191,36,0.95);border-radius:3px;pointer-events:none;box-shadow:0 0 10px rgba(251,191,36,0.6);`
                  overlay.appendChild(div)
                  div.scrollIntoView({ behavior: 'smooth', block: 'center' })
                })
              }, 500)
              setSearchMsg(`Found on page ${p}`)
              setTimeout(() => setSearchMsg(''), 3000)
              return
            }
          }
        } catch {}
      }
      setSearchMsg(`Not found in PDF`)
      setTimeout(() => setSearchMsg(''), 3000)
    }
    search()
  }, [highlightField, pdfDoc])

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1}
          className="p-1 rounded hover:bg-white/[0.08] disabled:opacity-30 text-white/50">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs text-white/50 tabular-nums">{page}/{total}</span>
        <button onClick={() => setPage(p => Math.min(total, p+1))} disabled={page >= total}
          className="p-1 rounded hover:bg-white/[0.08] disabled:opacity-30 text-white/50">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        {searchMsg && <span className="text-[10px] px-2 py-0.5 rounded flex-1 truncate" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>{searchMsg}</span>}
        <div className="flex-1" />
        <button onClick={() => setScale(s => Math.max(0.5, +(s-0.2).toFixed(1)))} className="p-1 rounded hover:bg-white/[0.08] text-white/40"><ZoomOut className="w-3 h-3" /></button>
        <span className="text-[9px] text-white/25 w-8 text-center">{Math.round(scale*100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, +(s+0.2).toFixed(1)))} className="p-1 rounded hover:bg-white/[0.08] text-white/40"><ZoomIn className="w-3 h-3" /></button>
      </div>
      {/* Canvas */}
      <div className="flex-1 overflow-auto p-2" style={{ background: '#1a2035' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="relative inline-block mx-auto">
            <canvas ref={canvasRef} className="block rounded shadow-2xl" style={{ maxWidth: '100%', direction: 'ltr', transform: 'none' }} />
            <div ref={overlayRef} className="absolute inset-0 pointer-events-none" style={{ position: 'absolute', top: 0, left: 0 }} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Schema Selector — Admin Default / Upload / Create Custom ─────────────────
function SchemaSelector({ schemaPreset, setSchemaPreset }) {
  const [tab,        setTab]        = useState('admin')
  const [fieldNames, setFieldNames] = useState('')
  const [generating, setGenerating] = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const [defaultSchema, setDefaultSchema] = useState(null) // { schema_id, schema_name, fields, configured }

  useEffect(() => {
    api.get('/guests/default-schema')
      .then(r => {
        if (r.data?.configured) {
          setDefaultSchema(r.data)
          // Auto-select if nothing chosen yet
          if (!schemaPreset) {
            setSchemaPreset({
              id:     r.data.schema_id,
              name:   r.data.schema_name,
              fields: r.data.fields || [],
            })
          }
        }
      })
      .catch(() => {})
  }, [])

  const handleUploadSchema = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await api.post('/api/v1/schemas/upload', fd)
      setSchemaPreset({ id: r.data.id, name: r.data.name, fields: r.data.fields || [] })
      toast.success(`Schema uploaded: ${r.data.name}`)
    } catch (e) { toast.error(e.message) }
    finally { setUploading(false); e.target.value = '' }
  }

  const generateSchema = () => {
    const names = fieldNames.split(/[,\n]+/).map(s => s.trim()).filter(Boolean)
    if (!names.length) { toast.error('Enter at least one field name'); return }
    setGenerating(true)
    const fields = names.map(name => {
      const lower = name.toLowerCase().replace(/\s+/g, '_')
      let type = 'string'
      if (/date|year|month/.test(lower)) type = 'date'
      else if (/amount|price|cost|total|fee|charge/.test(lower)) type = 'currency'
      else if (/count|qty|quantity|num|page/.test(lower)) type = 'integer'
      else if (/email/.test(lower)) type = 'email'
      else if (/phone|tel|fax/.test(lower)) type = 'phone'
      else if (/list|items|features/.test(lower)) type = 'list'
      return { name: lower, type, description: name.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
    })
    setSchemaPreset({ id: `custom_${Date.now()}`, name: `Custom (${names.length} fields)`, fields })
    toast.success(`Schema ready: ${names.length} fields`)
    setGenerating(false)
  }

  const TABS = [
    { id: 'admin',  label: '📋 Default Schema' },
    { id: 'upload', label: '📤 Upload JSON'    },
    { id: 'create', label: '✏️ Custom Fields'  },
  ]

  return (
    <div className="mb-5 space-y-3">
      {/* Tab bar */}
      <div className="flex gap-2">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
            style={{
              background: tab === t.id ? 'linear-gradient(135deg,rgba(37,99,235,0.25),rgba(124,58,237,0.2))' : 'rgba(255,255,255,0.04)',
              border: tab === t.id ? '1px solid rgba(37,99,235,0.4)' : '1px solid rgba(255,255,255,0.08)',
              color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.45)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Admin Default Schema ── */}
      {tab === 'admin' && (
        <div className="rounded-2xl p-4" style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.07)' }}>
          {defaultSchema?.configured ? (
            <button
              onClick={() => setSchemaPreset({ id: defaultSchema.schema_id, name: defaultSchema.schema_name, fields: defaultSchema.fields || [] })}
              className="w-full text-left p-4 rounded-xl transition-all hover:-translate-y-0.5"
              style={{
                background: schemaPreset?.id === defaultSchema.schema_id ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.03)',
                border: schemaPreset?.id === defaultSchema.schema_id ? '2px solid rgba(37,99,235,0.5)' : '1px solid rgba(255,255,255,0.07)',
              }}>
              <div className="text-2xl mb-2">📋</div>
              <p className="text-sm font-black text-white mb-1">{defaultSchema.schema_name}</p>
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {defaultSchema.description || `${(defaultSchema.fields || []).length} fields`}
              </p>
              {schemaPreset?.id === defaultSchema.schema_id && (
                <div className="mt-2 flex items-center gap-1 text-[10px] font-bold" style={{ color: '#34d399' }}>
                  <CheckCircle2 className="w-3 h-3" /> Selected
                </div>
              )}
            </button>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>No default schema set</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
                Admin hasn't set a default schema yet. Use Upload or Custom Fields instead.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Upload JSON ── */}
      {tab === 'upload' && (
        <div className="rounded-2xl p-5 text-center" style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.07)' }}>
          <label className="flex flex-col items-center gap-3 cursor-pointer">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.25)' }}>
              {uploading ? <Loader2 className="w-6 h-6 animate-spin text-blue-400" /> : <Upload className="w-6 h-6 text-blue-400" />}
            </div>
            <div>
              <p className="text-sm font-bold text-white">Upload Schema JSON</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Supports LandingAI ADE or flat field list format</p>
            </div>
            <input type="file" accept=".json" className="hidden" onChange={handleUploadSchema} />
            <span className="px-5 py-2 rounded-xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>Browse JSON File</span>
          </label>
          {schemaPreset?.id && !schemaPreset.id.startsWith('preset_') && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs" style={{ color: '#34d399' }}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Loaded: {schemaPreset.name}
            </div>
          )}
        </div>
      )}

      {/* ── Create Custom ── */}
      {tab === 'create' && (
        <div className="rounded-2xl p-5 space-y-3" style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Enter field names to extract
            </label>
            <textarea className="input text-sm w-full resize-none" rows={4}
              placeholder={`invoice_number\ninvoice_date\nvendor_name\ntotal_amount`}
              value={fieldNames} onChange={e => setFieldNames(e.target.value)}
              style={{ fontFamily: 'monospace' }} />
            <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
              One per line or comma-separated. Types auto-detected (date, currency, email, phone, list…)
            </p>
          </div>
          <button onClick={generateSchema} disabled={generating || !fieldNames.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
            <Zap className="w-4 h-4" /> Generate Schema & Use
          </button>
          {schemaPreset?.id?.startsWith('custom_') && (
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl"
              style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', color: '#34d399' }}>
              <CheckCircle2 className="w-3.5 h-3.5" /> {schemaPreset.name} ({(schemaPreset.fields||[]).length} fields)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function GuestWizard() {
  const { state, addJob, addToLibrary } = useWorkflow()
  const navigate = useNavigate()
  const [step,           setStep]         = useState(1)
  const [docId,          setDocId]        = useState(null)
  const [docName,        setDocName]      = useState('')
  const [uploading,      setUploading]    = useState(false)
  const [crawlUrl,       setCrawlUrl]     = useState('')
  const [crawling,       setCrawling]     = useState(false)
  const [crawlDocs,      setCrawlDocs]    = useState([])
  const [schemaPreset,   setSchemaPreset] = useState(null)
  const [extracting,     setExtracting]   = useState(false)
  const [job,            setJob]          = useState(null)
  const [exporting,      setExporting]    = useState(false)
  const [showRequest,    setShowRequest]  = useState(false)
  const [inputMode,      setInputMode]    = useState('discover') // 'discover' | 'upload'
  const [limits,         setLimits]       = useState(getGuestLimits())
  const [landingAIAvailable, setLandingAIAvailable] = useState(false)
  const [pastJobs,           setPastJobs]           = useState([])
  const [viewingJob,         setViewingJob]         = useState(null)
  const [samplePdf,          setSamplePdf]          = useState(null)
  const [loadingSample,      setLoadingSample]      = useState(false)
  const [selectedEngine,     setSelectedEngine]     = useState('landingai')
  const [parsingDoc,         setParsingDoc]         = useState(null)
  const [showDocViewer,      setShowDocViewer]      = useState(false)
  const [highlightField,     setHighlightField]     = useState(null)
  const [parsingTooLong,     setParsingTooLong]     = useState(false)
  const guest = getGuestSession()

  useEffect(() => {
    refreshGuestUsage().then(() => setLimits(getGuestLimits()))
    api.get('/guests/landingai-available')
      .then(r => setLandingAIAvailable(r.data?.available || false))
      .catch(() => setLandingAIAvailable(false))
    getGuestJobs()
      .then(r => setPastJobs(r.jobs || []))
      .catch(() => {})
    api.get('/guests/sample-pdf-available')
      .then(r => setSamplePdf(r.data))
      .catch(() => {})
    // Load default schema if admin set one — use full field definitions from API
    api.get('/guests/default-schema')
      .then(r => {
        if (r.data?.configured && r.data?.schema_id && !schemaPreset) {
          setSchemaPreset({
            id:     r.data.schema_id,
            name:   r.data.schema_name,
            fields: r.data.fields || [],
          })
        }
      })
      .catch(() => {})
  }, [])

  // ── Upload handler ──────────────────────────────────────────────────────
  const onDrop = useCallback(async (files) => {
    if (!files.length) return
    const file = files[0]
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post('/api/v1/documents/upload', fd)
      const doc = res.data
      setDocId(doc.id)
      setDocName(doc.file_name || file.name)
      toast.success(`"${doc.file_name || file.name}" uploaded — ready to extract`)
      setStep(2)
    } catch (e) {
      toast.error('Upload failed: ' + e.message)
    } finally {
      setUploading(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: false,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.png','.jpg'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] }
  })

  // ── Crawl handler ───────────────────────────────────────────────────────
  const startCrawl = async () => {
    if (!crawlUrl.trim()) { toast.error('Enter a website URL'); return }
    if (limits && limits.pdfRemaining <= 0) { setShowRequest(true); return }
    setCrawling(true)
    setCrawlDocs([])
    logGuestActivity('crawl_url', crawlUrl)
    try {
      const url = crawlUrl.startsWith('http') ? crawlUrl : 'https://' + crawlUrl
      const es  = new EventSource(`${BASE_URL}/crawl-stream?url=${encodeURIComponent(url)}`)
      es.onmessage = (e) => {
        const data = JSON.parse(e.data)
        if (data.type === 'done') {
          const docs = (data.files || []).map(f => ({
            url: f.url,
            filename: f.name,
            format: f.format,
            localPath: f.path || null,   // keep local path for fast bridge lookup
          }))
          setCrawlDocs(docs)
          setCrawling(false)
          es.close()
          if (docs.length) toast.success(`Found ${docs.length} documents`)
          else toast.error('No documents found')
        }
        if (data.type === 'error') { setCrawling(false); toast.error(data.message); es.close() }
      }
      es.onerror = () => { setCrawling(false); es.close() }
    } catch (e) {
      setCrawling(false)
      toast.error(e.message)
    }
  }

  const sendDocToLibrary = async (docUrl, filename, localPath = null) => {
    if (limits && limits.pdfRemaining <= 0) { setShowRequest(true); return }
    try {
      // Pass both the web URL and the local path hint so the backend
      // can serve from local cache without re-downloading
      const payload = { urls: [docUrl] }
      if (localPath) payload.local_paths = { [docUrl]: localPath }

      const res = await api.post('/bridge/send-to-doclens', payload)
      const data = res.data
      if (data.total_created > 0) {
        const created = data.created[0]
        setDocId(created.doc_id)
        setDocName(created.filename || filename)
        await refreshGuestUsage()
        setLimits(getGuestLimits())
        logGuestActivity('pdf_fetch', filename)
        toast.success(`"${created.filename || filename}" added — ready to extract`)
        setStep(2)
      } else {
        const errMsg = data.failed?.[0]?.error || 'Could not fetch this document'
        if (errMsg.includes('limit') || errMsg.includes('LIMIT')) {
          setShowRequest(true)
        } else {
          toast.error(`Failed: ${errMsg}`, { duration: 6000 })
        }
      }
    } catch (e) {
      const msg = e?.response?.data?.detail?.message || e?.response?.data?.detail || e.message || 'Network error'
      if (msg.includes('limit') || msg.includes('LIMIT')) {
        setShowRequest(true)
      } else {
        toast.error(`Fetch failed: ${msg}`, { duration: 6000 })
      }
    }
  }

  // ── Extract handler ─────────────────────────────────────────────────────
  const runExtract = async () => {
    if (!docId || !schemaPreset) return
    if (limits && limits.extractionRemaining <= 0) { setShowRequest(true); return }
    setExtracting(true)
    setStep(3)
    try {
      // Auto-detect multi_record: schema has a list[object] or array-of-objects field
      const isMultiRecord = schemaPreset.fields.some(f =>
        f.type === 'list[object]' || f.type === 'list_object' ||
        (f.type === 'list' && Array.isArray(f.fields) && f.fields.length > 0) ||
        (f.type === 'array' && f.items?.type === 'object')
      )

      const providerConfig = landingAIAvailable
        ? { provider: selectedEngine || 'landingai', api_key: '', model: 'dpt-2-latest', base_url: '' }
        : { provider: 'none', api_key: '', model: '', base_url: '' }

      const payload = {
        document_id:     docId,
        schema:          { name: schemaPreset.name, fields: schemaPreset.fields },
        provider_config: providerConfig,
        options: {
          smart_retry:    true,
          retry_threshold: 0.5,
          multi_record:   isMultiRecord,
          // auto_multi: tells backend to also detect multi-record from schema
          auto_multi:     true,
        },
      }
      const result = await runExtraction(payload)

      // API now returns normalized shape: fields, confidence_scores, all_records, total_records, quality_score
      // Also handle legacy shape as fallback
      const fields = result.fields || result.result || {}
      const confs  = result.confidence_scores || result.confidence || {}
      const srcs   = result.source_references || result.sources || {}
      const allRec = result.all_records || result.records || null
      const qualScore = result.quality_score ??
        (typeof result.quality === 'object' ? result.quality?.score : result.quality) ?? null

      const jobObj = {
        job_id:            result.job_id,
        document_id:       docId,
        schema_name:       schemaPreset.name,
        status:            result.status || 'completed',
        fields,
        all_records:       allRec,
        total_records:     result.total_records ?? (allRec?.length ?? null),
        quality_score:     qualScore,
        confidence_scores: confs,
        source_references: srcs,
      }
      setJob(jobObj)
      addJob(jobObj)
      // Refresh persistent job list so it shows immediately on Step 1
      getGuestJobs().then(r => setPastJobs(r.jobs || [])).catch(() => {})

      // Increment guest counter
      const token = getGuestToken()
      if (token) {
        await api.post('/guests/increment-extraction', {}, { headers: { 'X-Guest-Token': token } }).catch(() => {})
        await refreshGuestUsage()
        setLimits(getGuestLimits())
        logGuestActivity('extraction', `doc=${docId}`)
      }

      toast.success('Extraction complete!')
      // Navigate to the full Results page — identical to admin view with all schema fields
      navigate('/guest-results')
    } catch (e) {
      toast.error('Extraction failed: ' + e.message)
      setStep(2)
    } finally {
      setExtracting(false)
    }
  }

  // ── Export handler ──────────────────────────────────────────────────────
  const handleExport = async (fmt) => {
    if (!job) return
    // Block if no export permission
    if (!limits?.exportAllowed) {
      setShowRequest(true)
      return
    }
    setExporting(true)
    try {
      const blob = await exportResults(job.job_id, fmt)
      downloadBlob(blob, `extraction_${job.job_id.slice(0,8)}.${fmt === 'excel' ? 'xlsx' : fmt}`)
      toast.success(`Exported as ${fmt.toUpperCase()}`)
    } catch {
      const fields  = job.fields || {}
      const confs   = job.confidence_scores || {}
      const sources = job.source_references || {}
      const keys    = Object.keys(fields)
      if (fmt === 'json') {
        downloadBlob(new Blob([JSON.stringify(job, null, 2)], { type: 'application/json' }),
          `extraction_${job.job_id.slice(0,8)}.json`)
        toast.success('Exported as JSON')
      } else {
        const csv = ['Field,Value,Confidence',
          ...keys.map(k => `"${k}","${String(fields[k] ?? '').replace(/"/g,'""')}","${confs[k] != null ? Math.round((confs[k]>1?confs[k]:confs[k]*100))+'%' : ''}"`)
        ].join('\n')
        downloadBlob(new Blob([csv], { type: 'text/csv' }), `extraction_${job.job_id.slice(0,8)}.csv`)
        toast.success('Exported as CSV')
      }
    }
    setExporting(false)
  }

  const steps = [
    { n: 1,   label: 'Get PDF'  },
    { n: 1.5, label: 'Preview'  },
    { n: 2,   label: 'Schema'   },
    { n: 3,   label: 'Extract'  },
    { n: 4,   label: 'Results'  },
  ]

  const fieldKeys = job ? Object.keys(job.fields || {}) : []

  // For multi-record jobs (all_records or nested array), compute fill stats across all records
  const jobRecords = job?.all_records?.length > 0
    ? job.all_records.map(r => r.result || r)
    : (() => {
        const nestedKey = job ? Object.keys(job.fields || {}).find(k =>
          Array.isArray(job.fields[k]) && job.fields[k].length > 0 && typeof job.fields[k][0] === 'object'
        ) : null
        return nestedKey ? job.fields[nestedKey] : null
      })()

  const isJobMultiRecord = jobRecords && jobRecords.length > 0

  const filledCount = isJobMultiRecord
    ? (() => {
        const allKeys = [...new Set(jobRecords.flatMap(r => Object.keys(r || {})))]
        return jobRecords.reduce((sum, r) =>
          sum + allKeys.filter(k => r[k] !== null && r[k] !== undefined && r[k] !== '').length, 0)
      })()
    : fieldKeys.filter(k => { const v = job?.fields?.[k]; return v !== null && v !== undefined && v !== '' }).length

  // Confidence: estimate from fill rate when no explicit confidence scores
  const jobConfScores = job?.confidence_scores || {}
  const confAvg = Object.values(jobConfScores).length > 0
    ? Math.round(Object.values(jobConfScores).reduce((a, b) => a + (b > 1 ? b : b * 100), 0) / Object.values(jobConfScores).length)
    : isJobMultiRecord
      ? (() => {
          const allKeys = [...new Set(jobRecords.flatMap(r => Object.keys(r || {})))]
          const totalCells = allKeys.length * jobRecords.length
          if (totalCells === 0) return 0
          const filledCells = jobRecords.reduce((sum, r) =>
            sum + allKeys.filter(k => r[k] !== null && r[k] !== undefined && r[k] !== '').length, 0)
          return Math.min(90, Math.round((filledCells / totalCells) * 90))
        })()
      : 0

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#060b18' }}>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 shrink-0"
        style={{ background: 'rgba(8,13,28,0.95)', borderBottom: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)' }}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.location.href = '/'}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-black text-white text-sm hidden sm:block">
            DOCPlus AI<span style={{ color: '#7c3aed' }}>⁺</span>
          </span>
        </div>

        {/* Step pills */}
        <div className="flex items-center gap-2 sm:gap-4">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center gap-1 sm:gap-2">
              <StepPill n={s.n} label={s.label} active={step === s.n} done={step > s.n} />
              {i < steps.length - 1 && (
                <div className="w-4 sm:w-8 h-px" style={{ background: step > s.n ? '#34d399' : 'rgba(255,255,255,0.1)' }} />
              )}
            </div>
          ))}
        </div>

        {/* Trial badge + user */}
        <div className="flex items-center gap-3">
          {limits && (
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <span style={{ color: limits.pdfRemaining === 0 ? '#fca5a5' : 'rgba(255,255,255,0.4)' }}>
                PDF <strong className="text-white">{limits.pdfFetched}/{limits.pdfLimit}</strong>
              </span>
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
              <span style={{ color: limits.extractionRemaining === 0 ? '#fca5a5' : 'rgba(255,255,255,0.4)' }}>
                Extract <strong className="text-white">{limits.extractionsUsed}/{limits.extractionLimit}</strong>
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black"
            style={{ background: 'rgba(37,99,235,0.15)', color: '#93c5fd', border: '1px solid rgba(37,99,235,0.25)' }}>
            ⚡ Trial
          </div>
          <button onClick={logout}
            className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
            style={{ color: 'rgba(255,255,255,0.3)' }} title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex items-start justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-2xl">

          {/* ════════════════ STEP 1: GET PDF ════════════════ */}
          {step === 1 && (
            <div className="space-y-5 animate-fade-in">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-black text-white mb-1">Get your document</h1>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Discover PDFs from any website, or upload directly if permitted
                </p>
              </div>

              {/* Mode toggle — Discover FIRST, Upload SECOND */}
              <div className="flex rounded-2xl overflow-hidden p-1 gap-1"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>

                {/* ① Discover from Web — always available */}
                <button onClick={() => setInputMode('discover')}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all"
                  style={{
                    background: inputMode === 'discover' ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'transparent',
                    color: inputMode === 'discover' ? '#fff' : 'rgba(255,255,255,0.5)',
                  }}>
                  <Globe className="w-4 h-4" />
                  Discover from Web
                </button>

                {/* ② Upload File — locked unless admin granted permission */}
                <button onClick={() => setInputMode('upload')}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all relative"
                  style={{
                    background: inputMode === 'upload'
                      ? (limits?.uploadAllowed ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)')
                      : 'transparent',
                    color: inputMode === 'upload'
                      ? (limits?.uploadAllowed ? '#86efac' : 'rgba(255,255,255,0.5)')
                      : 'rgba(255,255,255,0.4)',
                    border: inputMode === 'upload' ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                  }}>
                  {limits?.uploadAllowed
                    ? <Upload className="w-4 h-4" />
                    : <Lock className="w-3.5 h-3.5" />}
                  Upload File
                  {!limits?.uploadAllowed && (
                    <span className="text-[9px] font-black px-1 py-0.5 rounded ml-1"
                      style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
                      Admin Only
                    </span>
                  )}
                </button>
              </div>

              {/* ── Upload panel ── */}
              {inputMode === 'upload' && (
                limits?.uploadAllowed ? (
                  /* Admin has granted upload permission — show real dropzone */
                  <div {...getRootProps()} className="rounded-2xl p-10 text-center cursor-pointer transition-all"
                    style={{
                      border: isDragActive ? '2px dashed #22c55e' : '2px dashed rgba(255,255,255,0.12)',
                      background: isDragActive ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)',
                    }}>
                    <input {...getInputProps()} />
                    {uploading
                      ? <><Loader2 className="mx-auto w-10 h-10 animate-spin mb-3 text-green-400" /><p className="text-white font-bold">Uploading...</p></>
                      : <>
                          <Upload className="mx-auto w-12 h-12 mb-4" style={{ color: isDragActive ? '#22c55e' : 'rgba(255,255,255,0.25)' }} />
                          <p className="text-base font-black text-white mb-1">
                            {isDragActive ? 'Drop it here!' : 'Drop your PDF here'}
                          </p>
                          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                            or click to browse · PDF, Word, Image
                          </p>
                        </>
                    }
                  </div>
                ) : (
                  /* No upload permission — explain and offer request */
                  <div className="rounded-2xl p-7 text-center space-y-4"
                    style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
                      style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
                      <Lock className="w-7 h-7" style={{ color: '#fbbf24' }} />
                    </div>
                    <div>
                      <p className="text-base font-black text-white mb-1">Upload requires Admin approval</p>
                      <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        Direct file upload is not enabled for your trial account.
                        You can request access from the admin, or use
                        <strong className="text-white"> Discover from Web</strong> to fetch PDFs for free right now.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
                      <button onClick={() => setInputMode('discover')}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all hover:-translate-y-0.5"
                        style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
                        <Globe className="w-4 h-4" /> Use Discover Instead
                      </button>
                      <button onClick={() => setShowRequest(true)}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5"
                        style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24' }}>
                        Request Upload Access
                      </button>
                    </div>
                  </div>
                )
              )}

              {/* Discover mode */}
              {inputMode === 'discover' && (
                <div className="space-y-3">
                  {limits && limits.pdfRemaining === 0 ? (
                    <div className="rounded-2xl p-5 text-center"
                      style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <Lock className="w-8 h-8 mx-auto mb-2 text-red-400" />
                      <p className="text-sm font-bold text-red-400">PDF fetch limit reached</p>
                      <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>You've used all {limits.pdfLimit} PDF fetches</p>
                      <button onClick={() => setShowRequest(true)}
                        className="mt-3 px-4 py-2 rounded-xl text-xs font-black text-white"
                        style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                        Request More Access
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <input className="input text-sm w-full" placeholder="https://www.manufacturer.com"
                            value={crawlUrl} onChange={e => setCrawlUrl(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && startCrawl()} />
                        </div>
                        <button onClick={startCrawl} disabled={crawling}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all disabled:opacity-60"
                          style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
                          {crawling ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Globe className="w-4 h-4" /> Crawl</>}
                        </button>
                      </div>

                      {limits && (
                        <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          {limits.pdfRemaining} PDF fetch{limits.pdfRemaining !== 1 ? 'es' : ''} remaining in your trial
                        </p>
                      )}

                      {/* ── Try Default PDF button ── */}
                      {samplePdf?.available && (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.2)' }}>or</span>
                          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
                        </div>
                      )}
                      {samplePdf?.available && (
                        <button
                          onClick={async () => {
                            if (loadingSample) return
                            setLoadingSample(true)
                            try {
                              const r = await api.post('/guests/use-sample-pdf')
                              const newDocId = r.data.doc_id
                              setDocId(newDocId)
                              setDocName(r.data.filename)
                              addToLibrary({ id: newDocId, file_name: r.data.filename, status: 'uploaded', file_size: 0 })
                              toast.success('Default PDF loaded — parsing...')
                              // Show parsing screen immediately
                              setParsingDoc({ id: newDocId, name: r.data.filename, status: 'parsing' })
                              setStep(1.5)
                              setParsingTooLong(false)
                              // Show "Proceed Anyway" after 30 seconds
                              const tooLongTimer = setTimeout(() => setParsingTooLong(true), 30000)
                              // Poll for parsed status — poll the specific doc directly
                              let attempts = 0
                              const poll = setInterval(async () => {
                                attempts++
                                try {
                                  // Poll directly by doc_id to avoid filter issues
                                  const r2 = await api.get(`/api/v1/documents/${newDocId}`)
                                  const doc = r2.data
                                  if (doc) setParsingDoc({ id: newDocId, name: r.data.filename, status: doc.status })
                                  if (doc?.status === 'parsed' || doc?.status === 'error' || attempts > 90) {
                                    clearInterval(poll)
                                  }
                                } catch { if (attempts > 90) clearInterval(poll) }
                              }, 2000)
                            } catch (e) {
                              toast.error(e.message || 'Failed to load default PDF')
                            } finally {
                              setLoadingSample(false)
                            }
                          }}
                          disabled={loadingSample}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5 disabled:opacity-50"
                          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: '#34d399' }}>
                          {loadingSample
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</>
                            : <><FileText className="w-4 h-4" /> Try Default PDF — {samplePdf.filename}</>}
                        </button>
                      )}

                      {crawlDocs.length > 0 && (
                        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                          <div className="px-4 py-3 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.03)', color: '#22d3ee' }}>
                            ✓ {crawlDocs.length} documents found — click to use
                          </div>
                          <div className="divide-y max-h-64 overflow-y-auto" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                            {crawlDocs.map((doc, i) => (
                              <button key={i} onClick={() => sendDocToLibrary(doc.url, doc.filename, doc.localPath)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors">
                                <FileText className="w-4 h-4 shrink-0 text-blue-400" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-white truncate">{doc.filename}</p>
                                  <p className="text-[10px] truncate font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>{doc.url}</p>
                                </div>
                                <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: '#60a5fa' }} />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Past Extractions (always visible on Step 1) ── */}
          {step === 1 && pastJobs.length > 0 && !viewingJob && (
            <div className="space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-black uppercase tracking-widest"
                  style={{ color: 'rgba(255,255,255,0.3)' }}>
                  ● YOUR PAST EXTRACTIONS
                </p>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#34d399' }}>
                  {pastJobs.length} saved
                </span>
              </div>
              <div className="rounded-2xl overflow-hidden"
                style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.07)' }}>
                {pastJobs.slice(0, 5).map((j, i) => (
                  <button key={j.job_id} onClick={() => setViewingJob(j)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
                    style={{ borderBottom: i < Math.min(pastJobs.length, 5) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: j.status === 'completed' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)' }}>
                      <CheckCircle2 className="w-4 h-4" style={{ color: j.status === 'completed' ? '#34d399' : '#fca5a5' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{j.schema_name}</p>
                      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {j.created_at ? new Date(j.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Kolkata' }) : ''}
                        {j.total_records ? ` · ${j.total_records} records` : ''}
                      </p>
                    </div>
                    {j.quality_score != null && (
                      <span className="text-xs font-black tabular-nums shrink-0"
                        style={{ color: j.quality_score >= 70 ? '#86efac' : '#fde047' }}>
                        {j.quality_score}%
                      </span>
                    )}
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: '#60a5fa' }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── View past job inline ── */}
          {step === 1 && viewingJob && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <button onClick={() => setViewingJob(null)}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </button>
                <p className="text-sm font-black text-white">{viewingJob.schema_name}</p>
                {viewingJob.quality_score != null && (
                  <span className="ml-auto text-xs font-black px-2 py-0.5 rounded-full"
                    style={{ background: viewingJob.quality_score >= 70 ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)',
                             color: viewingJob.quality_score >= 70 ? '#34d399' : '#fde047' }}>
                    {viewingJob.quality_score}% quality
                  </span>
                )}
              </div>

              {/* Records table or field grid */}
              <div className="rounded-2xl overflow-hidden"
                style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="px-4 py-3 border-b flex items-center justify-between"
                  style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <p className="text-xs font-black uppercase tracking-widest" style={{ color: '#22d3ee' }}>
                    ● EXTRACTED DATA
                  </p>
                  {viewingJob.records?.length > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(34,197,94,0.12)', color: '#34d399' }}>
                      {viewingJob.records.length} records
                    </span>
                  )}
                </div>
                {viewingJob.records?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-max">
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {Object.keys(viewingJob.records[0]?.result || viewingJob.records[0] || {}).map(col => (
                            <th key={col} className="px-3 py-2 text-left font-bold font-mono whitespace-nowrap"
                              style={{ color: '#a78bfa' }}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {viewingJob.records.map((rec, ri) => {
                          const row = rec.result || rec
                          return (
                            <tr key={ri} className="hover:bg-white/[0.02]"
                              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              {Object.values(row).map((val, ci) => (
                                <td key={ci} className="px-3 py-2 text-xs"
                                  style={{ color: val == null || val === '' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.85)' }}>
                                  {val == null || val === '' ? '—' : String(val)}
                                </td>
                              ))}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-px" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {Object.entries(viewingJob.fields || {}).map(([key, val]) => (
                      <div key={key} className="px-4 py-3" style={{ background: '#0d1526' }}>
                        <p className="text-[10px] font-bold font-mono mb-1" style={{ color: '#a78bfa' }}>{key}</p>
                        <p className="text-sm" style={{ color: val == null || val === '' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.85)' }}>
                          {val == null || val === '' ? 'Not found' : Array.isArray(val) ? val.join(', ') : String(val)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Export past job — only if export permission granted */}
              <div className="flex gap-2">
                {limits?.exportAllowed ? (
                  ['excel','csv','json'].map(fmt => (
                    <button key={fmt} onClick={() => { setJob(viewingJob); handleExport(fmt) }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold"
                      style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', color: '#93c5fd' }}>
                      <Download className="w-3.5 h-3.5" />
                      {fmt === 'excel' ? 'Excel' : fmt.toUpperCase()}
                    </button>
                  ))
                ) : (
                  <button onClick={() => setShowRequest(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all"
                    style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24' }}>
                    🔒 Request Export Access
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ════════════════ STEP 1.5: PARSING + VIEW ════════════════ */}
          {step === 1.5 && parsingDoc && (
            <div className="w-full max-w-2xl animate-fade-in space-y-5">
              <div className="text-center">
                <h1 className="text-2xl font-black text-white mb-1">Document Ready</h1>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Your PDF is being parsed — view it or proceed to extraction
                </p>
              </div>

              {/* Document card */}
              <div className="rounded-2xl p-5"
                style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.25)' }}>
                    <FileText className="w-6 h-6" style={{ color: '#60a5fa' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-white truncate">{parsingDoc.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {parsingDoc.status === 'parsed' ? (
                        <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: '#34d399' }}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Parsed & Ready
                        </span>
                      ) : parsingDoc.status === 'error' ? (
                        <span className="text-xs font-bold text-red-400">✗ Parse failed</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-bold animate-pulse" style={{ color: '#fbbf24' }}>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Parsing...
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* View button — opens DocumentViewer */}
                {parsingDoc.status === 'parsed' && (
                  <button
                    onClick={() => setShowDocViewer(true)}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5"
                    style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)', color: '#60a5fa' }}>
                    <Eye className="w-4 h-4" /> View Document (with click-to-highlight)
                  </button>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={parsingDoc.status !== 'parsed'}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black text-white transition-all disabled:opacity-40 hover:-translate-y-0.5"
                  style={{
                    background: parsingDoc.status === 'parsed' ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.06)',
                    boxShadow: parsingDoc.status === 'parsed' ? '0 4px 20px rgba(37,99,235,0.35)' : 'none'
                  }}>
                  {parsingDoc.status === 'parsed'
                    ? <><Zap className="w-4 h-4" /> Select Schema & Extract</>
                    : <><Loader2 className="w-4 h-4 animate-spin" /> Parsing...</>}
                </button>
              </div>
            </div>
          )}

          {/* DocumentViewer fullscreen overlay */}
          {showDocViewer && parsingDoc?.id && (
            <DocumentViewer
              docId={parsingDoc.id}
              onClose={() => setShowDocViewer(false)}
              onRunExtraction={(id) => {
                setDocId(id)
                setShowDocViewer(false)
                setStep(2)
              }}
            />
          )}

          {/* ════════════════ STEP 2: SCHEMA + ENGINE ════════════════ */}
          {step === 2 && (
            <div className="w-full max-w-4xl animate-fade-in">
              <div className="text-center mb-5">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl mb-3 text-sm"
                  style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', color: '#60a5fa' }}>
                  <FileText className="w-4 h-4" />
                  <span className="font-semibold truncate max-w-48">{docName}</span>
                </div>
                <h1 className="text-2xl font-black text-white mb-1">Select Schema & Engine</h1>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Choose how to define what to extract
                </p>
              </div>

              {/* ── Schema source tabs ── */}
              <SchemaSelector
                schemaPreset={schemaPreset}
                setSchemaPreset={setSchemaPreset}
              />

              {/* ── AI Engine ── */}
              <div className="rounded-2xl p-4 mb-5"
                style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: '#22d3ee' }}>● AI ENGINE</p>
                <div className="flex items-center gap-3">
                  <select value={selectedEngine} onChange={e => setSelectedEngine(e.target.value)}
                    className="select text-sm flex-1"
                    style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)', color: '#60a5fa' }}>
                    <option value="landingai">LandingAI — Vision AI (Recommended)</option>
                    {!landingAIAvailable && <option value="none">Built-in Heuristic (lower accuracy)</option>}
                  </select>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-2 h-2 rounded-full" style={{ background: landingAIAvailable ? '#34d399' : '#fbbf24' }} />
                    <span className="text-xs font-bold" style={{ color: landingAIAvailable ? '#34d399' : '#fbbf24' }}>
                      {landingAIAvailable ? 'Ready' : 'Limited'}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {landingAIAvailable ? 'LandingAI Vision AI — no API key needed for your trial' : 'Using built-in engine'}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep(parsingDoc ? 1.5 : 1)}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button onClick={runExtract} disabled={!schemaPreset}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black text-white transition-all disabled:opacity-40 hover:-translate-y-0.5"
                  style={{ background: schemaPreset ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.06)', boxShadow: schemaPreset ? '0 4px 20px rgba(37,99,235,0.35)' : 'none' }}>
                  <Zap className="w-4 h-4" /> Extract Now
                </button>
              </div>

              {limits && limits.extractionRemaining <= 1 && (
                <div className="mt-3 rounded-xl p-3 text-center"
                  style={{ background: limits.extractionRemaining === 0 ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.07)', border: `1px solid ${limits.extractionRemaining === 0 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
                  <p className="text-xs font-bold" style={{ color: limits.extractionRemaining === 0 ? '#fca5a5' : '#fbbf24' }}>
                    {limits.extractionRemaining === 0 ? '🔒 No extractions remaining' : '⚠ Last extraction remaining'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ════════════════ STEP 3: EXTRACTING ════════════════ */}
          {step === 3 && (
            <div className="text-center py-16 animate-fade-in">
              <div className="relative mx-auto w-24 h-24 mb-8">
                <div className="w-24 h-24 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Zap className="w-10 h-10 text-blue-400" />
                </div>
              </div>
              <h2 className="text-2xl font-black text-white mb-2">Extracting data...</h2>
              <p className="text-sm animate-pulse mb-1" style={{ color: '#60a5fa' }}>
                Analyzing {docName}
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Using {schemaPreset?.name} schema · Built-in engine · 10–30 seconds
              </p>
            </div>
          )}

          {/* ════════════════ STEP 4: RESULTS ════════════════ */}
          {step === 4 && job && (
            <div className="w-full animate-fade-in" style={{ maxWidth: '100%' }}>
              {/* Header */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(34,197,94,0.15)' }}>
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    </div>
                    <h1 className="text-lg font-black text-white">Extraction Complete</h1>
                  </div>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {isJobMultiRecord
                      ? `${jobRecords?.length} records · ${confAvg}% confidence`
                      : `${filledCount} of ${fieldKeys.length} fields`}
                    {' · '}{docName}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {limits?.exportAllowed ? (
                    ['excel','csv','json'].map(fmt => (
                      <button key={fmt} onClick={() => handleExport(fmt)} disabled={exporting}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:-translate-y-0.5"
                        style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', color: '#93c5fd' }}>
                        <Download className="w-3 h-3" />
                        {fmt === 'excel' ? 'Excel' : fmt.toUpperCase()}
                      </button>
                    ))
                  ) : (
                    <button onClick={() => setShowRequest(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all hover:-translate-y-0.5"
                      style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24' }}>
                      🔒 Request Export Access
                    </button>
                  )}
                  <button onClick={() => { setStep(1); setDocId(null); setDocName(''); setSchemaPreset(null); setJob(null); setCrawlDocs([]); setParsingDoc(null); refreshGuestUsage().then(() => setLimits(getGuestLimits())) }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                    <RefreshCw className="w-3.5 h-3.5" /> Extract Another
                  </button>
                </div>
              </div>

              {/* Two-column: PDF viewer + Results */}
              <div className="flex gap-4 overflow-hidden rounded-2xl"
                style={{ height: '70vh', border: '1px solid rgba(255,255,255,0.07)', background: '#0d1526' }}>

                {/* Left: PDF viewer */}
                <div className="flex flex-col shrink-0" style={{ width: '45%', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
                  {docId && <GuestPdfViewer docId={docId} highlightField={highlightField} />}
                </div>

                {/* Right: Results */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Quality bar */}
                  {job.quality_score != null && (
                    <div className="px-4 py-3 shrink-0 flex items-center gap-3"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="text-center shrink-0">
                        <p className="text-xl font-black" style={{ color: job.quality_score >= 70 ? '#22c55e' : '#eab308' }}>{job.quality_score}</p>
                        <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Quality</p>
                      </div>
                      <div className="flex-1">
                        <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div className="h-full rounded-full" style={{ width: `${job.quality_score}%`, background: job.quality_score >= 70 ? '#22c55e' : '#eab308' }} />
                        </div>
                        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          {isJobMultiRecord
                            ? `${jobRecords?.length} records · ${confAvg}% confidence`
                            : `${filledCount}/${fieldKeys.length} fields`}
                          {' · '}{schemaPreset?.name}
                        </p>
                      </div>
                      <p className="text-[10px] shrink-0" style={{ color: '#60a5fa' }}>
                        Click any value to highlight in PDF
                      </p>
                    </div>
                  )}

                  {/* Multi-record spreadsheet OR single-record field table */}
                  <div className="flex-1 overflow-auto p-3">
                    {(() => {
                      // Determine display mode — fully schema-driven, no hardcoded field names:
                      // 1. job.records[] → multi-record from LandingAI multi-extract
                      // 2. Any array-of-objects field in job.fields (e.g. models, items, records…)
                      // 3. flat fields → simple field-value table

                      // Detect nested array-of-objects field regardless of name
                      const nestedArrayKey = job.records?.length > 0
                        ? null
                        : Object.keys(job.fields || {}).find(k =>
                            Array.isArray(job.fields[k]) &&
                            job.fields[k].length > 0 &&
                            typeof job.fields[k][0] === 'object'
                          )

                      const modelsArray = job.records?.length > 0
                        ? job.records.map(r => r.result || r)
                        : nestedArrayKey
                          ? job.fields[nestedArrayKey]
                          : null

                      const headerFields = Object.entries(job.fields || {})
                        .filter(([k, v]) => k !== nestedArrayKey && !Array.isArray(v) && typeof v !== 'object' && v !== null && v !== undefined && v !== '')

                      if (modelsArray && modelsArray.length > 0) {
                        // Get all column keys from all model records
                        const allKeys = [...new Set(modelsArray.flatMap(r => Object.keys(typeof r === 'object' && r !== null ? r : {})))]

                        return (
                          <div>
                            {/* Header metadata strip */}
                            {headerFields.length > 0 && (
                              <div className="flex flex-wrap gap-x-6 gap-y-1.5 mb-3 px-3 py-2.5 rounded-xl"
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                {headerFields.map(([k, v]) => (
                                  <div key={k} className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono" style={{ color: '#a78bfa' }}>{k}</span>
                                    <span className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>{String(v)}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>EXTRACTED RECORDS</span>
                              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(34,197,94,0.12)', color: '#34d399' }}>
                                {modelsArray.length} records · {allKeys.length} fields
                              </span>
                            </div>

                            <div className="rounded-xl overflow-auto" style={{ border: '1px solid rgba(255,255,255,0.1)', maxHeight: '50vh' }}>
                              <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
                                <thead className="sticky top-0 z-10">
                                  <tr style={{ background: '#1e2d4a' }}>
                                    <th className="px-3 py-2.5 text-center font-bold sticky left-0 z-20"
                                      style={{ background: '#1e2d4a', color: '#60a5fa', minWidth: 36 }}>#</th>
                                    {allKeys.map(col => (
                                      <th key={col} className="px-3 py-2.5 text-left font-bold whitespace-nowrap"
                                        style={{ color: '#a78bfa', borderRight: '1px solid rgba(255,255,255,0.07)', minWidth: 120 }}>
                                        {col}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {modelsArray.map((model, ri) => {
                                    const rowData = typeof model === 'object' && model !== null ? model : {}
                                    return (
                                      <tr key={ri} className="hover:bg-white/[0.03]"
                                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: ri % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                        <td className="px-3 py-2 text-center sticky left-0 font-bold"
                                          style={{ background: ri % 2 === 0 ? '#0d1526' : '#0a1020', color: 'rgba(255,255,255,0.3)' }}>{ri + 1}</td>
                                        {allKeys.map(col => {
                                          const val = rowData[col]
                                          const empty = val === null || val === undefined || val === ''
                                          return (
                                            <td key={col} className="px-3 py-2 whitespace-nowrap cursor-pointer hover:text-yellow-300 transition-colors"
                                              style={{ borderRight: '1px solid rgba(255,255,255,0.04)', color: empty ? 'rgba(255,255,255,0.2)' : '#e2e8f0' }}
                                              onClick={() => !empty && setHighlightField({ field: col, value: String(val) })}>
                                              {empty ? '—' : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                            </td>
                                          )
                                        })}
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )
                      }

                      // Fall through to single-record field table
                      return (
                        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr style={{ background: '#1e2d4a' }}>
                                <th className="px-4 py-2.5 text-left font-bold" style={{ color: '#60a5fa', minWidth: 140 }}>Field</th>
                                <th className="px-4 py-2.5 text-left font-bold" style={{ color: '#a78bfa' }}>Value</th>
                                <th className="px-4 py-2.5 text-left font-bold w-20" style={{ color: '#34d399' }}>Confidence</th>
                              </tr>
                            </thead>
                            <tbody>
                              {fieldKeys.map((key, i) => {
                                const val   = job.fields[key]
                                const conf  = job.confidence_scores?.[key]
                                const empty = val === null || val === undefined || val === ''
                                const pct   = conf != null ? Math.round(conf > 1 ? conf : conf * 100) : null
                                const cc    = pct != null ? (pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : '#ef4444') : null
                                return (
                                  <tr key={key} className="hover:bg-white/[0.025] transition-colors"
                                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                    <td className="px-4 py-2.5 font-mono font-bold" style={{ color: '#a78bfa' }}>{key}</td>
                                    <td className="px-4 py-2.5 cursor-pointer hover:text-yellow-300 transition-colors"
                                      style={{ color: empty ? 'rgba(255,255,255,0.2)' : '#e2e8f0' }}
                                      onClick={() => !empty && setHighlightField({ field: key, value: Array.isArray(val) ? val.join(' ') : String(val) })}>
                                      {empty ? '—' : Array.isArray(val) ? val.join(', ') : String(val)}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      {pct != null && cc ? (
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded"
                                            style={{ color: cc, background: `${cc}15` }}>{pct}%</span>
                                          <div className="w-10 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cc }} />
                                          </div>
                                        </div>
                                      ) : <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>

              {/* Limit notice */}
              {limits && limits.extractionRemaining === 0 && (
                <div className="mt-4 rounded-2xl p-4 text-center"
                  style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <p className="text-sm font-bold text-red-400 mb-1">🔒 Extraction limit reached</p>
                  <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>You've used all {limits.extractionLimit} trial extractions.</p>
                  <button onClick={() => setShowRequest(true)}
                    className="px-5 py-2 rounded-xl text-xs font-black text-white"
                    style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                    Request More Access
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showRequest && <RequestAccessModal defaultType="extraction" onClose={() => setShowRequest(false)} />}
    </div>
  )
}
