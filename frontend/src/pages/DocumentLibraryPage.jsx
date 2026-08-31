/**
 * DocumentLibraryPage
 * TOP: 3 upload cards side by side (Single File | Batch Upload | ZIP Folder)
 *      clicking a card shows its dropzone below — exactly like Extract page
 * BOTTOM: full document table with search, filter, all actions
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import {
  RefreshCw, Trash2, Zap, Search, FileText, ArrowRight,
  Eye, Upload, Package, Archive, Loader2, FolderOpen,
  CheckCircle2, AlertCircle, X, ChevronDown, Globe
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useWorkflow } from '../lib/store'
import { listDocuments, deleteDocument } from '../lib/api'
import api from '../lib/api'
import { formatBytes, statusBadge } from '../lib/utils'
import DocumentViewer from '../components/DocumentViewer'
import { isGuest, isAdmin, getGuestLimits, refreshGuestUsage } from '../lib/auth'

// ─────────────────────────────────────────────────────────────────────────────
// Drop zone shown below the selected card
// ─────────────────────────────────────────────────────────────────────────────
function ActiveDropZone({ mode, onUploaded }) {
  const [staged,    setStaged]    = useState([])
  const [uploading, setUploading] = useState(false)

  const isZip   = mode === 'zip'
  const isBatch = mode === 'batch'

  const accept = isZip
    ? { 'application/zip': ['.zip'], 'application/x-zip-compressed': ['.zip'] }
    : { 'application/pdf': ['.pdf'], 'application/msword': ['.doc'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
        'image/*': ['.png', '.jpg', '.jpeg'] }

  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return
    const items = accepted.map(f => ({ file: f, id: Math.random().toString(36).slice(2), status: 'pending' }))
    if (!isBatch) setStaged([items[0]])
    else setStaged(prev => {
      const existing = new Set(prev.map(x => x.file.name))
      return [...prev, ...items.filter(i => !existing.has(i.file.name))]
    })
  }, [isBatch])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: isBatch, accept, maxFiles: isBatch ? undefined : 1,
  })

  // Single file: auto-upload immediately on drop
  useEffect(() => {
    if (!isBatch && !isZip && staged.length === 1 && staged[0].status === 'pending' && !uploading) {
      doUpload()
    }
  }, [staged]) // eslint-disable-line

  const doUpload = async () => {
    const pending = staged.filter(f => f.status === 'pending')
    if (!pending.length) return
    setUploading(true)
    let uploaded = 0

    if (isZip) {
      const item = pending[0]
      setStaged(prev => prev.map(f => f.id === item.id ? { ...f, status: 'uploading' } : f))
      try {
        const fd = new FormData(); fd.append('file', item.file)
        const r  = await api.post('/api/v1/documents/upload/zip', fd)
        const count = r.data.count || 0
        setStaged(prev => prev.map(f => f.id === item.id ? { ...f, status: 'done', count } : f))
        toast.success(`${count} file${count !== 1 ? 's' : ''} extracted from ZIP`)
        uploaded = count
      } catch (e) {
        setStaged(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error' } : f))
        toast.error('ZIP failed: ' + e.message)
      }
    } else if (isBatch) {
      // Use the batch endpoint — backend always saves upload_source='batch'
      setStaged(prev => prev.map(f => ({ ...f, status: 'uploading' })))
      try {
        const fd = new FormData()
        pending.forEach(item => fd.append('files', item.file))
        const r = await api.post('/api/v1/documents/upload/batch', fd)
        const count = r.data.count || r.data.documents?.length || pending.length
        setStaged(prev => prev.map(f => ({ ...f, status: 'done' })))
        toast.success(`${count} file${count !== 1 ? 's' : ''} uploaded — parsing...`)
        uploaded = count
      } catch (e) {
        setStaged(prev => prev.map(f => ({ ...f, status: 'error' })))
        toast.error('Batch upload failed: ' + e.message)
      }
    } else {
      // Single file upload
      for (const item of pending) {
        setStaged(prev => prev.map(f => f.id === item.id ? { ...f, status: 'uploading' } : f))
        try {
          const fd = new FormData(); fd.append('file', item.file)
          await api.post(`/api/v1/documents/upload?upload_source=${mode}`, fd)
          setStaged(prev => prev.map(f => f.id === item.id ? { ...f, status: 'done' } : f))
          uploaded++
        } catch (e) {
          setStaged(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error' } : f))
        }
      }
      if (uploaded > 0) toast.success(`${uploaded} file${uploaded > 1 ? 's' : ''} uploaded — parsing...`)
    }

    setUploading(false)
    if (uploaded > 0) {
      setTimeout(() => onUploaded(), 1500)
      setTimeout(() => onUploaded(), 4000)
    }
  }

  const pendingCount = staged.filter(f => f.status === 'pending').length

  return (
    <div className="rounded-2xl p-5 mt-3" style={{ background: 'rgba(8,13,28,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Drop area */}
      <div {...getRootProps()}
        className="rounded-xl p-8 text-center cursor-pointer transition-all"
        style={{
          border: isDragActive ? '2px dashed #3b82f6' : '2px dashed rgba(255,255,255,0.1)',
          background: isDragActive ? 'rgba(37,99,235,0.06)' : 'rgba(255,255,255,0.01)',
        }}>
        <input {...getInputProps()} />
        {uploading
          ? <Loader2 className="mx-auto w-10 h-10 animate-spin mb-3 text-blue-400" />
          : <Upload className="mx-auto w-10 h-10 mb-3" style={{ color: isDragActive ? '#3b82f6' : 'rgba(255,255,255,0.2)' }} />}
        <p className="text-sm font-bold text-white mb-1">
          {uploading ? 'Uploading...' : isDragActive ? 'Drop here!'
            : isZip    ? 'Drop ZIP file here'
            : isBatch  ? 'Drop multiple files here'
            : 'Drop one PDF here'}
        </p>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {isZip   ? 'ZIP archive — all PDFs extracted automatically'
            : isBatch ? 'PDF · PNG · JPG · DOCX · XLSX'
            : 'PDF · PNG · JPG · DOCX · XLSX'}
        </p>
      </div>

      {/* Staged files */}
      {staged.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {staged.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <FileText className="w-4 h-4 shrink-0 text-blue-400" />
              <span className="text-sm text-white flex-1 truncate">{item.file.name}</span>
              <span className="text-xs shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }}>{formatBytes(item.file.size)}</span>
              {item.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />}
              {item.status === 'done'      && <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
              {item.status === 'error'     && <AlertCircle  className="w-4 h-4 text-red-400 shrink-0" />}
              {item.status === 'pending' && !uploading && (
                <button onClick={() => setStaged(s => s.filter(x => x.id !== item.id))}
                  className="p-0.5 rounded hover:bg-white/[0.08] text-white/25 hover:text-white/60">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}

          {/* Upload button for batch / zip */}
          {(isBatch || isZip) && pendingCount > 0 && (
            <button onClick={doUpload} disabled={uploading}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black text-white disabled:opacity-40 transition-all hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
              {isZip
                ? <><Archive className="w-4 h-4" /> Extract & Parse ZIP</>
                : <><Upload className="w-4 h-4" /> Upload {pendingCount} File{pendingCount !== 1 ? 's' : ''}</>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch group — collapsible sub-section for one batch upload session
// ─────────────────────────────────────────────────────────────────────────────
function BatchGroup({ batchNum, batchId, docs, sel, set, toggleDoc, deleteDocs, navigate, setViewingDocId, sendToExtract, fetchDocs, groupLabel = 'Batch' }) {
  const [open, setOpen] = useState(true)
  const uploadedAt = docs[0]?.created_at
    ? new Date(docs[0].created_at).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true, timeZone:'Asia/Kolkata' })
    : null

  const allSel = docs.every(d => sel.includes(d.id))

  return (
    <div className="rounded-xl overflow-hidden mb-3"
      style={{ border: '1px solid rgba(167,139,250,0.2)', background: 'rgba(124,58,237,0.04)' }}>

      {/* Group header */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
        style={{ borderBottom: open ? '1px solid rgba(167,139,250,0.12)' : 'none' }}>

        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-black"
          style={{ background: 'rgba(167,139,250,0.18)', color: '#c4b5fd' }}>
          {batchNum}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">
            {groupLabel} {batchNum}
            <span className="ml-2 text-[10px] font-normal" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {docs.length} file{docs.length !== 1 ? 's' : ''}
              {docs.filter(d => d.status === 'parsed').length > 0 &&
                ` · ${docs.filter(d => d.status === 'parsed').length} parsed`}
            </span>
          </p>
          {uploadedAt && (
            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Uploaded {uploadedAt}
            </p>
          )}
        </div>

        {/* Select all in batch */}
        <input type="checkbox" className="checkbox"
          checked={allSel}
          onClick={e => e.stopPropagation()}
          onChange={() => {
            const ids = docs.map(d => d.id)
            if (allSel) set({ selectedDocIds: sel.filter(i => !ids.includes(i)) })
            else set({ selectedDocIds: [...new Set([...sel, ...ids])] })
          }} />

        {/* Extract batch */}
        {docs.some(d => sel.includes(d.id)) && (
          <button onClick={e => { e.stopPropagation(); sendToExtract() }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all"
            style={{ background: 'rgba(167,139,250,0.15)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.25)' }}>
            <Zap className="w-3 h-3" /> Extract
          </button>
        )}

        <ChevronDown className="w-4 h-4 shrink-0 transition-transform"
          style={{ color: 'rgba(255,255,255,0.3)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </div>

      {/* Files table */}
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <th className="w-10 px-4 py-2.5 text-center" />
                {['Document', 'Size', 'Pages', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider"
                    style={{ color: 'rgba(255,255,255,0.3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map(doc => {
                const isSel = sel.includes(doc.id)
                return (
                  <tr key={doc.id}
                    className="cursor-pointer transition-colors hover:bg-white/[0.025]"
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: isSel ? 'rgba(124,58,237,0.1)' : undefined,
                    }}
                    onClick={() => toggleDoc(doc.id)}>

                    <td className="px-4 py-3 text-center" onClick={e => { e.stopPropagation(); toggleDoc(doc.id) }}>
                      <input type="checkbox" className="checkbox" checked={isSel} readOnly />
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(167,139,250,0.15)' }}>
                          <FileText className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate max-w-xs">{doc.file_name}</div>
                          <div className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>{doc.id?.slice(0, 14)}…</div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{formatBytes(doc.file_size)}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{doc.page_count || '—'}</td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`badge ${statusBadge(doc.status)}`}>{doc.status}</span>
                        {(doc.status === 'parsing' || doc.status === 'uploaded') && (
                          <div className="w-3 h-3 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button title="View" onClick={() => setViewingDocId(doc.id)}
                          className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
                          style={{ color: 'rgba(255,255,255,0.35)' }}>
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button title="Extract" onClick={() => { set({ selectedDocIds: [doc.id] }); navigate('/extract') }}
                          className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
                          style={{ color: 'rgba(255,255,255,0.35)' }}>
                          <Zap className="w-3.5 h-3.5" />
                        </button>
                        <button title="Delete" onClick={() => deleteDocs([doc.id])}
                          className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
                          style={{ color: 'rgba(255,255,255,0.35)' }}>
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
  )
}
export default function DocumentLibraryPage() {
  const navigate = useNavigate()
  const { state, set, removeFromLibrary, toggleDoc, goToStep } = useWorkflow()

  const [loading,      setLoading]      = useState(false)
  const [search,       setSearch]       = useState('')
  const [statusF,      setStatusF]      = useState('ALL')
  const [viewingDocId, setViewingDocId] = useState(null)
  const [activeMode,   setActiveMode]   = useState('single') // which upload card is selected

  // Guest upload permission
  const guestLimits        = getGuestLimits()
  const guestUploadAllowed = isAdmin() ? true : (guestLimits?.uploadAllowed || false)

  useEffect(() => {
    if (isGuest()) refreshGuestUsage().catch(() => {})
  }, [])

  const docs       = state.library
  const sel        = state.selectedDocIds
  const libraryRef = useRef(state.library)
  useEffect(() => { libraryRef.current = state.library }, [state.library])

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    try {
      const data    = await listDocuments()
      const fromApi = data.documents || []
      const apiIds  = new Set(fromApi.map(d => d.id))
      const inMem   = libraryRef.current.filter(d => !apiIds.has(d.id))
      set({ library: [...fromApi, ...inMem] })
    } catch (e) { toast.error('Failed to load library: ' + e.message) }
    finally { setLoading(false) }
  }, [set])

  useEffect(() => {
    fetchDocs()
    const t1 = setTimeout(() => fetchDocs(), 1000)
    const t2 = setTimeout(() => fetchDocs(), 3000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [fetchDocs])

  useEffect(() => {
    window.addEventListener('focus', fetchDocs)
    return () => window.removeEventListener('focus', fetchDocs)
  }, [fetchDocs])

  useEffect(() => {
    const needsPoll = docs.some(d => d.status === 'parsing' || d.status === 'uploaded')
    if (!needsPoll) return
    const iv = setInterval(fetchDocs, 4000)
    return () => clearInterval(iv)
  }, [docs, fetchDocs])

  const filtered = docs.filter(d => {
    const matchS    = !search || d.file_name?.toLowerCase().includes(search.toLowerCase())
    const matchF    = statusF === 'ALL' || d.status === statusF
    // Only show files that belong to the currently selected upload mode
    const matchMode = (d.upload_source || 'single') === activeMode
    return matchS && matchF && matchMode
  })

  const deleteDocs = async (ids) => {
    if (!window.confirm(`Delete ${ids.length} document(s)?`)) return
    for (const id of ids) { try { await deleteDocument(id); removeFromLibrary(id) } catch {} }
    set({ selectedDocIds: sel.filter(i => !ids.includes(i)) })
    toast.success(`Deleted ${ids.length} document(s)`)
  }

  const sendToExtract = () => {
    if (sel.length === 0) { toast.error('Select documents first'); return }
    goToStep(8); navigate('/extract')
  }

  const statuses = ['ALL', ...new Set(docs.map(d => d.status).filter(Boolean))]

  // Upload mode cards config — same style as Extract page
  const MODES = [
    {
      id:   'single',
      icon: FileText,
      label: 'Single File',
      desc:  'Upload & extract one document',
    },
    {
      id:   'batch',
      icon: Package,
      label: 'Batch Upload',
      desc:  'Upload multiple PDFs at once',
    },
    {
      id:   'zip',
      icon: Archive,
      label: 'ZIP Folder',
      desc:  'Upload a ZIP containing PDFs',
    },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      {viewingDocId && <DocumentViewer docId={viewingDocId} onClose={() => setViewingDocId(null)} />}

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">Document Library</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {docs.length} total · {docs.filter(d => d.status === 'parsed').length} parsed
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={fetchDocs} disabled={loading} className="btn btn-secondary gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={async () => {
            if (!window.confirm(`Re-parse all ${docs.length} documents?`)) return
            let count = 0
            for (const d of docs) { try { await api.post(`/api/v1/documents/${d.id}/reparse`); count++ } catch {} }
            toast.success(`Re-parsing ${count} document(s)`)
          }} className="btn btn-secondary gap-2">↺ Re-parse All</button>
          {sel.length > 0 && (
            <button onClick={sendToExtract} className="btn btn-primary gap-2">
              <Zap className="w-3.5 h-3.5" /> Extract {sel.length} Selected
            </button>
          )}
        </div>
      </div>

      {/* ── 3 upload mode cards side by side ── */}
      {(isAdmin() || guestUploadAllowed) && (
        <div className="mb-2">
          <div className="grid grid-cols-3 gap-4">
            {MODES.map(m => {
              const active = activeMode === m.id
              const count  = docs.filter(d => (d.upload_source || 'single') === m.id).length
              return (
                <button key={m.id} onClick={() => setActiveMode(m.id)}
                  className="flex flex-col items-center gap-2 rounded-2xl p-4 text-center transition-all hover:-translate-y-0.5"
                  style={{
                    background: active
                      ? 'linear-gradient(135deg,rgba(37,99,235,0.25),rgba(124,58,237,0.2))'
                      : 'rgba(13,21,38,0.8)',
                    border: active
                      ? '1px solid rgba(37,99,235,0.5)'
                      : '1px solid rgba(255,255,255,0.08)',
                    boxShadow: active ? '0 0 24px rgba(37,99,235,0.2)' : 'none',
                  }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: active ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.06)' }}>
                    <m.icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-white">{m.label}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{m.desc}</p>
                  </div>
                  {count > 0 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: active ? 'rgba(255,255,255,0.2)' : 'rgba(37,99,235,0.2)', color: active ? '#fff' : '#60a5fa' }}>
                      {count} file{count !== 1 ? 's' : ''}
                    </span>
                  )}
                  {active && count === 0 && (
                    <div className="w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.5)' }}>
                      <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Drop zone for active mode */}
          <ActiveDropZone key={activeMode} mode={activeMode} onUploaded={fetchDocs} />
        </div>
      )}

      {/* Guest — no upload permission */}
      {isGuest() && !guestUploadAllowed && (
        <div className="mb-6 rounded-2xl p-4 flex items-center gap-3"
          style={{ background: 'rgba(124,58,237,0.07)', border: '1px dashed rgba(124,58,237,0.3)' }}>
          <span className="text-lg">🔒</span>
          <div>
            <p className="text-sm font-bold" style={{ color: '#c4b5fd' }}>Upload requires admin permission</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Use <button onClick={() => navigate('/discover')} className="underline text-blue-400">Discover</button> to fetch PDFs from websites instead.
            </p>
          </div>
        </div>
      )}

      {/* ── Search + filter toolbar ── */}
      <div className="flex flex-wrap gap-3 mb-4 mt-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input className="input pl-8 py-2 text-sm" placeholder="Search documents..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="select text-sm py-2" value={statusF} onChange={e => setStatusF(e.target.value)}>
          {statuses.map(s => <option key={s} value={s}>{s === 'ALL' ? 'All Status' : s}</option>)}
        </select>
        {sel.length > 0 && (
          <button onClick={() => deleteDocs(sel)} className="btn btn-danger gap-1.5 text-sm" style={{ padding: '8px 14px' }}>
            <Trash2 className="w-3.5 h-3.5" /> Delete {sel.length}
          </button>
        )}
      </div>

      {/* ── Full document table / batch groups ── */}
      {loading && docs.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-8 h-8 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin mx-auto mb-3" />
          <div className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading library...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <FolderOpen className="w-12 h-12 mx-auto mb-4 text-white/10" />
          <p className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>No {activeMode} files yet</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
            {activeMode === 'single'   ? 'Drop a single file above to upload'
              : activeMode === 'batch'   ? 'Drop multiple files above to batch upload'
              : activeMode === 'zip'     ? 'Drop a ZIP file above to extract PDFs'
              : 'No PDFs discovered yet — use Discover page to fetch PDFs from websites'}
          </p>
        </div>
      ) : (activeMode === 'batch') ? (
        /* ── Batch mode: group by batch_id / session ── */
        (() => {
          // Group docs by batch_id.
          // For old docs without batch_id, group by upload minute (same minute = same session)
          const groups = []
          const seen = new Map()
          filtered.forEach(doc => {
            let key
            if (doc.batch_id) {
              key = doc.batch_id
            } else {
              key = doc.created_at
                ? new Date(doc.created_at).toISOString().slice(0, 16)
                : doc.id
            }
            if (!seen.has(key)) {
              seen.set(key, groups.length)
              groups.push({ batchId: key, docs: [doc] })
            } else {
              groups[seen.get(key)].docs.push(doc)
            }
          })
          // Sort groups newest first
          groups.sort((a, b) => {
            const ta = new Date(a.docs[0]?.created_at || 0).getTime()
            const tb = new Date(b.docs[0]?.created_at || 0).getTime()
            return tb - ta
          })
          const groupLabel = 'Batch'
          return (
            <div>
              {groups.map((g, i) => (
                <BatchGroup
                  key={g.batchId}
                  batchNum={groups.length - i}
                  batchId={g.batchId}
                  docs={g.docs}
                  sel={sel}
                  set={set}
                  toggleDoc={toggleDoc}
                  deleteDocs={deleteDocs}
                  navigate={navigate}
                  setViewingDocId={setViewingDocId}
                  sendToExtract={sendToExtract}
                  fetchDocs={fetchDocs}
                  groupLabel={groupLabel}
                />
              ))}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {groups.length} {groupLabel.toLowerCase()}{groups.length !== 1 ? 'es' : ''} · {filtered.length} files · {sel.length} selected
                  {docs.some(d => d.status === 'parsing') && <span className="ml-2 text-yellow-400 animate-pulse">⟳ Parsing...</span>}
                </span>
                {sel.length > 0 && (
                  <button onClick={sendToExtract} className="btn btn-primary gap-2 text-sm">
                    <Zap className="w-3.5 h-3.5" /> Extract {sel.length} Selected <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )
        })()
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <th className="w-10 px-4 py-3 text-center">
                    <input type="checkbox" className="checkbox"
                      checked={filtered.length > 0 && filtered.every(d => sel.includes(d.id))}
                      onChange={() => {
                        const ids = filtered.map(d => d.id)
                        const allIn = ids.every(id => sel.includes(id))
                        if (allIn) set({ selectedDocIds: sel.filter(i => !ids.includes(i)) })
                        else set({ selectedDocIds: [...new Set([...sel, ...ids])] })
                      }} />
                  </th>
                  {['Document', 'Type', 'Size', 'Pages', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider"
                      style={{ color: 'rgba(255,255,255,0.35)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(doc => {
                  const isSel = sel.includes(doc.id)
                  const src   = doc.upload_source || 'single'
                  // colour per upload type
                  const srcClr = src === 'batch'    ? '#a78bfa'
                               : src === 'zip'      ? '#fbbf24'
                               : src === 'discover' ? '#34d399'
                               : '#60a5fa'
                  return (
                    <tr key={doc.id}
                      className="cursor-pointer transition-colors hover:bg-white/[0.025]"
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: isSel ? 'rgba(37,99,235,0.07)' : undefined,
                      }}
                      onClick={() => toggleDoc(doc.id)}>

                      <td className="px-4 py-3 text-center" onClick={e => { e.stopPropagation(); toggleDoc(doc.id) }}>
                        <input type="checkbox" className="checkbox" checked={isSel} readOnly />
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `${srcClr}18` }}>
                            <FileText className="w-4 h-4" style={{ color: srcClr }} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-white truncate max-w-xs">{doc.file_name}</div>
                            <div className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
                              {doc.id?.slice(0, 16)}…
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Type badge */}
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                          style={{ background: `${srcClr}18`, color: srcClr, border: `1px solid ${srcClr}30` }}>
                          {src === 'discover' ? 'crawl' : src}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        {formatBytes(doc.file_size)}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        {doc.page_count || '—'}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`badge ${statusBadge(doc.status)}`}>{doc.status}</span>
                          {(doc.status === 'parsing' || doc.status === 'uploaded') && (
                            <div className="w-3 h-3 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button title="View"
                            onClick={() => setViewingDocId(doc.id)}
                            className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
                            style={{ color: 'rgba(255,255,255,0.35)' }}>
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button title="Extract"
                            onClick={() => { set({ selectedDocIds: [doc.id] }); navigate('/extract') }}
                            className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
                            style={{ color: 'rgba(255,255,255,0.35)' }}>
                            <Zap className="w-3.5 h-3.5" />
                          </button>
                          <button title="Delete"
                            onClick={() => deleteDocs([doc.id])}
                            className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
                            style={{ color: 'rgba(255,255,255,0.35)' }}>
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

          {/* Table footer */}
          <div className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {filtered.length} {activeMode} file{filtered.length !== 1 ? 's' : ''} · {sel.length} selected
              {docs.some(d => d.status === 'parsing') && (
                <span className="ml-2 text-yellow-400 animate-pulse">⟳ Parsing...</span>
              )}
            </span>
            {sel.length > 0 && (
              <button onClick={sendToExtract} className="btn btn-primary gap-2 text-sm">
                <Zap className="w-3.5 h-3.5" /> Extract {sel.length} Selected
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
