import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  LayoutDashboard, Globe, FolderOpen, Zap, BarChart3,
  Layers3, Menu, X, Sparkles, ChevronRight, Upload, Shield,
  LogOut, User, Crown, FileText
} from 'lucide-react'
import { useWorkflow } from '../lib/store'
import GuestBanner from './GuestBanner'
import GuestTour from './GuestTour'
import GuestHelpButton from './GuestHelpButton'
import RobotMascot from './RobotMascot'
import { isGuest, isAdmin, getGuestSession, getGuestLimits, logout, isFullAccessGuest } from '../lib/auth'

// ── Guest top-bar badge with live usage counters ──────────────────────────────
function GuestTopBadge() {
  const limits = getGuestLimits()
  const guest  = getGuestSession()
  if (!limits) return null
  const pdfFull = limits.pdfRemaining === 0
  const extFull = limits.extractionRemaining === 0
  return (
    <div className="flex items-center gap-2">
      {/* Name */}
      <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {guest?.first_name}
      </span>
      {/* Trial badge */}
      <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black"
        style={{ background: 'rgba(37,99,235,0.15)', color: '#93c5fd', border: '1px solid rgba(37,99,235,0.25)' }}>
        ⚡ TRIAL
      </span>
      {/* PDF counter */}
      <span className="text-[10px] font-semibold tabular-nums"
        style={{ color: pdfFull ? '#fca5a5' : 'rgba(255,255,255,0.4)' }}>
        PDF&nbsp;
        <strong className="text-white">{limits.pdfFetched}/{limits.pdfLimit}</strong>
        {pdfFull && ' 🔒'}
      </span>
      <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
      {/* Extraction counter */}
      <span className="text-[10px] font-semibold tabular-nums"
        style={{ color: extFull ? '#fca5a5' : 'rgba(255,255,255,0.4)' }}>
        Extract&nbsp;
        <strong className="text-white">{limits.extractionsUsed}/{limits.extractionLimit}</strong>
        {extFull && ' 🔒'}
      </span>
    </div>
  )
}

// ── User data helper ──────────────────────────────────────────────────────────
function useUserData() {
  const guest     = getGuestSession()
  const adminMode = isAdmin()
  const adminUser = adminMode ? JSON.parse(localStorage.getItem('docplus_admin_user') || '{}') : null
  const name      = adminMode ? (adminUser?.full_name || 'Admin') : (guest?.full_name || guest?.first_name || 'Guest')
  const email     = adminMode ? (adminUser?.email || '') : (guest?.email || '')
  const initials  = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  return { name, email, initials, adminMode, guest, adminUser }
}

function UserAvatar() {
  const { initials, adminMode } = useUserData()
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black text-white"
      style={{ background: adminMode ? 'linear-gradient(135deg,#7c3aed,#2563eb)' : 'linear-gradient(135deg,#2563eb,#06b6d4)' }}>
      {initials || <User className="w-3.5 h-3.5" />}
    </div>
  )
}

function UserName() {
  const { name, adminMode } = useUserData()
  return <>{name}{adminMode && <Crown className="inline w-2.5 h-2.5 ml-1 text-yellow-400" />}</>
}

function UserEmail() {
  const { email } = useUserData()
  return <>{email}</>
}

// ── Expanded user details panel ───────────────────────────────────────────────
function UserInfoRow({ collapsed, nav }) {
  const { name, email, initials, adminMode, guest } = useUserData()

  if (collapsed) {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white"
        style={{ background: adminMode ? 'linear-gradient(135deg,#7c3aed,#2563eb)' : 'linear-gradient(135deg,#2563eb,#06b6d4)' }}>
        {initials || <User className="w-4 h-4" />}
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
            style={{
              background: adminMode ? 'rgba(124,58,237,0.15)' : 'rgba(37,99,235,0.15)',
              color:      adminMode ? '#c4b5fd' : '#93c5fd',
              border:     adminMode ? '1px solid rgba(124,58,237,0.25)' : '1px solid rgba(37,99,235,0.25)',
            }}>
            {adminMode ? '⚡ Admin' : '🎯 Trial'}
          </span>
          {!adminMode && guest?.current_role && (
            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{guest.current_role}</span>
          )}
        </div>
        <div className="text-[10px] space-y-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {!adminMode && guest?.company && <p>🏢 {guest.company}</p>}
          {!adminMode && guest?.created_at && (
            <p>📅 Joined {new Date(guest.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Kolkata' })}</p>
          )}
        </div>
      </div>
      <div className="flex gap-1.5 px-3 py-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {adminMode && nav && (
          <button onClick={() => nav('/admin')}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:bg-white/[0.08]"
            style={{ color: '#a78bfa', border: '1px solid rgba(124,58,237,0.2)' }}>
            <Shield className="w-3 h-3" /> Admin Panel
          </button>
        )}
        <button onClick={logout}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:bg-red-500/[0.08]"
          style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <LogOut className="w-3 h-3" /> Sign Out
        </button>
      </div>
    </div>
  )
}

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard',        desc: 'Overview & stats' },
  { to: '/discover',  icon: Globe,           label: 'Discover',          desc: 'Find PDFs from websites' },
  { to: '/library',   icon: FolderOpen,       label: 'Document Library',  desc: 'Manage & upload docs' },
  { to: '/extract',   icon: Zap,              label: 'Extract',           desc: 'Steps 8–11: Run AI' },
  { to: '/results',   icon: BarChart3,        label: 'Results',           desc: 'Step 12: Review data' },
  { to: '/logs',      icon: FileText,         label: 'Extraction Logs',   desc: 'Job history & status' },
  { to: '/schemas',   icon: Layers3,          label: 'Schemas',           desc: 'Manage schemas' },
]

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userExpanded, setUserExpanded] = useState(false)
  const { state } = useWorkflow()
  const location = useLocation()
  const navigate  = useNavigate()   // ← must be at component level, not inside SidebarContent

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo — click to go to homepage */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/[0.06] cursor-pointer group"
        onClick={() => navigate('/')}
        title="Go to homepage">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
          style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 0 20px rgba(37,99,235,0.4)' }}>
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div>
            <div className="flex items-end gap-0 leading-none mb-0.5">
              <div className="relative inline-flex items-end">
                <div style={{ position: 'absolute', top: -16, left: -2, zIndex: 10 }}>
                  <RobotMascot size={22} />
                </div>
                <span className="font-black text-white text-sm tracking-tight group-hover:text-blue-300 transition-colors">D</span>
              </div>
              <span className="font-black text-white text-sm tracking-tight group-hover:text-blue-300 transition-colors">
                OCPlus AI<span style={{color:'#7c3aed'}}>⁺</span>
              </span>
            </div>
            <div className="text-[10px] font-medium" style={{color:'rgba(255,255,255,0.3)'}}>Unified Platform</div>
          </div>
        )}
      </div>  {/* end logo section */}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV.map(({ to, icon: Icon, label, desc }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
                isActive
                  ? 'bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/20 text-white'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
              }`
            }>
            {({ isActive }) => (
              <>
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-400' : ''}`} />
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{label}</div>
                    {!isActive && <div className="text-[10px] truncate opacity-50">{desc}</div>}
                  </div>
                )}
                {!collapsed && isActive && <ChevronRight className="w-3 h-3 text-blue-400 shrink-0" />}
              </>
            )}
          </NavLink>
        ))}
        {/* Admin link — only for real admin users, NOT full-access guests */}
        {isAdmin() && (
          <NavLink to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all mt-2 border ${
                isActive
                  ? 'bg-gradient-to-r from-purple-600/20 to-red-600/20 border-purple-500/30 text-white'
                  : 'border-purple-500/15 text-purple-400/60 hover:text-purple-400 hover:bg-purple-500/10'
              }`
            }>
            {({ isActive }) => (
              <>
                <Shield className={`w-4 h-4 shrink-0 ${isActive ? 'text-purple-400' : ''}`} />
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">Admin Panel</div>
                    {!isActive && <div className="text-[10px] truncate opacity-50">Manage guests</div>}
                  </div>
                )}
              </>
            )}
          </NavLink>
        )}
      </nav>

      {/* User info dropdown + Collapse */}
      <div className="border-t border-white/[0.06]">

        {/* Collapsed: just avatar */}
        {collapsed ? (
          <div className="flex justify-center py-3">
            <UserInfoRow collapsed={true} nav={navigate} />
          </div>
        ) : (
          <>
            {/* Dropdown trigger row */}
            <button
              onClick={() => setUserExpanded(e => !e)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors">
              <UserAvatar />
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-bold text-white truncate"><UserName /></p>
                <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.3)' }}><UserEmail /></p>
              </div>
              <ChevronRight
                className="w-3.5 h-3.5 shrink-0 transition-transform duration-200"
                style={{
                  color: 'rgba(255,255,255,0.25)',
                  transform: userExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
                }} />
            </button>

            {/* Expanded details */}
            {userExpanded && (
              <div className="px-3 pb-3">
                <UserInfoRow collapsed={false} nav={navigate} />
              </div>
            )}
          </>
        )}

        {/* Collapse sidebar button */}
        <button onClick={() => setCollapsed(c => !c)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-white/25 hover:text-white/50 transition-colors text-xs font-medium"
          style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <Menu className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden" style={{background:'#060b18'}}>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col shrink-0 transition-all duration-300"
        style={{ width: collapsed ? 64 : 240, background:'rgba(8,13,28,0.95)', borderRight:'1px solid rgba(255,255,255,0.05)' }}>
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 flex flex-col w-64"
            style={{ background:'rgba(8,13,28,0.98)', borderRight:'1px solid rgba(255,255,255,0.07)' }}>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-4 px-4 md:px-6 py-3 shrink-0"
          style={{ background:'rgba(8,13,28,0.9)', borderBottom:'1px solid rgba(255,255,255,0.05)', backdropFilter:'blur(12px)' }}>
          <button className="md:hidden p-2 rounded-lg hover:bg-white/[0.06]" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5 text-white/60" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white/80 truncate">
              {NAV.find(n => location.pathname.startsWith(n.to))?.label || 'DOCPlus AI+'}
            </div>
            <div className="text-[11px] text-white/30">
              {state.library.length} docs in library · {state.extractionJobs.length} extraction jobs
            </div>
          </div>
          {/* Role + quick stats */}
          <div className="hidden lg:flex items-center gap-3">
            {isAdmin() ? (
              /* Admin badge */
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black"
                style={{ background: 'rgba(124,58,237,0.15)', color: '#c4b5fd', border: '1px solid rgba(124,58,237,0.25)' }}>
                <Shield className="w-3.5 h-3.5" /> Admin · Full Access
              </span>
            ) : isGuest() && !isFullAccessGuest() ? (
              /* Guest trial badge with live counters — hidden for full-access guests */
              <GuestTopBadge />
            ) : null}
            {state.library.length > 0 && (
              <span className="badge badge-green">{state.library.length} in library</span>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {/* GuestBanner — only for regular trial guests, not full-access */}
          {isGuest() && !isFullAccessGuest() && <GuestBanner />}
          <Outlet />
        </main>
      </div>
      {/* Guest-only: tour + floating help */}
      <GuestTour />
      <GuestHelpButton />
    </div>
  )
}
