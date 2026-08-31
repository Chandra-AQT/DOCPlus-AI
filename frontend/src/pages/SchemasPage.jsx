import { useEffect, useState } from 'react'
import { Plus, Trash2, Edit2, Upload, Layers3, Check, X, Lock, Shield, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { useWorkflow } from '../lib/store'
import { listSchemas, createSchema, updateSchema, deleteSchema, uploadSchemaFile } from '../lib/api'
import { FIELD_TYPES } from '../lib/utils'
import { isGuest, isAdmin } from '../lib/auth'

const EMPTY_SCHEMA = { name: '', description: '', domain: '', version: '1.0', fields: [{ name: '', type: 'string', description: '' }] }

// ── Preset schema definitions (same as backend) ───────────────────────────────
const PRESET_SCHEMAS = [
  { id: 'preset_product_literature', name: 'Product Literature', icon: '📄', domain: 'product_documentation',
    desc: 'Product manuals, spec sheets, brochures, datasheets',
    fields: ['source_file','manufacturer','model_number','product_description','product_literature_date','product_line'] },
  { id: 'preset_invoice', name: 'Invoice', icon: '🧾', domain: 'finance',
    desc: 'Invoices, bills, purchase orders, receipts',
    fields: ['invoice_number','invoice_date','vendor_name','customer_bill_to','total_amount','due_date'] },
  { id: 'preset_manual', name: 'Manual / IOM', icon: '📖', domain: 'technical',
    desc: 'Installation, operation and maintenance manuals',
    fields: ['document_title','manufacturer','model_number','document_date','revision','product_line'] },
  { id: 'preset_spec_sheet', name: 'Spec Sheet', icon: '📋', domain: 'technical',
    desc: 'Technical specification sheets and datasheets',
    fields: ['manufacturer','model_number','product_description','specifications','certifications','product_line'] },
  { id: 'preset_contract', name: 'Contract / Agreement', icon: '📜', domain: 'legal',
    desc: 'Contracts, agreements, legal documents',
    fields: ['contract_title','parties','effective_date','expiry_date','contract_value','governing_law'] },
  { id: 'preset_report', name: 'Report', icon: '📊', domain: 'business',
    desc: 'Business reports, research reports, assessments',
    fields: ['report_title','author','report_date','summary','key_findings','report_period'] },
]

export default function SchemasPage() {
  const { set, state } = useWorkflow()
  const [schemas, setSchemas] = useState([])
  const [loading, setLoading] = useState(false)
  const [mode,    setMode]    = useState('list')
  const [form,    setForm]    = useState(EMPTY_SCHEMA)
  const [editId,  setEditId]  = useState(null)
  const guestMode = isGuest()
  const adminMode = isAdmin()

  const load = async () => {
    setLoading(true)
    try { const d = await listSchemas(); setSchemas(d.schemas || []) }
    catch { toast.error('Failed to load schemas') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const addField    = () => setForm(f => ({ ...f, fields: [...f.fields, { name:'', type:'string', description:'' }] }))
  const removeField = (i) => setForm(f => ({ ...f, fields: f.fields.filter((_,j) => j !== i) }))
  const updateField = (i, k, v) => setForm(f => ({ ...f, fields: f.fields.map((x,j) => j === i ? {...x,[k]:v} : x) }))

  const save = async () => {
    if (guestMode) { toast.error('Schema creation requires admin access'); return }
    if (!form.name.trim()) { toast.error('Schema name required'); return }
    const fields = form.fields.filter(f => f.name.trim())
    if (!fields.length) { toast.error('Add at least one field'); return }
    try {
      if (editId) { await updateSchema(editId, { ...form, fields }); toast.success('Schema updated') }
      else        { await createSchema({ ...form, fields }); toast.success('Schema created') }
      await load(); setMode('list'); setForm(EMPTY_SCHEMA); setEditId(null)
    } catch (e) { toast.error(e.message) }
  }

  const startEdit = (s) => {
    if (guestMode) { toast.error('Schema editing requires admin access'); return }
    setForm({ name: s.name, description: s.description||'', domain: s.domain||'', version: s.version||'1.0', fields: s.fields || [] })
    setEditId(s.id); setMode('edit')
  }

  const del = async (id) => {
    if (guestMode) { toast.error('Schema deletion requires admin access'); return }
    if (!window.confirm('Delete this schema?')) return
    try { await deleteSchema(id); await load(); toast.success('Deleted') } catch (e) { toast.error(e.message) }
  }

  const handleUpload = async (e) => {
    if (guestMode) { toast.error('Schema upload requires admin access'); return }
    const file = e.target.files[0]; if (!file) return
    try { const res = await uploadSchemaFile(file); await load(); toast.success(`Imported "${res.name}"`) }
    catch (e) { toast.error(e.message) }
    e.target.value = ''
  }

  // ── Guest view: preset schemas only ──────────────────────────────────────
  if (guestMode) {
    return (
      <div className="p-6 max-w-5xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">Schemas</h1>
          <p className="text-white/40 text-sm mt-0.5">6 preset schemas available for your trial</p>
        </div>

        {/* Guest notice */}
        <div className="rounded-2xl p-4 flex items-start gap-4 mb-6"
          style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.25)' }}>
            <Lock className="w-4 h-4" style={{ color: '#a78bfa' }} />
          </div>
          <div>
            <p className="text-sm font-bold mb-0.5" style={{ color: '#c4b5fd' }}>Guest Trial — Preset Schemas Only</p>
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Your trial includes access to 6 predefined schemas covering the most common document types.
              Custom schema creation, editing, and uploading requires full admin access.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
            <Shield className="w-3 h-3" /> Admin Feature
          </div>
        </div>

        {/* Preset schemas grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PRESET_SCHEMAS.map(s => {
            const isActive = state.schema?.id === s.id
            return (
              <div key={s.id}
                className="rounded-2xl p-5 transition-all hover:-translate-y-0.5 cursor-pointer"
                style={{
                  background: isActive ? 'rgba(37,99,235,0.1)' : '#0d1526',
                  border: isActive ? '1px solid rgba(37,99,235,0.35)' : '1px solid rgba(255,255,255,0.07)',
                  boxShadow: isActive ? '0 0 20px rgba(37,99,235,0.15)' : 'none',
                }}
                onClick={() => { set({ schema: { id: s.id, name: s.name } }); toast.success(`"${s.name}" selected`) }}>
                <div className="flex items-start justify-between mb-3">
                  <span className="text-3xl">{s.icon}</span>
                  {isActive && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(34,197,94,0.15)', color: '#34d399', border: '1px solid rgba(34,197,94,0.25)' }}>
                      ✓ Active
                    </span>
                  )}
                </div>
                <p className="text-sm font-black text-white mb-1">{s.name}</p>
                <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.desc}</p>
                {/* Field chips */}
                <div className="flex flex-wrap gap-1">
                  {s.fields.map(f => (
                    <span key={f} className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                      style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      {f}
                    </span>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{s.fields.length} fields · {s.domain}</span>
                  <span className="text-[10px] font-bold" style={{ color: isActive ? '#34d399' : '#60a5fa' }}>
                    {isActive ? 'Selected ✓' : 'Click to use →'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Admin features locked */}
        <div className="mt-8 rounded-2xl p-5"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3 mb-4">
            <Lock className="w-4 h-4 text-white/20" />
            <p className="text-sm font-bold text-white/30">Admin-Only Features</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { icon: '✏️', title: 'Create Custom Schema', desc: 'Define your own fields for any document type' },
              { icon: '📤', title: 'Upload JSON Schema', desc: 'Import schemas from file or LandingAI format' },
              { icon: '🔧', title: 'Edit & Delete', desc: 'Modify existing schemas and manage your library' },
            ].map(f => (
              <div key={f.title} className="flex items-start gap-3 p-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="text-lg opacity-40">{f.icon}</span>
                <div>
                  <p className="text-xs font-bold text-white/30">{f.title}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Admin view: full schema management ───────────────────────────────────
  const FormView = () => (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)' }}>
            <Shield className="w-3.5 h-3.5 text-white" />
          </div>
          <h2 className="font-bold text-white">{editId ? 'Edit Schema' : 'New Schema'}</h2>
        </div>
        <button onClick={() => { setMode('list'); setForm(EMPTY_SCHEMA); setEditId(null) }}
          className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/30">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="text-xs text-white/40 mb-1 block">Schema Name *</label>
          <input className="input" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Equipment Spec" /></div>
        <div><label className="text-xs text-white/40 mb-1 block">Domain</label>
          <input className="input" value={form.domain} onChange={e => setForm(f=>({...f,domain:e.target.value}))} placeholder="e.g. hvac, energy" /></div>
        <div className="sm:col-span-2"><label className="text-xs text-white/40 mb-1 block">Description</label>
          <input className="input" value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} placeholder="Optional description" /></div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Fields</label>
          <button onClick={addField} className="btn btn-secondary gap-1.5 text-xs" style={{padding:'5px 10px'}}>
            <Plus className="w-3 h-3" /> Add Field
          </button>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {form.fields.map((f, i) => (
            <div key={i} className="flex gap-2 items-center p-2 rounded-xl" style={{background:'rgba(255,255,255,0.03)'}}>
              <div className="text-xs text-white/20 w-5 shrink-0 text-center font-mono">{i+1}</div>
              <input className="input flex-1 text-xs" placeholder="field_name" value={f.name}
                onChange={e => updateField(i,'name',e.target.value)} style={{padding:'7px 10px'}} />
              <select className="select text-xs" value={f.type} onChange={e => updateField(i,'type',e.target.value)}
                style={{padding:'7px 10px', minWidth:80}}>
                {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input className="input flex-1 text-xs" placeholder="Description" value={f.description}
                onChange={e => updateField(i,'description',e.target.value)} style={{padding:'7px 10px'}} />
              <button onClick={() => removeField(i)} className="p-1.5 rounded hover:bg-white/[0.08] text-white/20 hover:text-red-400">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={save} className="btn btn-primary flex-1 gap-2"><Check className="w-4 h-4" />{editId ? 'Update' : 'Create'} Schema</button>
        <button onClick={() => { setMode('list'); setForm(EMPTY_SCHEMA); setEditId(null) }} className="btn btn-secondary">Cancel</button>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-black text-white">Schemas</h1>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold"
              style={{ background: 'rgba(124,58,237,0.15)', color: '#c4b5fd', border: '1px solid rgba(124,58,237,0.25)' }}>
              ⚡ Admin
            </span>
          </div>
          <p className="text-white/40 text-sm">{schemas.length} schema{schemas.length !== 1 ? 's' : ''} · Create and manage extraction schemas</p>
        </div>
        <div className="flex gap-2">
          <label className="btn btn-secondary gap-2 cursor-pointer">
            <Upload className="w-3.5 h-3.5" /> Import JSON
            <input type="file" accept=".json" className="hidden" onChange={handleUpload} />
          </label>
          <button onClick={() => { setMode('create'); setForm(EMPTY_SCHEMA); setEditId(null) }}
            className="btn btn-primary gap-2">
            <Plus className="w-3.5 h-3.5" /> New Schema
          </button>
        </div>
      </div>

      {(mode === 'create' || mode === 'edit') && <div className="mb-6"><FormView /></div>}

      {loading ? (
        <div className="card p-12 text-center"><div className="w-6 h-6 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin mx-auto" /></div>
      ) : schemas.length === 0 ? (
        <div className="card p-12 text-center">
          <Layers3 className="w-12 h-12 mx-auto mb-3 text-white/10" />
          <div className="text-white/40 text-sm mb-2">No schemas yet</div>
          <p className="text-xs mb-5" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Create custom schemas or the preset schemas are auto-seeded on backend startup
          </p>
          <button onClick={() => setMode('create')} className="btn btn-primary gap-2 mt-2"><Plus className="w-3.5 h-3.5" />Create First Schema</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {schemas.map(s => {
            const isActive  = state.schema?.id === s.id
            const isPreset  = s.id?.startsWith('preset_') || s.id === 'guest_fixed_schema'
            return (
              <div key={s.id} className="card card-hover p-5 relative transition-all"
                style={isActive ? { borderColor:'rgba(59,130,246,0.3)', background:'rgba(37,99,235,0.06)' } : {}}>
                {isActive && <div className="absolute top-3 right-3"><span className="badge badge-blue">Active</span></div>}
                {isPreset && !isActive && (
                  <div className="absolute top-3 right-3">
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                      style={{ background: 'rgba(34,197,94,0.1)', color: '#34d399', border: '1px solid rgba(34,197,94,0.2)' }}>
                      PRESET
                    </span>
                  </div>
                )}
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: isPreset ? 'rgba(34,197,94,0.1)' : 'rgba(124,58,237,0.15)' }}>
                  <Layers3 className="w-5 h-5" style={{ color: isPreset ? '#34d399' : '#a78bfa' }} />
                </div>
                <div className="font-bold text-white text-sm mb-1 pr-14">{s.name}</div>
                {s.domain && <div className="text-xs text-white/30 mb-1">{s.domain}</div>}
                <div className="text-xs text-white/30 mb-3">{s.field_count || s.fields?.length || 0} fields</div>
                {s.description && <div className="text-xs text-white/40 mb-3 line-clamp-2">{s.description}</div>}
                <div className="flex gap-2 mt-auto">
                  <button onClick={() => { set({ schema: s }); toast.success(`"${s.name}" set as active`) }}
                    className={`btn text-xs flex-1 gap-1.5 ${isActive ? 'btn-success' : 'btn-secondary'}`}
                    style={{ padding:'6px 10px' }}>
                    {isActive ? <><Check className="w-3 h-3"/>Active</> : 'Use Schema'}
                  </button>
                  {!isPreset && (
                    <>
                      <button onClick={() => startEdit(s)} className="btn btn-secondary" style={{padding:'6px 10px'}}>
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button onClick={() => del(s.id)} className="btn btn-danger" style={{padding:'6px 10px'}}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
