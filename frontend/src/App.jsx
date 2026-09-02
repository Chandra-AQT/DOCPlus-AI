import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { WorkflowProvider } from './lib/store'
import { Component } from 'react'
import Layout from './components/Layout'
import WorkflowPage from './pages/WorkflowPage'
import DocumentLibraryPage from './pages/DocumentLibraryPage'
import ExtractionPage from './pages/ExtractionPage'
import ResultsPage from './pages/ResultsPage'
import ExtractionLogsPage from './pages/ExtractionLogsPage'
import SchemasPage from './pages/SchemasPage'
import DashboardPage from './pages/DashboardPage'
import LandingPage from './pages/LandingPage'
import GuestRegistrationPage from './pages/GuestRegistrationPage'
import AdminLoginPage from './pages/AdminLoginPage'
import AdminPage from './pages/AdminPage'
import GuestWizard from './pages/GuestWizard'
import GuestDashboard from './pages/GuestDashboard'
import { isLoggedIn, isGuest, isFullAccessGuest, getGuestSession } from './lib/auth'

// ── Error boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: '#060b18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: 32, maxWidth: 600, width: '100%' }}>
            <div style={{ color: '#fca5a5', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>⚠ Something went wrong</div>
            <pre style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, overflowX: 'auto', marginBottom: 16 }}>
              {this.state.error?.message}
            </pre>
            <button onClick={() => { this.setState({ error: null }); window.location.href = '/' }}
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontWeight: 600 }}>
              ← Back to Home
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Auth guard ────────────────────────────────────────────────────────────────
function RequireAuth({ children }) {
  const location = useLocation()
  if (!isLoggedIn()) return <Navigate to="/" state={{ from: location }} replace />
  return children
}

// ── Admin-only guard — guests redirected based on their access level ─────────
function RequireAdminLayout({ children }) {
  const location = useLocation()
  if (!isLoggedIn()) return <Navigate to="/" state={{ from: location }} replace />
  // Full-access guest: allowed into admin sidebar (but not admin panel page)
  if (isGuest() && isFullAccessGuest()) return children
  // Regular guest: redirect to guest area
  if (isGuest()) return <Navigate to="/guest-dashboard" replace />
  return children
}

// ── Admin panel guard — only real admins, never guests ───────────────────────
function RequireRealAdmin({ children }) {
  const location = useLocation()
  if (!isLoggedIn()) return <Navigate to="/" state={{ from: location }} replace />
  if (isGuest()) return <Navigate to="/dashboard" replace />  // full-access guest can't access admin panel
  return children
}

// ── Smart dashboard: full-access guest or admin → Layout, regular guest → GuestDashboard
function SmartRoot() {
  if (!isLoggedIn()) return <Navigate to="/" replace />
  if (isGuest() && isFullAccessGuest()) return <Navigate to="/dashboard" replace />
  if (isGuest()) return <Navigate to="/guest-dashboard" replace />
  return <Navigate to="/dashboard" replace />
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <WorkflowProvider>
        <Routes>

          {/* ── Public ──────────────────────────────────────────────────── */}
          <Route path="/"         element={<LandingPage />} />
          <Route path="/register" element={<GuestRegistrationPage />} />
          <Route path="/login"    element={<AdminLoginPage />} />

          {/* ── Guest-only pages (no sidebar) — regular guests only ──────── */}
          <Route path="/guest-dashboard" element={
            <RequireAuth><GuestDashboard /></RequireAuth>
          } />
          <Route path="/wizard" element={
            <RequireAuth><GuestWizard /></RequireAuth>
          } />
          <Route path="/guest-results" element={
            <RequireAuth><ResultsPage /></RequireAuth>
          } />

          {/* ── Admin panel — real admins only, never guests ─────────────── */}
          <Route path="/admin" element={
            <RequireRealAdmin><AdminPage /></RequireRealAdmin>
          } />

          {/* ── Full sidebar layout: admins + full-access guests ────────── */}
          <Route element={<RequireAdminLayout><Layout /></RequireAdminLayout>}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="discover"  element={<WorkflowPage />} />
            <Route path="library"   element={<DocumentLibraryPage />} />
            <Route path="extract"   element={<ExtractionPage />} />
            <Route path="results"   element={<ResultsPage />} />
            <Route path="logs"      element={<ExtractionLogsPage />} />
            <Route path="schemas"   element={<SchemasPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </WorkflowProvider>
    </ErrorBoundary>
  )
}

// ── Error boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: '#060b18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: 32, maxWidth: 600, width: '100%' }}>
            <div style={{ color: '#fca5a5', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>⚠ Something went wrong</div>
            <pre style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, overflowX: 'auto', marginBottom: 16 }}>
              {this.state.error?.message}
            </pre>
            <button onClick={() => { this.setState({ error: null }); window.location.href = '/' }}
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontWeight: 600 }}>
              ← Back to Home
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Auth guard ────────────────────────────────────────────────────────────────
function RequireAuth({ children }) {
  const location = useLocation()
  if (!isLoggedIn()) return <Navigate to="/" state={{ from: location }} replace />
  return children
}

// ── Admin-only guard — guests redirected to their dashboard ──────────────────
function RequireAdminLayout({ children }) {
  const location = useLocation()
  if (!isLoggedIn()) return <Navigate to="/" state={{ from: location }} replace />
  if (isGuest()) return <Navigate to="/guest-dashboard" replace />
  return children
}

// ── Smart dashboard: admin → Layout+Dashboard, guest → GuestDashboard ────────
function SmartDashboard() {
  if (isGuest()) return <GuestDashboard />
  // Admin: rendered inside Layout via the route below — this shouldn't be hit
  return <Navigate to="/dashboard" replace />
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <WorkflowProvider>
        <Routes>

          {/* ── Public ──────────────────────────────────────────────────── */}
          <Route path="/"         element={<LandingPage />} />
          <Route path="/register" element={<GuestRegistrationPage />} />
          <Route path="/login"    element={<AdminLoginPage />} />

          {/* ── Guest-only pages (no sidebar) ───────────────────────────── */}
          <Route path="/guest-dashboard" element={
            <RequireAuth><GuestDashboard /></RequireAuth>
          } />
          <Route path="/wizard" element={
            <RequireAuth><GuestWizard /></RequireAuth>
          } />

          {/* ── Guest-accessible results page (no sidebar) ─────────────── */}
          <Route path="/guest-results" element={
            <RequireAuth><ResultsPage /></RequireAuth>
          } />

          {/* ── Admin full panel (no sidebar) ───────────────────────────── */}
          <Route path="/admin" element={
            <RequireAdminLayout><AdminPage /></RequireAdminLayout>
          } />

          {/* ── Admin pages WITH sidebar Layout ─────────────────────────── */}
          <Route element={<RequireAdminLayout><Layout /></RequireAdminLayout>}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="discover"  element={<WorkflowPage />} />
            <Route path="library"   element={<DocumentLibraryPage />} />
            <Route path="extract"   element={<ExtractionPage />} />
            <Route path="results"   element={<ResultsPage />} />
            <Route path="logs"      element={<ExtractionLogsPage />} />
            <Route path="schemas"   element={<SchemasPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </WorkflowProvider>
    </ErrorBoundary>
  )
}
