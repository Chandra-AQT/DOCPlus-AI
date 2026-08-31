/**
 * LandingPage — public homepage at /
 * Styled after AQT Data Intelligence reference.
 */
import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import {
  Globe, Zap, BarChart3, Shield, ArrowRight, CheckCircle2,
  Sparkles, Play, FileText, Cpu, Upload, Database, Download,
  ChevronRight, Menu, X
} from 'lucide-react'
import { isLoggedIn } from '../lib/auth'
import RobotMascot from '../components/RobotMascot'

/**
 * Hero heading with robot that jumps on each letter using JS-measured positions
 */
function HeroHeadingWithRobot() {
  const containerRef = useRef(null)
  const letterRefs   = useRef([])
  const [robotPos,   setRobotPos]   = useState({ x: -80, y: -52 })
  const [letterIdx,  setLetterIdx]  = useState(0)
  const [isJumping,  setIsJumping]  = useState(false)
  const timerRef = useRef(null)

  const LETTERS = ['D','O','C','P','l','u','s',' ','A','I','⁺']
  const ROBOT_SIZE = 52
  const JUMP_H     = 32   // extra height during jump

  // Measure letter positions and move robot to next letter
  const jumpToLetter = (idx) => {
    const letterEl = letterRefs.current[idx]
    const container = containerRef.current
    if (!letterEl || !container) return

    const lr = letterEl.getBoundingClientRect()
    const cr = container.getBoundingClientRect()

    // Centre robot over the letter, sit on top
    const x = lr.left - cr.left + lr.width / 2 - ROBOT_SIZE / 2
    const y = -(ROBOT_SIZE + 8) // sit right above the letter top

    setIsJumping(true)
    setTimeout(() => {
      setRobotPos({ x, y })
      setIsJumping(false)
    }, 250)
  }

  // Walk through all letters cyclically
  useEffect(() => {
    const walk = () => {
      setLetterIdx(prev => {
        const next = (prev + 1) % LETTERS.length
        jumpToLetter(next)
        return next
      })
    }
    // Start after a short delay to let layout settle
    timerRef.current = setTimeout(() => {
      jumpToLetter(0)
      const interval = setInterval(walk, 900)
      timerRef.current = interval
    }, 800)

    return () => { clearInterval(timerRef.current); clearTimeout(timerRef.current) }
  }, [])

  // Recalculate on resize
  useEffect(() => {
    const onResize = () => jumpToLetter(letterIdx)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [letterIdx])

  return (
    <h1 className="mb-4 leading-none tracking-tight">
      {/* Line 1: DOCPlus AI⁺ */}
      <div
        ref={containerRef}
        className="block text-5xl md:text-7xl font-black text-white mb-2 relative"
        style={{ display: 'inline-block', position: 'relative' }}
      >
        {/* Robot positioned absolutely over current letter */}
        <span
          style={{
            position: 'absolute',
            left:     robotPos.x,
            top:      robotPos.y - (isJumping ? JUMP_H : 0),
            zIndex:   20,
            pointerEvents: 'none',
            transition: isJumping
              ? 'left 0.25s cubic-bezier(.36,.07,.19,.97), top 0.12s ease-out'
              : 'left 0.3s cubic-bezier(.36,.07,.19,.97), top 0.18s ease-in',
          }}
        >
          <RobotMascot size={ROBOT_SIZE} />
        </span>

        {/* Each letter individually ref'd so we can measure position */}
        {LETTERS.map((ch, i) => (
          <span
            key={i}
            ref={el => { letterRefs.current[i] = el }}
            style={{
              display: 'inline-block',
              position: 'relative',
              // Highlight the current letter
              color: i === letterIdx
                ? (ch === '⁺' ? '#7c3aed' : '#60a5fa')
                : ch === '⁺' ? '#7c3aed' : 'white',
              textShadow: i === letterIdx
                ? '0 0 20px rgba(96,165,250,0.8), 0 0 40px rgba(124,58,237,0.4)'
                : 'none',
              transition: 'color 0.2s, text-shadow 0.2s',
              fontSize:   ch === '⁺' ? '0.5em' : undefined,
              verticalAlign: ch === '⁺' ? 'super' : undefined,
              lineHeight:    ch === '⁺' ? 0       : undefined,
            }}
          >
            {ch === ' ' ? '\u00A0' : ch}
          </span>
        ))}
      </div>

      {/* Line 2: Document Intelligence */}
      <span
        className="block text-5xl md:text-7xl font-black"
        style={{
          background: 'linear-gradient(135deg,#3b82f6,#8b5cf6,#06b6d4)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
        Document Intelligence
      </span>
    </h1>
  )
}

export default function LandingPage() {
  const navigate    = useNavigate()
  const [scrolled,  setScrolled]  = useState(false)
  const [menuOpen,  setMenuOpen]  = useState(false)
  const heroRef     = useRef(null)
  const loggedIn    = isLoggedIn()

  useEffect(() => {
    // Never auto-redirect — landing page is always accessible
    const fn = () => setScrolled(window.scrollY > 30)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // If logged in — "Go to App" → dashboard, else → register
  const handleGoToApp = () => navigate(loggedIn ? '/dashboard' : '/register')
  const handleSignIn  = () => navigate(loggedIn ? '/dashboard' : '/login')

  // ── helpers ──────────────────────────────────────────────────────────────
  const NAV_LINKS = [
    { label: 'How it works', href: '#how' },
    { label: 'Features',     href: '#features' },
    { label: 'Engines',      href: '#engines' },
  ]

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: '#05080f', color: '#f1f5f9' }}>

      {/* ━━━━━━━━━━━━━━ NAV ━━━━━━━━━━━━━━ */}
      <nav className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          background:    scrolled ? 'rgba(5,8,15,0.92)' : 'transparent',
          borderBottom:  scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
        }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            {/* Robot on D */}
            <div className="flex items-end gap-0 leading-none">
              <div className="relative inline-flex items-end">
                <div style={{ position: 'absolute', top: -14, left: -2, zIndex: 10 }}>
                  <RobotMascot size={18} />
                </div>
                <span className="font-black text-white text-sm tracking-tight">D</span>
              </div>
              <span className="font-black text-white text-sm tracking-tight">
                OCPlus AI<span style={{ color: '#7c3aed' }}>⁺</span>
              </span>
            </div>
          </div>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-7">
            {NAV_LINKS.map(l => (
              <a key={l.label} href={l.href}
                className="text-sm font-medium transition-colors"
                style={{ color: 'rgba(255,255,255,0.5)' }}
                onMouseEnter={e => e.target.style.color = '#fff'}
                onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.5)'}>
                {l.label}
              </a>
            ))}
          </div>

          {/* Right CTAs */}
          <div className="flex items-center gap-3">
            {/* Status dot */}
            <div className="hidden sm:flex items-center gap-1.5 mr-1">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#22c55e' }} />
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Live</span>
            </div>
            {/* Show "Go to App" if logged in, "Sign In" if not */}
            {loggedIn ? (
              <button onClick={() => navigate('/dashboard')}
                className="hidden sm:flex items-center gap-1.5 text-sm font-semibold transition-colors px-3 py-1.5 rounded-lg"
                style={{ color: '#60a5fa', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)' }}>
                → Go to Dashboard
              </button>
            ) : (
              <button onClick={handleSignIn}
                className="hidden sm:block text-sm font-semibold transition-colors px-1"
                style={{ color: 'rgba(255,255,255,0.5)' }}
                onMouseEnter={e => e.target.style.color = '#fff'}
                onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.5)'}>
                Sign In
              </button>
            )}
            <button onClick={handleGoToApp}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-black text-white transition-all hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 4px 16px rgba(37,99,235,0.4)' }}>
              {loggedIn ? 'Open App' : 'Get Started'} <ArrowRight className="w-3.5 h-3.5" />
            </button>
            {/* Mobile menu */}
            <button className="md:hidden p-2 rounded-lg" onClick={() => setMenuOpen(o => !o)}
              style={{ color: 'rgba(255,255,255,0.5)' }}>
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden px-6 pb-4 space-y-2"
            style={{ background: 'rgba(5,8,15,0.98)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {NAV_LINKS.map(l => (
              <a key={l.label} href={l.href} onClick={() => setMenuOpen(false)}
                className="block py-2 text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {l.label}
              </a>
            ))}
            <div className="flex gap-3 pt-2">
              <button onClick={() => navigate('/login')} className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                Sign In
              </button>
              <button onClick={() => navigate('/register')} className="flex-1 py-2.5 rounded-xl text-sm font-black text-white"
                style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
                Get Started
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* ━━━━━━━━━━━━━━ HERO ━━━━━━━━━━━━━━ */}
      <section ref={heroRef} className="relative flex flex-col items-center justify-center text-center px-6 pt-36 pb-24 min-h-screen">

        {/* Logged-in banner */}
        {loggedIn && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
            <button onClick={() => navigate('/dashboard')}
              className="flex items-center gap-3 px-6 py-3 rounded-2xl text-sm font-black text-white shadow-2xl transition-all hover:-translate-y-1"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 8px 32px rgba(37,99,235,0.5)' }}>
              <Sparkles className="w-4 h-4" />
              You're logged in — Go to Dashboard
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Deep space glow bg */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] opacity-25"
            style={{ background: 'radial-gradient(ellipse,#1d4ed8,transparent 60%)' }} />
          <div className="absolute top-1/3 left-1/3 w-80 h-80 opacity-15 rounded-full"
            style={{ background: 'radial-gradient(circle,#7c3aed,transparent 70%)' }} />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 opacity-10 rounded-full"
            style={{ background: 'radial-gradient(circle,#06b6d4,transparent 70%)' }} />
        </div>

        <div className="relative max-w-4xl mx-auto">
          {/* Top badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-10 text-xs font-semibold"
            style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)', color: '#93c5fd' }}>
            <Sparkles className="w-3.5 h-3.5" />
            AI-Powered Document Extraction
          </div>

          {/* BIG headline with robot walking ON each letter */}
          <HeroHeadingWithRobot />

          {/* Sub badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mt-4 mb-7 text-xs font-black uppercase tracking-widest"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}>
            <Zap className="w-3.5 h-3.5 text-yellow-400" /> Metadata Extractor
          </div>

          {/* Description */}
          <p className="text-base md:text-lg mb-10 max-w-xl mx-auto leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.5)' }}>
            Extract structured metadata from any PDF document using AI — automatically, accurately, at scale.
            Crawl websites, upload files, and export results in seconds.
          </p>

          {/* Primary CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
            <button onClick={handleGoToApp}
              className="flex items-center gap-3 px-8 py-4 rounded-2xl text-base font-black text-white transition-all hover:-translate-y-1"
              style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)', boxShadow: '0 8px 32px rgba(37,99,235,0.5)' }}>
              {loggedIn ? 'Go to App' : 'Start Extracting Free'} <ArrowRight className="w-5 h-5" />
            </button>
            <button onClick={handleSignIn}
              className="flex items-center gap-3 px-8 py-4 rounded-2xl text-base font-bold transition-all hover:-translate-y-0.5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}>
              <Play className="w-4 h-4" /> {loggedIn ? 'Dashboard' : 'Admin Sign In'}
            </button>
          </div>

          {/* Trust row — matches reference exactly */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              BYOK — keys never stored
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              7 AI engines supported
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              20–60s per document
            </span>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━ HOW IT WORKS ━━━━━━━━━━━━━━ */}
      <section id="how" className="px-6 py-20" style={{ background: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: '#60a5fa' }}>HOW IT WORKS</p>
            <h2 className="text-3xl md:text-4xl font-black text-white">Three simple steps</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                n: '01', icon: Globe, color: '#3b82f6',
                title: 'Discover or Upload',
                desc: 'Crawl any website to automatically find PDFs, or upload documents directly from your computer.',
              },
              {
                n: '02', icon: Cpu, color: '#8b5cf6',
                title: 'Choose AI Engine',
                desc: 'Select GPT-4o, Claude, Gemini, Groq, or our free built-in engine. Pick a schema matching your document type.',
              },
              {
                n: '03', icon: Download, color: '#22c55e',
                title: 'Extract & Export',
                desc: 'AI extracts structured metadata with confidence scores. Review, edit and export as Excel, CSV, or JSON.',
              },
            ].map(s => (
              <div key={s.n} className="rounded-2xl p-6 transition-all hover:-translate-y-1"
                style={{ background: '#0d1526', border: `1px solid ${s.color}20` }}>
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-4xl font-black" style={{ color: `${s.color}30` }}>{s.n}</span>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${s.color}15`, border: `1px solid ${s.color}30` }}>
                    <s.icon className="w-5 h-5" style={{ color: s.color }} />
                  </div>
                </div>
                <p className="text-base font-black text-white mb-2">{s.title}</p>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━ FEATURES ━━━━━━━━━━━━━━ */}
      <section id="features" className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: '#a78bfa' }}>FEATURES</p>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-3">Everything you need</h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>From web discovery to structured data export — all in one platform</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Globe,     color: '#3b82f6', title: 'Web PDF Discovery',     desc: 'Crawl any website and automatically find all PDF documents. Filter by type.' },
              { icon: Upload,    color: '#8b5cf6', title: 'Direct Upload',          desc: 'Upload PDFs, Word docs, images. Batch upload and ZIP folder support.' },
              { icon: Database,  color: '#06b6d4', title: 'Document Library',       desc: 'Centralized document store with full-text parsing and status tracking.' },
              { icon: Cpu,       color: '#f59e0b', title: 'Multi-Engine AI',        desc: 'GPT-4o, Claude 3.5, Gemini, Groq, Ollama, LandingAI and more.' },
              { icon: FileText,  color: '#a78bfa', title: 'Smart Schemas',          desc: '6 preset schemas: Invoice, Product Lit, Manual, Spec Sheet, Contract, Report.' },
              { icon: BarChart3, color: '#22c55e', title: 'Results & Export',       desc: 'Confidence scores, source refs, inline editing. Export Excel/CSV/JSON.' },
            ].map(f => (
              <div key={f.title} className="rounded-2xl p-5 transition-all hover:-translate-y-1 group"
                style={{ background: '#0d1526', border: `1px solid rgba(255,255,255,0.06)` }}
                onMouseEnter={e => e.currentTarget.style.border = `1px solid ${f.color}30`}
                onMouseLeave={e => e.currentTarget.style.border = '1px solid rgba(255,255,255,0.06)'}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${f.color}12`, border: `1px solid ${f.color}25` }}>
                  <f.icon className="w-5 h-5" style={{ color: f.color }} />
                </div>
                <p className="text-sm font-black text-white mb-1.5">{f.title}</p>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━ ENGINES ━━━━━━━━━━━━━━ */}
      <section id="engines" className="px-6 py-20"
        style={{ background: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: '#34d399' }}>AI ENGINES</p>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-3">7 AI Engines</h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Bring your own API key. Keys are never stored after the request.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { name: 'GPT-4o',       color: '#22c55e', badge: 'OpenAI',     free: false },
              { name: 'Claude 3.5',   color: '#f59e0b', badge: 'Anthropic',  free: false },
              { name: 'Gemini Pro',   color: '#3b82f6', badge: 'Google',     free: false },
              { name: 'Groq',         color: '#a78bfa', badge: 'Fast',       free: false },
              { name: 'LandingAI',    color: '#06b6d4', badge: 'Vision',     free: false },
              { name: 'Ollama',       color: '#34d399', badge: 'Local',      free: true  },
              { name: 'Built-in',     color: '#94a3b8', badge: 'Free',       free: true  },
            ].map(e => (
              <div key={e.name}
                className="flex items-center gap-2.5 px-4 py-3 rounded-2xl transition-all hover:-translate-y-0.5"
                style={{ background: '#0d1526', border: `1px solid ${e.color}20` }}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color }} />
                <div>
                  <p className="text-sm font-bold text-white">{e.name}</p>
                  <p className="text-[10px]" style={{ color: `${e.color}99` }}>{e.badge}{e.free ? ' · FREE' : ''}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs mt-8" style={{ color: 'rgba(255,255,255,0.25)' }}>
            BYOK — bring your own API key. Keys are used only for the extraction request and never stored.
          </p>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━ BOTTOM CTA ━━━━━━━━━━━━━━ */}
      <section className="px-6 py-24 text-center relative overflow-hidden"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] opacity-15"
            style={{ background: 'radial-gradient(ellipse,#1d4ed8,transparent 70%)' }} />
        </div>
        <div className="relative max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-black text-white mb-4">
            Start extracting<br />
            <span style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              intelligence today
            </span>
          </h2>
          <p className="text-sm mb-10" style={{ color: 'rgba(255,255,255,0.4)' }}>
            No password. No credit card. Just register and start extracting.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={handleGoToApp}
              className="flex items-center justify-center gap-2 px-10 py-4 rounded-2xl text-base font-black text-white transition-all hover:-translate-y-1"
              style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)', boxShadow: '0 8px 40px rgba(37,99,235,0.5)' }}>
              {loggedIn ? 'Go to App' : 'Start Extracting Free'} <ArrowRight className="w-5 h-5" />
            </button>
            <button onClick={handleSignIn}
              className="flex items-center justify-center gap-2 px-10 py-4 rounded-2xl text-base font-bold transition-all hover:-translate-y-0.5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}>
              {loggedIn ? 'Dashboard' : 'Admin Sign In'}
            </button>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━ FOOTER ━━━━━━━━━━━━━━ */}
      <footer className="px-6 py-8" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="flex items-end leading-none">
              <div className="relative inline-flex items-end">
                <div style={{ position: 'absolute', top: -12, left: -1 }}>
                  <RobotMascot size={14} />
                </div>
                <span className="font-black text-white text-sm">D</span>
              </div>
              <span className="font-black text-white text-sm">
                OCPlus AI<span style={{ color: '#7c3aed' }}>⁺</span>
              </span>
            </div>
          </div>
          <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.2)' }}>
            © 2026 Aquarient Technologies LLC · Document Intelligence Platform
          </p>
          <div className="flex gap-5 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <button onClick={handleGoToApp} className="hover:text-white transition-colors">Try Free</button>
            <button onClick={handleSignIn} className="hover:text-white transition-colors">Admin</button>
          </div>
        </div>
      </footer>
    </div>
  )
}
