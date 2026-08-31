import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, RefreshCw, Trash2, RotateCcw, Edit2, Save, X,
  Shield, ChevronDown, ChevronUp, CheckCircle2, Clock,
  Bell, Activity, ThumbsUp, ThumbsDown, Key, Globe, Zap, Eraser,
  FileText, BarChart3, AlertCircle, Eye, EyeOff, Upload, Loader2, Layers3
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { isAdmin, logout } from '../lib/auth'

// ── Security Panel — change admin password ────────────────────────────────────
function SecurityPanel() {
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd,     setNewPwd]     = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [showCur,    setShowCur]    = useState(false)
  const [showNew,    setShowNew]    = useState(false)

  const handleChange = async (e) => {
    e.preventDefault()
    if (newPwd.length < 8) { toast.error('Password must be at least 8 characters'); return }
    if (newPwd !== confirmPwd) { toast.error('Passwords do not match'); return }
    setSaving(true)
    try {
      await api.post('/admin/change-password', { current_password: currentPwd, new_password: newPwd })
      toast.success('Password changed successfully!')
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
    } catch (e) { toast.error(e.message || 'Failed to change password') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)' }}>
            <Shield className="w-5 h-5" style={{ color: '#a78bfa' }} />
          </div>
          <div>
            <p className="text-sm font-black text-white">Change Admin Password</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Default: <span className="font-mono">Admin@2024!</span> — change it here
            </p>
          </div>
        </div>

        <form onSubmit={handleChange} className="space-y-4">
          {/* Current password */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
              style={{ color: 'rgba(255,255,255,0.4)' }}>Current Password</label>
            <div className="relative">
              <input className="input text-sm w-full pr-10"
                type={showCur ? 'text' : 'password'}
                placeholder="Enter current password"
                value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} required />
              <button type="button" onClick={() => setShowCur(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'rgba(255,255,255,0.3)' }}>
                {showCur ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
              style={{ color: 'rgba(255,255,255,0.4)' }}>New Password</label>
            <div className="relative">
              <input className="input text-sm w-full pr-10"
                type={showNew ? 'text' : 'password'}
                placeholder="Min 8 characters"
                value={newPwd} onChange={e => setNewPwd(e.target.value)} required />
              <button type="button" onClick={() => setShowNew(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'rgba(255,255,255,0.3)' }}>
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {/* Strength indicator */}
            {newPwd.length > 0 && (
              <div className="flex items-center gap-2 mt-1.5">
                {['weak','fair','good','strong'].map((s, i) => {
                  const score = newPwd.length >= 12 && /[A-Z]/.test(newPwd) && /[0-9]/.test(newPwd) && /[^a-zA-Z0-9]/.test(newPwd) ? 3
                    : newPwd.length >= 10 && /[A-Z]/.test(newPwd) ? 2
                    : newPwd.length >= 8 ? 1 : 0
                  const colors = ['#ef4444','#f59e0b','#22c55e','#3b82f6']
                  return <div key={s} className="h-1 flex-1 rounded-full"
                    style={{ background: i <= score ? colors[score] : 'rgba(255,255,255,0.1)' }} />
                })}
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {newPwd.length < 8 ? 'weak' : newPwd.length < 10 ? 'fair' : newPwd.length < 12 ? 'good' : 'strong'}
                </span>
              </div>
            )}
          </div>

          {/* Confirm */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
              style={{ color: 'rgba(255,255,255,0.4)' }}>Confirm New Password</label>
            <input className="input text-sm w-full"
              type="password"
              placeholder="Repeat new password"
              value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required />
            {confirmPwd && newPwd !== confirmPwd && (
              <p className="text-[10px] mt-1 text-red-400">Passwords do not match</p>
            )}
            {confirmPwd && newPwd === confirmPwd && (
              <p className="text-[10px] mt-1 text-green-400">✓ Passwords match</p>
            )}
          </div>

          <button type="submit" disabled={saving || newPwd !== confirmPwd || newPwd.length < 8}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black text-white disabled:opacity-40 transition-all hover:-translate-y-0.5"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)' }}>
            {saving
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
              : <><Shield className="w-4 h-4" /> Update Password</>}
          </button>
        </form>
      </div>

      <div className="card p-5">
        <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: '#22d3ee' }}>● SECURITY TIPS</p>
        <div className="space-y-2 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
          <p>✓ Use at least 12 characters with a mix of uppercase, numbers, and symbols</p>
          <p>✓ Never share your admin password with guests</p>
          <p>✓ Change the default password immediately after first login</p>
          <p>✓ Admin access is also restricted by email whitelist in <span className="font-mono text-white/60">admin_config.py</span></p>
        </div>
      </div>
    </div>
  )
}

// ── Default Schema Panel ──────────────────────────────────────────────────────
function DefaultSchemaPanel() {
  const [current,   setCurrent]   = useState(null)
  const [uploading, setUploading] = useState(false)

  const loadCurrent = () => {
    api.get('/admin/default-schema')
      .then(r => { if (r.data?.configured) setCurrent(r.data) })
      .catch(() => {})
  }
  useEffect(() => { loadCurrent() }, [])

  const save = async () => {
    const s = schemas.find(x => x.id === selected)
    if (!s) { toast.error('Select a schema first'); return }
    setSaving(true)
    try {
      await api.post('/admin/default-schema', {
        schema_id:   s.id,
        schema_name: s.name,
        description: s.description || '',
        fields:      s.fields || [],
      })
      setCurrent({ configured: true, schema_id: s.id, schema_name: s.name })
      toast.success(`Default schema set: ${s.name}`)
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const handleUploadAndSetDefault = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setUploading(true)
    try {
      // Upload schema to DB first
      const fd = new FormData(); fd.append('file', file)
      const r = await api.post('/api/v1/schemas/upload', fd)
      const s = r.data
      // Then set it as default immediately
      await api.post('/admin/default-schema', {
        schema_id:   s.id,
        schema_name: s.name,
        description: s.description || '',
        fields:      s.fields || [],
      })
      setCurrent({ configured: true, schema_id: s.id, schema_name: s.name })
      toast.success(`Schema uploaded & set as default: ${s.name}`)
      loadCurrent()
    } catch (e) {
      const msg = e.message || ''
      if (msg.includes('Not Found') || msg.includes('404') || msg.includes('not found')) {
        toast.error('Please restart the backend (start.bat) to activate new endpoints')
      } else {
        toast.error(msg)
      }
    }
    finally { setUploading(false); e.target.value = '' }
  }

  const clear = async () => {
    try {
      await api.delete('/admin/default-schema').catch(() => {})
      setCurrent(null); setSelected('')
      toast.success('Default schema removed')
    } catch {}
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)' }}>
          <Layers3 className="w-4 h-4" style={{ color: '#a78bfa' }} />
        </div>
        <div>
          <p className="text-sm font-black text-white">Guest Default Schema</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Set one schema — guests see only this, pre-selected
          </p>
        </div>
      </div>

      {current?.configured && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl"
          style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
          <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="text-xs font-bold flex-1" style={{ color: '#c4b5fd' }}>
            Active: {current.schema_name}
          </span>
          <button onClick={clear} className="text-[10px] text-red-400/60 hover:text-red-400">Remove</button>
        </div>
      )}

      {/* Upload a JSON schema and set as default in one step */}
      <div className="mb-3">
        <label className="w-full flex items-center justify-center gap-2 py-3 rounded-xl cursor-pointer transition-all hover:-translate-y-0.5 text-sm font-bold text-white"
          style={{ background: 'rgba(37,99,235,0.12)', border: '1px dashed rgba(37,99,235,0.35)', color: '#60a5fa' }}>
          {uploading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading & Setting Default...</>
            : <><Upload className="w-4 h-4" /> Upload JSON Schema & Set as Default</>}
          <input type="file" accept=".json" className="hidden" onChange={handleUploadAndSetDefault} disabled={uploading} />
        </label>
        <p className="text-[10px] mt-2 text-center" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Upload a schema JSON file → automatically saves and sets it as the only schema guests see
        </p>
      </div>
    </div>
  )
}

// ── Sample PDF Panel ──────────────────────────────────────────────────────────
function SamplePdfPanel() {
  const [info,    setInfo]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)

  const load = () => {
    setLoading(true)
    api.get('/admin/sample-pdf')
      .then(r => setInfo(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const handleUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setSaving(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await api.post('/admin/sample-pdf', fd)
      toast.success(`Sample PDF set: ${r.data.filename}`)
      load()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false); e.target.value = '' }
  }

  const handleDelete = async () => {
    if (!window.confirm('Remove the sample PDF?')) return
    await api.delete('/admin/sample-pdf').catch(() => {})
    toast.success('Sample PDF removed')
    setInfo({ configured: false })
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
          <FileText className="w-4 h-4" style={{ color: '#34d399' }} />
        </div>
        <div>
          <p className="text-sm font-black text-white">Guest Sample PDF</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Set a default PDF that guests can test with — free, no quota used
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-white/30">Loading...</div>
      ) : info?.configured ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{info.filename}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {info.size ? `${(info.size / 1024).toFixed(1)} KB` : ''} · Guests can use this for free
              </p>
            </div>
            <button onClick={handleDelete}
              className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
              style={{ color: 'rgba(255,255,255,0.3)' }}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <label className="btn btn-secondary gap-2 cursor-pointer text-xs">
            <Upload className="w-3.5 h-3.5" /> Replace PDF
            <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
            No sample PDF set yet. Upload a PDF that guests can test without using their quota.
          </p>
          <label className="w-full flex items-center justify-center gap-2 py-3 rounded-xl cursor-pointer transition-all hover:-translate-y-0.5 text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg,rgba(34,197,94,0.3),rgba(34,197,94,0.15))', border: '1px solid rgba(34,197,94,0.3)' }}>
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
              : <><Upload className="w-4 h-4" /> Upload Sample PDF</>}
            <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={saving} />
          </label>
        </div>
      )}
    </div>
  )
}

// ── LandingAI Config Panel — Up to 5 API keys with auto-fallback ─────────────
function LandingAIConfigPanel() {
  const EMPTY_KEY  = { key: '', base_url: '', label: '', active: true }
  const [slots,    setSlots]    = useState([{ ...EMPTY_KEY }, { ...EMPTY_KEY }, { ...EMPTY_KEY }, { ...EMPTY_KEY }, { ...EMPTY_KEY }])
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [status,   setStatus]   = useState(null)
  const [credits,  setCredits]  = useState(null)
  const [loadingCredits, setLoadingCredits] = useState(false)
  const [showKeys, setShowKeys] = useState([false,false,false,false,false])

  const loadConfig = () => {
    setLoading(true)
    api.get('/admin/landingai-config')
      .then(r => {
        setStatus(r.data)
        // Populate slots from pool
        const pool = r.data.api_keys || []
        const newSlots = [0,1,2,3,4].map(i => pool[i]
          ? { key: '', base_url: pool[i].base_url || '', label: pool[i].label || `Key ${i+1}`, active: pool[i].active !== false, _hasKey: pool[i].has_key, _masked: pool[i].masked, _failed: pool[i].failed }
          : { ...EMPTY_KEY, label: `Key ${i+1}` }
        )
        setSlots(newSlots)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const loadCredits = () => {
    setLoadingCredits(true)
    api.get('/admin/landingai-credits').then(r => setCredits(r.data)).catch(() => {}).finally(() => setLoadingCredits(false))
  }

  useEffect(() => { loadConfig(); loadCredits() }, [])

  const updateSlot = (i, field, val) => setSlots(s => s.map((sl, idx) => idx === i ? { ...sl, [field]: val } : sl))

  const save = async () => {
    const validSlots = slots.filter(s => s.key.trim() || s._hasKey)
    if (!validSlots.length) { toast.error('Enter at least one API key'); return }
    setSaving(true)
    try {
      // Build payload — only include slots with a new key or existing key
      const payload = slots.map((s, i) => ({
        key:      s.key.trim(),          // empty = keep existing (server handles)
        base_url: s.base_url.trim(),
        label:    s.label.trim() || `Key ${i+1}`,
        active:   s.active,
      })).filter((s, i) => s.key || slots[i]._hasKey)

      await api.post('/admin/landingai-config-pool', { api_keys: payload })
      toast.success(`${payload.length} LandingAI key(s) saved — automatic fallback enabled!`)
      loadConfig()
      setSlots(s => s.map(sl => ({ ...sl, key: '' })))  // clear plaintext after save
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const toggleShow = (i) => setShowKeys(s => s.map((v, idx) => idx === i ? !v : v))

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="card p-5" style={{ border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.04)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)' }}>
            <Zap className="w-4 h-4" style={{ color: '#fbbf24' }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-white">LandingAI Key Pool — Up to 5 Keys</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Keys are used in order. When Key 1 runs out of credits, Key 2 activates automatically, and so on.
            </p>
          </div>
          {status?.configured && (
            <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
              style={{ background: 'rgba(34,197,94,0.15)', color: '#34d399', border: '1px solid rgba(34,197,94,0.25)' }}>
              <CheckCircle2 className="w-3 h-3" /> Active · {status.pool_size || 1} key{(status.pool_size || 1) !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* 5 key slots */}
        <div className="space-y-3">
          {slots.map((slot, i) => {
            const hasSaved = slot._hasKey
            const isFailed = slot._failed
            const slotColor = isFailed ? '#f87171' : hasSaved ? '#34d399' : 'rgba(255,255,255,0.2)'
            return (
              <div key={i} className="rounded-xl p-4 space-y-2.5"
                style={{
                  background: hasSaved ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${hasSaved ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.07)'}`,
                }}>
                {/* Slot header */}
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0"
                    style={{ background: hasSaved ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)', color: slotColor }}>
                    {i + 1}
                  </div>
                  <span className="text-xs font-bold" style={{ color: slotColor }}>
                    {isFailed ? '⚠ Quota exhausted' : hasSaved ? '✓ Key configured' : 'Empty slot'}
                  </span>
                  {hasSaved && slot._masked && (
                    <span className="text-[10px] font-mono ml-1" style={{ color: '#fbbf24' }}>{slot._masked}</span>
                  )}
                  {/* Active toggle */}
                  <div className="ml-auto flex items-center gap-2">
                    {hasSaved && (
                      <label className="flex items-center gap-1.5 text-[10px] cursor-pointer select-none"
                        style={{ color: slot.active ? '#34d399' : 'rgba(255,255,255,0.3)' }}>
                        <input type="checkbox" checked={slot.active} onChange={e => updateSlot(i, 'active', e.target.checked)}
                          className="w-3 h-3 accent-green-400" />
                        {slot.active ? 'Active' : 'Disabled'}
                      </label>
                    )}
                  </div>
                </div>

                {/* Key input */}
                <div className="relative">
                  <input
                    className="input text-sm w-full pr-10"
                    type={showKeys[i] ? 'text' : 'password'}
                    placeholder={hasSaved ? `Enter new key to replace ...${slot._masked?.slice(-6) || ''}` : `LandingAI API key ${i + 1}`}
                    value={slot.key}
                    onChange={e => updateSlot(i, 'key', e.target.value)}
                  />
                  <button onClick={() => toggleShow(i)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors text-[10px]">
                    {showKeys[i] ? '🙈' : '👁'}
                  </button>
                </div>

                {/* Region + Label row */}
                <div className="grid grid-cols-2 gap-2">
                  <input className="input text-xs"
                    placeholder="Region (optional — e.g. eu-west-1)"
                    value={slot.base_url}
                    onChange={e => updateSlot(i, 'base_url', e.target.value)} />
                  <input className="input text-xs"
                    placeholder={`Label (e.g. "Primary", "Backup 1")`}
                    value={slot.label === `Key ${i+1}` ? '' : slot.label}
                    onChange={e => updateSlot(i, 'label', e.target.value)} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Save button */}
        <div className="mt-4 flex items-center gap-3">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
            {saving
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</>
              : <><Zap className="w-4 h-4" /> Save Key Pool</>}
          </button>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Keys rotate automatically when quota is reached
          </p>
        </div>
      </div>

      {/* Credits card */}
      <div className="card p-5" style={{ border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.04)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.15)' }}>
              <Zap className="w-3.5 h-3.5" style={{ color: '#818cf8' }} />
            </div>
            <p className="text-sm font-black text-white">Credit Usage</p>
          </div>
          <button onClick={loadCredits} disabled={loadingCredits}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingCredits ? 'animate-spin' : ''}`}
              style={{ color: 'rgba(255,255,255,0.4)' }} />
          </button>
        </div>

        {credits ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Credits Used',  value: credits.total_credits_consumed?.toLocaleString() || '0', color: '#818cf8' },
                { label: 'Est. Cost',     value: `$${credits.cost_estimate_usd || '0.00'}`,                color: '#34d399' },
                { label: 'Total Jobs',    value: credits.landingai_jobs_total || 0,                        color: '#60a5fa' },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-3 text-center"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-lg font-black" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.label}</p>
                </div>
              ))}
            </div>
            {credits.daily_breakdown?.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                  style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.3)' }}>Last 30 days</div>
                <div className="max-h-40 overflow-y-auto divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  {credits.daily_breakdown.slice(0, 10).map(d => (
                    <div key={d.date} className="flex items-center justify-between px-3 py-2">
                      <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>{d.date}</span>
                      <span className="text-xs font-bold" style={{ color: '#818cf8' }}>
                        {d.credits} credits <span className="text-[10px] ml-1" style={{ color: 'rgba(255,255,255,0.25)' }}>(~${(d.credits * 0.01).toFixed(3)})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[10px] text-center" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Exact balance →{' '}
              <a href="https://ade.landing.ai/settings/billing" target="_blank" rel="noreferrer"
                className="underline" style={{ color: '#818cf8' }}>LandingAI Billing ↗</a>
            </p>
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="w-5 h-5 border-2 border-white/10 border-t-indigo-400 rounded-full animate-spin mx-auto" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Action type label map ─────────────────────────────────────────────────────
const ACTION_LABELS = {
  crawl_url:       { label: 'Crawled URL',         color: '#60a5fa', icon: '🔍' },
  pdf_fetch:       { label: 'PDF Fetched',          color: '#34d399', icon: '📄' },
  extraction:      { label: 'Extraction Run',       color: '#a78bfa', icon: '⚡' },
  export_attempt:  { label: 'Export Attempted',     color: '#fbbf24', icon: '📊' },
  access_request:  { label: 'Access Requested',     color: '#f87171', icon: '🔔' },
  access_approved: { label: 'Access Approved',      color: '#22c55e', icon: '✅' },
}

// ── Activity log panel per guest ──────────────────────────────────────────────
function ActivityPanel({ guestId }) {
  const [log,     setLog]     = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/admin/guests/${guestId}/activity`)
      setLog(res.data.activities || [])
    } catch (e) { toast.error('Failed to load activity') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [guestId])

  if (loading) return (
    <div className="py-6 text-center">
      <div className="w-6 h-6 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin mx-auto" />
    </div>
  )

  if (!log || log.length === 0) return (
    <div className="py-6 text-center text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>No activity recorded yet</div>
  )

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {log.map(a => {
        const meta = ACTION_LABELS[a.action] || { label: a.action, color: '#94a3b8', icon: '·' }
        return (
          <div key={a.id} className="flex items-start gap-3 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <span className="text-sm shrink-0 mt-0.5">{meta.icon}</span>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-bold" style={{ color: meta.color }}>{meta.label}</span>
              {a.detail && <span className="text-xs ml-2 truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{a.detail}</span>}
            </div>
            <span className="text-[10px] shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {a.created_at ? new Date(a.created_at).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true, timeZone:'Asia/Kolkata' }) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Access requests panel ─────────────────────────────────────────────────────
function AccessRequestsPanel({ onRefreshGuests }) {
  const [requests, setRequests] = useState([])
  const [loading,  setLoading]  = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/access-requests')
      setRequests(res.data.requests || [])
    } catch (e) { toast.error('Failed to load access requests') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const approve = async (id, guestName) => {
    try {
      await api.post(`/admin/access-requests/${id}/approve`)
      toast.success(`Approved request for ${guestName}`)
      load(); onRefreshGuests()
    } catch (e) { toast.error(e.message) }
  }

  const decline = async (id, guestName) => {
    if (!window.confirm(`Decline request from ${guestName}?`)) return
    try {
      await api.post(`/admin/access-requests/${id}/decline`)
      toast.success('Request declined')
      load()
    } catch (e) { toast.error(e.message) }
  }

  const TYPE_LABELS = {
    pdf_fetch:   '📄 More PDF Fetches',
    extraction:  '⚡ More Extractions',
    export:      '📊 Export Access',
    full_access: '🚀 Full Platform Access',
  }

  if (loading) return <div className="py-8 text-center"><div className="w-6 h-6 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin mx-auto" /></div>

  if (requests.length === 0) return (
    <div className="py-10 text-center">
      <Bell className="w-10 h-10 mx-auto mb-2 text-white/10" />
      <div className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>No pending access requests</div>
    </div>
  )

  return (
    <div className="space-y-3">
      {requests.map(r => (
        <div key={r.id} className="rounded-xl p-4"
          style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-white">{r.guest_name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                  style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}>
                  {TYPE_LABELS[r.request_type] || r.request_type}
                </span>
              </div>
              <div className="text-xs mb-1" style={{ color: '#60a5fa' }}>{r.guest_email}</div>
              {r.guest_company && <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{r.guest_company}</div>}
              {r.note && <div className="text-xs italic" style={{ color: 'rgba(255,255,255,0.5)' }}>"{r.note}"</div>}
              <div className="flex gap-3 mt-2 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                <span>PDF: {r.current_usage?.pdf_fetched}/{r.current_usage?.pdf_fetch_limit}</span>
                <span>Extractions: {r.current_usage?.extractions_used}/{r.current_usage?.extraction_limit}</span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => approve(r.id, r.guest_name)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
                <ThumbsUp className="w-3 h-3" /> Approve
              </button>
              <button onClick={() => decline(r.id, r.guest_name)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                <ThumbsDown className="w-3 h-3" /> Decline
              </button>
            </div>
          </div>
          <div className="mt-2 text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Requested: {r.created_at ? new Date(r.created_at).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true, timeZone:'Asia/Kolkata' }) : '—'}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main AdminPage ────────────────────────────────────────────────────────────
export default function AdminPage() {
  const navigate      = useNavigate()
  const [guests,      setGuests]      = useState([])
  const [stats,       setStats]       = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [editId,      setEditId]      = useState(null)
  const [editLimits,  setEditLimits]  = useState({})
  const [testingEmail,setTestingEmail]= useState(false)
  const [expandedId,  setExpandedId]  = useState(null)
  const [activeTab,   setActiveTab]   = useState('guests')
  const [extLogs,     setExtLogs]     = useState([])
  const [extLoading,  setExtLoading]  = useState(false)
  const [extTotal,    setExtTotal]    = useState(0)
  const [extFilter,   setExtFilter]   = useState('')  // status filter

  useEffect(() => { if (!isAdmin()) navigate('/login') }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/guests')
      setGuests(res.data.guests || [])
      setStats(res.data.stats || null)
    } catch (e) {
      toast.error('Failed to load guests: ' + e.message)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const loadExtLogs = async () => {
    setExtLoading(true)
    try {
      const params = extFilter ? `?status=${extFilter}&limit=200` : '?limit=200'
      const res = await api.get(`/api/v1/extraction/admin/all${params}`)
      setExtLogs(res.data.jobs || [])
      setExtTotal(res.data.total || 0)
    } catch (e) { toast.error('Failed to load logs: ' + e.message) }
    finally { setExtLoading(false) }
  }

  useEffect(() => { if (activeTab === 'logs') loadExtLogs() }, [activeTab, extFilter])

  const deleteGuest = async (id, name) => {
    if (!window.confirm(`Delete guest "${name}"? This cannot be undone.`)) return
    try {
      await api.delete(`/admin/guests/${id}`)
      toast.success(`Deleted ${name}`)
      load()
    } catch (e) { toast.error(e.message) }
  }

  const deleteExtJob = async (jobId) => {
    if (!window.confirm('Delete this extraction job?')) return
    try {
      await api.delete(`/api/v1/extraction/admin/${jobId}`)
      toast.success('Job deleted')
      loadExtLogs()
    } catch (e) { toast.error(e.message) }
  }

  const resetUsage = async (id, name) => {
    try {
      await api.post(`/admin/guests/${id}/reset-usage`)
      toast.success(`Reset usage for ${name}`)
      load()
    } catch (e) { toast.error(e.message) }
  }

  const clearGuestData = async (id, name) => {
    if (!window.confirm(`Clear ALL extraction data for "${name}"?\nThe account stays, but all their jobs will be permanently deleted.`)) return
    try {
      const r = await api.delete(`/admin/guests/${id}/data`)
      toast.success(`Cleared ${r.data.jobs_deleted} job(s) for ${name}`)
      load()
    } catch (e) { toast.error(e.message) }
  }

  const toggleUpload = async (g) => {
    try {
      await api.put(`/admin/guests/${g.id}/limits`, { upload_allowed: !g.upload_allowed })
      toast.success(g.upload_allowed ? `Upload revoked for ${g.full_name}` : `Upload granted to ${g.full_name}`)
      load()
    } catch (e) { toast.error(e.message) }
  }

  const toggleExport = async (g) => {
    try {
      await api.put(`/admin/guests/${g.id}/limits`, { export_allowed: !g.export_allowed })
      toast.success(g.export_allowed ? `Export revoked for ${g.full_name}` : `Export granted to ${g.full_name}`)
      load()
    } catch (e) { toast.error(e.message) }
  }

  const saveLimit = async (id) => {
    try {
      await api.put(`/admin/guests/${id}/limits`, editLimits)
      toast.success('Limits updated')
      setEditId(null)
      load()
    } catch (e) { toast.error(e.message) }
  }

  const startEdit = (g) => {
    setEditId(g.id)
    setEditLimits({ pdf_fetch_limit: g.pdf_fetch_limit, extraction_limit: g.extraction_limit })
  }

  const testEmail = async () => {
    setTestingEmail(true)
    try {
      const res = await api.post('/admin/notify-test')
      toast.success(res.data.message || 'Test email sent!')
    } catch (e) {
      toast.error('Email test failed: ' + (e.response?.data?.detail || e.message))
    } finally { setTestingEmail(false) }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-white/30 mb-1">
            <Shield className="w-3 h-3" />
            <span className="text-white/60 font-medium">Admin Panel</span>
          </div>
          <h1 className="text-2xl font-black text-white">Guest Management</h1>
          <p className="text-white/40 text-sm mt-0.5">Manage guests, monitor usage, review access requests</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} disabled={loading} className="btn btn-secondary gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {/* Export sales leads — business emails only */}
          <button
            onClick={() => {
              const leads = guests.filter(g => g.is_business_email)
              if (!leads.length) { toast('No business emails found yet', { icon: 'ℹ️' }); return }
              const csv = [
                'Name,Email,Company,Role,Extractions Used,Registered,Email Verified',
                ...leads.map(g => [
                  `"${g.full_name}"`,
                  `"${g.email}"`,
                  `"${g.company || ''}"`,
                  `"${g.current_role || ''}"`,
                  g.extractions_used,
                  g.created_at ? new Date(g.created_at).toLocaleDateString('en-IN') : '',
                  g.email_verified ? 'Yes' : 'No',
                ].join(','))
              ].join('\n')
              const blob = new Blob(['\ufeff' + csv], { type: 'text/csv' })
              const url  = URL.createObjectURL(blob)
              const a    = document.createElement('a')
              a.href = url; a.download = `docplus_leads_${new Date().toISOString().slice(0,10)}.csv`
              a.click(); URL.revokeObjectURL(url)
              toast.success(`Exported ${leads.length} business email lead${leads.length !== 1 ? 's' : ''}`)
            }}
            className="btn btn-secondary gap-2"
            title="Export business email leads for outreach">
            📊 Export Leads
          </button>
          <button onClick={testEmail} disabled={testingEmail} className="btn btn-secondary gap-2">
            {testingEmail ? <><div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />Sending...</> : <>✉ Test Email</>}
          </button>
          <button onClick={logout} className="btn btn-danger gap-2">
            <X className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
          {[
            { label: 'Total Guests',     val: stats.total_registered,  icon: '👥', color: '#60a5fa' },
            { label: 'Active This Week', val: stats.active_this_week,  icon: '📅', color: '#34d399' },
            { label: 'PDFs Fetched',     val: stats.total_pdfs_fetched,icon: '📄', color: '#a78bfa' },
            { label: 'Extractions Run',  val: stats.total_extractions, icon: '⚡', color: '#fbbf24' },
            { label: 'Business Emails',  val: guests.filter(g => g.is_business_email).length, icon: '🏢', color: '#34d399' },
            { label: 'Verified Emails',  val: guests.filter(g => g.email_verified).length,    icon: '✓',  color: '#60a5fa' },
          ].map(s => (
            <div key={s.label} className="card p-4">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className="text-2xl font-black" style={{ color: s.color }}>{s.val}</div>
              <div className="text-xs text-white/40">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { id: 'guests',   label: 'Registered Guests', icon: Users },
          { id: 'requests', label: 'Access Requests',   icon: Bell  },
          { id: 'logs',     label: 'Extraction Logs',   icon: FileText },
          { id: 'config',   label: 'AI Config',         icon: Zap   },
          { id: 'security', label: 'Security',          icon: Shield },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{
              background: activeTab === t.id ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.04)',
              color: activeTab === t.id ? '#fff' : 'rgba(255,255,255,0.5)',
              border: activeTab === t.id ? 'none' : '1px solid rgba(255,255,255,0.08)',
            }}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Guests ─────────────────────────────────────────────────────── */}
      {activeTab === 'guests' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-white text-sm">Registered Guests</span>
            <span className="badge badge-blue ml-1">{guests.length}</span>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin mx-auto" />
            </div>
          ) : guests.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 mx-auto mb-3 text-white/10" />
              <div className="text-white/40 text-sm">No guests registered yet</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['Guest', 'Email / Quality', 'Role / Company', 'PDF Fetch', 'Extraction', 'Upload', 'Export', 'Registered', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-white/40 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {guests.map(g => {
                    const pdfFull   = g.pdf_fetched >= g.pdf_fetch_limit
                    const extFull   = g.extractions_used >= g.extraction_limit
                    const isEditing = editId === g.id
                    const expanded  = expandedId === g.id
                    return (
                      <>
                        <tr key={g.id} className="table-row">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-white">{g.full_name}</div>
                            {!g.is_active && <span className="badge badge-red text-[10px]">Inactive</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-blue-400 text-xs font-mono mb-1">{g.email}</div>
                            <div className="flex items-center gap-1 flex-wrap">
                              {/* Business email badge */}
                              {g.is_business_email
                                ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.15)', color: '#34d399' }}>🏢 Business</span>
                                : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(107,114,128,0.15)', color: '#9ca3af' }}>Personal</span>
                              }
                              {/* SMTP verified badge */}
                              {g.email_verified
                                ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>✓ Verified</span>
                                : null
                              }
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-white/70">{g.current_role || '—'}</div>
                            <div className="text-[10px] text-white/30">{g.company || ''}</div>
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input type="number" min="0" max="999" className="input text-xs py-1 w-16"
                                value={editLimits.pdf_fetch_limit}
                                onChange={e => setEditLimits(l => ({ ...l, pdf_fetch_limit: +e.target.value }))} />
                            ) : (
                              <div>
                                <span className={`text-sm font-bold ${pdfFull ? 'text-red-400' : 'text-white'}`}>
                                  {g.pdf_fetched} / {g.pdf_fetch_limit}
                                </span>
                                {pdfFull && <div className="text-[10px] text-red-400">Limit reached</div>}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input type="number" min="0" max="999" className="input text-xs py-1 w-16"
                                value={editLimits.extraction_limit}
                                onChange={e => setEditLimits(l => ({ ...l, extraction_limit: +e.target.value }))} />
                            ) : (
                              <div>
                                <span className={`text-sm font-bold ${extFull ? 'text-red-400' : 'text-white'}`}>
                                  {g.extractions_used} / {g.extraction_limit}
                                </span>
                                {extFull && <div className="text-[10px] text-red-400">Limit reached</div>}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-white/30">
                            {g.created_at ? new Date(g.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Kolkata' }) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {/* Upload permission toggle */}
                            <button
                              onClick={() => toggleUpload(g)}
                              title={g.upload_allowed ? 'Revoke upload access' : 'Grant upload access'}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
                              style={{
                                background: g.upload_allowed ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${g.upload_allowed ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
                                color: g.upload_allowed ? '#86efac' : 'rgba(255,255,255,0.35)',
                              }}>
                              {g.upload_allowed ? '✓ Allowed' : '✗ Locked'}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            {/* Export permission toggle */}
                            <button
                              onClick={() => toggleExport(g)}
                              title={g.export_allowed ? 'Revoke export access' : 'Grant export access'}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
                              style={{
                                background: g.export_allowed ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${g.export_allowed ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.1)'}`,
                                color: g.export_allowed ? '#93c5fd' : 'rgba(255,255,255,0.35)',
                              }}>
                              {g.export_allowed ? '✓ Allowed' : '✗ Locked'}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {isEditing ? (
                                <>
                                  <button onClick={() => saveLimit(g.id)}
                                    className="p-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25">
                                    <Save className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setEditId(null)}
                                    className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/40">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => startEdit(g)} title="Edit limits"
                                  className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-blue-400">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button onClick={() => resetUsage(g.id, g.full_name)} title="Reset usage counters"
                                className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-yellow-400">
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => clearGuestData(g.id, g.full_name)} title="Clear extraction data"
                                className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-orange-400">
                                <Eraser className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteGuest(g.id, g.full_name)} title="Delete guest account"
                                className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-red-400">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setExpandedId(expanded ? null : g.id)} title="Activity log"
                                className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-cyan-400">
                                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Activity log row */}
                        {expanded && (
                          <tr key={`${g.id}-activity`}>
                            <td colSpan={8} className="px-6 py-4"
                              style={{ background: 'rgba(34,211,238,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <div className="flex items-center gap-2 mb-3">
                                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                                <span className="text-xs font-bold" style={{ color: '#22d3ee' }}>
                                  Activity Log — {g.full_name}
                                </span>
                              </div>
                              <ActivityPanel guestId={g.id} />
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Access Requests ─────────────────────────────────────────────── */}
      {activeTab === 'requests' && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-5">
            <Bell className="w-4 h-4 text-yellow-400" />
            <span className="font-bold text-white text-sm">Pending Access Requests</span>
          </div>
          <AccessRequestsPanel onRefreshGuests={load} />
        </div>
      )}

      {/* ── TAB: Extraction Logs ──────────────────────────────────────────────── */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {/* Header + filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" />
              <span className="font-bold text-white text-sm">Extraction Logs</span>
              <span className="badge badge-blue">{extTotal}</span>
            </div>
            <div className="flex gap-2 ml-auto flex-wrap">
              {['', 'completed', 'failed', 'running'].map(s => (
                <button key={s} onClick={() => setExtFilter(s)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={{
                    background: extFilter === s ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.04)',
                    color: extFilter === s ? '#fff' : 'rgba(255,255,255,0.5)',
                    border: extFilter === s ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  }}>
                  {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
              <button onClick={loadExtLogs} disabled={extLoading}
                className="btn btn-secondary gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${extLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Logs table */}
          <div className="card overflow-hidden">
            {extLoading ? (
              <div className="p-12 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin" />
              </div>
            ) : extLogs.length === 0 ? (
              <div className="p-12 text-center">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 text-white/10" />
                <p className="text-white/40 text-sm">No extraction jobs found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {['Document', 'Schema', 'Provider', 'Status', 'Records', 'Quality', 'Credits', 'Owner', 'Date', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-bold text-white/40 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extLogs.map((j, i) => {
                      const statusColor = j.status === 'completed' ? '#34d399' : j.status === 'failed' ? '#f87171' : '#fbbf24'
                      return (
                        <tr key={j.job_id} className="table-row"
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td className="px-4 py-3 max-w-[180px]">
                            <p className="text-xs font-semibold text-white truncate" title={j.filename}>{j.filename}</p>
                            <p className="text-[10px] font-mono text-white/25 truncate">{j.job_id?.slice(0,12)}...</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-white/70 truncate max-w-[120px] block" title={j.schema_name}>{j.schema_name || '—'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                              style={{ background: j.provider === 'landingai' ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.06)', color: j.provider === 'landingai' ? '#fbbf24' : 'rgba(255,255,255,0.4)' }}>
                              {j.provider || 'none'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-black px-2 py-0.5 rounded"
                              style={{ background: `${statusColor}15`, color: statusColor }}>
                              {j.status}
                            </span>
                            {j.error && <p className="text-[9px] text-red-400/60 mt-0.5 truncate max-w-[100px]" title={j.error}>{j.error}</p>}
                          </td>
                          <td className="px-4 py-3 text-xs text-white/60 text-center">{j.records ?? '—'}</td>
                          <td className="px-4 py-3 text-xs font-bold text-center"
                            style={{ color: j.quality >= 80 ? '#34d399' : j.quality >= 60 ? '#fbbf24' : j.quality != null ? '#f87171' : 'rgba(255,255,255,0.3)' }}>
                            {j.quality != null ? `${j.quality}%` : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-white/50 text-center">{j.credits_used > 0 ? j.credits_used.toFixed(1) : '—'}</td>
                          <td className="px-4 py-3">
                            <span className="text-[9px] px-1.5 py-0.5 rounded"
                              style={{ background: j.guest_id ? 'rgba(99,102,241,0.15)' : 'rgba(37,99,235,0.12)', color: j.guest_id ? '#a5b4fc' : '#60a5fa' }}>
                              {j.guest_id ? 'Guest' : 'Admin'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[10px] text-white/30 whitespace-nowrap">
                            {j.created_at ? new Date(j.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Kolkata' }) : '—'}
                            <br />
                            {j.created_at ? new Date(j.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone:'Asia/Kolkata' }) : ''}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5">
                              <button onClick={() => deleteExtJob(j.job_id)}
                                title="Delete job"
                                className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-red-400 transition-colors">
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

          {/* Summary stats */}
          {extLogs.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total Jobs',    val: extTotal,                                                          color: '#60a5fa' },
                { label: 'Completed',     val: extLogs.filter(j => j.status === 'completed').length,              color: '#34d399' },
                { label: 'Failed',        val: extLogs.filter(j => j.status === 'failed').length,                 color: '#f87171' },
                { label: 'Total Credits', val: extLogs.reduce((s, j) => s + (j.credits_used || 0), 0).toFixed(1), color: '#fbbf24' },
              ].map(s => (
                <div key={s.label} className="card p-4 text-center">
                  <p className="text-xl font-black" style={{ color: s.color }}>{s.val}</p>
                  <p className="text-xs text-white/40 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: AI Config ───────────────────────────────────────────────────── */}
      {activeTab === 'config' && (
        <div className="space-y-4">
          <LandingAIConfigPanel />
          <DefaultSchemaPanel />
          <SamplePdfPanel />
          <div className="card p-5">
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: '#22d3ee' }}>● HOW IT WORKS</p>
            <div className="space-y-3 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <p>1. Enter your LandingAI API key above and click Save.</p>
              <p>2. Guests see a simple "Extract" button — no API key input needed.</p>
              <p>3. All guest extractions automatically use your LandingAI credentials.</p>
              <p>4. You can update or remove the key at any time.</p>
              <p className="text-xs pt-2" style={{ color: 'rgba(255,255,255,0.25)' }}>
                The key is stored securely on the server. Guests never see it. Admin extractions still use whatever key you enter in the extraction wizard.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Security ────────────────────────────────────────────────────── */}
      {activeTab === 'security' && <SecurityPanel />}
    </div>
  )
}
