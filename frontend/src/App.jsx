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
import { isLoggedIn, isGuest, isFullAccessGuest } from './lib/auth'

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

// ── Layout guard — admins + full-access guests get sidebar ───────────────────
function RequireAdminLayout({ children }) {
  const location = useLocation()
  if (!isLoggedIn()) return <Navigate to="/" state={{ from: location }} replace />
  if (isGuest() && isFullAccessGuest()) return children
  if (isGuest()) return <Navigate to="/guest-dashboard" replace />
  return children
}

// ── Admin panel guard — only real admins ─────────────────────────────────────
function RequireRealAdmin({ children }) {
  const location = useLocation()
  if (!isLoggedIn()) return <Navigate to="/" state={{ from: location }} replace />
  if (isGuest()) return <Navigate to="/dashboard" replace />
  return children
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <WorkflowProvider>
        <Routes>

          {/* ── Public ── */}
          <Route path="/"         element={<LandingPage />} />
          <Route path="/register" element={<GuestRegistrationPage />} />
          <Route path="/login"    element={<AdminLoginPage />} />

          {/* ── Guest-only (no sidebar) ── */}
          <Route path="/guest-dashboard" element={<RequireAuth><GuestDashboard /></RequireAuth>} />
          <Route path="/wizard"          element={<RequireAuth><GuestWizard /></RequireAuth>} />
          <Route path="/guest-results"   element={<RequireAuth><ResultsPage /></RequireAuth>} />

          {/* ── Admin panel — real admins only ── */}
          <Route path="/admin" element={<RequireRealAdmin><AdminPage /></RequireRealAdmin>} />

          {/* ── Full sidebar: admins + full-access guests ── */}
          <Route element={<RequireAdminLayout><Layout /></RequireAdminLayout>}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="discover"  element={<WorkflowPage />} />
            <Route path="library"   element={<DocumentLibraryPage />} />
            <Route path="extract"   element={<ExtractionPage />} />
            <Route path="results"   element={<ResultsPage />} />
            <Route path="logs"      element={<ExtractionLogsPage />} />
            <Route path="schemas"   element={<SchemasPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </WorkflowProvider>
    </ErrorBoundary>
  )
}
