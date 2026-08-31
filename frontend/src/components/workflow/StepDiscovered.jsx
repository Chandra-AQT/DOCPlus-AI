import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CheckSquare, Square, ExternalLink, Download, Send, ArrowRight, Eye, Lock, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useWorkflow } from '../../lib/store'
import { sendToDoclens, getFileProxyUrl, logGuestActivity } from '../../lib/api'
import { docTypeBadge, formatBadge } from '../../lib/utils'
import { isGuest, isAdmin, getGuestLimits, canFetchPdf, refreshGuestUsage } from '../../lib/auth'
import api from '../../lib/api'

// ── Inline PDF viewer using PDF.js ────────────────────────────────────────────
function PdfJsViewer({ url }) {
  const canvasRef = useRef(null)
  const [pdfDoc,  setPdfDoc]  = useState(null)
  const [page,    setPage]    = useState(1)
  const [total,   setTotal]   = useState(1)
  const [scale,   setScale]   = useState(1.3)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!url) return
    setLoading(true); setError(null); setPage(1)
    const load = async () => {
      try {
        if (!window.pdfjsLib) {
          await new Promise((res, rej) => {
            const s = document.createElement('script')
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
            s.onload = () => {
              window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
              res()
            }
            s.onerror = rej
            document.head.appendChild(s)
          })
        }
        const pdf = await window.pdfjsLib.getDocument({ url, withCredentials: false }).promise
        setPdfDoc(pdf); setTotal(pdf.numPages); setLoading(false)
      } catch (e) { setError(e.message); setLoading(false) }
    }
    load()
  }, [url])

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    pdfDoc.getPage(page).then(pg => {
      // Use the page's natural viewport — PDF.js handles rotation correctly
      const vp = pg.getViewport({ scale })
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      canvas.width  = Math.floor(vp.width)
      canvas.height = Math.floor(vp.height)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      // Reset any inherited canvas transforms
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      pg.render({ canvasContext: ctx, viewport: vp }).promise?.catch(() => {})
    }).catch(() => {})
  }, [pdfDoc, page, scale])

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
    </div>
  )
  if (error) return (
    <div className="flex-1 flex items-center justify-center flex-col gap-3">
      <p className="text-red-400 text-sm">Could not load PDF</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-xs underline">Open directly →</a>
    </div>
  )
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Controls */}
      <div className="flex items-center gap-3 px-4 py-2 shrink-0"
        style={{background:'rgba(255,255,255,0.03)', borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
        <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1}
          className="p-1 rounded hover:bg-white/[0.08] disabled:opacity-30 text-white/50">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs text-white/50 tabular-nums">{page} / {total}</span>
        <button onClick={() => setPage(p => Math.min(total, p+1))} disabled={page >= total}
          className="p-1 rounded hover:bg-white/[0.08] disabled:opacity-30 text-white/50">
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <button onClick={() => setScale(s => Math.max(0.5, +(s-0.2).toFixed(1)))}
          className="p-1 rounded hover:bg-white/[0.08] text-white/50"><ZoomOut className="w-3.5 h-3.5" /></button>
        <span className="text-[10px] text-white/30 w-9 text-center tabular-nums">{Math.round(scale*100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, +(s+0.2).toFixed(1)))}
          className="p-1 rounded hover:bg-white/[0.08] text-white/50"><ZoomIn className="w-3.5 h-3.5" /></button>
      </div>
      {/* Canvas */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-4" style={{background:'#1a2035'}}>
        <canvas ref={canvasRef} className="block rounded shadow-2xl"
          style={{maxWidth:'100%', direction:'ltr', transform:'none'}} />
      </div>
    </div>
  )
}

export default function StepDiscovered() {
  const navigate = useNavigate()
  const { state, set, togglePdf, addToLibrary, goToStep } = useWorkflow()
  const clearPdfSelection = () => set({ selectedPdfs: [] })
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('ALL')
  const [filterFmt, setFilterFmt] = useState('ALL')
  const [sending, setSending] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)

  // Guest limit state
  const guestMode = isGuest()
  const guestLimits = guestMode ? getGuestLimits() : null
  const pdfRemaining = guestLimits ? guestLimits.pdfRemaining : Infinity
  const pdfFetched   = guestLimits ? guestLimits.pdfFetched   : 0
  const pdfLimit     = guestLimits ? guestLimits.pdfLimit      : 5

  const pdfs = state.discoveredPdfs
  const sel  = state.selectedPdfs

  const docTypes = ['ALL', ...new Set(pdfs.map(p => p.doc_type))]
  const formats  = ['ALL', ...new Set(pdfs.map(p => p.format))]

  const filtered = pdfs.filter(p => {
    const matchSearch = !search || p.filename?.toLowerCase().includes(search.toLowerCase()) || p.url?.toLowerCase().includes(search.toLowerCase())
    const matchType   = filterType === 'ALL' || p.doc_type === filterType
    const matchFmt    = filterFmt  === 'ALL' || p.format   === filterFmt
    return matchSearch && matchType && matchFmt
  })

  const allSelected = filtered.length > 0 && filtered.every(p => sel.find(s => s.url === p.url))

  // Guest-aware select: cap at remaining limit
  const toggleAll = () => {
    if (allSelected) {
      clearPdfSelection()
    } else if (guestMode) {
      // Only allow selecting up to the remaining limit
      const canSelect = Math.max(0, pdfRemaining)
      if (canSelect === 0) {
        toast.error(`Trial limit reached — you've used all ${pdfLimit} PDF fetches.`)
        return
      }
      const toAdd = filtered.filter(p => !sel.find(s => s.url === p.url)).slice(0, canSelect)
      toAdd.forEach(p => togglePdf(p))
      if (filtered.length > canSelect + sel.length) {
        toast(`Guest trial: selected ${toAdd.length + sel.length} of ${pdfLimit} allowed`, { icon: '⚡' })
      }
    } else {
      filtered.forEach(p => { if (!sel.find(s => s.url === p.url)) togglePdf(p) })
    }
  }

  // Guest-aware single toggle
  const handleToggle = (pdf) => {
    const isSelected = !!sel.find(s => s.url === pdf.url)
    if (!isSelected && guestMode && sel.length >= pdfRemaining) {
      toast.error(`Trial limit: you can only fetch ${pdfLimit} PDFs total. ${pdfFetched} already fetched.`)
      return
    }
    togglePdf(pdf)
  }

  const sendSelected = async () => {
    if (sel.length === 0) { toast.error('Select at least one document'); return }

    // Guest limit check
    if (guestMode) {
      const currentLimits = getGuestLimits()
      if (!currentLimits || currentLimits.pdfRemaining <= 0) {
        toast.error(`Trial limit reached. You've used all ${pdfLimit} PDF fetches. Contact admin for more access.`)
        return
      }
      if (sel.length > currentLimits.pdfRemaining) {
        toast.error(`You can only fetch ${currentLimits.pdfRemaining} more PDF(s). Deselect ${sel.length - currentLimits.pdfRemaining} document(s).`)
        return
      }
    }

    setSending(true)
    try {
      const urls = sel.map(p => p.url)
      const loadingToast = toast.loading(`Sending ${urls.length} document(s) to library...`)
      const res = await sendToDoclens(urls)
      toast.dismiss(loadingToast)

      if (res.total_created > 0) {
        // If guest, increment the PDF fetch counter on the backend
        if (guestMode) {
          const token = localStorage.getItem('docplus_guest') 
            ? JSON.parse(localStorage.getItem('docplus_guest'))?.session_token 
            : null
          if (token) {
            try {
              // Increment by number of docs actually created
              for (let i = 0; i < res.total_created; i++) {
                await api.post('/guests/increment-pdf-fetch', {}, {
                  headers: { 'X-Guest-Token': token }
                })
              }
              // Refresh local usage
              await refreshGuestUsage()
            } catch (err) {
              console.warn('Could not update guest PDF counter:', err.message)
            }
          }
        }

        // Add to in-memory store immediately for instant UI feedback
        res.created.forEach(doc => addToLibrary({
          id: doc.doc_id,
          file_name: doc.filename,
          status: 'uploaded',
          source_url: doc.url,
          file_size: doc.size || 0,
          page_count: null,
        }))
        // Log activity for each fetched PDF
        if (guestMode) {
          res.created.forEach(doc => logGuestActivity('pdf_fetch', doc.filename || doc.url))
        }
        goToStep(6)
        toast.success(`✓ ${res.total_created} document(s) added to library!`)
        // Navigate to library after short delay so user sees the success toast
        setTimeout(() => navigate('/library'), 1200)
      } else {
        toast.error('No documents were added. ' + (res.failed?.[0]?.error || ''))
      }
      if (res.total_failed > 0) {
        toast.error(`${res.total_failed} document(s) failed to download`)
      }
    } catch (e) {
      toast.error('Failed: ' + e.message)
      console.error('sendToDoclens error:', e)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      {/* Guest trial limit banner */}
      {guestMode && (
        <div className="px-6 py-3 flex items-center justify-between text-xs"
          style={{
            background: pdfRemaining === 0 ? 'rgba(239,68,68,0.08)' : 'rgba(37,99,235,0.07)',
            borderBottom: `1px solid ${pdfRemaining === 0 ? 'rgba(239,68,68,0.2)' : 'rgba(37,99,235,0.15)'}`,
          }}>
          <div className="flex items-center gap-2">
            {pdfRemaining === 0
              ? <><Lock className="w-3.5 h-3.5 text-red-400" /><span className="font-bold text-red-400">PDF fetch limit reached</span></>
              : <><span className="text-blue-400">⚡</span><span className="text-white/60">Trial PDF Fetch:</span></>
            }
            {pdfRemaining > 0 && (
              <span>
                <strong className="text-white">{pdfFetched}</strong>
                <span className="text-white/30"> / </span>
                <strong className="text-white">{pdfLimit}</strong>
                <span className="text-white/40"> used · </span>
                <strong style={{color: pdfRemaining <= 1 ? '#fbbf24' : '#34d399'}}>{pdfRemaining} remaining</strong>
              </span>
            )}
          </div>
          {pdfRemaining === 0 && (
            <span className="text-red-300/70">Contact admin to increase limit</span>
          )}
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black text-white"
              style={{background:'linear-gradient(135deg,#2563eb,#7c3aed)'}}>5</div>
            <div>
              <div className="font-bold text-white">Discovered Documents</div>
              <div className="text-xs text-white/40">{pdfs.length} found · {sel.length} selected
                {guestMode && pdfRemaining > 0 && <span className="ml-2" style={{color:'#60a5fa'}}>· select up to {pdfRemaining} more</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sel.length > 0 && (
              <button onClick={sendSelected} disabled={sending || (guestMode && pdfRemaining === 0)}
                className="btn btn-primary gap-2 text-sm"
                style={{padding:'8px 16px'}}>
                {sending
                  ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending...</>
                  : <><Send className="w-3 h-3" />Send {sel.length} to Library</>
                }
              </button>
            )}
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input className="input pl-8 py-2 text-xs" placeholder="Search filename or URL..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="select text-xs py-2" value={filterType} onChange={e => setFilterType(e.target.value)}>
            {docTypes.map(t => <option key={t} value={t}>{t === 'ALL' ? 'All Types' : t}</option>)}
          </select>
          <select className="select text-xs py-2" value={filterFmt} onChange={e => setFilterFmt(e.target.value)}>
            {formats.map(f => <option key={f} value={f}>{f === 'ALL' ? 'All Formats' : f.toUpperCase()}</option>)}
          </select>
          <button onClick={toggleAll} className="btn btn-secondary gap-1.5 text-xs" style={{padding:'8px 12px'}}>
            {allSelected ? <><CheckSquare className="w-3.5 h-3.5" />Deselect All</> : <><Square className="w-3.5 h-3.5" />Select All</>}
          </button>
        </div>
      </div>

      {/* PDF Preview Modal — PDF.js canvas renderer */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{background:'rgba(0,0,0,0.85)', backdropFilter:'blur(8px)'}}>
          <div className="w-full max-w-4xl h-[85vh] rounded-2xl overflow-hidden flex flex-col"
            style={{background:'#0f172a', border:'1px solid rgba(255,255,255,0.1)'}}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 shrink-0 border-b border-white/[0.06]">
              <span className="text-sm font-bold text-white truncate max-w-xs">{decodeURIComponent(previewUrl.split('/').pop().split('?')[0])}</span>
              <div className="flex gap-2">
                <a href={getFileProxyUrl(previewUrl)} target="_blank" rel="noopener noreferrer"
                  className="btn btn-secondary gap-1.5 text-xs" style={{padding:'6px 12px'}}>
                  <Download className="w-3 h-3" /> Open
                </a>
                <button onClick={() => setPreviewUrl(null)} className="btn btn-secondary text-xs" style={{padding:'6px 12px'}}>✕ Close</button>
              </div>
            </div>

            {/* PDF.js viewer */}
            <PdfJsViewer url={getFileProxyUrl(previewUrl)} />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{background:'rgba(255,255,255,0.03)', borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
              <th className="w-10 px-4 py-3 text-center"><input type="checkbox" className="checkbox" checked={allSelected} onChange={toggleAll} /></th>
              <th className="px-4 py-3 text-left text-xs font-bold text-white/40 uppercase tracking-wider">Document</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-white/40 uppercase tracking-wider">Format</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-white/40 uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-center text-xs font-bold text-white/40 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="text-center py-12 text-white/30 text-sm">No documents match your filters</td></tr>
            )}
            {filtered.map((pdf, i) => {
              const isSelected = !!sel.find(s => s.url === pdf.url)
              const isAtLimit  = guestMode && !isSelected && sel.length >= pdfRemaining
              return (
                <tr key={pdf.url} className={`table-row ${isAtLimit ? '' : 'cursor-pointer'} ${isSelected ? 'bg-blue-500/5' : ''}`}
                  onClick={() => !isAtLimit && handleToggle(pdf)}
                  style={isAtLimit ? {opacity:0.45} : {}}>
                  <td className="px-4 py-3 text-center" onClick={e => { e.stopPropagation(); handleToggle(pdf) }}>
                    <input type="checkbox" className="checkbox" checked={isSelected} readOnly
                      disabled={isAtLimit} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-white text-sm truncate max-w-xs">{pdf.filename || pdf.url.split('/').pop()}</div>
                    <div className="text-xs text-white/25 truncate max-w-xs font-mono">{pdf.url}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${formatBadge(pdf.format)}`}>{pdf.format?.toUpperCase() || 'PDF'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${docTypeBadge(pdf.doc_type)}`}>{pdf.doc_type || 'OTHER'}</span>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <button title="Preview" onClick={() => setPreviewUrl(pdf.url)}
                        className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-white transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <a href={pdf.url} target="_blank" rel="noopener noreferrer" title="Open source"
                        className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-white transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <a href={getFileProxyUrl(pdf.url)} download title="Download"
                        className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-white transition-colors">
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {filtered.length > 0 && (
        <div className="px-6 py-4 border-t border-white/[0.05] flex items-center justify-between">
          <span className="text-xs text-white/30">{filtered.length} document{filtered.length !== 1 ? 's' : ''} · {sel.length} selected</span>
          {sel.length > 0 && (
            <button onClick={sendSelected} disabled={sending || (guestMode && pdfRemaining === 0)} className="btn btn-primary gap-2 text-sm" style={{padding:'8px 16px'}}>
              {sending ? 'Sending...' : <><Send className="w-3.5 h-3.5" /> Add {sel.length} to Library</>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
