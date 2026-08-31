/**
 * GuestTooltip — contextual help tooltip for guest users.
 * Shows a ? icon that reveals a popup on hover/click.
 * Only renders for guests — invisible for admins.
 */
import { useState } from 'react'
import { HelpCircle, X } from 'lucide-react'
import { isGuest } from '../lib/auth'

export default function GuestTooltip({ text, title, position = 'top', className = '' }) {
  const [open, setOpen] = useState(false)
  if (!isGuest()) return null

  const posStyles = {
    top:    { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8 },
    bottom: { top: '100%',   left: '50%', transform: 'translateX(-50%)', marginTop: 8 },
    left:   { right: '100%', top: '50%',  transform: 'translateY(-50%)', marginRight: 8 },
    right:  { left: '100%',  top: '50%',  transform: 'translateY(-50%)', marginLeft: 8 },
  }

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="flex items-center justify-center w-4 h-4 rounded-full transition-colors ml-1"
        style={{
          background: open ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.08)',
          color: open ? '#60a5fa' : 'rgba(255,255,255,0.3)',
          flexShrink: 0,
        }}
        aria-label="Help"
      >
        <HelpCircle className="w-3 h-3" />
      </button>

      {open && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{ ...posStyles[position], width: 240 }}
        >
          <div className="rounded-xl p-3 shadow-2xl"
            style={{
              background: '#0d1526',
              border: '1px solid rgba(37,99,235,0.3)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}>
            {title && (
              <p className="text-xs font-bold mb-1" style={{ color: '#60a5fa' }}>{title}</p>
            )}
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{text}</p>
          </div>
        </div>
      )}
    </span>
  )
}
