import { useEffect, useState } from 'react'
import { Layers3, Plus, Trash2, Upload, ChevronDown, ChevronUp, X, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { useWorkflow } from '../../lib/store'
import { listSchemas, createSchema, deleteSchema, uploadSchemaFile } from '../../lib/api'
import { FIELD_TYPES, SAMPLE_SCHEMAS } from '../../lib/utils'

export default function StepSchemaPanel() {
  const { state, set } = useWorkflow()
  const [schemas, setSchemas] = useState([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode]       = useState('list') // 'list' | 'create' | 'sample'
  const [newSchema, setNewSchema] = useState({ name: '', description: '', fields: [{ name: '', type: 'string', description: '' }] })

  const loadSchemas = async () => {
    setLoading(true)
    try { const d = await listSchemas(); setSchemas(d.schemas || []) }
    catch (e) { toast.error('Failed to load schemas') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadSchemas() }, [])

  const selectSchema = (s) => { set({ schema: s }); toast.success(`Schema "${s.name}" selected`) }

  const addField = () => setNewSchema(s => ({ ...s, fields: [...s.fields, { name: '', type: 'string', description: '' }] }))
  const removeField = (i) => setNewSchema(s => ({ ...s, fields: s.fields.filter((_,j) => j !== i) }))
  const updateField = (i, key, val) => setNewSchema(s => ({
    ...s, fields: s.fields.map((f, j) => j === i ? { ...f, [key]: val } : f)
  }))

  const saveSchema = async () => {
    if (!newSchema.name.trim()) { toast.error('Schema name required'); return }
    const validFields = newSchema.fields.filter(f => f.name.trim())
    if (validFields.length === 0) { toast.error('Add at least one field'); return }
    try {
      const res = await createSchema({ ...newSchema, fields: validFields })
      toast.success('Schema created!')
      await loadSchemas()
      set({ schema: { id: res.id, name: newSchema.name, fields: validFields } })
      setMode('list')
      setNewSchema({ name: '', description: '', fields: [{ name: '', type: 'string', description: '' }] })
    } catch (e) { toast.error(e.message) }
  }

  const useSample = async (sample) => {
    try {
      const res = await createSchema(sample)
      await loadSchemas()
      set({ schema: { id: res.id, name: sample.name, fields: sample.fields } })
      toast.success(`Sample schema "${sample.name}" applied!`)
      setMode('list')
    } catch (e) {
      // Use inline without saving
      set({ schema: { name: sample.name, fields: sample.fields } })
      toast.success(`Using "${sample.name}" schema`)
      setMode('list')
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    try {
      const res = await uploadSchemaFile(file)
      await loadSchemas()
      toast.success(`Schema "${res.name}" uploaded!`)
    } catch (err) { toast.error(err.message) }
    e.target.value = ''
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black text-white"
            style={{background:'linear-gradient(135deg,#7c3aed,#2563eb)'}}>9</div>
          <div>
            <div className="font-bold text-white text-sm">Choose Schema</div>
            <div className="text-xs text-white/40">
              {state.schema ? <span className="text-green-400">✓ {state.schema.name} selected</span> : 'Select or create a metadata schema'}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <label className="btn btn-secondary gap-1.5 text-xs cursor-pointer" style={{padding:'6px 10px'}}>
            <Upload className="w-3 h-3" /> Upload JSON
            <input type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
          </label>
          <button onClick={() => setMode(m => m === 'sample' ? 'list' : 'sample')}
            className="btn btn-secondary text-xs" style={{padding:'6px 10px'}}>Samples</button>
          <button onClick={() => setMode(m => m === 'create' ? 'list' : 'create')}
            className="btn btn-primary gap-1.5 text-xs" style={{padding:'6px 10px'}}>
            <Plus className="w-3 h-3" /> New
          </button>
        </div>
      </div>

      {/* Sample schemas */}
      {mode === 'sample' && (
        <div className="px-5 py-4 border-b border-white/[0.06] space-y-2">
          <div className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Sample Schemas</div>
          {SAMPLE_SCHEMAS.map(s => (
            <div key={s.name} className="flex items-center justify-between p-3 rounded-xl"
              style={{background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)'}}>
              <div>
                <div className="text-sm font-semibold text-white">{s.name}</div>
                <div className="text-xs text-white/30">{s.fields.length} fields</div>
              </div>
              <button onClick={() => useSample(s)} className="btn btn-primary text-xs" style={{padding:'6px 12px'}}>Use</button>
            </div>
          ))}
        </div>
      )}

      {/* Create schema */}
      {mode === 'create' && (
        <div className="px-5 py-4 border-b border-white/[0.06] space-y-4">
          <div className="text-xs font-bold text-white/40 uppercase tracking-wider">Create New Schema</div>
          <input className="input" placeholder="Schema name *" value={newSchema.name}
            onChange={e => setNewSchema(s => ({ ...s, name: e.target.value }))} />
          <input className="input" placeholder="Description (optional)" value={newSchema.description}
            onChange={e => setNewSchema(s => ({ ...s, description: e.target.value }))} />

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {newSchema.fields.map((f, i) => (
              <div key={i} className="flex gap-2 items-start">
                <input className="input flex-1 text-xs" placeholder="field_name *" value={f.name}
                  onChange={e => updateField(i, 'name', e.target.value)} style={{padding:'8px 10px'}} />
                <select className="select text-xs" value={f.type}
                  onChange={e => updateField(i, 'type', e.target.value)} style={{padding:'8px 10px', minWidth:90}}>
                  {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input className="input flex-1 text-xs" placeholder="Description" value={f.description}
                  onChange={e => updateField(i, 'description', e.target.value)} style={{padding:'8px 10px'}} />
                <button onClick={() => removeField(i)} className="p-2 rounded-lg hover:bg-white/[0.08] text-white/30 hover:text-red-400 transition-colors shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={addField} className="btn btn-secondary gap-1.5 text-xs flex-1" style={{padding:'8px'}}>
              <Plus className="w-3 h-3" /> Add Field
            </button>
            <button onClick={saveSchema} className="btn btn-primary gap-1.5 text-xs flex-1" style={{padding:'8px'}}>
              <Check className="w-3 h-3" /> Save & Use Schema
            </button>
          </div>
        </div>
      )}

      {/* Saved schemas list */}
      <div className="max-h-60 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center text-white/30 text-xs">Loading schemas...</div>
        ) : schemas.length === 0 ? (
          <div className="p-6 text-center text-white/20 text-xs">No saved schemas — create one above or use a sample</div>
        ) : (
          schemas.map(s => {
            const isActive = state.schema?.id === s.id
            return (
              <div key={s.id}
                onClick={() => selectSchema(s)}
                className={`flex items-center gap-3 px-5 py-3 table-row cursor-pointer ${isActive ? 'bg-blue-500/5' : ''}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${
                  isActive ? 'border-blue-500 bg-blue-500' : 'border-white/20'
                }`}>
                  {isActive && <Check className="w-3 h-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">{s.name}</div>
                  <div className="text-xs text-white/30">{s.field_count} field{s.field_count !== 1 ? 's' : ''}{s.domain ? ` · ${s.domain}` : ''}</div>
                </div>
                {isActive && <span className="badge badge-blue">Active</span>}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
