import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  Globe, FolderOpen, Zap, BarChart3, ArrowRight, CheckCircle2,
  Clock, Upload, Lock, Sparkles, TrendingUp, FileText,
  ChevronRight, Activity, Shield, Users, Star, Play,
  Database, Cpu, Download, RefreshCw
} from 'lucide-react'
import { useWorkflow } from '../lib/store'
import { isGuest, isAdmin, getGuestSession, getGuestLimits, refreshGuestUsage } from '../lib/auth'
import GuestTooltip from '../components/GuestTooltip'
import RequestAccessModal from '../components/RequestAccessModal'

// ─────────────────────────────────────────────────────────────────────────────
// Quick Action Card
// ─────────────────────────────────────────────────────────────────────────────
function QuickActionCard({ icon: Icon, title, desc, route, color, badge, locked, onClick }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={locked ? undefined : (onClick || (() => navigate(route)))}
      className={`group relative w-full text-left rounded-2xl p-5 transition-all duration-200 ${locked ? 'cursor-not-allowed' : 'hover:-translate-y-1 hover:shadow-2xl'}`}
      style={{
        background: locked ? 'rgba(255,255,255,0.02)' : '#0d1526',
        border: locked ? '1px solid rgba(255,255,255,0.06)' : `1px solid ${color}25`,
        opacity: locked ? 0.6 : 1,
      }}
    >
      {badge && (
        <span className="absolute top-3 right-3 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider"
          style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
          {badge}
        </span>
      )}
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: locked ? 'rgba(255,255,255,0.04)' : `${color}18`, border: `1px solid ${color}30` }}>
          {locked
            ? <Lock className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.2)' }} />
            : <Icon className="w-5 h-5" style={{ color }} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white mb-1">{title}</p>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>{desc}</p>
        </div>
        {!locked && (
          <ArrowRight className="w-4 h-4 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color }} />
        )}
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, color, sub }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xl">{icon}</span>
        <span className="text-2xl font-black" style={{ color }}>{value}</span>
      </div>
      <p className="text-xs font-bold text-white">{label}</p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Guest Trial Progress Bar
// ─────────────────────────────────────────────────────────────────────────────
function GuestUsageBar({ used, limit, label, color }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const full = used >= limit
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
        <span className="text-xs font-black tabular-nums" style={{ color: full ? '#fca5a5' : color }}>
          {used} / {limit}{full ? ' 🔒' : ''}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: full ? '#ef4444' : color }} />
      </div>
      {!full && limit - used <= 1 && (
        <p className="text-[10px] mt-1 font-semibold" style={{ color: '#fbbf24' }}>
          ⚠ {limit - used} remaining — use carefully
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Guest Journey Checklist
// ─────────────────────────────────────────────────────────────────────────────
function GuestJourney({ state }) {
  const navigate = useNavigate()
  const items = [
    { done: true,                                     label: 'Create trial account',          hint: 'Done!',                          action: null },
    { done: state.discoveredPdfs.length > 0,          label: 'Discover PDFs from a website',  hint: '→ Go to Discover',               action: () => navigate('/discover') },
    { done: state.library.length > 0,                 label: 'Add documents to library',      hint: '→ Go to Library',                action: () => navigate('/library') },
    { done: state.extractionJobs.length > 0,          label: 'Run AI metadata extraction',    hint: '→ Go to Extract',                action: () => navigate('/extract') },
    { done: state.extractionJobs.some(j=>j.status==='completed'), label: 'Review results',    hint: '→ Go to Results',                action: () => navigate('/results') },
  ]
  const done = items.filter(i => i.done).length
  if (done === items.length) return null

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1526', border: '1px solid rgba(37,99,235,0.2)' }}>
      <div className="px-5 py-3.5 flex items-center justify-between border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#22d3ee' }}>● YOUR JOURNEY</p>
          <p className="text-sm font-bold text-white mt-0.5">Getting Started Checklist</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${(done/items.length)*100}%`, background: 'linear-gradient(90deg,#2563eb,#22c55e)' }} />
          </div>
          <span className="text-xs font-black" style={{ color: '#60a5fa' }}>{done}/{items.length}</span>
        </div>
      </div>
      <div className="px-5 py-3 space-y-1">
        {items.map((item, i) => (
          <div key={i} onClick={!item.done && item.action ? item.action : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${!item.done && item.action ? 'cursor-pointer hover:bg-white/[0.04]' : ''}`}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{ background: item.done ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)', border: item.done ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)' }}>
              {item.done
                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                : <span className="text-[10px] font-black" style={{ color: 'rgba(255,255,255,0.25)' }}>{i+1}</span>}
            </div>
            <span className="text-sm flex-1" style={{ color: item.done ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.75)', fontWeight: item.done ? 400 : 600, textDecoration: item.done ? 'line-through' : 'none' }}>
              {item.label}
            </span>
            {!item.done && item.action && (
              <span className="text-[10px] font-semibold" style={{ color: '#60a5fa' }}>{item.hint}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent Extractions Row
// ─────────────────────────────────────────────────────────────────────────────
function RecentJobRow({ job }) {
  const navigate = useNavigate()
  const done = job.status === 'completed'
  const score = job.quality_score
  return (
    <div onClick={() => navigate('/results')}
      className="group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-white/[0.03]"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {/* Status icon */}
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: done ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.1)' }}>
        {done ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Clock className="w-3.5 h-3.5 text-yellow-400" />}
      </div>
      {/* Schema + doc ID */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white truncate">{job.schema_name || 'Extraction'}</p>
        <p className="text-[10px] font-mono truncate" style={{ color: 'rgba(255,255,255,0.2)' }}>
          {job.document_id?.slice(0, 24)}…
        </p>
      </div>
      {/* Score + status */}
      <div className="flex items-center gap-2 shrink-0">
        {score != null && (
          <span className="text-xs font-black tabular-nums"
            style={{ color: score >= 75 ? '#86efac' : score >= 50 ? '#fde047' : '#fca5a5' }}>
            {score}%
          </span>
        )}
        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
          style={{
            background: done ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)',
            color:      done ? '#86efac'              : '#fde047',
          }}>
          {job.status}
        </span>
        <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity text-white" />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Flow Diagram
// ─────────────────────────────────────────────────────────────────────────────
function WorkflowFlow() {
  const navigate = useNavigate()
  const steps = [
    { icon: Globe,      color: '#3b82f6', label: 'Discover',  sub: 'Crawl website',   route: '/discover' },
    { icon: FolderOpen, color: '#06b6d4', label: 'Library',   sub: 'Upload & manage', route: '/library'  },
    { icon: Zap,        color: '#f59e0b', label: 'Extract',   sub: 'AI metadata',     route: '/extract'  },
    { icon: BarChart3,  color: '#22c55e', label: 'Results',   sub: 'Review & export', route: '/results'  },
  ]
  return (
    <div className="rounded-2xl p-5" style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-[10px] font-black uppercase tracking-widest mb-4" style={{ color: '#22d3ee' }}>● PLATFORM WORKFLOW</p>
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center flex-1">
            <button onClick={() => navigate(s.route)}
              className="group flex flex-col items-center gap-2 flex-1 transition-all hover:-translate-y-0.5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-all group-hover:scale-110"
                style={{ background: `${s.color}18`, border: `1px solid ${s.color}40` }}>
                <s.icon className="w-5 h-5" style={{ color: s.color }} />
              </div>
              <p className="text-xs font-bold text-white text-center">{s.label}</p>
              <p className="text-[9px] text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.sub}</p>
            </button>
            {i < steps.length - 1 && (
              <div className="flex items-center justify-center w-5 shrink-0 pb-6">
                <ChevronRight className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.15)' }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin quick stats
// ─────────────────────────────────────────────────────────────────────────────
function AdminPanel() {
  const navigate = useNavigate()
  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4" style={{ color: '#a78bfa' }} />
          <p className="text-sm font-bold" style={{ color: '#c4b5fd' }}>Admin Access</p>
        </div>
        <button onClick={() => navigate('/admin')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:-translate-y-0.5"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)' }}>
          Admin Panel <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: <Users className="w-4 h-4" />, label: 'Guest Management', desc: 'View, manage and control guest users', route: '/admin' },
          { icon: <Activity className="w-4 h-4" />, label: 'Usage Analytics', desc: 'Monitor PDF fetches and extractions', route: '/admin' },
        ].map(item => (
          <button key={item.label} onClick={() => navigate(item.route)}
            className="flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-all hover:bg-white/[0.04]"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <span style={{ color: '#a78bfa' }}>{item.icon}</span>
            <div>
              <p className="text-xs font-bold text-white">{item.label}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{item.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Engines Badge Row
// ─────────────────────────────────────────────────────────────────────────────
function EnginesBadges() {
  const engines = [
    { name: 'GPT-4o',   color: '#22c55e', free: false },
    { name: 'Claude',   color: '#f59e0b', free: false },
    { name: 'Gemini',   color: '#3b82f6', free: false },
    { name: 'Groq',     color: '#a78bfa', free: false },
    { name: 'Ollama',   color: '#34d399', free: true  },
    { name: 'Built-in', color: '#60a5fa', free: true  },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {engines.map(e => (
        <span key={e.name} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
          style={{ background: `${e.color}12`, color: e.color, border: `1px solid ${e.color}25` }}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: e.color }} />
          {e.name}
          {e.free && <span className="opacity-60">FREE</span>}
        </span>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate    = useNavigate()
  const { state }   = useWorkflow()
  const guest       = isGuest() ? getGuestSession() : null
  const adminUser   = isAdmin()
  const limits      = guest ? getGuestLimits() : null
  const [showRequest, setShowRequest] = useState(false)
  const [timeOfDay,   setTimeOfDay]   = useState('')

  useEffect(() => {
    const h = new Date().getHours()
    if (h < 12) setTimeOfDay('Good morning')
    else if (h < 17) setTimeOfDay('Good afternoon')
    else setTimeOfDay('Good evening')
    if (guest) refreshGuestUsage()
  }, [])

  const userName = guest
    ? guest.first_name
    : adminUser
      ? (JSON.parse(localStorage.getItem('docplus_admin_user') || '{}').full_name?.split(' ')[0] || 'Admin')
      : 'there'

  const completedJobs = state.extractionJobs.filter(j => j.status === 'completed').length

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in space-y-6">

      {/* ── TOP HERO ─────────────────────────────────────────────────────── */}
      <div className="rounded-3xl relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,rgba(37,99,235,0.18),rgba(124,58,237,0.14))', border: '1px solid rgba(37,99,235,0.2)', minHeight: 160 }}>
        {/* Grid bg */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)', backgroundSize: '32px 32px' }} />
        {/* Glow orbs */}
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle,#7c3aed,transparent)' }} />
        <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full opacity-10" style={{ background: 'radial-gradient(circle,#2563eb,transparent)' }} />

        <div className="relative px-7 py-7 flex items-center justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>
                DOCPlus AI⁺
              </span>
              {guest && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider"
                  style={{ background: 'rgba(37,99,235,0.2)', color: '#93c5fd', border: '1px solid rgba(37,99,235,0.3)' }}>
                  ⚡ Trial
                </span>
              )}
              {adminUser && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider"
                  style={{ background: 'rgba(124,58,237,0.2)', color: '#c4b5fd', border: '1px solid rgba(124,58,237,0.3)' }}>
                  <Shield className="inline w-2.5 h-2.5 mr-0.5" />Admin
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black text-white mb-1">
              {timeOfDay}, {userName}!
            </h1>
            <p className="text-sm max-w-xl" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {guest
                ? `Welcome to your DOCPlus AI⁺ trial. Discover PDFs, extract metadata with AI, and review your results — all in one platform.`
                : `Your document intelligence platform is ready. Discover, extract, and analyze at scale.`}
            </p>
          </div>

          {/* CTA buttons */}
          <div className="flex gap-3 flex-wrap shrink-0">
            <button onClick={() => navigate('/discover')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 4px 16px rgba(37,99,235,0.35)' }}>
              <Globe className="w-4 h-4" /> Discover PDFs
            </button>
            <button onClick={() => navigate('/extract')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all hover:-translate-y-0.5"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
              <Zap className="w-4 h-4" /> Extract Metadata
            </button>
          </div>
        </div>
      </div>

      {/* ── STATS ROW ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon="🔍" value={state.discoveredPdfs.length} label="PDFs Discovered" color="#3b82f6"
          sub={state.discoveredPdfs.length > 0 ? `from ${state.crawlUrl?.split('/')[2] || 'web'}` : 'Crawl a website to find PDFs'} />
        <StatCard icon="📚" value={state.library.length} label="In Library" color="#8b5cf6"
          sub={state.library.length > 0 ? `${state.library.filter(d=>d.status==='parsed').length} parsed` : 'Add documents to extract'} />
        <StatCard icon="⚡" value={state.extractionJobs.length} label="Extractions Run" color="#f59e0b"
          sub={completedJobs > 0 ? `${completedJobs} completed successfully` : 'No extractions yet'} />
        <StatCard icon="✅" value={completedJobs} label="Results Ready" color="#22c55e"
          sub={completedJobs > 0 ? 'Click to review & export' : 'Run extraction to see results'} />
      </div>

      {/* ── MAIN CONTENT GRID ────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-5">

        {/* LEFT — Quick Actions + Workflow */}
        <div className="lg:col-span-2 space-y-5">

          {/* Quick Actions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>
                QUICK ACTIONS
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <QuickActionCard icon={Globe} title="Discover PDFs" route="/discover" color="#3b82f6"
                desc="Enter a website URL to automatically find and collect all PDF documents" badge="Step 1" />
              <QuickActionCard icon={Upload} title="Upload Files" route="/library" color="#8b5cf6"
                desc="Upload PDF, Word, or image files directly from your computer or device" />
              <QuickActionCard icon={FolderOpen} title="Document Library" route="/library" color="#06b6d4"
                desc={`${state.library.length} document${state.library.length !== 1 ? 's' : ''} stored — select for AI extraction`} badge="Step 2" />
              <QuickActionCard icon={Zap} title="Extract Metadata" route="/extract" color="#f59e0b"
                desc="Run AI-powered extraction using GPT-4o, Claude, Gemini, or built-in engine" badge="Step 3" />
              <QuickActionCard icon={BarChart3} title="View Results" route="/results" color="#22c55e"
                desc={completedJobs > 0 ? `${completedJobs} extraction${completedJobs !== 1 ? 's' : ''} ready to review and export` : 'Review extracted fields and confidence scores'} />
              <QuickActionCard icon={FileText} title="Schemas" route={adminUser ? '/schemas' : '/schemas'}
                color="#a78bfa"
                desc={adminUser ? 'Create and manage custom extraction schemas' : 'View preset extraction schemas for your trial'}
                locked={false} />
            </div>
          </div>

          {/* Workflow overview */}
          <WorkflowFlow />

          {/* AI Engines */}
          <div className="rounded-2xl p-5" style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#22d3ee' }}>● AI ENGINES</p>
                <p className="text-sm font-bold text-white mt-0.5">Supported extraction engines</p>
              </div>
              <button onClick={() => navigate('/extract')}
                className="text-xs font-semibold" style={{ color: '#60a5fa' }}>
                Use Engine →
              </button>
            </div>
            <EnginesBadges />
            <p className="text-[10px] mt-3" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Bring your own API key (BYOK) · Keys are never stored · Free built-in engine available
            </p>
          </div>
        </div>

        {/* RIGHT — Guest/Admin panel + recent activity */}
        <div className="space-y-5">

          {/* Guest Trial Panel */}
          {guest && limits && (
            <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1526', border: '1px solid rgba(37,99,235,0.2)' }}>
              <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#22d3ee' }}>● TRIAL USAGE</p>
                <p className="text-sm font-bold text-white mt-0.5">Your Limits</p>
              </div>
              <div className="px-5 py-4 space-y-4">
                <GuestUsageBar
                  used={limits.pdfFetched}
                  limit={limits.pdfLimit}
                  label="PDF Fetch"
                  color="#60a5fa" />
                <GuestUsageBar
                  used={limits.extractionsUsed}
                  limit={limits.extractionLimit}
                  label="Metadata Extraction"
                  color="#a78bfa" />

                {(limits.pdfRemaining === 0 || limits.extractionRemaining === 0) && (
                  <div className="rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <p className="text-xs font-bold text-red-400 mb-1">Trial limit reached</p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      Request more access from the admin to continue.
                    </p>
                    <button onClick={() => setShowRequest(true)}
                      className="w-full mt-2 py-2 rounded-xl text-xs font-black text-white"
                      style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                      Request More Access
                    </button>
                  </div>
                )}

                <div className="rounded-xl p-3 text-[10px]" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="font-bold mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Trial includes:</p>
                  <div className="space-y-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    <p>✓ Crawl unlimited websites</p>
                    <p>✓ Fetch up to {limits.pdfLimit} PDFs to library</p>
                    <p>✓ {limits.extractionLimit} AI metadata extractions</p>
                    <p>✓ Preset schemas (6 document types)</p>
                    <p>✓ Full results review</p>
                    <p style={{ color: 'rgba(239,68,68,0.6)' }}>✗ Custom schema creation</p>
                    <p style={{ color: 'rgba(239,68,68,0.6)' }}>✗ Export (Excel/CSV/JSON)</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Admin panel */}
          {adminUser && <AdminPanel />}

          {/* Guest Journey Checklist */}
          {guest && <GuestJourney state={state} />}

          {/* Recent Extractions */}
          {state.extractionJobs.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#22d3ee' }}>● RECENT EXTRACTIONS</p>
                <button onClick={() => navigate('/results')} className="text-xs font-semibold" style={{ color: '#60a5fa' }}>View all →</button>
              </div>
              {state.extractionJobs.slice(0, 4).map(job => (
                <RecentJobRow key={job.job_id} job={job} />
              ))}
            </div>
          )}

          {/* Platform info */}
          <div className="rounded-2xl p-4" style={{ background: '#0d1526', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.2)' }}>PLATFORM</p>
            <div className="space-y-2">
              {[
                { icon: <Globe className="w-3.5 h-3.5" />,    color: '#3b82f6', label: 'PDF Discovery',     desc: 'Web crawling + filtering' },
                { icon: <Cpu className="w-3.5 h-3.5" />,      color: '#f59e0b', label: 'AI Extraction',     desc: 'Multiple engine support' },
                { icon: <Database className="w-3.5 h-3.5" />, color: '#06b6d4', label: 'Document Library',  desc: 'Parse + manage PDFs' },
                { icon: <Download className="w-3.5 h-3.5" />, color: '#22c55e', label: 'Export',            desc: 'Excel, CSV, JSON' },
              ].map(f => (
                <div key={f.label} className="flex items-center gap-3">
                  <span style={{ color: f.color }}>{f.icon}</span>
                  <div>
                    <span className="text-xs font-semibold text-white">{f.label}</span>
                    <span className="text-[10px] ml-2" style={{ color: 'rgba(255,255,255,0.3)' }}>{f.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── EMPTY STATE — first time user ────────────────────────────────── */}
      {state.library.length === 0 && state.discoveredPdfs.length === 0 && (
        <div className="rounded-2xl p-8 text-center"
          style={{ background: 'rgba(37,99,235,0.05)', border: '1px dashed rgba(37,99,235,0.2)' }}>
          <Play className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: '#60a5fa' }} />
          <p className="text-base font-black text-white mb-1">Start your first extraction</p>
          <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Enter a website URL to discover PDFs, or upload a document directly.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate('/discover')}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black text-white"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
              <Globe className="w-4 h-4" /> Discover PDFs
            </button>
            <button onClick={() => navigate('/library')}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>
              <Upload className="w-4 h-4" /> Upload File
            </button>
          </div>
        </div>
      )}

      {showRequest && <RequestAccessModal defaultType="full_access" onClose={() => setShowRequest(false)} />}
    </div>
  )
}
