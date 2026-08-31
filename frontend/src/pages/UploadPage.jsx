/**
 * UploadPage — Mode cards (Single / Batch / ZIP) with auto-parse after upload.
 *
 * Single  — 1 file, upload + parse automatically
 * Batch   — multiple files, upload all + parse each automatically
 * ZIP     — 1 ZIP file, extract + parse all contained PDFs automatically
 */
import { useCallback, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import {
  Upload, FileText, X, CheckCircle2, AlertCircle,
  FolderOpen, ArrowRight, Loader2, Package, Archive,
  RefreshCw, Zap
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useWorkflow } from '../lib/store'
import api, { listDocuments } from '../lib/api'
import { formatBytes } from '../lib/utils'

// ── Mode card ─────────────────────────────────────────────────────────────────
function ModeCard({ icon: Icon, title, desc, active, onClick }) {
  return (
    <button onClick={onClick}
      className="flex-1 flex flex-col items-center gap-3 p-6 rounded-2xl text-center transition-all hover:-translate-y-0.5"
      style={{
        background: active ? 'linear-gradient(135deg,rgba(37,99,235,0.25),rgba(124,58,237,0.2))' : 'rgba(255,255,255,0.03)',
        border: active ? '2px solid rgba(37,99,235,0.5)' : '2px solid rgba(255,255,255,0.07)',
        boxShadow: active ? '0 0 24px rgba(37,99,235,0.2)' : 'none',
      }}>
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: active ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.05)' }}>
        <Icon className="w-7 h-7" style={{ color: active ? '#60a5fa' : 'rgba(255,255,255,0.4)' }} />
      </div>
      <div>
        <p className="text-sm font-black text-white mb-0.5">{title}</p>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{desc}</p>
      </div>
      {active && <CheckCircle2 className="w-5 h-5 text-blue-400" />}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function UploadPage() {
  const navigate = useNavigate()
  const { addToLibrary, state } = useWorkflow()
  const [mode,       setMode]       = useState('single')
  const [files,      setFiles]      = useState([])
  const [uploading,  setUploading]  = useState(false)
  const [library,    setLibrary]    = useState([])
  const [libLoading, setLibLoading] = useState(false)

  // ── Drop zone config per mode ───────────────────────────────────────────
  const isZip    = mode === 'zip'
  const isSingle = mode === 'single'

  const accept = isZip
    ? { 'application/zip': ['.zip'], 'application/x-zip-compressed': ['.zip'] }
    : {
        'application/pdf': ['.pdf'],
        'application/msword': ['.doc'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
        'image/*': ['.png','.jpg','.jpeg','.tiff'],
      }

  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return
    const items = accepted.map(f => ({
      file: f, id: Math.random().toString(36).slice(2), status: 'pending'
    }))
    if (isSingle) setFiles([items[0]])   // single: only keep 1
    else if (isZip) setFiles([items[0]]) // zip: only 1 zip
    else setFiles(prev => {
      // batch: replace duplicates by name
      const existing = new Set(prev.map(x => x.file.name))
      const fresh    = items.filter(i => !existing.has(i.file.name))
      return [...prev, ...fresh]
    })
  }, [isSingle, isZip])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: !isSingle && !isZip,
    accept,
    maxFiles: isSingle || isZip ? 1 : undefined,
  })

  // ── Library ─────────────────────────────────────────────────────────────
  const loadLibrary = async () => {
    setLibLoading(true)
    try {
      const r = await listDocuments()
      setLibrary(r.documents || r || [])
    } catch { /* silent */ }
    finally { setLibLoading(false) }
  }
  useEffect(() => { loadLibrary() }, [])

  const removeFile = (id) => setFiles(f => f.filter(x => x.id !== id))

  // ── Upload + auto-parse ─────────────────────────────────────────────────
  const uploadAll = async () => {
    const pending = files.filter(f => f.status === 'pending')
    if (!pending.length) { toast.error('No files to upload'); return }
    setUploading(true)
    let uploaded = 0

    if (isZip) {
      // ZIP mode — single endpoint that extracts + parses all contained files
      const item = pending[0]
      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'uploading' } : f))
      try {
        const fd = new FormData()
        fd.append('file', item.file)
        const r = await api.post('/api/v1/documents/upload/zip', fd)
        const count = r.data.count || 0
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'done', count } : f))
        toast.success(`${count} file${count !== 1 ? 's' : ''} extracted from ZIP — parsing in background`)
        uploaded = count
        loadLibrary()
      } catch (e) {
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error', error: e.message } : f))
        toast.error('ZIP upload failed: ' + e.message)
      }
    } else {
      // Single / Batch — upload each file individually (auto-parsed in background)
      for (const item of pending) {
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'uploading' } : f))
        try {
          const fd = new FormData()
          fd.append('file', item.file)
          const r = await api.post('/api/v1/documents/upload', fd)
          const doc = r.data
          addToLibrary({ id: doc.id, file_name: item.file.name, status: 'uploaded', file_size: item.file.size })
          setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'done', docId: doc.id } : f))
          uploaded++
        } catch (e) {
          setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error', error: e.message } : f))
        }
      }
      if (uploaded > 0) {
        toast.success(`${uploaded} file${uploaded > 1 ? 's' : ''} uploaded — parsing in background`)
        loadLibrary()
      }
    }

    setUploading(false)
  }

  // Auto-upload when files are dropped (single mode for better UX)
  useEffect(() => {
    if (isSingle && files.length === 1 && files[0].status === 'pending' && !uploading) {
      uploadAll()
    }
  }, [files])

  const pendingCount = files.filter(f => f.status === 'pending').length
  const doneCount    = files.filter(f => f.status === 'done').length
  const errorCount   = files.filter(f => f.status === 'error').length
  const allDone      = files.length > 0 && doneCount === files.length

  // Library display
  const allDocs = library.length > 0 ? library : state.library
  const parsed  = allDocs.filter(d => d.status === 'parsed')

  // ── Dropzone hint text ──────────────────────────────────────────────────
  const dropHint = {
    single: { drag: 'Drop your PDF here', idle: 'Drop one PDF here', types: 'PDF · PNG · JPG · DOCX' },
    batch:  { drag: 'Drop PDFs here',     idle: 'Drop multiple PDFs here', types: 'PDF · PNG · JPG · DOCX — multiple files' },
    zip:    { drag: 'Drop ZIP here',      idle: 'Drop ZIP file here', types: 'ZIP archive containing PDFs' },
  }[mode]

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in">

      {/* Header */}
      <h1 className="text-2xl font-black text-white mb-1">Upload Documents</h1>
      <p className="text-white/40 text-sm mb-6">
        Upload PDF, Word, or image files directly from your computer. Files are parsed automatically.
      </p>

      {/* ── Mode cards ── */}
      <div className="flex gap-4 mb-5">
        <ModeCard icon={FileText} title="Single File"  desc="Upload & parse one document"          active={mode === 'single'} onClick={() => { setMode('single'); setFiles([]) }} />
        <ModeCard icon={Package}  title="Batch Upload" desc="Upload multiple files at once"        active={mode === 'batch'}  onClick={() => { setMode('batch');  setFiles([]) }} />
        <ModeCard icon={Archive}  title="ZIP Folder"   desc="Upload a ZIP — all PDFs extracted"   active={mode === 'zip'}    onClick={() => { setMode('zip');    setFiles([]) }} />
      </div>

      {/* ── Restriction banner ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl mb-4 text-xs font-semibold"
        style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.15)', color: '#93c5fd' }}>
        <span className="text-base">
          {mode === 'single' ? '📄' : mode === 'batch' ? '📦' : '🗜️'}
        </span>
        {mode === 'single' && 'Single file mode — upload one PDF/image at a time. Parses automatically on drop.'}
        {mode === 'batch'  && 'Batch mode — drop or select multiple files. All will be uploaded and parsed in the background.'}
        {mode === 'zip'    && 'ZIP mode — drop one ZIP file. All PDFs inside will be extracted and parsed automatically.'}
      </div>

      {/* ── Drop zone ── */}
      <div {...getRootProps()}
        className="rounded-2xl p-12 text-center cursor-pointer transition-all mb-5"
        style={{
          border: isDragActive ? '2px dashed #2563eb' : '2px dashed rgba(255,255,255,0.1)',
          background: isDragActive ? 'rgba(37,99,235,0.08)' : 'rgba(13,21,38,0.6)',
        }}>
        <input {...getInputProps()} />
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: isDragActive ? 'rgba(37,99,235,0.2)' : 'rgba(255,255,255,0.05)' }}>
          <Upload className="w-8 h-8" style={{ color: isDragActive ? '#60a5fa' : 'rgba(255,255,255,0.3)' }} />
        </div>
        <p className="text-lg font-black text-white mb-1">
          {isDragActive ? dropHint.drag : dropHint.idle}
        </p>
        <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.35)' }}>{dropHint.types}</p>
        <button type="button"
          className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>
          <FolderOpen className="w-4 h-4" /> Browse {mode === 'zip' ? 'ZIP' : mode === 'single' ? 'File' : 'Files'}
        </button>
      </div>

      {/* ── File status list ── */}
      {files.length > 0 && (
        <div className="rounded-2xl overflow-hidden mb-5"
          style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#22d3ee' }}>
                ● {isZip ? 'ZIP FILE' : 'FILES STAGED'}
              </p>
              <p className="text-sm font-bold text-white mt-0.5">
                {files.length} file{files.length > 1 ? 's' : ''}
                {doneCount > 0  && <span className="text-green-400 ml-2">· {doneCount} uploaded ✓</span>}
                {errorCount > 0 && <span className="text-red-400 ml-2">· {errorCount} failed</span>}
                {uploading      && <span className="text-blue-400 ml-2 animate-pulse">· uploading...</span>}
              </p>
            </div>
            {!uploading && <button onClick={() => setFiles([])} className="text-xs text-white/30 hover:text-white/60">Clear</button>}
          </div>

          <div className="divide-y divide-white/[0.04]">
            {files.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: isZip ? 'rgba(245,158,11,0.12)' : 'rgba(37,99,235,0.12)' }}>
                  {isZip ? <Archive className="w-4 h-4 text-yellow-400" /> : <FileText className="w-4 h-4 text-blue-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{item.file.name}</p>
                  <p className="text-xs text-white/30">{formatBytes(item.file.size)}</p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {item.status === 'pending'   && <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>Pending</span>}
                  {item.status === 'uploading' && <div className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" /><span className="text-xs text-blue-400">Uploading</span></div>}
                  {item.status === 'done'      && (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-green-400">{item.count ? `${item.count} files extracted` : 'Uploaded — parsing...'}</span>
                    </div>
                  )}
                  {item.status === 'error'     && <div className="flex items-center gap-1.5"><AlertCircle className="w-4 h-4 text-red-400" /><span className="text-xs text-red-400 truncate max-w-[150px]">{item.error || 'Failed'}</span></div>}
                  {item.status === 'pending' && !uploading && (
                    <button onClick={() => removeFile(item.id)} className="p-1 rounded hover:bg-white/[0.08] text-white/20 hover:text-white/60">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Upload button (batch/zip need manual trigger; single auto-triggers) */}
          {!isSingle && (
            <div className="px-5 py-4 border-t border-white/[0.05] flex gap-3">
              <button onClick={uploadAll} disabled={uploading || pendingCount === 0}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black text-white transition-all disabled:opacity-40 hover:-translate-y-0.5"
                style={{ background: pendingCount > 0 ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.06)' }}>
                {uploading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Uploading & Parsing...</>
                  : isZip
                    ? <><Archive className="w-4 h-4" />Extract & Parse ZIP</>
                    : <><Upload className="w-4 h-4" />Upload {pendingCount} File{pendingCount !== 1 ? 's' : ''} & Parse</>
                }
              </button>
              {allDone && (
                <button onClick={() => navigate('/extract')}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-black text-white transition-all hover:-translate-y-0.5"
                  style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
                  <Zap className="w-4 h-4" /> Extract Now
                </button>
              )}
            </div>
          )}
          {isSingle && allDone && (
            <div className="px-5 py-4 border-t border-white/[0.05]">
              <button onClick={() => navigate('/extract')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black text-white transition-all hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
                <Zap className="w-4 h-4" /> Go to Extract
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Document library ── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#22d3ee' }}>● DOCUMENTS</p>
            <p className="text-sm font-bold text-white mt-0.5">
              {parsed.length} ready to extract · {allDocs.length} total
              {libLoading && <span className="text-blue-400 ml-2 text-xs animate-pulse">Refreshing...</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={loadLibrary} disabled={libLoading}
              className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
              style={{ color: 'rgba(255,255,255,0.4)' }}>
              <RefreshCw className={`w-3.5 h-3.5 ${libLoading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => navigate('/extract')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', color: '#fff' }}>
              <Zap className="w-3 h-3" /> Go to Extract
            </button>
          </div>
        </div>

        {allDocs.length === 0 ? (
          <div className="p-10 text-center">
            <FolderOpen className="w-10 h-10 mx-auto mb-3 text-white/10" />
            <p className="text-white/40 text-sm">No documents yet — upload files above</p>
          </div>
        ) : (
          <>
            <p className="px-5 py-2.5 text-xs text-white/40"
              style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              Click a parsed document to go to Extract
            </p>
            <div className="divide-y divide-white/[0.04] max-h-64 overflow-y-auto">
              {allDocs.slice(0, 50).map(doc => (
                <div key={doc.id}
                  className={`flex items-center gap-3 px-5 py-3 transition-colors ${doc.status === 'parsed' ? 'cursor-pointer hover:bg-white/[0.04]' : ''}`}
                  onClick={() => doc.status === 'parsed' && navigate('/extract')}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: doc.status === 'parsed' ? 'rgba(34,197,94,0.12)' : doc.status === 'parsing' ? 'rgba(251,191,36,0.1)' : 'rgba(37,99,235,0.1)' }}>
                    <FileText className="w-3.5 h-3.5" style={{ color: doc.status === 'parsed' ? '#34d399' : doc.status === 'parsing' ? '#fbbf24' : '#60a5fa' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{doc.file_name || doc.filename}</p>
                    <p className="text-[10px] text-white/30">{doc.file_size ? formatBytes(doc.file_size) : ''}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0"
                    style={{
                      background: doc.status === 'parsed' ? 'rgba(34,197,94,0.12)' : doc.status === 'parsing' ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.06)',
                      color: doc.status === 'parsed' ? '#34d399' : doc.status === 'parsing' ? '#fbbf24' : 'rgba(255,255,255,0.4)',
                    }}>
                    {doc.status || 'uploaded'}
                    {doc.status === 'parsing' && ' ⟳'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Discover tip */}
      <div className="mt-5 rounded-2xl px-5 py-4"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-sm font-bold text-yellow-400 mb-1">💡 Looking for documents from a website?</p>
        <p className="text-xs text-white/40 mb-2">
          Use the <strong className="text-white">Discover</strong> feature to automatically crawl any manufacturer or supplier website and find all available PDFs.
        </p>
        <button onClick={() => navigate('/discover')}
          className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors">
          Go to Discover <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
