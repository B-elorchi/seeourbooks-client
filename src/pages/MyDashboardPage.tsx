import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageShell, PageHeader, StatCard } from './admin/_shared'
import { getMyMetrics, getMyUsage, getMyJobs } from '../api/me'
import { useAuth } from '../auth/AuthContext'
import StatusBadge from '../components/StatusBadge'

export default function MyDashboardPage() {
  const { user } = useAuth()
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const { data: m, isError: mError } = useQuery({
    queryKey: ['myMetrics'],
    queryFn: getMyMetrics,
  })

  const { data: usage, isError: uError } = useQuery({
    queryKey: ['myUsage'],
    queryFn: getMyUsage,
  })

  const { data: jobs, isError: jError } = useQuery({
    queryKey: ['myJobs'],
    queryFn: () => getMyJobs(500),
  })

  const filteredJobs = jobs?.filter(j => statusFilter === 'all' || j.status === statusFilter) || []
  const hasError = mError || uError || jError

  return (
    <PageShell>
      <PageHeader title="Dashboard" subtitle={`Signed in as ${user?.email ?? ''}`} />

      {hasError && <p className="text-sm text-red-600 mb-4">Error loading dashboard data.</p>}

      <div className="flex flex-wrap gap-3 mb-6">
        <Link to="/summary" className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">
          New Summary
        </Link>
        <Link to="/documents" className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
          My Documents
        </Link>
      </div>

      <h3 className="text-lg font-medium text-gray-900 mb-4">Job Status</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <StatCard label="Total"   value={m?.total   ?? '—'} />
        <StatCard label="Done"    value={m?.done    ?? '—'} color="text-green-600" />
        <StatCard label="Partial" value={m?.partial ?? '—'} color="text-orange-600" />
        <StatCard label="Failed"  value={m?.failed  ?? '—'} color="text-red-600" />
        <StatCard label="Running" value={m?.running ?? '—'} color="text-blue-600" />
        <StatCard label="Queued"  value={m?.queued  ?? '—'} color="text-yellow-600" />
      </div>

      <h3 className="text-lg font-medium text-gray-900 mb-4">Token Usage</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500 font-medium">Total Tokens Used</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">
            {usage?.total_tokens ? usage.total_tokens.toLocaleString() : '—'}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm max-h-64 overflow-y-auto">
          <p className="text-sm text-gray-500 font-medium mb-2">Tokens by Book</p>
          {usage?.by_book && Object.keys(usage.by_book).length > 0 ? (
            <ul className="space-y-1">
              {Object.entries(usage.by_book).map(([book, tokens]) => (
                <li key={book} className="flex justify-between text-sm">
                  <span className="text-gray-700 truncate mr-2">{book}</span>
                  <span className="text-gray-900 font-medium">{tokens.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          ) : (
             <p className="text-sm text-gray-400">No data</p>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm max-h-64 overflow-y-auto">
          <p className="text-sm text-gray-500 font-medium mb-2">Tokens by Provider</p>
          {usage?.by_provider && Object.keys(usage.by_provider).length > 0 ? (
            <ul className="space-y-1">
              {Object.entries(usage.by_provider).map(([provider, tokens]) => (
                <li key={provider} className="flex justify-between text-sm">
                  <span className="text-gray-700">{provider}</span>
                  <span className="text-gray-900 font-medium">{tokens.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          ) : (
             <p className="text-sm text-gray-400">No data</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Recent Jobs</h3>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="all">All Statuses</option>
          <option value="done">Done</option>
          <option value="running">Running</option>
          <option value="failed">Failed</option>
          <option value="queued">Queued</option>
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-8">
        <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-500">Book ID</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 font-medium text-gray-500">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredJobs.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No jobs found</td></tr>
            ) : (
              filteredJobs.map(job => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{job.book_id}</td>
                  <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                  <td className="px-4 py-3 text-gray-500">
                    {job.created_at ? new Date(job.created_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
