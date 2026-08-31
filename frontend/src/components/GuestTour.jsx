/**
 * GuestTour — first-login guided walkthrough for guest users.
 * Shows a 4-step overlay tour only once (tracked in localStorage).
 * Invisible for admin users.
 */
import { useState, useEffect } from 'react'
import { ChevronRight, ChevronLeft, X, CheckCircle2 } from 'lucide-react'
import { isGuest, getGuestSession } from '../lib/auth'

const TOUR_KEY = 'docplus_tour_done'

const STEPS = [
  {
    icon: '👋',
    title: 'Welcome to DOCPlus AI+!',
    desc: "You're on a free trial. Let's show you how it works in 4 quick steps.",
    highlight: null,
    tip: null,
  },
  {
    icon: '🔍',
    title: 'Step 1 — Discover PDFs',
    desc: 'Go to "Discover" in the sidebar. Enter any website URL and we\'ll automatically find all the PDF documents on it.',
    highlight: 'You can fetch up to 5 PDFs from the discovered results with your trial.',
    tip: 'Try a manufacturer website like https://www.carrier.com',
  },
  {
    icon: '⚡',
    title: 'Step 2 — Extract Metadata',
    desc: 'Go to "Extract". Select a document from your library, choose the AI engine, and click Extract.',
    highlight: 'Your trial includes 2 AI extractions. A fixed schema with 8 fields will be used automatically.',
    tip: 'Free engines (no API key) work great for most documents.',
  },
  {
    icon: '📊',
    title: 'Step 3 — Review Results',
    desc: 'Go to "Results" to see extracted metadata with confidence scores. You can edit values inline.',
    highlight: 'Trial users can view all results. Export is available after contacting admin for full access.',
    tip: null,
  },
]

export default function GuestTour() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isGuest()) return
    const done = localStorage.getItem(TOUR_KEY)
    if (!done) setVisible(true)
  }, [])

  const dismiss = () => {
    localStorage.setItem(TOUR_KEY, '1')
    setVisible(false)
  }

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else dismiss()
  }

  const prev = () => setStep(s => Math.max(0, s - 1))

  if (!visible) return null

  const s = STEPS[step]
  const guest = getGuestSession()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden animate-fade-in"
        style={{ background: '#0d1526', border: '1px solid rgba(37,99,235,0.3)', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>

        {/* Progress bar */}
        <div className="h-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full transition-all duration-500"
            style={{
              width: `${((step + 1) / STEPS.length) * 100}%`,
              background: 'linear-gradient(135deg,#2563eb,#7c3aed)'
            }} />
        </div>

        <div className="px-6 py-6">
          {/* Step indicator */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <div key={i} className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === step ? 20 : 6,
                    background: i <= step ? '#2563eb' : 'rgba(255,255,255,0.12)'
                  }} />
              ))}
            </div>
            <button onClick={dismiss}
              className="p-1 rounded-lg hover:bg-white/[0.08] transition-colors"
              style={{ color: 'rgba(255,255,255,0.3)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Icon + content */}
          <div className="text-center mb-6">
            <div className="text-5xl mb-4">{s.icon}</div>
            <h2 className="text-lg font-black text-white mb-2">
              {step === 0 && guest ? `Welcome, ${guest.first_name}!` : s.title}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {step === 0 && guest
                ? `Hi ${guest.first_name}! ${s.desc}`
                : s.desc}
            </p>
          </div>

          {/* Highlight box */}
          {s.highlight && (
            <div className="rounded-xl px-4 py-3 mb-4"
              style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.25)' }}>
              <p className="text-xs font-semibold" style={{ color: '#93c5fd' }}>
                ⚡ {s.highlight}
              </p>
            </div>
          )}

          {/* Tip */}
          {s.tip && (
            <div className="rounded-xl px-4 py-3 mb-4"
              style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <p className="text-xs" style={{ color: '#86efac' }}>
                💡 {s.tip}
              </p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <button onClick={prev} disabled={step === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-0"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)' }}>
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>

            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {step + 1} / {STEPS.length}
            </span>

            <button onClick={next}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white transition-all"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 4px 12px rgba(37,99,235,0.35)' }}>
              {step === STEPS.length - 1
                ? <><CheckCircle2 className="w-3.5 h-3.5" />Let's go!</>
                : <>Next <ChevronRight className="w-3.5 h-3.5" /></>
              }
            </button>
          </div>

          {/* Skip */}
          <button onClick={dismiss}
            className="w-full text-center text-xs mt-3 transition-colors"
            style={{ color: 'rgba(255,255,255,0.2)' }}
            onMouseEnter={e => e.target.style.color = 'rgba(255,255,255,0.4)'}
            onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.2)'}>
            Skip tour
          </button>
        </div>
      </div>
    </div>
  )
}

// Export a function to restart the tour
export function restartTour() {
  localStorage.removeItem(TOUR_KEY)
  window.location.reload()
}
