import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom'

import Layout           from './components/Layout'
import SummaryPage      from './pages/SummaryPage'
import PipelinePage     from './pages/PipelinePage'
import LoginPage        from './pages/LoginPage'
import DocumentsPage    from './pages/DocumentsPage'
import MyDashboardPage  from './pages/MyDashboardPage'
import MyJobsPage       from './pages/MyJobsPage'

import AdminDashboard   from './pages/admin/DashboardPage'
import AdminJobs        from './pages/admin/JobsPage'
import AdminBooks       from './pages/admin/BooksPage'
import AdminUsers       from './pages/admin/UsersPage'
import AdminAnalytics   from './pages/admin/AnalyticsPage'
import AdminCatalog     from './pages/admin/CatalogPage'
import AdminSettings    from './pages/admin/SettingsPage'

import { AuthProvider, useAuth } from './auth/AuthContext'
import ProtectedRoute   from './auth/ProtectedRoute'

/** Home route — admins land on the admin dashboard, everyone else on their scoped dashboard. */
function HomeRoute() {
  const { user, disabled } = useAuth()
  if (!disabled && user && !user.is_admin) return <MyDashboardPage />
  return <Navigate to="/admin" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<Layout><Outlet /></Layout>}>
            <Route path="/"          element={<ProtectedRoute><HomeRoute /></ProtectedRoute>} />
            <Route path="/summary"   element={<ProtectedRoute><SummaryPage /></ProtectedRoute>} />
            <Route path="/my-jobs"   element={<ProtectedRoute><MyJobsPage /></ProtectedRoute>} />
            <Route path="/pipeline"  element={<ProtectedRoute requireAdmin><PipelinePage /></ProtectedRoute>} />
            <Route path="/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />

            {/* Admin sub-routes */}
            <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/jobs"      element={<ProtectedRoute requireAdmin><AdminJobs /></ProtectedRoute>} />
            <Route path="/admin/books"     element={<ProtectedRoute requireAdmin><AdminBooks /></ProtectedRoute>} />
            <Route path="/admin/users"     element={<ProtectedRoute requireAdmin><AdminUsers /></ProtectedRoute>} />
            <Route path="/admin/analytics" element={<ProtectedRoute requireAdmin><AdminAnalytics /></ProtectedRoute>} />
            <Route path="/admin/catalog"   element={<ProtectedRoute requireAdmin><AdminCatalog /></ProtectedRoute>} />
            <Route path="/admin/settings"  element={<ProtectedRoute requireAdmin><AdminSettings /></ProtectedRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
