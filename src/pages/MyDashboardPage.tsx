import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageShell, PageHeader, StatCard } from './admin/_shared'
import { getMyMetrics, type MyMetrics } from '../api/me'
import { useAuth } from '../auth/AuthContext'

/**
 * Scoped dashboard for editor/viewer roles.
 *
 * Shows only the signed-in user's own job counts. Deliberately contains NO
 * cost/spend figures and no system-wide totals — those stay on the admin
 * dashboard.
 */
export default function MyDashboardPage() {
  const { user } = useAuth()
  const [m, setM] = useState<MyMetrics | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    getMyMetrics().then(setM).catch(e => setErr(String(e)))
  }, [])

  return (
    <PageShell>
      <PageHeader title="Dashboard" subtitle={`Signed in as ${user?.email ?? ''}`} />

      {err && <p className="text-sm text-red-600 mb-4">{err}</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <StatCard label="Total"   value={m?.total   ?? '—'} />
        <StatCard label="Done"    value={m?.done    ?? '—'} color="text-green-600" />
        <StatCard label="Partial" value={m?.partial ?? '—'} color="text-orange-600" />
        <StatCard label="Failed"  value={m?.failed  ?? '—'} color="text-red-600" />
        <StatCard label="Running" value={m?.running ?? '—'} color="text-blue-600" />
        <StatCard label="Queued"  value={m?.queued  ?? '—'} color="text-yellow-600" />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link to="/summary" className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">
          New Summary
        </Link>
        <Link to="/documents" className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
          My Documents
        </Link>
        <Link to="/my-jobs" className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
          My Jobs
        </Link>
      </div>
    </PageShell>
  )
}
