/**
 * WhatsNextBanner — contextual "next step" guidance for guests.
 * Shows after key actions to tell the guest what to do next.
 * Only visible for guest users.
 */
import { ArrowRight, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { isGuest } from '../lib/auth'

export default function WhatsNextBanner({ icon, message, action, actionLabel, actionRoute, onDismiss, color = '#22c55e' }) {
  const navigate = useNavigate()
  if (!isGuest()) return null

  return (
    <div className="rounded-2xl px-5 py-4 flex items-center gap-4 animate-fade-in"
      style={{
        background: `${color}0f`,
        border: `1px solid ${color}30`,
      }}>
      {icon && <span className="text-2xl shrink-0">{icon}</span>}
      <p className="flex-1 text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>
        {message}
      </p>
      <div className="flex items-center gap-2 shrink-0">
        {actionRoute && (
          <button
            onClick={() => navigate(actionRoute)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white transition-all"
            style={{ background: `linear-gradient(135deg,${color},${color}cc)` }}>
            {actionLabel || 'Continue'} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
        {action && (
          <button
            onClick={action}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white transition-all"
            style={{ background: `linear-gradient(135deg,${color},${color}cc)` }}>
            {actionLabel || 'Continue'} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
        {onDismiss && (
          <button onClick={onDismiss}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'rgba(255,255,255,0.25)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
