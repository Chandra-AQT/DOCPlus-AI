/**
 * GuestHelpButton — floating ? button for guests only.
 * Bottom-right corner. Opens a quick-help menu.
 */
import { useState } from 'react'
import { HelpCircle, X, BookOpen, Zap, Mail, RotateCcw, ChevronRight } from 'lucide-react'
import { isGuest, getGuestLimits } from '../lib/auth'
import { restartTour } from './GuestTour'
import RequestAccessModal from './RequestAccessModal'

export default function GuestHelpButton() {
  const [open, setOpen]               = useState(false)
  const [showRequest, setShowRequest] = useState(false)

  if (!isGuest()) return null

  const limits = getGuestLimits()

  const ITEMS = [
    {
      icon: BookOpen,
      color: '#60a5fa',
      label: 'Quick Guide',
      desc:  'How to use the platform',
      action: () => {
        setOpen(false)
        // Show a quick guide inline
        window.dispatchEvent(new CustomEvent('docplus:show-guide'))
      }
    },
    {
      icon: Zap,
      color: '#a78bfa',
      label: 'Your Trial Usage',
      desc:  limits
        ? `PDF: ${limits.pdfFetched}/${limits.pdfLimit} · Extractions: ${limits.extractionsUsed}/${limits.extractionLimit}`
        : 'View usage stats',
      action: () => { setOpen(false); window.location.href = '/dashboard' }
    },
    {
      icon: Mail,
      color: '#fbbf24',
      label: 'Request More Access',
      desc:  'Ask admin to increase limits',
      action: () => { setOpen(false); setShowRequest(true) }
    },
    {
      icon: RotateCcw,
      color: '#34d399',
      label: 'Restart Tour',
      desc:  'Show the welcome walkthrough again',
      action: () => { setOpen(false); restartTour() }
    },
  ]

  return (
    <>
      {/* Floating button */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">

        {/* Menu */}
        {open && (
          <div className="rounded-2xl overflow-hidden animate-fade-in mb-1"
            style={{
              background: '#0d1526',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
              width: 260,
            }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <p className="text-xs font-black text-white">Guest Help</p>
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                DOCPlus AI⁺ Trial
              </p>
            </div>
            <div className="p-2">
              {ITEMS.map(item => (
                <button key={item.label} onClick={item.action}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group"
                  style={{ background: 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${item.color}18`, border: `1px solid ${item.color}25` }}>
                    <item.icon className="w-3.5 h-3.5" style={{ color: item.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white">{item.label}</p>
                    <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{item.desc}</p>
                  </div>
                  <ChevronRight className="w-3 h-3 shrink-0 opacity-30 group-hover:opacity-70 transition-opacity"
                    style={{ color: 'white' }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Toggle button */}
        <button
          onClick={() => setOpen(o => !o)}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all"
          style={{
            background: open
              ? 'linear-gradient(135deg,#ef4444,#dc2626)'
              : 'linear-gradient(135deg,#2563eb,#7c3aed)',
            boxShadow: open
              ? '0 4px 20px rgba(239,68,68,0.4)'
              : '0 4px 20px rgba(37,99,235,0.5)',
          }}
          title="Guest Help"
        >
          {open
            ? <X className="w-5 h-5 text-white" />
            : <HelpCircle className="w-5 h-5 text-white" />
          }
        </button>
      </div>

      {/* Request access modal */}
      {showRequest && (
        <RequestAccessModal
          defaultType="full_access"
          onClose={() => setShowRequest(false)}
        />
      )}
    </>
  )
}
