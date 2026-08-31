/**
 * RequestAccessModal — one-click access request for guests.
 * Shows when any trial limit is reached.
 */
import { useState } from 'react'
import { X, Send, Loader2, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { getGuestToken, getGuestSession } from '../lib/auth'

const REQUEST_TYPES = [
  { id: 'pdf_fetch',   label: 'More PDF Fetches',   desc: 'Increase my PDF discovery limit',     icon: '📄' },
  { id: 'extraction',  label: 'More Extractions',   desc: 'Increase my metadata extraction limit', icon: '⚡' },
  { id: 'export',      label: 'Export Access',       desc: 'Allow me to download results',          icon: '📊' },
  { id: 'full_access', label: 'Full Platform Access',desc: 'Unrestricted access to all features',   icon: '🚀' },
]

export default function RequestAccessModal({ defaultType = 'pdf_fetch', onClose }) {
  const [type, setType]   = useState(defaultType)
  const [note, setNote]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]   = useState(false)

  const guest = getGuestSession()

  const handleSend = async () => {
    const token = getGuestToken()
    if (!token) { toast.error('Session expired — please refresh'); return }
    setLoading(true)
    try {
      const res = await api.post('/guests/request-access',
        { request_type: type, note },
        { headers: { 'X-Guest-Token': token } }
      )
      setSent(true)
      toast.success('Request sent to admin!')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to send request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden animate-fade-in"
        style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div>
            <h2 className="text-base font-black text-white">Request More Access</h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Your request will be sent directly to the admin
            </p>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {sent ? (
          /* Success state */
          <div className="px-6 py-10 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <div>
              <p className="text-base font-black text-white mb-1">Request Sent!</p>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                The admin has been notified. You'll be contacted at{' '}
                <strong className="text-white">{guest?.email}</strong>.
              </p>
            </div>
            <button onClick={onClose}
              className="btn btn-primary w-full justify-center">
              Close
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-5">
            {/* Guest info */}
            {guest && (
              <div className="rounded-xl px-4 py-3 flex items-center gap-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                  style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
                  {guest.first_name?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{guest.full_name}</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{guest.email}</p>
                </div>
              </div>
            )}

            {/* Request type */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-2 block"
                style={{ color: '#22d3ee' }}>What do you need?</label>
              <div className="space-y-2">
                {REQUEST_TYPES.map(rt => (
                  <button key={rt.id} onClick={() => setType(rt.id)}
                    className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all"
                    style={{
                      background: type === rt.id ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.02)',
                      border: type === rt.id ? '1px solid rgba(37,99,235,0.4)' : '1px solid rgba(255,255,255,0.07)',
                    }}>
                    <span className="text-xl shrink-0">{rt.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">{rt.label}</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{rt.desc}</p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 transition-all ${
                      type === rt.id ? 'bg-blue-500 border-blue-500' : 'border-white/20'}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-2 block"
                style={{ color: '#22d3ee' }}>Add a note <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
              <textarea
                className="input text-sm resize-none w-full"
                rows={2}
                placeholder="Tell the admin why you need more access..."
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>

            {/* Submit */}
            <button onClick={handleSend} disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black text-white transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 4px 16px rgba(245,158,11,0.3)' }}>
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Sending...</>
                : <><Send className="w-4 h-4" />Send Request to Admin</>
              }
            </button>

            <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
              Admin: chandra.paidimukkala@aquarient.com
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
