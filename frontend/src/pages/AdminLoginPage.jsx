/**
 * AdminLoginPage — /login
 * Admin signs in with email + password.
 * Email must be in the admin whitelist; password is verified server-side.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, ArrowRight, Loader2, Sparkles, ChevronLeft, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { isLoggedIn, isGuest, saveAdminToken } from '../lib/auth'
import api from '../lib/api'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [done,     setDone]     = useState(false)

  useEffect(() => {
    if (isLoggedIn()) {
      if (isGuest()) navigate('/guest-dashboard', { replace: true })
      else navigate('/dashboard', { replace: true })
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) { toast.error('Enter a valid email'); return }
    if (!password.trim()) { toast.error('Password is required'); return }

    setLoading(true)
    try {
      const res = await api.post('/admin/login', { email: email.trim().toLowerCase(), password })
      const data = res.data

      if (data.is_admin && data.token) {
        saveAdminToken(data.token)
        localStorage.setItem('docplus_admin_user', JSON.stringify(data.user))
        setDone(true)
        toast.success('Welcome, Admin! Access granted.')
        setTimeout(() => navigate('/dashboard'), 1200)
      } else {
        toast.error('Not an admin account')
      }
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('401') || msg.includes('Invalid credentials')) {
        toast.error('Invalid email or password')
      } else {
        toast.error('Login failed — make sure backend is restarted')
      }
    } finally {
      setLoading(false)
    }
  }

  if (done) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#060b18' }}>
      <div className="text-center space-y-4 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)', boxShadow: '0 0 40px rgba(124,58,237,0.4)' }}>
          <CheckCircle2 className="w-8 h-8 text-white" />
        </div>
        <p className="text-xl font-black text-white">Access Granted</p>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Redirecting to dashboard...</p>
        <div className="w-6 h-6 border-2 border-white/10 border-t-purple-400 rounded-full animate-spin mx-auto" />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex" style={{ background: '#060b18' }}>

      {/* ── Left info panel ── */}
      <div className="hidden lg:flex flex-col justify-between w-2/5 p-12"
        style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.15),rgba(37,99,235,0.1))', borderRight: '1px solid rgba(255,255,255,0.06)' }}>

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)' }}>
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-black text-white">DOCPlus AI<span style={{ color: '#7c3aed' }}>⁺</span></div>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Document Intelligence Platform</div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-8">
          <div>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)' }}>
              <Shield className="w-7 h-7" style={{ color: '#a78bfa' }} />
            </div>
            <h1 className="text-3xl font-black text-white leading-tight mb-4">Admin Access</h1>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Secure login for DOCPlus AI⁺ administrators. Email + password required.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { icon: '♾️', text: 'Unlimited PDF discovery and extractions' },
              { icon: '🛠️', text: 'Create and manage custom schemas' },
              { icon: '📊', text: 'Export results as Excel, CSV, JSON' },
              { icon: '👥', text: 'Manage guest users and their limits' },
              { icon: '🔒', text: 'Password-protected secure access' },
            ].map(f => (
              <div key={f.text} className="flex items-start gap-3">
                <span className="text-lg">{f.icon}</span>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>{f.text}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
            <p className="text-xs font-bold mb-1" style={{ color: '#c4b5fd' }}>Default password</p>
            <p className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Admin@2024! — change it in Admin Panel → Security after first login
            </p>
          </div>
        </div>

        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Not an admin?{' '}
          <button onClick={() => navigate('/register')} className="underline hover:text-white/50">
            Register as guest →
          </button>
        </p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">

          <button onClick={() => navigate('/')}
            className="flex items-center gap-1.5 mb-8 text-xs transition-colors"
            style={{ color: 'rgba(255,255,255,0.35)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}>
            <ChevronLeft className="w-3.5 h-3.5" /> Back to home
          </button>

          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden mb-6">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)' }}>
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-black text-white">Admin Login</span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)' }}>
                <Shield className="w-5 h-5" style={{ color: '#a78bfa' }} />
              </div>
              <h2 className="text-2xl font-black text-white">Admin Login</h2>
            </div>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Enter your admin email and password
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-2 block"
                style={{ color: 'rgba(255,255,255,0.4)' }}>Admin Email</label>
              <input
                className="input text-sm w-full"
                type="email"
                placeholder="your.email@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                required />
            </div>

            {/* Password */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-2 block"
                style={{ color: 'rgba(255,255,255,0.4)' }}>Password</label>
              <div className="relative">
                <input
                  className="input text-sm w-full pr-10"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required />
                <button type="button"
                  onClick={() => setShowPwd(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors hover:bg-white/[0.08]"
                  style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] mt-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Default: <span className="font-mono text-white/40">Admin@2024!</span> — change in Admin Panel after login
              </p>
            </div>

            {/* Submit */}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black text-white transition-all disabled:opacity-50 hover:-translate-y-0.5 mt-2"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)', boxShadow: '0 4px 20px rgba(124,58,237,0.35)' }}>
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</>
                : <>Access Admin Panel <ArrowRight className="w-4 h-4" /></>}
            </button>

            <div className="relative flex items-center gap-3 py-1">
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>or</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
            </div>

            <button type="button" onClick={() => navigate('/register')}
              className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
              Register as Guest → Free Trial
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
