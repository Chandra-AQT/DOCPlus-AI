import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, ChevronDown, ChevronUp, LogOut } from 'lucide-react'
import { getGuestSession, getGuestLimits, logout } from '../lib/auth'

function UsagePill({ used, limit, label, color }) {
  const pct = limit > 0 ? Math.round((used / limit) * 100) : 0
  const full = used >= limit
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{color:'rgba(255,255,255,0.5)'}}>{label}</span>
          <span className="text-[10px] font-black tabular-nums" style={{color: full ? '#fca5a5' : color}}>
            {used} / {limit} {full ? '🔒' : 'used'}
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.08)'}}>
          <div className="h-full rounded-full transition-all" style={{
            width:`${pct}%`,
            background: full ? '#ef4444' : color,
          }} />
        </div>
      </div>
    </div>
  )
}

export default function GuestBanner() {
  const [expanded, setExpanded] = useState(false)
  const guest  = getGuestSession()
  const limits = getGuestLimits()
  const navigate = useNavigate()

  if (!guest || !limits) return null

  const allUsed = limits.pdfRemaining === 0 && limits.extractionRemaining === 0

  return (
    <div className="shrink-0" style={{
      background: allUsed
        ? 'rgba(239,68,68,0.08)'
        : 'rgba(37,99,235,0.08)',
      borderBottom: allUsed
        ? '1px solid rgba(239,68,68,0.2)'
        : '1px solid rgba(37,99,235,0.15)',
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left">

        {/* Trial badge */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full shrink-0 text-[10px] font-black uppercase tracking-wider"
          style={{
            background: allUsed ? 'rgba(239,68,68,0.15)' : 'rgba(37,99,235,0.15)',
            color: allUsed ? '#fca5a5' : '#93c5fd',
            border: `1px solid ${allUsed ? 'rgba(239,68,68,0.25)' : 'rgba(37,99,235,0.25)'}`,
          }}>
          {allUsed ? <Lock className="w-2.5 h-2.5" /> : <span>⚡</span>}
          Trial
        </div>

        {/* Usage summary */}
        <div className="flex items-center gap-4 flex-1 min-w-0 text-xs">
          <span className="font-semibold" style={{color:'rgba(255,255,255,0.6)'}}>
            {guest.first_name}
          </span>
          <span style={{color:'rgba(255,255,255,0.3)'}}>·</span>
          <span style={{color: limits.pdfRemaining === 0 ? '#fca5a5' : 'rgba(255,255,255,0.5)'}}>
            PDF Fetch: <strong className="text-white">{limits.pdfFetched}/{limits.pdfLimit}</strong>
          </span>
          <span style={{color:'rgba(255,255,255,0.3)'}}>·</span>
          <span style={{color: limits.extractionRemaining === 0 ? '#fca5a5' : 'rgba(255,255,255,0.5)'}}>
            Extraction: <strong className="text-white">{limits.extractionsUsed}/{limits.extractionLimit}</strong>
          </span>
          {allUsed && (
            <>
              <span style={{color:'rgba(255,255,255,0.3)'}}>·</span>
              <span className="text-red-400 font-bold text-[10px]">Limit reached — contact admin</span>
            </>
          )}
        </div>

        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-white/30 shrink-0" />
                  : <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/[0.05]" style={{paddingTop:12}}>
          <UsagePill used={limits.pdfFetched}      limit={limits.pdfLimit}       label="PDF Fetch Limit"   color="#60a5fa" />
          <UsagePill used={limits.extractionsUsed} limit={limits.extractionLimit} label="Extraction Limit"  color="#a78bfa" />

          {allUsed && (
            <div className="rounded-xl p-3 text-xs"
              style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)'}}>
              <p className="font-bold text-red-400 mb-0.5">Trial limit reached</p>
              <p className="text-white/50">Contact the administrator to increase your limits or unlock full access.</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button onClick={logout}
              className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
              <LogOut className="w-3 h-3" /> Exit Trial
            </button>
            <button onClick={() => navigate('/register')}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold">
              View Registration →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
