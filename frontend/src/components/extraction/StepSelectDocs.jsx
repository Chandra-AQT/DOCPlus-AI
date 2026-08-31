import { useEffect, useState } from 'react'
import { FileText, RefreshCw, CheckSquare, Square } from 'lucide-react'
import toast from 'react-hot-toast'
import { useWorkflow } from '../../lib/store'
import { listDocuments } from '../../lib/api'
import { formatBytes, statusBadge } from '../../lib/utils'

export default function StepSelectDocs() {
  const { state, set, toggleDoc } = useWorkflow()
  const [loading, setLoading] = useState(false)
  const docs = state.library
  const sel  = state.selectedDocIds

  const load = async () => {
    setLoading(true)
    try {
      const data = await listDocuments()
      set({ library: data.documents || [] })
    } catch (e) { toast.error('Failed to load documents') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (docs.length === 0) load() }, [])

  const parsedDocs = docs.filter(d => d.status === 'parsed')
  const allSel = parsedDocs.length > 0 && parsedDocs.every(d => sel.includes(d.id))
  const toggleAll = () => {
    if (allSel) set({ selectedDocIds: [] })
    else set({ selectedDocIds: parsedDocs.map(d => d.id) })
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black text-white"
            style={{background:'linear-gradient(135deg,#2563eb,#7c3aed)'}}>8</div>
          <div>
            <div className="font-bold text-white text-sm">Select Documents</div>
            <div className="text-xs text-white/40">{sel.length} of {parsedDocs.length} parsed docs selected</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={toggleAll} className="btn btn-secondary gap-1.5 text-xs" style={{padding:'6px 10px'}}>
            {allSel ? <><CheckSquare className="w-3 h-3" />Deselect</> : <><Square className="w-3 h-3" />Select All</>}
          </button>
          <button onClick={load} disabled={loading} className="btn btn-secondary" style={{padding:'6px 10px'}}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-white/30 text-sm">Loading documents...</div>
        ) : docs.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-white/20 text-sm mb-2">No documents in library</div>
            <div className="text-white/15 text-xs">Go to Discover or Library to add documents</div>
          </div>
        ) : (
          docs.map(doc => {
            const isSel   = sel.includes(doc.id)
            const canSel  = doc.status === 'parsed'
            return (
              <div key={doc.id}
                onClick={() => canSel && toggleDoc(doc.id)}
                className={`flex items-center gap-3 px-5 py-3 table-row ${canSel ? 'cursor-pointer' : 'opacity-40'} ${isSel ? 'bg-blue-500/5' : ''}`}>
                <input type="checkbox" className="checkbox" checked={isSel} disabled={!canSel} readOnly />
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{background:'rgba(37,99,235,0.15)'}}>
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium truncate">{doc.file_name}</div>
                  <div className="text-xs text-white/25">{doc.page_count ? `${doc.page_count} pages · ` : ''}{formatBytes(doc.file_size)}</div>
                </div>
                <span className={`badge ${statusBadge(doc.status)}`}>{doc.status}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
