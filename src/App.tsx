import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'

import Layout           from './components/Layout'
import SummaryPage      from './pages/SummaryPage'
import PipelinePage     from './pages/PipelinePage'
import LoginPage        from './pages/LoginPage'
import DocumentsPage    from './pages/DocumentsPage'

import AdminDashboard   from './pages/admin/DashboardPage'
import AdminJobs        from './pages/admin/JobsPage'
import AdminBooks       from './pages/admin/BooksPage'
import AdminUsers       from './pages/admin/UsersPage'
import AdminAnalytics   from './pages/admin/AnalyticsPage'
import AdminCatalog     from './pages/admin/CatalogPage'
import AdminSettings    from './pages/admin/SettingsPage'

import { AuthProvider } from './auth/AuthContext'
import ProtectedRoute   from './auth/ProtectedRoute'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<Layout><Outlet /></Layout>}>
            <Route path="/"         element={<SummaryPage />} />
            <Route path="/pipeline" element={<ProtectedRoute><PipelinePage /></ProtectedRoute>} />
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
