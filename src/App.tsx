import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'

import Layout          from './components/Layout'
import SummaryPage     from './pages/SummaryPage'
import PipelinePage    from './pages/PipelinePage'
import AdminPage       from './pages/AdminPage'
import LoginPage       from './pages/LoginPage'
import DocumentsPage   from './pages/DocumentsPage'

import { AuthProvider } from './auth/AuthContext'
import ProtectedRoute   from './auth/ProtectedRoute'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Login is OUTSIDE the layout — full-screen card, no nav chrome */}
          <Route path="/login" element={<LoginPage />} />

          {/* Everything else inside the standard layout */}
          <Route element={<Layout><Outlet /></Layout>}>
            <Route path="/"         element={<SummaryPage  />} />
            <Route path="/pipeline" element={
              <ProtectedRoute><PipelinePage /></ProtectedRoute>
            } />
            <Route path="/documents" element={
              <ProtectedRoute><DocumentsPage /></ProtectedRoute>
            } />
            <Route path="/admin"    element={
              <ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>
            } />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
