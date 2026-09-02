/**
 * GuestDashboard — Clean, well-spaced dashboard for guest trial users.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Globe, Upload, Zap, BarChart3, ArrowRight, CheckCircle2,
  FileText, Sparkles, RefreshCw, LogOut, Lock
} from 'lucide-react'
import { useWorkflow } from '../lib/store'
import { getGuestSession, getGuestLimits, refreshGuestUsage, logout } from '../lib/auth'
import { getGuestJobs } from '../lib/api'
import RequestAccessModal from '../components/RequestAccessModal'
import RobotMascot from '../components/RobotMascot'

// ── Usage progress bar ────────────────────────────────────────────────────────
function UsageBar({ used, limit, label, color }) {
  const pct  = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const full = used >= limit
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</span>
        <span className="text-xs font-black tabular-nums" style={{ color: full ? '#fca5a5' : color }}>
          {used} / {limit}{full ? ' 🔒' : ''}
        </span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: full ? '#ef4444' : color }} />
      </div>
      {!full && limit - used === 1 && (
        <p className="text-[11px] mt-1.5 font-semibold" style={{ color: '#fbbf24' }}>
          ⚠ Last {label.toLowerCase()} remaining
        </p>
      )}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, sub, color }) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-1"
      style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.07)' }}>
      <span className="text-xl">{icon}</span>
      <p className="text-2xl font-black text-white leading-none mt-1">{value}</p>
      <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
      {sub && <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{sub}</p>}
    </div>
  )
}

// ── Quick action row ──────────────────────────────────────────────────────────
function ActionRow({ icon: Icon, title, desc, badge, color, locked, onClick }) {
  return (
    <button onClick={locked ? undefined : onClick}
      className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-all rounded-xl ${locked ? 'cursor-not-allowed opacity-50' : 'hover:bg-white/[0.04]'}`}
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: locked ? 'rgba(255,255,255,0.04)' : `${color}15`, border: `1px solid ${locked ? 'rgba(255,255,255,0.08)' : color + '30'}` }}>
        {locked ? <Lock className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.2)' }} />
                : <Icon className="w-4 h-4" style={{ color }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-bold text-white">{title}</p>
          {badge && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
              style={{ background: `${color}18`, color, border: `1px solid ${color}25` }}>
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{desc}</p>
      </div>
      {!locked && <ArrowRight className="w-4 h-4 shrink-0 opacity-30" style={{ color }} />}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function GuestDashboard() {
  const navigate = useNavigate()
  const { state } = useWorkflow()
  const [limits,      setLimits]      = useState(getGuestLimits())
  const [showRequest, setShowRequest] = useState(false)
  const [timeOfDay,   setTimeOfDay]   = useState('')

  const guest = getGuestSession()
  const [persistedJobs, setPersistedJobs] = useState([])

  useEffect(() => {
    const h = new Date().getHours()
    setTimeOfDay(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')

    // Refresh from server — if full_access was granted, redirect to dashboard
    refreshGuestUsage().then(updated => {
      if (updated?.full_access) {
        // Guest has been upgraded — go to full platform
        window.location.href = '/dashboard'
        return
      }
      setLimits(getGuestLimits())
    })

    // Load persisted jobs from DB (survive page refresh)
    getGuestJobs().then(r => setPersistedJobs(r.jobs || [])).catch(() => {})
  }, [])

  // Merge: DB jobs are authoritative; fall back to in-memory state for current session
  const allJobs = persistedJobs.length > 0 ? persistedJobs : state.extractionJobs
  const completedJobs = allJobs.filter(j => j.status === 'completed').length

  const checklist = [
    { done: true,                           label: 'Create trial account' },
    { done: state.library.length > 0,       label: 'Add a document to library',  action: () => navigate('/wizard') },
    { done: allJobs.length > 0,             label: 'Run your first extraction',  action: () => navigate('/wizard') },
    { done: completedJobs > 0,              label: 'Review your results',        action: () => navigate('/wizard') },
  ]
  const checkDone = checklist.filter(c => c.done).length

  return (
    <div className="min-h-screen" style={{ background: '#060b18', color: '#f1f5f9' }}>

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 py-3"
        style={{ background: 'rgba(6,11,24,0.95)', borderBottom: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)' }}>
        {/* Logo */}
        <div className="flex items-end cursor-pointer gap-0" onClick={() => navigate('/')}>
          <div className="relative inline-flex items-end">
            <div style={{ position: 'absolute', top: -14, left: -2 }}>
              <RobotMascot size={19} />
            </div>
            <span className="font-black text-white text-sm">D</span>
          </div>
          <span className="font-black text-white text-sm">OCPlus AI<span style={{ color: '#7c3aed' }}>⁺</span></span>
        </div>

        {/* Trial counters */}
        <div className="flex items-center gap-4">
          {limits && (
            <div className="hidden sm:flex items-center gap-3 text-xs">
              <span style={{ color: limits.pdfRemaining === 0 ? '#fca5a5' : 'rgba(255,255,255,0.45)' }}>
                PDF <strong className="text-white">{limits.pdfFetched}/{limits.pdfLimit}</strong>
              </span>
              <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
              <span style={{ color: limits.extractionRemaining === 0 ? '#fca5a5' : 'rgba(255,255,255,0.45)' }}>
                Extract <strong className="text-white">{limits.extractionsUsed}/{limits.extractionLimit}</strong>
              </span>
            </div>
          )}
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black"
            style={{ background: 'rgba(37,99,235,0.15)', color: '#93c5fd', border: '1px solid rgba(37,99,235,0.25)' }}>
            ⚡ Trial
          </span>
          <button onClick={logout}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.08]"
            style={{ color: 'rgba(255,255,255,0.3)' }}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Page content ── */}
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* ── Hero ── */}
        <div className="rounded-3xl relative overflow-hidden px-8 py-7"
          style={{ background: 'linear-gradient(135deg,rgba(37,99,235,0.18),rgba(124,58,237,0.14))', border: '1px solid rgba(37,99,235,0.2)' }}>
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)', backgroundSize: '32px 32px' }} />
          <div className="relative flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#93c5fd' }}>
                ⚡ TRIAL ACCOUNT
              </p>
              <h1 className="text-2xl font-black text-white mb-1">
                {timeOfDay}, {guest?.first_name || 'there'}!
              </h1>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Upload PDFs, extract metadata with AI, and export your results.
              </p>
            </div>
            <button onClick={() => navigate('/wizard')}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black text-white transition-all hover:-translate-y-0.5 shrink-0"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 4px 16px rgba(37,99,235,0.4)' }}>
              <Zap className="w-4 h-4" /> Start Extracting
            </button>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon="📚" value={state.library.length}   label="In Library"   sub={state.library.length > 0 ? `${state.library.filter(d=>d.status==='parsed').length} parsed` : 'No documents yet'} color="#60a5fa" />
          <StatCard icon="⚡" value={allJobs.length}          label="Extractions"  sub={completedJobs > 0 ? `${completedJobs} completed` : 'None yet'} color="#a78bfa" />
          <StatCard icon="✅" value={completedJobs}                  label="Completed"      sub={completedJobs > 0 ? 'Results ready' : 'Run extraction first'} color="#22c55e" />
          <StatCard icon="🔍" value={state.discoveredPdfs.length}   label="Discovered"     sub={state.discoveredPdfs.length > 0 ? 'From web crawl' : 'Crawl a website'} color="#34d399" />
        </div>

        {/* ── Two-column layout ── */}
        <div className="grid md:grid-cols-5 gap-6">

          {/* Left — Quick Actions (wider) */}
          <div className="md:col-span-3">
            <p className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
              QUICK ACTIONS
            </p>
            <div className="rounded-2xl overflow-hidden"
              style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.07)' }}>
              <ActionRow icon={Zap} title="Extract Metadata" badge="Start here" color="#f59e0b"
                desc="Upload a PDF, pick a schema, and extract structured data with AI"
                onClick={() => navigate('/wizard')} />
              <ActionRow icon={Globe} title="Discover PDFs from Web" color="#3b82f6"
                desc={limits?.pdfRemaining === 0 ? 'PDF fetch limit reached' : `Fetch up to ${limits?.pdfRemaining ?? 0} more PDFs from any website`}
                locked={limits?.pdfRemaining === 0}
                onClick={() => navigate('/wizard')} />
              <ActionRow icon={Upload} title="Upload a Document" color="#8b5cf6"
                desc={limits?.uploadAllowed ? 'Upload PDF, Word, or image files directly' : 'Requires admin approval — request access to enable'}
                locked={!limits?.uploadAllowed}
                onClick={() => navigate('/wizard')} />
              <div style={{ borderBottom: 'none' }}>
                <ActionRow icon={BarChart3} title="View Results" color="#22c55e"
                  desc={completedJobs > 0 ? `${completedJobs} extraction${completedJobs !== 1 ? 's' : ''} ready to review` : 'No results yet — run an extraction first'}
                  locked={completedJobs === 0}
                  onClick={() => navigate('/wizard')} />
              </div>
            </div>
          </div>

          {/* Right — Trial usage + checklist (narrower) */}
          <div className="md:col-span-2 space-y-5">

            {/* Trial usage card */}
            {limits && (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: '#0d1526', border: '1px solid rgba(124,58,237,0.2)' }}>
                <div className="px-5 py-4 border-b flex items-center justify-between"
                  style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#a78bfa' }}>
                    ● TRIAL USAGE
                  </p>
                  <button onClick={() => refreshGuestUsage().then(() => setLimits(getGuestLimits()))}
                    className="p-1 rounded-lg hover:bg-white/[0.06] transition-colors">
                    <RefreshCw className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
                  </button>
                </div>
                <div className="px-5 py-4 space-y-4">
                  <UsageBar used={limits.pdfFetched}      limit={limits.pdfLimit}       label="PDF Fetch"   color="#60a5fa" />
                  <UsageBar used={limits.extractionsUsed} limit={limits.extractionLimit} label="Extraction"  color="#a78bfa" />
                </div>

                {/* Trial includes */}
                <div className="px-5 pb-4">
                  <div className="rounded-xl p-3 space-y-1.5"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[10px] font-bold mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Trial includes:</p>
                    {[
                      ['✓', 'Crawl unlimited websites', '#34d399'],
                      ['✓', `Fetch up to ${limits.pdfLimit} PDFs`, '#34d399'],
                      ['✓', `${limits.extractionLimit} AI extractions`, '#34d399'],
                      ['✓', '6 preset schemas', '#34d399'],
                      ['✓', 'Full results view + export', '#34d399'],
                      [limits.uploadAllowed ? '✓' : '⊘', 'Manual file upload', limits.uploadAllowed ? '#34d399' : 'rgba(255,255,255,0.25)'],
                    ].map(([icon, text, color]) => (
                      <p key={text} className="flex items-center gap-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        <span style={{ color }}>{icon}</span>{text}
                      </p>
                    ))}
                  </div>
                </div>

                {(limits.pdfRemaining === 0 || limits.extractionRemaining === 0) && (
                  <div className="px-5 pb-5">
                    <button onClick={() => setShowRequest(true)}
                      className="w-full py-2.5 rounded-xl text-xs font-black text-white"
                      style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                      Request More Access
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Getting started checklist */}
            {checkDone < checklist.length && (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: '#0d1526', border: '1px solid rgba(37,99,235,0.2)' }}>
                <div className="px-5 py-4 border-b flex items-center justify-between"
                  style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#22d3ee' }}>
                    ● GET STARTED
                  </p>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(37,99,235,0.15)', color: '#60a5fa' }}>
                    {checkDone}/{checklist.length}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div className="h-full transition-all duration-700"
                    style={{ width: `${(checkDone/checklist.length)*100}%`, background: 'linear-gradient(90deg,#2563eb,#22c55e)' }} />
                </div>
                <div className="px-4 py-3 space-y-1">
                  {checklist.map((item, i) => (
                    <div key={i}
                      onClick={!item.done && item.action ? item.action : undefined}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${!item.done && item.action ? 'cursor-pointer hover:bg-white/[0.04]' : ''}`}>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: item.done ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)', border: item.done ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)' }}>
                        {item.done
                          ? <CheckCircle2 className="w-3 h-3 text-green-400" />
                          : <span className="text-[9px] font-black" style={{ color: 'rgba(255,255,255,0.25)' }}>{i+1}</span>}
                      </div>
                      <span className="text-xs flex-1 leading-snug"
                        style={{ color: item.done ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)', fontWeight: item.done ? 400 : 600, textDecoration: item.done ? 'line-through' : 'none' }}>
                        {item.label}
                      </span>
                      {!item.done && item.action && (
                        <ArrowRight className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent extractions — loaded from DB */}
            {allJobs.length > 0 && (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#22d3ee' }}>
                    ● RECENT EXTRACTIONS
                  </p>
                </div>
                {allJobs.slice(0, 3).map(job => (
                  <div key={job.job_id}
                    className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-white/[0.03] transition-colors"
                    onClick={() => navigate('/wizard')}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${job.status === 'completed' ? 'bg-green-500/12' : 'bg-yellow-500/12'}`}>
                      {job.status === 'completed'
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                        : <Zap className="w-3.5 h-3.5 text-yellow-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{job.schema_name}</p>
                      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                        {job.created_at ? new Date(job.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Kolkata' }) : ''}
                        {job.total_records ? ` · ${job.total_records} records` : ''}
                      </p>
                    </div>
                    {job.quality_score != null && (
                      <span className="text-xs font-black tabular-nums"
                        style={{ color: job.quality_score >= 70 ? '#86efac' : '#fde047' }}>
                        {job.quality_score}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      </div>

      {showRequest && <RequestAccessModal defaultType="full_access" onClose={() => setShowRequest(false)} />}
    </div>
  )
}
