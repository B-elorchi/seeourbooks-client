/**
 * <ProtectedRoute> — gates a route behind auth.
 *
 *   <ProtectedRoute>{<AdminPage />}</ProtectedRoute>          ← requires login
 *   <ProtectedRoute requireAdmin>{<AdminPage />}</ProtectedRoute>  ← requires admin
 *
 * Behavior:
 *   - loading        → render nothing (avoids flash of "Forbidden" before session resolves)
 *   - disabled       → render children (auth is off; dev mode)
 *   - not signed in  → redirect to /login (preserves intended URL in state.from)
 *   - signed in, not admin (when requireAdmin) → render a small "no access" panel
 *   - signed in + ok → render children
 */
import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'

import { useAuth } from './AuthContext'

export default function ProtectedRoute({
  children,
  requireAdmin = false,
}: {
  children:      ReactNode
  requireAdmin?: boolean
}) {
  const { user, loading, adminChecking, disabled } = useAuth()
  const location = useLocation()

  if (loading) return null
  if (disabled) return <>{children}</>

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // While we're still asking the backend who the user is, don't show the
  // "Admin access required" panel — it would briefly flash for every admin.
  if (requireAdmin && adminChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6">
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <span className="inline-block w-3 h-3 border border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          Verifying admin access…
        </div>
      </div>
    )
  }

  if (requireAdmin && !user.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6">
        <div className="max-w-md text-center bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Admin access required</h2>
          <p className="text-sm text-gray-500 mb-3">
            You're signed in as <span className="text-gray-700 font-mono">{user.email}</span>{' '}
            but this account is not in the admin allow-list.
          </p>
          <p className="text-xs text-gray-500">
            Make sure <code className="text-xs bg-gray-100 px-1 py-0.5 rounded border border-gray-200">ADMIN_EMAILS</code>{' '}
            in your backend <code className="text-xs bg-gray-100 px-1 py-0.5 rounded border border-gray-200">.env</code>{' '}
            contains this email AND the API server has been restarted since you set it.
            Check the browser console for any <code className="text-xs bg-gray-100 px-1 py-0.5 rounded border border-gray-200">/api/auth/me</code>{' '}
            errors.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
