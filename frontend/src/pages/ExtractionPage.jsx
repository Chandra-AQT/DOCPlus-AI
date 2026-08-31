import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import {
  FileText, Boxes, FolderArchive, Upload, Layers3, Cpu, Zap, BarChart3,
  CheckCircle2, ChevronRight, ChevronLeft, X, FolderOpen, Loader2,
  Eye, EyeOff, AlertCircle, Plus, Trash2, Lock
} from 'lucide-react'
import { useWorkflow } from '../lib/store'
import api, { listDocuments, uploadDocument, uploadBatch, listSchemas,
  createSchema, uploadSchemaFile, runExtraction, logGuestActivity, BASE_URL } from '../lib/api'
import { PROVIDERS, FIELD_TYPES, statusBadge } from '../lib/utils'
import { isGuest, isAdmin, canExtract, getGuestLimits, getGuestToken, refreshGuestUsage } from '../lib/auth'

// ── Step bar ──────────────────────────────────────────────────────────────────
const STEPS = [
  { id:1, label:'Upload',  Icon: Upload  },
  { id:2, label:'Schema',  Icon: Layers3 },
  { id:3, label:'Engine',  Icon: Cpu     },
  { id:4, label:'Extract', Icon: Zap     },
  { id:5, label:'Results', Icon: BarChart3 },
]

function StepBar({ current }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((s, i) => {
        const done   = current > s.id
        const active = current === s.id
        return (
          <div key={s.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-black transition-all"
                style={{
                  background: done   ? 'linear-gradient(135deg,#22c55e,#16a34a)'
                            : active ? 'linear-gradient(135deg,#2563eb,#7c3aed)'
                            : 'rgba(255,255,255,0.06)',
                  color:  (done || active) ? '#fff' : 'rgba(255,255,255,0.3)',
                  border: active ? '2px solid rgba(124,58,237,0.5)' : '2px solid transparent',
                  boxShadow: active ? '0 0 20px rgba(37,99,235,0.4)' : 'none',
                }}>
                {done ? <CheckCircle2 className="w-4 h-4" /> : <s.Icon className="w-4 h-4" />}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wide"
                style={{ color: active ? '#fff' : done ? '#22c55e' : 'rgba(255,255,255,0.25)' }}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-12 h-px mx-2 mb-5 transition-all"
                style={{ backgroundColor: done ? '#22c55e' : 'rgba(255,255,255,0.08)' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1: Upload ────────────────────────────────────────────────────────────
function Step1Upload({ mode, setMode, selectedIds, setSelectedIds, onNext }) {
  const { state } = useWorkflow()
  const [docs, setDocs]       = useState([])
  const [loading, setLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    try { const d = await listDocuments(); setDocs(d.documents || []) }
    catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  // Auto-select docs passed from library
  useEffect(() => {
    if (state.selectedDocIds?.length > 0) {
      setSelectedIds(state.selectedDocIds)
    }
  }, [])

  useEffect(() => {
    const anyParsing = docs.some(d => ['parsing','uploaded'].includes(d.status))
    if (anyParsing) { const t = setInterval(fetchDocs, 3000); return () => clearInterval(t) }
  }, [docs, fetchDocs])

  const toggle = (id) => {
    if (mode === 'single') setSelectedIds([id])
    else setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const parsedDocs = docs.filter(d => d.status === 'parsed')

  // Sort: selected first, then newest first
  const sortedDocs = [...parsedDocs].sort((a, b) => {
    const aSel = selectedIds.includes(a.id)
    const bSel = selectedIds.includes(b.id)
    if (aSel && !bSel) return -1
    if (!aSel && bSel) return 1
    // newest first
    return new Date(b.created_at || 0) - new Date(a.created_at || 0)
  })

  // Show 5 by default, expand on "show all"
  const LIMIT = 5
  const visibleDocs = showAll ? sortedDocs : sortedDocs.slice(0, LIMIT)
  const canNext = selectedIds.length > 0

  return (
    <div className="space-y-4">

      {/* Selected summary banner */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{backgroundColor:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)'}}>
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{color:'#22c55e'}} />
          <p className="text-sm font-bold flex-1" style={{color:'#22c55e'}}>
            {selectedIds.length === 1
              ? `Selected: ${docs.find(d => d.id === selectedIds[0])?.file_name || '1 document'}`
              : `${selectedIds.length} documents selected`}
          </p>
          <button onClick={() => setSelectedIds([])}
            className="text-xs opacity-50 hover:opacity-80 transition-opacity"
            style={{color:'#22c55e'}}>
            Clear
          </button>
        </div>
      )}

      {/* Document list */}
      <div className="rounded-2xl p-5" style={{backgroundColor:'#0d1526', border:'1px solid rgba(255,255,255,0.1)'}}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-widest" style={{color:'#22d3ee'}}>
            ● SELECT DOCUMENTS TO EXTRACT
          </p>
          <div className="flex items-center gap-3">
            {docs.some(d => ['parsing','uploaded'].includes(d.status)) &&
              <span className="text-xs animate-pulse" style={{color:'#60a5fa'}}>⟳ Parsing...</span>}
            <button onClick={fetchDocs} className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>↻</button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i =>
            <div key={i} className="h-14 rounded-xl animate-pulse" style={{backgroundColor:'rgba(255,255,255,0.04)'}} />
          )}</div>
        ) : parsedDocs.length === 0 ? (
          <div className="py-8 text-center">
            <FolderOpen className="mx-auto w-10 h-10 mb-3 opacity-20" style={{color:'#60a5fa'}} />
            <p className="text-sm font-bold" style={{color:'rgba(255,255,255,0.3)'}}>No parsed documents</p>
            <p className="text-xs mt-1" style={{color:'rgba(255,255,255,0.2)'}}>
              Go to <strong className="text-white">Document Library</strong> to upload documents first
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              {visibleDocs.map(doc => {
                const isSel = selectedIds.includes(doc.id)
                const isNew = !showAll && sortedDocs.indexOf(doc) === 0 && !selectedIds.includes(doc.id)
                return (
                  <div key={doc.id} onClick={() => toggle(doc.id)}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-all"
                    style={{
                      backgroundColor: isSel ? 'rgba(37,99,235,0.18)' : 'rgba(37,99,235,0.04)',
                      border: isSel ? '1px solid rgba(37,99,235,0.55)' : '1px solid rgba(37,99,235,0.12)',
                      boxShadow: isSel ? '0 0 12px rgba(37,99,235,0.15)' : 'none',
                    }}>
                    <div className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg"
                      style={{backgroundColor: isSel ? 'rgba(37,99,235,0.35)' : 'rgba(37,99,235,0.15)'}}>
                      <FileText className="w-4 h-4" style={{color:'#60a5fa'}} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{doc.file_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{doc.page_count}p</span>
                        {isNew && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{background:'rgba(34,197,94,0.12)',color:'#34d399'}}>LATEST</span>
                        )}
                      </div>
                    </div>
                    {isSel
                      ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{color:'#22c55e'}} />
                      : <div className="w-4 h-4 rounded-full shrink-0" style={{border:'2px solid rgba(255,255,255,0.15)'}} />
                    }
                  </div>
                )
              })}
            </div>

            {/* Show more / less */}
            {sortedDocs.length > LIMIT && (
              <button onClick={() => setShowAll(s => !s)}
                className="w-full mt-2 py-2 text-xs font-semibold rounded-lg transition-colors"
                style={{color:'rgba(255,255,255,0.4)', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)'}}>
                {showAll
                  ? `↑ Show less`
                  : `↓ Show all ${sortedDocs.length} documents`}
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={onNext} disabled={!canNext}
          className="flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-black text-white transition-all disabled:opacity-40 hover:-translate-y-0.5"
          style={{background: canNext ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.06)'}}>
          Next: Schema <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Schema ────────────────────────────────────────────────────────────
function Step2Schema({ schemaId, setSchemaId, setSchemaFields, setSchemaName, onNext, onBack }) {
  const guestMode = isGuest()
  const [tab, setTab]         = useState('select')
  const [schemas, setSchemas] = useState([])
  const [loading, setLoading] = useState(false)
  const [name, setName]       = useState('')
  const [desc, setDesc]       = useState('')
  const [domain, setDomain]   = useState('')
  const [fields, setFields]   = useState([{name:'',type:'string',description:''}])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]   = useState(false)

  const FIXED_SCHEMA_ID = 'guest_fixed_schema'
  const FIXED_SCHEMA = {
    id: FIXED_SCHEMA_ID,
    name: 'Guest Trial Schema',
    field_count: 6,
    description: '6 required product documentation fields',
  }

  // Fallback if backend is unreachable
  const FALLBACK_PRESETS = [
    {
      id: 'preset_product_literature', name: 'Product Literature', icon: '📄',
      description: 'Product manuals, spec sheets, brochures, datasheets',
      field_count: 6,
      fields: [
        {name:'source_file',type:'string',description:'Source document filename'},
        {name:'manufacturer',type:'string',description:'Manufacturer or brand name (MFG)'},
        {name:'model_number',type:'string',description:'Model number or product code'},
        {name:'product_description',type:'string',description:'Product description (MFG)'},
        {name:'product_literature_date',type:'date',description:'Publication or revision year (YR)'},
        {name:'product_line',type:'string',description:'Product line or product family (MFG)'},
      ],
    },
    {
      id: 'preset_invoice', name: 'Invoice', icon: '🧾',
      description: 'Invoices, bills, purchase orders, receipts',
      field_count: 6,
      fields: [
        {name:'invoice_number',type:'string',description:'Invoice number or ID'},
        {name:'invoice_date',type:'date',description:'Date the invoice was issued'},
        {name:'vendor_name',type:'string',description:'Vendor or supplier name'},
        {name:'customer_bill_to',type:'string',description:'Customer or billing address'},
        {name:'total_amount',type:'currency',description:'Total invoice amount'},
        {name:'due_date',type:'date',description:'Payment due date'},
      ],
    },
    {
      id: 'preset_manual', name: 'Manual / IOM', icon: '📖',
      description: 'Installation, operation and maintenance manuals',
      field_count: 6,
      fields: [
        {name:'document_title',type:'string',description:'Title of the manual'},
        {name:'manufacturer',type:'string',description:'Manufacturer name'},
        {name:'model_number',type:'string',description:'Model number'},
        {name:'document_date',type:'date',description:'Publication or revision date'},
        {name:'revision',type:'string',description:'Revision number or version'},
        {name:'product_line',type:'string',description:'Product line or series'},
      ],
    },
    {
      id: 'preset_spec_sheet', name: 'Spec Sheet', icon: '📋',
      description: 'Technical specification sheets and datasheets',
      field_count: 6,
      fields: [
        {name:'manufacturer',type:'string',description:'Manufacturer name'},
        {name:'model_number',type:'string',description:'Model number or part number'},
        {name:'product_description',type:'string',description:'Product description'},
        {name:'specifications',type:'string',description:'Technical specifications'},
        {name:'certifications',type:'list',description:'Certifications and compliance standards'},
        {name:'product_line',type:'string',description:'Product line or series'},
      ],
    },
    {
      id: 'preset_contract', name: 'Contract / Agreement', icon: '📜',
      description: 'Contracts, agreements, legal documents',
      field_count: 6,
      fields: [
        {name:'contract_title',type:'string',description:'Title of the contract'},
        {name:'parties',type:'list',description:'Names of all parties involved'},
        {name:'effective_date',type:'date',description:'Contract start or effective date'},
        {name:'expiry_date',type:'date',description:'Contract expiry date'},
        {name:'contract_value',type:'currency',description:'Total contract value'},
        {name:'governing_law',type:'string',description:'Governing law or jurisdiction'},
      ],
    },
    {
      id: 'preset_report', name: 'Report', icon: '📊',
      description: 'Business reports, research reports, assessments',
      field_count: 6,
      fields: [
        {name:'report_title',type:'string',description:'Title of the report'},
        {name:'author',type:'string',description:'Author or organization'},
        {name:'report_date',type:'date',description:'Date the report was issued'},
        {name:'summary',type:'string',description:'Executive summary or abstract'},
        {name:'key_findings',type:'list',description:'Key findings or recommendations'},
        {name:'report_period',type:'string',description:'Reporting period or scope'},
      ],
    },
  ]

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (guestMode) {
        // Guests: load preset schemas — use static fallback immediately,
        // then try to enrich from backend (but never block on it)
        setSchemas(FALLBACK_PRESETS)
        try {
          const res = await fetch(`${BASE_URL}/guests/preset-schemas`)
          if (res.ok) {
            const data = await res.json()
            if (data.schemas?.length) setSchemas(data.schemas)
          }
        } catch { /* stay with fallback */ }
      } else {
        const d = await listSchemas(); setSchemas(d.schemas || [])
      }
    } catch {
      if (guestMode) setSchemas(FALLBACK_PRESETS)
    }
    finally { setLoading(false) }
  }, [guestMode])
  useEffect(() => { load() }, [load])

  const uploadSchema = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setUploading(true)
    try {
      const res = await uploadSchemaFile(file)
      toast.success(`Schema uploaded: ${res.name}`)
      load(); setTab('select')
    } catch { toast.error('Upload failed') }
    finally { setUploading(false) }
    e.target.value = ''
  }

  const saveSchema = async () => {
    if (!name.trim()) { toast.error('Schema name required'); return }
    const validFields = fields.filter(f => f.name.trim())
    if (!validFields.length) { toast.error('Add at least one field'); return }
    setSaving(true)
    try {
      const res = await createSchema({name, description:desc, domain, fields:validFields})
      toast.success('Schema created!')
      setSchemaId(res.id)
      load(); setTab('select')
      setName(''); setDesc(''); setDomain(''); setFields([{name:'',type:'string',description:''}])
    } catch { toast.error('Failed to create schema') }
    finally { setSaving(false) }
  }

  const addField    = () => setFields(f => [...f, {name:'',type:'string',description:''}])
  const removeField = (i) => setFields(f => f.filter((_,j) => j !== i))
  const updateField = (i,k,v) => setFields(f => f.map((x,j) => j===i ? {...x,[k]:v} : x))

  // Guest mode: preset schema picker
  if (guestMode) {
    return (
      <div className="space-y-5">
        {/* Header notice */}
        <div className="rounded-2xl p-4 flex items-start gap-3"
          style={{background:'rgba(124,58,237,0.1)', border:'1px solid rgba(124,58,237,0.25)'}}>
          <Lock className="w-4 h-4 shrink-0 mt-0.5" style={{color:'#c4b5fd'}} />
          <div>
            <p className="text-sm font-bold" style={{color:'#c4b5fd'}}>Guest Trial — Preset Schemas</p>
            <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.4)'}}>
              Select the schema that matches your document type. All fields are predefined — no custom schemas in trial mode.
            </p>
          </div>
        </div>

        {/* Preset schema cards */}
        <div className="rounded-2xl p-5" style={{backgroundColor:'#0d1526', border:'1px solid rgba(255,255,255,0.1)'}}>
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{color:'#22d3ee'}}>
            ● SELECT DOCUMENT TYPE
          </p>

          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl animate-pulse" style={{backgroundColor:'rgba(255,255,255,0.04)'}} />)}
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {schemas.map(s => {
                const sel = schemaId === s.id
                return (
                  <button key={s.id} onClick={() => {
                    setSchemaId(s.id)
                    if (setSchemaFields) setSchemaFields(s.fields || [])
                    if (setSchemaName)   setSchemaName(s.name || '')
                  }}
                    className="w-full flex items-start gap-4 rounded-xl px-4 py-3.5 text-left transition-all hover:-translate-y-0.5"
                    style={{
                      backgroundColor: sel ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.02)',
                      border: sel ? '1px solid rgba(37,99,235,0.4)' : '1px solid rgba(255,255,255,0.07)',
                      boxShadow: sel ? '0 0 16px rgba(37,99,235,0.15)' : 'none',
                    }}>
                    {/* Icon */}
                    <span className="text-2xl shrink-0 mt-0.5">{s.icon || '📄'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-white">{s.name}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                          style={{backgroundColor:'rgba(37,99,235,0.15)',color:'#60a5fa'}}>
                          {s.field_count || s.fields?.length || 0} fields
                        </span>
                      </div>
                      <p className="text-xs mb-2" style={{color:'rgba(255,255,255,0.4)'}}>{s.description}</p>
                      {/* Field preview chips */}
                      <div className="flex flex-wrap gap-1">
                        {(s.fields || []).map(f => (
                          <span key={f.name} className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                            style={{background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.08)'}}>
                            {f.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    {sel && <CheckCircle2 className="w-4 h-4 shrink-0 mt-1" style={{color:'#22c55e'}} />}
                  </button>
                )
              })}
            </div>
          )}

          {schemaId && (
            <div className="mt-4 flex items-center gap-2 rounded-xl px-4 py-2.5"
              style={{backgroundColor:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.2)'}}>
              <CheckCircle2 className="w-4 h-4 shrink-0" style={{color:'#22c55e'}} />
              <p className="text-xs font-bold" style={{color:'#22c55e'}}>
                Schema selected: {schemas.find(s => s.id === schemaId)?.name}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-between">
          <button onClick={onBack} className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all"
            style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.6)'}}>
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <button onClick={onNext} disabled={!schemaId}
            className="flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-black text-white transition-all disabled:opacity-40 hover:-translate-y-0.5"
            style={{background: schemaId ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.06)'}}>
            Next: Engine <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  // Admin/full mode: full schema tabs
  const TABS = [
    {id:'select', label:'Select',      emoji:'📋'},
    {id:'upload', label:'Upload JSON', emoji:'📤'},
    {id:'create', label:'Create',      emoji:'✏️'},
  ]

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
            style={{
              background: tab===t.id ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.04)',
              color: tab===t.id ? '#fff' : 'rgba(255,255,255,0.5)',
              border: tab===t.id ? 'none' : '1px solid rgba(255,255,255,0.08)',
            }}>
            <span>{t.emoji}</span>{t.label}
          </button>
        ))}
      </div>

      {/* SELECT */}
      {tab === 'select' && (
        <div className="rounded-2xl p-5" style={{backgroundColor:'#0d1526', border:'1px solid rgba(255,255,255,0.1)'}}>
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{color:'#22d3ee'}}>● SELECT SCHEMA</p>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-16 rounded-xl animate-pulse" style={{backgroundColor:'rgba(255,255,255,0.04)'}}/>)}</div>
          ) : schemas.length === 0 ? (
            <div className="py-10 text-center">
              <Layers3 className="mx-auto w-10 h-10 mb-3 opacity-20" style={{color:'#60a5fa'}} />
              <p className="text-sm font-bold" style={{color:'rgba(255,255,255,0.3)'}}>No schemas yet</p>
              <p className="text-xs mt-2" style={{color:'rgba(255,255,255,0.2)'}}>Upload or create a schema using the tabs above</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {schemas.map(s => {
                const sel = schemaId === s.id
                return (
                  <button key={s.id} onClick={() => setSchemaId(s.id)}
                    className="w-full flex items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-all hover:-translate-y-0.5"
                    style={{
                      backgroundColor: sel ? 'rgba(37,99,235,0.12)' : 'rgba(255,255,255,0.02)',
                      border: sel ? '1px solid rgba(37,99,235,0.35)' : '1px solid rgba(255,255,255,0.06)',
                    }}>
                    <div className="flex w-10 h-10 shrink-0 items-center justify-center rounded-xl"
                      style={{background: sel ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.06)'}}>
                      <Layers3 className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{s.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs px-1.5 py-0.5 rounded-md font-bold" style={{backgroundColor:'rgba(37,99,235,0.15)',color:'#60a5fa'}}>{s.field_count} fields</span>
                        {s.domain && <span className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{s.domain}</span>}
                      </div>
                    </div>
                    {sel && <CheckCircle2 className="w-4 h-4 shrink-0" style={{color:'#22c55e'}} />}
                  </button>
                )
              })}
            </div>
          )}
          {schemaId && (
            <div className="mt-4 flex items-center gap-2 rounded-xl px-4 py-2.5" style={{backgroundColor:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.2)'}}>
              <CheckCircle2 className="w-4 h-4 shrink-0" style={{color:'#22c55e'}} />
              <p className="text-xs font-bold" style={{color:'#22c55e'}}>
                Schema: {schemas.find(s=>s.id===schemaId)?.name}
              </p>
            </div>
          )}
        </div>
      )}

      {/* UPLOAD */}
      {tab === 'upload' && (
        <div className="rounded-2xl p-5 space-y-4" style={{backgroundColor:'#0d1526',border:'1px solid rgba(255,255,255,0.1)'}}>
          <p className="text-xs font-bold uppercase tracking-widest" style={{color:'#22d3ee'}}>● UPLOAD SCHEMA JSON</p>
          <label className="flex flex-col items-center justify-center gap-3 rounded-2xl p-10 cursor-pointer border-2 border-dashed transition-all hover:border-blue-500/50"
            style={{borderColor:'rgba(255,255,255,0.12)',backgroundColor:'rgba(255,255,255,0.02)'}}>
            <input type="file" accept=".json" className="hidden" onChange={uploadSchema} />
            {uploading ? <Loader2 className="w-10 h-10 animate-spin text-blue-400" /> : <Upload className="w-10 h-10" style={{color:'rgba(255,255,255,0.3)'}} />}
            <p className="text-base font-black text-white">{uploading ? 'Uploading...' : 'Drop schema JSON here or click to browse'}</p>
            <p className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>Supports LandingAI ADE, native, JSON Schema, or flat field list formats</p>
          </label>
        </div>
      )}

      {/* CREATE */}
      {tab === 'create' && (
        <div className="rounded-2xl p-5 space-y-4" style={{backgroundColor:'#0d1526',border:'1px solid rgba(255,255,255,0.1)'}}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{color:'#22d3ee'}}>● CREATE SCHEMA</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-white/40 mb-1 block">Schema Name *</label>
              <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Equipment Spec" /></div>
            <div><label className="text-xs text-white/40 mb-1 block">Domain</label>
              <input className="input" value={domain} onChange={e=>setDomain(e.target.value)} placeholder="e.g. hvac, energy" /></div>
            <div className="col-span-2"><label className="text-xs text-white/40 mb-1 block">Description</label>
              <input className="input" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Optional" /></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Fields</label>
              <button onClick={addField} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                <Plus className="w-3 h-3" /> Add Field
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {fields.map((f,i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input className="input flex-1 text-xs" placeholder="field_name *" value={f.name}
                    onChange={e=>updateField(i,'name',e.target.value)} style={{padding:'7px 10px'}} />
                  <select className="select text-xs" value={f.type} onChange={e=>updateField(i,'type',e.target.value)}
                    style={{padding:'7px 10px',minWidth:90}}>
                    {FIELD_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                  <input className="input flex-1 text-xs" placeholder="Description" value={f.description}
                    onChange={e=>updateField(i,'description',e.target.value)} style={{padding:'7px 10px'}} />
                  <button onClick={()=>removeField(i)} className="p-1.5 rounded hover:bg-white/[0.08] text-white/20 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <button onClick={saveSchema} disabled={saving}
            className="btn btn-primary w-full gap-2 justify-center">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <>✓ Save & Use Schema</>}
          </button>
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all"
          style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.6)'}}>
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button onClick={onNext} disabled={!schemaId}
          className="flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-black text-white transition-all disabled:opacity-40 hover:-translate-y-0.5"
          style={{background: schemaId ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.06)'}}>
          Next: Engine <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Engine ────────────────────────────────────────────────────────────
function Step3Engine({ providerCfg, setProviderCfg, options, setOptions, onNext, onBack }) {
  const [showKey, setShowKey] = useState(false)
  const update = (k, v) => setProviderCfg(c => ({ ...c, [k]: v }))

  // All providers for dropdown
  const ALL_PROVIDERS = [
    { key: 'none',       label: 'None (Heuristic only)',  model: '',              needsKey: false, needsBaseUrl: false, free: true,  group: 'Free / No Key' },
    { key: 'python',     label: 'Python Heuristic',       model: '',              needsKey: false, needsBaseUrl: false, free: true,  group: 'Free / No Key' },
    { key: 'hybrid',     label: 'Hybrid (Heuristic + AI)',model: '',              needsKey: false, needsBaseUrl: false, free: true,  group: 'Free / No Key' },
    { key: 'ollama',     label: 'Ollama (Local)',          model: '',              needsKey: false, needsBaseUrl: true,  free: true,  group: 'Free / No Key' },
    { key: 'openai',     label: 'OpenAI GPT-4o',          model: 'gpt-4o',        needsKey: true,  needsBaseUrl: false, free: false, group: 'OpenAI' },
    { key: 'anthropic',  label: 'Anthropic Claude',        model: 'claude-3-5-sonnet-20241022', needsKey: true, needsBaseUrl: false, free: false, group: 'Anthropic' },
    { key: 'gemini',     label: 'Google Gemini',           model: 'gemini-1.5-pro',needsKey: true,  needsBaseUrl: false, free: false, group: 'Google' },
    { key: 'groq',       label: 'Groq (LLaMA)',            model: 'llama-3.3-70b-versatile', needsKey: true, needsBaseUrl: false, free: false, group: 'Fast LLMs' },
    { key: 'landingai',  label: 'LandingAI ADE',           model: 'dpt-2-latest',  needsKey: true,  needsBaseUrl: true,  free: false, group: 'LandingAI ADE' },
  ]

  const active = ALL_PROVIDERS.find(p => p.key === providerCfg.provider) || ALL_PROVIDERS[0]

  return (
    <div className="space-y-5">

      {/* ── Provider section ── */}
      <div className="rounded-2xl overflow-hidden" style={{backgroundColor:'#0d1526', border:'1px solid rgba(255,255,255,0.1)'}}>

        {/* Provider dropdown */}
        <div className="px-5 py-4 border-b" style={{borderColor:'rgba(255,255,255,0.07)'}}>
          <label className="text-xs font-bold uppercase tracking-widest mb-2 block" style={{color:'rgba(255,255,255,0.5)'}}>
            Provider
          </label>
          <div className="relative">
            <select
              className="w-full px-4 py-3 rounded-xl text-sm font-semibold text-white appearance-none cursor-pointer transition-all focus:outline-none"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff',
              }}
              value={providerCfg.provider}
              onChange={e => {
                const p = ALL_PROVIDERS.find(x => x.key === e.target.value) || ALL_PROVIDERS[0]
                setProviderCfg(c => ({ ...c, provider: p.key, model: p.model || c.model }))
              }}
            >
              {['Free / No Key', 'OpenAI', 'Anthropic', 'Google', 'Fast LLMs', 'LandingAI ADE'].map(group => (
                <optgroup key={group} label={group}
                  style={{background:'#0d1526', color:'rgba(255,255,255,0.5)'}}>
                  {ALL_PROVIDERS.filter(p => p.group === group).map(p => (
                    <option key={p.key} value={p.key} style={{background:'#0d1526', color:'#fff'}}>
                      {p.label}{p.free ? ' — FREE' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {/* Chevron icon */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <ChevronLeft className="w-4 h-4 -rotate-90" style={{color:'rgba(255,255,255,0.4)'}} />
            </div>
          </div>
          {/* Free badge */}
          {active.free && (
            <div className="mt-2 flex items-center gap-2 text-xs" style={{color:'#86efac'}}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              No API key required — runs locally on your server
            </div>
          )}
        </div>

        {/* API Key */}
        {active.needsKey && (
          <div className="px-5 py-4 border-b" style={{borderColor:'rgba(255,255,255,0.07)'}}>
            <label className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5"
              style={{color:'rgba(255,255,255,0.5)'}}>
              🔑 API Key
            </label>
            <div className="relative">
              <input
                className="input pr-10 text-sm w-full"
                type={showKey ? 'text' : 'password'}
                placeholder="Stored locally in browser"
                value={providerCfg.api_key}
                onChange={e => update('api_key', e.target.value)} />
              <button onClick={() => setShowKey(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Model */}
        {active.needsKey && (
          <div className="px-5 py-4 border-b" style={{borderColor:'rgba(255,255,255,0.07)'}}>
            <label className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5"
              style={{color:'rgba(255,255,255,0.5)'}}>
              🤖 Model
            </label>
            <input
              className="input text-sm w-full"
              placeholder={active.model || 'default'}
              value={providerCfg.model}
              onChange={e => update('model', e.target.value)} />
          </div>
        )}

        {/* Base URL */}
        {active.needsBaseUrl && (
          <div className="px-5 py-4 border-b" style={{borderColor:'rgba(255,255,255,0.07)'}}>
            <label className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5"
              style={{color:'rgba(255,255,255,0.5)'}}>
              🔗 Base URL
            </label>
            <input
              className="input text-sm w-full"
              placeholder={
                active.key === 'ollama' ? 'http://localhost:11434'
                : active.key === 'landingai' ? 'https://va.eu-west-1.landing.ai/' : 'Base URL'
              }
              value={providerCfg.base_url}
              onChange={e => update('base_url', e.target.value)} />
          </div>
        )}

        {/* Security note */}
        <div className="px-5 py-3">
          <p className="text-[11px]" style={{color:'rgba(255,255,255,0.25)'}}>
            API keys and Base URLs are stored locally in your browser and never saved on the server.
          </p>
        </div>
      </div>

      {/* ── OPTIONS ── */}
      <div className="rounded-2xl overflow-hidden" style={{backgroundColor:'#0d1526', border:'1px solid rgba(255,255,255,0.1)'}}>
        <div className="px-5 py-3 border-b" style={{borderColor:'rgba(255,255,255,0.07)'}}>
          <p className="text-xs font-black uppercase tracking-widest" style={{color:'#22d3ee'}}>● OPTIONS</p>
        </div>
        <div className="divide-y" style={{borderColor:'rgba(255,255,255,0.06)'}}>

          {/* Multi-record mode */}
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-bold text-white">Multi-record mode</p>
              <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.4)'}}>
                Extract all model variants from one PDF simultaneously
              </p>
            </div>
            <button
              onClick={() => setOptions(o => ({...o, multi_record: !o.multi_record}))}
              className="relative w-11 h-6 rounded-full transition-all shrink-0"
              style={{
                background: options.multi_record ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.1)',
                boxShadow: options.multi_record ? '0 0 12px rgba(37,99,235,0.4)' : 'none',
              }}>
              <span className="absolute top-0.5 transition-all w-5 h-5 rounded-full bg-white shadow-sm"
                style={{left: options.multi_record ? 22 : 2}} />
            </button>
          </div>

          {/* AI Parse (vision) */}
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-base">🤖</span>
                <p className="text-sm font-bold text-white">AI Parse</p>
                {active.free && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                    style={{background:'rgba(234,179,8,0.15)',color:'#fbbf24'}}>
                    Requires AI key
                  </span>
                )}
              </div>
              <p className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>
                Use AI vision to read dimensions from diagrams and images
              </p>
            </div>
            <button
              onClick={() => setOptions(o => ({...o, vision_parse: !o.vision_parse}))}
              className="relative w-11 h-6 rounded-full transition-all shrink-0"
              style={{
                background: options.vision_parse ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.1)',
                boxShadow: options.vision_parse ? '0 0 12px rgba(37,99,235,0.4)' : 'none',
              }}>
              <span className="absolute top-0.5 transition-all w-5 h-5 rounded-full bg-white shadow-sm"
                style={{left: options.vision_parse ? 22 : 2}} />
            </button>
          </div>

          {/* Smart Retry */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-bold text-white">Smart Retry</p>
                <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.4)'}}>
                  Re-extract low-confidence fields automatically
                </p>
              </div>
              <button
                onClick={() => setOptions(o => ({...o, smart_retry: !o.smart_retry}))}
                className="relative w-11 h-6 rounded-full transition-all shrink-0"
                style={{
                  background: options.smart_retry ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.1)',
                  boxShadow: options.smart_retry ? '0 0 12px rgba(37,99,235,0.4)' : 'none',
                }}>
                <span className="absolute top-0.5 transition-all w-5 h-5 rounded-full bg-white shadow-sm"
                  style={{left: options.smart_retry ? 22 : 2}} />
              </button>
            </div>
            {options.smart_retry && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs" style={{color:'rgba(255,255,255,0.5)'}}>
                    Retry threshold: <strong className="text-white">{options.retry_threshold ?? 50}%</strong> confidence
                  </span>
                </div>
                <input
                  type="range" min="10" max="90" step="5"
                  value={options.retry_threshold ?? 50}
                  onChange={e => setOptions(o => ({...o, retry_threshold: +e.target.value}))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #2563eb ${options.retry_threshold ?? 50}%, rgba(255,255,255,0.1) ${options.retry_threshold ?? 50}%)`,
                    accentColor: '#2563eb',
                  }} />
                <div className="flex justify-between mt-1 text-[9px]" style={{color:'rgba(255,255,255,0.2)'}}>
                  <span>10%</span><span>50%</span><span>90%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all"
          style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.6)'}}>
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button onClick={onNext}
          className="flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-black text-white transition-all hover:-translate-y-0.5"
          style={{background:'linear-gradient(135deg,#2563eb,#7c3aed)'}}>
          Next: Extract <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Step 4: Extracting ────────────────────────────────────────────────────────
function Step4Extract({ running, error }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-6">
      {error ? (
        <>
          <AlertCircle className="w-16 h-16" style={{color:'#ef4444'}} />
          <div>
            <p className="text-xl font-black text-white mb-2">Extraction Failed</p>
            <p className="text-sm" style={{color:'rgba(255,255,255,0.5)'}}>{error}</p>
          </div>
        </>
      ) : (
        <div className="rounded-3xl p-12 space-y-6" style={{backgroundColor:'#0d1526',border:'1px solid rgba(255,255,255,0.1)',minWidth:360}}>
          <div className="relative mx-auto w-20 h-20">
            <div className="w-20 h-20 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Zap className="w-8 h-8" style={{color:'#3b82f6'}} />
            </div>
          </div>
          <div>
            <p className="text-xl font-black text-white">Extracting Data</p>
            <p className="text-sm mt-1 animate-pulse" style={{color:'#60a5fa'}}>
              {running === 'connecting' ? 'Connecting to AI engine...' : 'Processing document...'}
            </p>
          </div>
          <div className="flex justify-center gap-6 text-xs" style={{color:'rgba(255,255,255,0.3)'}}>
            <span>Loading AI ~20s</span>
            <span>GPT-4o ~40s</span>
            <span>Claude ~30s</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Extraction Page ──────────────────────────────────────────────────────
export default function ExtractionPage() {
  const navigate  = useNavigate()
  const { state, set, addJob, goToStep } = useWorkflow()

  const [step,         setStep]         = useState(1)
  const [mode,         setMode]         = useState('single')
  const [selectedIds,  setSelectedIds]  = useState(state.selectedDocIds || [])
  const [schemaId,     setSchemaId]     = useState(state.schema?.id || '')
  const [schemaFields, setSchemaFields] = useState(state.schema?.fields || null)
  const [schemaName,   setSchemaName]   = useState(state.schema?.name || '')
  const [providerCfg,  setProviderCfg]  = useState(state.providerConfig || {provider:'none',api_key:'',model:'',base_url:''})
  const [options,      setOptions]      = useState({
    multi_record:    false,
    vision_parse:    false,
    smart_retry:     true,
    retry_threshold: 50,
  })
  const [running,      setRunning]      = useState(false)
  const [runError,     setRunError]     = useState(null)
  const [jobIds,       setJobIds]       = useState([])
  const [batchRunId,   setBatchRunId]   = useState(null)

  // ── Guest limit check ──────────────────────────────────────────────────────
  const guestMode     = isGuest()
  const guestLimits   = guestMode ? getGuestLimits() : null
  const extractLocked = guestMode && guestLimits && guestLimits.extractionRemaining <= 0

  // Refresh guest usage from server on mount so counts are always current
  useEffect(() => {
    if (guestMode) refreshGuestUsage()
  }, [])

  // Sync to global state
  useEffect(() => { set({ selectedDocIds: selectedIds }) }, [selectedIds])
  useEffect(() => { if (schemaId) set({ schema: { id: schemaId } }) }, [schemaId])
  useEffect(() => { set({ providerConfig: providerCfg }) }, [providerCfg])

  // If workflow pre-selected docs/schema
  useEffect(() => {
    if (state.selectedDocIds.length > 0 && selectedIds.length === 0)
      setSelectedIds(state.selectedDocIds)
    if (state.schema?.id && !schemaId)
      setSchemaId(state.schema.id)
  }, [])

  const runExtract = async () => {
    if (!selectedIds.length || !schemaId) return

    // ── Guest limit check ──────────────────────────────────────────────────
    if (isGuest()) {
      const limits = getGuestLimits()
      if (!limits || limits.extractionRemaining <= 0) {
        toast.error(`Trial limit reached. You've used all ${limits?.extractionLimit || 2} extractions. Contact admin for more access.`)
        return
      }
      if (selectedIds.length > limits.extractionRemaining) {
        toast.error(`You can only extract ${limits.extractionRemaining} more document(s). Deselect ${selectedIds.length - limits.extractionRemaining} document(s).`)
        return
      }
    }

    setStep(4)
    setRunning('connecting')
    setRunError(null)
    const created = []
    const failed  = []

    // Generate a shared batch_run_id for all jobs in this extraction run
    const batchRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    for (const docId of selectedIds) {
      try {
        const extractionPayload = (isGuest() && schemaFields)
          ? {
              document_id:     docId,
              schema:          { name: schemaName || schemaId, fields: schemaFields },
              provider_config: providerCfg,
              batch_run_id:    batchRunId,
              options: {
                multi_record:    options.multi_record,
                vision_parse:    options.vision_parse,
                smart_retry:     options.smart_retry,
                retry_threshold: (options.retry_threshold ?? 50) / 100,
              },
            }
          : {
              document_id:     docId,
              schema_id:       schemaId,
              provider_config: providerCfg,
              batch_run_id:    batchRunId,
              options: {
                multi_record:    options.multi_record,
                vision_parse:    options.vision_parse,
                smart_retry:     options.smart_retry,
                retry_threshold: (options.retry_threshold ?? 50) / 100,
              },
            }

        const result = await runExtraction(extractionPayload)
        created.push(result.job_id)

        const fields = result.fields || result.result || {}
        const confs  = result.confidence_scores || result.confidence || {}
        const srcs   = result.source_references || result.sources || {}
        const allRec = result.all_records || result.records || null
        const qualScore = result.quality_score ??
          (typeof result.quality === 'object' ? result.quality?.score : result.quality) ?? null

        addJob({
          job_id:            result.job_id,
          document_id:       docId,
          schema_name:       result.schema_name || schemaName || schemaId,
          status:            result.status || 'completed',
          fields,
          all_records:       allRec,
          total_records:     result.total_records ?? (allRec?.length ?? null),
          quality_score:     qualScore,
          confidence_scores: confs,
          source_references: srcs,
          failure_log:       result.failure_log || [],
          error:             result.error,
          batch_run_id:      batchRunId,
        })

        // Increment guest extraction counter after each successful extraction
        if (isGuest()) {
          const token = getGuestToken()
          if (token) {
            try {
              await api.post('/guests/increment-extraction', {}, {
                headers: { 'X-Guest-Token': token }
              })
              await refreshGuestUsage()
              // Log activity
              logGuestActivity('extraction', `doc=${docId} engine=${providerCfg.provider}`)
            } catch (err) {
              console.warn('Could not update guest extraction counter:', err.message)
            }
          }
        }
      } catch (e) {
        failed.push({ docId, error: e.message })
      }
    }

    setRunning(false)
    setJobIds(created)
    setBatchRunId(batchRunId)
    goToStep(12)

    if (created.length > 0) {
      toast.success(`${created.length} extraction(s) completed!`)
      setStep(5)
    } else {
      const err = failed[0]?.error || 'All extractions failed'
      setRunError(err)
      toast.error('Extraction failed: ' + err)
    }
  }

  const CONTENT = {
    1: <Step1Upload mode={mode} setMode={setMode}
          selectedIds={selectedIds} setSelectedIds={setSelectedIds}
          onNext={() => setStep(2)} />,
    2: <Step2Schema schemaId={schemaId} setSchemaId={setSchemaId}
          setSchemaFields={setSchemaFields} setSchemaName={setSchemaName}
          onNext={() => setStep(3)} onBack={() => setStep(1)} />,
    3: <Step3Engine providerCfg={providerCfg} setProviderCfg={setProviderCfg}
          options={options} setOptions={setOptions}
          onNext={runExtract} onBack={() => setStep(2)} />,
    4: <Step4Extract running={running} error={runError} />,
    5: null,
  }

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-white/30 mb-1">Steps 8–11</p>
        <h1 className="text-2xl font-black text-white">Extraction Pipeline</h1>
        <p className="text-white/40 text-sm mt-0.5">
          Upload documents, choose a schema and AI engine, then extract structured data.
        </p>
      </div>

      {/* Guest trial usage indicator */}
      {guestMode && guestLimits && (
        <div className="mb-5 rounded-2xl px-5 py-3.5 flex items-center justify-between"
          style={{
            background: extractLocked ? 'rgba(239,68,68,0.08)' : 'rgba(37,99,235,0.07)',
            border: `1px solid ${extractLocked ? 'rgba(239,68,68,0.2)' : 'rgba(37,99,235,0.15)'}`,
          }}>
          <div className="flex items-center gap-3 text-sm">
            {extractLocked
              ? <><Lock className="w-4 h-4 shrink-0 text-red-400" /><span className="font-bold text-red-400">Extraction limit reached</span></>
              : <><span className="text-blue-400">⚡</span><span className="text-white/60">Extraction:</span></>
            }
            {!extractLocked && (
              <span>
                <strong className="text-white">{guestLimits.extractionsUsed}</strong>
                <span className="text-white/30"> / </span>
                <strong className="text-white">{guestLimits.extractionLimit}</strong>
                <span className="text-white/40"> used · </span>
                <strong style={{color: guestLimits.extractionRemaining <= 1 ? '#fbbf24' : '#34d399'}}>
                  {guestLimits.extractionRemaining} remaining
                </strong>
              </span>
            )}
          </div>
          {extractLocked && (
            <span className="text-xs text-red-300/70">Contact admin to increase limit</span>
          )}
        </div>
      )}

      {/* Locked overlay when guest extraction limit reached */}
      {extractLocked ? (
        <div className="rounded-3xl p-12 text-center space-y-5"
          style={{background:'rgba(239,68,68,0.06)', border:'2px solid rgba(239,68,68,0.2)'}}>
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto"
            style={{background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)'}}>
            <Lock className="w-10 h-10 text-red-400" />
          </div>
          <div>
            <p className="text-xl font-black text-white">Trial Extraction Limit Reached</p>
            <p className="text-sm mt-2 max-w-md mx-auto" style={{color:'rgba(255,255,255,0.5)'}}>
              You have used all <strong className="text-white">{guestLimits.extractionLimit}</strong> extractions
              in your guest trial. Contact the administrator to get additional access.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm"
            style={{background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', color:'#fca5a5'}}>
            📧 chandra.paidimukkala@aquarient.com
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <button onClick={() => navigate('/results')}
              className="btn btn-secondary gap-2">
              <BarChart3 className="w-4 h-4" /> View Previous Results
            </button>
            <button onClick={() => navigate('/library')}
              className="btn btn-secondary gap-2">
              ← Back to Library
            </button>
          </div>
        </div>
      ) : (
        <>
          <StepBar current={step} />

          {/* Step content */}
          {step < 5 && CONTENT[step]}

          {/* Step 5: Results summary */}
          {step === 5 && (
            <div className="text-center space-y-6 py-8">
              <div className="flex items-center justify-center gap-3">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{background:'linear-gradient(135deg,#22c55e,#16a34a)',boxShadow:'0 0 30px rgba(34,197,94,0.4)'}}>
                  <CheckCircle2 className="w-8 h-8 text-white" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-white">Extraction Complete!</p>
                <p className="text-white/50 mt-1">{jobIds.length} extraction{jobIds.length !== 1 ? 's' : ''} finished successfully</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button onClick={() => navigate(`/results?batch=${batchRunId || ''}`)}
                  className="btn btn-primary gap-2 px-8 py-3 text-base">
                  <BarChart3 className="w-5 h-5" /> View Results
                </button>
                <button onClick={() => { setStep(1); setSelectedIds([]); setSchemaId(''); setJobIds([]); setBatchRunId(null); setRunError(null) }}
                  className="btn btn-secondary gap-2 px-6 py-3">
                  ↩ New Extraction
                </button>
              </div>
            </div>
          )}

          {/* Error retry */}
          {step === 4 && runError && (
            <div className="flex justify-center mt-6">
              <button onClick={() => { setStep(3); setRunError(null) }}
                className="btn btn-secondary gap-2">
                <ChevronLeft className="w-4 h-4" /> Back to Engine
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
