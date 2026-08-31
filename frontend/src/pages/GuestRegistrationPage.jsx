import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { isLoggedIn, isGuest, registerGuest } from '../lib/auth'

export default function GuestRegistrationPage() {
  const navigate  = useNavigate()

  // If already logged in, redirect appropriately
  useEffect(() => {
    if (isLoggedIn()) {
      if (isGuest()) navigate('/guest-dashboard', { replace: true })
      else navigate('/dashboard', { replace: true })
    }
  }, [])
  const [form, setForm]     = useState({ first_name:'', last_name:'', email:'', company:'', note:'' })
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(false)
  const [guestName, setGuestName] = useState('')
  // Returning user quick sign-in
  const [returningEmail,   setReturningEmail]   = useState('')
  const [returningLoading, setReturningLoading] = useState(false)
  const [returningError,   setReturningError]   = useState('')

  const handleReturningUser = async () => {
    const email = returningEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) { setReturningError('Enter a valid email'); return }
    setReturningLoading(true); setReturningError('')
    try {
      // Use dedicated sign-in endpoint — never creates new accounts
      const { default: api } = await import('../lib/api')
      const { saveAdminToken, saveGuestSession } = await import('../lib/auth')
      const res = await api.post('/guests/signin', { email })
      const data = res.data

      if (data.is_admin && data.token) {
        saveAdminToken(data.token)
        localStorage.setItem('docplus_admin_user', JSON.stringify(data.user))
        setGuestName('Admin'); setDone(true)
        setTimeout(() => navigate('/dashboard'), 1200)
      } else if (data.guest) {
        saveGuestSession(data.guest)
        setGuestName(data.guest.first_name)
        setDone(true)
        toast.success(`Welcome back, ${data.guest.first_name}!`)
        setTimeout(() => navigate('/guest-dashboard'), 1500)
      }
    } catch (e) {
      const msg = e.response?.data?.detail || e.message || ''
      if (e.response?.status === 404) {
        setReturningError('Email not registered. Please fill the form below to create an account.')
      } else if (msg.includes('domain') || msg.includes('mail server')) {
        setReturningError(msg)
      } else {
        setReturningError('Sign-in failed. Check your email or register below.')
      }
    } finally {
      setReturningLoading(false)
    }
  }

  const update = (k, v) => setForm(f => ({...f, [k]: v}))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.first_name.trim()) { toast.error('First name is required'); return }
    if (!form.last_name.trim())  { toast.error('Last name is required');  return }
    if (!form.email.trim() || !form.email.includes('@')) { toast.error('Valid email required'); return }

    setLoading(true)
    try {
      const res = await registerGuest(form)

      if (res.sessionType === 'admin') {
        toast.success(`Welcome, Admin ${form.first_name}! Full access granted.`)
        setGuestName(form.first_name)
        setDone(true)
        setTimeout(() => navigate('/dashboard'), 1500)
        return
      }

      // Guest → goes to guest dashboard
      setGuestName(res.guest.first_name)
      setDone(true)
      if (res.is_returning) {
        toast.success(`Welcome back, ${res.guest.first_name}! Your usage has been retained.`)
      } else {
        toast.success(`Welcome, ${res.guest.first_name}! Your trial account is ready.`)
      }
      setTimeout(() => navigate('/guest-dashboard'), 2000)
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{background:'#060b18'}}>
      <div className="text-center space-y-6 animate-fade-in">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto"
          style={{background:'linear-gradient(135deg,#22c55e,#16a34a)',boxShadow:'0 0 40px rgba(34,197,94,0.4)'}}>
          <CheckCircle2 className="w-10 h-10 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-white">Welcome, {guestName}!</h2>
          <p className="text-white/50 mt-1">Your trial account is ready. Redirecting to the platform...</p>
        </div>
        <div className="w-8 h-8 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin mx-auto" />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex" style={{background:'#060b18'}}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-2/5 p-12"
        style={{background:'linear-gradient(135deg,rgba(37,99,235,0.15),rgba(124,58,237,0.1))',borderRight:'1px solid rgba(255,255,255,0.06)'}}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{background:'linear-gradient(135deg,#2563eb,#7c3aed)'}}>
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-black text-white">DOCPlus AI<span style={{color:'#7c3aed'}}>⁺</span></div>
            <div className="text-xs text-white/40">Document Intelligence Platform</div>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-black text-white leading-tight mb-4">
              Discover &amp; Extract<br />Document Intelligence
            </h1>
            <p className="text-white/50 leading-relaxed">
              Register for a free trial to explore AI-powered PDF discovery and metadata extraction.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {icon:'🔍', title:'PDF Discovery', desc:'Crawl any website and discover all PDFs automatically'},
              {icon:'🤖', title:'AI Extraction',  desc:'Extract structured metadata using leading AI models'},
              {icon:'📊', title:'Export Results', desc:'Download results as Excel, CSV, or JSON'},
            ].map(f => (
              <div key={f.title} className="flex items-start gap-3">
                <span className="text-2xl">{f.icon}</span>
                <div>
                  <div className="text-sm font-bold text-white">{f.title}</div>
                  <div className="text-xs text-white/40">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl p-4" style={{background:'rgba(37,99,235,0.1)',border:'1px solid rgba(37,99,235,0.2)'}}>
            <p className="text-xs font-bold text-blue-400 mb-1">🎯 Trial Includes</p>
            <p className="text-xs text-white/50">Fetch up to <strong className="text-white">5 PDFs</strong> · Extract metadata from <strong className="text-white">2 documents</strong> · Full platform access</p>
          </div>
        </div>

        <p className="text-xs text-white/20">No credit card required · No password needed</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <button onClick={() => navigate('/')}
              className="flex items-center gap-1.5 mb-6 text-xs transition-colors"
              style={{ color: 'rgba(255,255,255,0.35)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}>
              ← Back to home
            </button>
            <div className="flex items-center gap-2 lg:hidden mb-6">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background:'linear-gradient(135deg,#2563eb,#7c3aed)'}}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-black text-white">DOCPlus AI<span style={{color:'#7c3aed'}}>⁺</span></span>
            </div>
            <h2 className="text-2xl font-black text-white">Start Your Free Trial</h2>
            <p className="text-white/40 text-sm mt-1">Fill in your details to get instant access</p>
          </div>

          {/* ── Returning user — quick sign-in by email only ── */}
          <div className="mb-2">
            <div className="rounded-2xl p-4"
              style={{ background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.2)' }}>
              <p className="text-sm font-bold text-white mb-3">Already registered? Sign in with your email</p>
              <div className="flex gap-2">
                <input
                  className="input text-sm flex-1"
                  type="email"
                  placeholder="your@email.com"
                  value={returningEmail}
                  onChange={e => setReturningEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleReturningUser()}
                />
                <button
                  type="button"
                  onClick={handleReturningUser}
                  disabled={returningLoading || !returningEmail.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black text-white disabled:opacity-40 transition-all hover:-translate-y-0.5 shrink-0"
                  style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
                  {returningLoading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <>Sign In →</>}
                </button>
              </div>
              {returningError && (
                <p className="text-xs mt-2 text-red-400">{returningError}</p>
              )}
            </div>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.2)' }}>or register new</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name row — First + Last only */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/40 mb-1 block">First Name *</label>
                <input className="input text-sm" placeholder="John"
                  value={form.first_name} onChange={e => update('first_name', e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-white/40 mb-1 block">Last Name *</label>
                <input className="input text-sm" placeholder="Doe"
                  value={form.last_name} onChange={e => update('last_name', e.target.value)} required />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="text-xs text-white/40 mb-1 block">Email Address *</label>
              <input className="input text-sm" type="email" placeholder="john@company.com"
                value={form.email} onChange={e => update('email', e.target.value)} required />
              <p className="text-[10px] text-white/25 mt-1">Your email is your unique identifier. Returning users retain their usage.</p>
            </div>

            {/* Company */}
            <div>
              <label className="text-xs text-white/40 mb-1 block">Company</label>
              <input className="input text-sm" placeholder="e.g. Acme Corporation"
                value={form.company} onChange={e => update('company', e.target.value)} />
            </div>

            {/* Note */}
            <div>
              <label className="text-xs text-white/40 mb-1 block">Note <span className="text-white/20">(optional)</span></label>
              <textarea className="input text-sm resize-none" rows={2}
                placeholder="How do you plan to use DOCPlus AI+?"
                value={form.note} onChange={e => update('note', e.target.value)} />
            </div>

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black text-white transition-all disabled:opacity-50 hover:-translate-y-0.5"
              style={{background:'linear-gradient(135deg,#2563eb,#7c3aed)',boxShadow:'0 4px 20px rgba(37,99,235,0.35)'}}>
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Creating your account...</>
                : <>Get Free Trial Access <ArrowRight className="w-4 h-4" /></>
              }
            </button>

            <p className="text-center text-xs text-white/25">
              Admin users are automatically recognized by email.{' '}
              <button onClick={() => navigate('/login')} className="underline hover:text-white/40 transition-colors">
                Admin login →
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
