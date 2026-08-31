import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, X, CheckCircle2, AlertCircle, Plus, FolderOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import { useWorkflow } from '../../lib/store'
import { uploadDocument, uploadBatch } from '../../lib/api'
import { formatBytes } from '../../lib/utils'

export default function StepAddDocuments() {
  const { addToLibrary } = useWorkflow()
  const [files, setFiles]     = useState([])  // staged files
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState([])

  const onDrop = useCallback((accepted) => {
    const newFiles = accepted.map(f => ({ file: f, id: Math.random().toString(36).slice(2), status: 'pending' }))
    setFiles(prev => [...prev, ...newFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'application/msword': ['.doc'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
    multiple: true,
  })

  const removeFile = (id) => setFiles(f => f.filter(x => x.id !== id))

  const uploadAll = async () => {
    if (files.length === 0) { toast.error('Add files first'); return }
    setUploading(true)
    const res = []

    // Upload one by one to show progress
    for (const item of files) {
      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'uploading' } : f))
      try {
        const doc = await uploadDocument(item.file)
        addToLibrary({ id: doc.id, file_name: item.file.name, status: 'uploaded', file_size: item.file.size })
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'done' } : f))
        res.push({ name: item.file.name, status: 'success', id: doc.id })
      } catch (e) {
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error', error: e.message } : f))
        res.push({ name: item.file.name, status: 'error', error: e.message })
      }
    }
    setResults(res)
    setUploading(false)
    const ok  = res.filter(r => r.status === 'success').length
    const err = res.filter(r => r.status === 'error').length
    if (ok > 0) toast.success(`${ok} file${ok > 1 ? 's' : ''} uploaded successfully`)
    if (err > 0) toast.error(`${err} file${err > 1 ? 's' : ''} failed`)
  }

  const clearAll = () => { setFiles([]); setResults([]) }

  return (
    <div className="space-y-5">
      {/* Step header */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black text-white"
            style={{background:'linear-gradient(135deg,#2563eb,#7c3aed)'}}>6</div>
          <div>
            <div className="font-bold text-white">Add Documents to Library</div>
            <div className="text-xs text-white/40">Upload PDFs from your computer — single files, batch, or ZIP</div>
          </div>
        </div>

        {/* Dropzone */}
        <div {...getRootProps()} className={`rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
          isDragActive ? 'border-blue-500/60 bg-blue-500/5' : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
        }`}>
          <input {...getInputProps()} />
          <Upload className="w-10 h-10 mx-auto mb-3" style={{color: isDragActive ? '#60a5fa' : 'rgba(255,255,255,0.2)'}} />
          <div className="text-sm font-bold text-white/60 mb-1">
            {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
          </div>
          <div className="text-xs text-white/30 mb-4">PDF, DOC, DOCX — multiple files supported</div>
          <button type="button" className="btn btn-secondary text-xs gap-2" style={{padding:'8px 16px'}}>
            <FolderOpen className="w-3.5 h-3.5" /> Browse Files
          </button>
        </div>

        {/* Staged file list */}
        {files.length > 0 && (
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-white/50 uppercase tracking-wider">{files.length} file{files.length > 1 ? 's' : ''} staged</span>
              <button onClick={clearAll} className="text-xs text-white/30 hover:text-white/60 transition-colors">Clear all</button>
            </div>
            {files.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)'}}>
                <FileText className="w-4 h-4 text-white/30 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{item.file.name}</div>
                  <div className="text-xs text-white/30">{formatBytes(item.file.size)}</div>
                </div>
                <div className="shrink-0">
                  {item.status === 'pending'   && <span className="badge badge-gray">Pending</span>}
                  {item.status === 'uploading' && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                      <span className="text-xs text-blue-400">Uploading</span>
                    </div>
                  )}
                  {item.status === 'done'      && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                  {item.status === 'error'     && (
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      <span className="text-xs text-red-400">Failed</span>
                    </div>
                  )}
                </div>
                {item.status === 'pending' && (
                  <button onClick={() => removeFile(item.id)} className="p-1 rounded hover:bg-white/[0.08] text-white/30 hover:text-white transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}

            <div className="flex gap-3 pt-2">
              <button onClick={uploadAll} disabled={uploading || files.every(f => f.status !== 'pending')}
                className="btn btn-primary gap-2 flex-1">
                {uploading
                  ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Uploading...</>
                  : <><Upload className="w-3.5 h-3.5" />Upload {files.filter(f => f.status === 'pending').length} Files</>
                }
              </button>
              {!uploading && (
                <button onClick={() => setFiles(f => f.filter(x => x.status === 'pending'))}
                  className="btn btn-secondary gap-2">
                  <X className="w-3.5 h-3.5" /> Clear Done
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Upload results summary */}
      {results.length > 0 && (
        <div className="card p-5">
          <div className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Upload Summary</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3 text-center" style={{background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.15)'}}>
              <div className="text-2xl font-black text-green-400">{results.filter(r => r.status === 'success').length}</div>
              <div className="text-xs text-green-400/60">Uploaded</div>
            </div>
            <div className="rounded-xl p-3 text-center" style={{background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.15)'}}>
              <div className="text-2xl font-black text-red-400">{results.filter(r => r.status === 'error').length}</div>
              <div className="text-xs text-red-400/60">Failed</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
