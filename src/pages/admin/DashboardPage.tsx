import { Link } from 'react-router-dom'
import { useAdminMetrics, useAdminCosts, useAdminJobs, useUserCount, useInvalidateAdmin } from '../../hooks/useAdmin'
import { PageShell, PageHeader, Badge, timeAgo } from './_shared'

export default function DashboardPage() {
  const { data: jobs = [], isLoading: jobsLoading } = useAdminJobs(50)
  const { data: metrics } = useAdminMetrics()
  const { data: costs } = useAdminCosts(1)
  const { data: userCount } = useUserCount()
  const { invalidateAll } = useInvalidateAdmin()

  const recentJobs = jobs.slice(0, 8)
  const isLoading = jobsLoading

  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your SeeOurBook system"
        action={
          <button
            onClick={() => invalidateAll()}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-colors disabled:opacity-50"
          >
            <i className="ti ti-refresh text-sm" aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {/* Row 1: job status KPIs */}
      {metrics && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 mb-4">
          <KpiCard label="Total jobs"  value={metrics.total}   />
          <KpiCard label="Done"        value={metrics.done}    color="text-green-600" />
          <KpiCard label="Partial"     value={metrics.partial} color="text-orange-500" />
          <KpiCard label="Failed"      value={metrics.failed}  color="text-red-600" />
          <KpiCard label="Running"     value={metrics.running} color="text-blue-600" />
          <KpiCard label="Queued"      value={metrics.queued}  color="text-yellow-600" />
        </div>
      )}

      {/* Row 2: today's cost + API users */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <KpiCard
          label="Today's cost"
          value={costs ? `$${costs.total_cost_usd.toFixed(2)}` : '—'}
        />
        <KpiCard
          label="API users"
          value={typeof userCount === 'number' ? userCount : '—'}
        />
      </div>

      {/* Recent jobs table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gray-900">Recent jobs</p>
          <Link to="/admin/jobs" className="text-xs text-indigo-600 hover:underline">View all →</Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {isLoading ? (
            <p className="p-5 text-sm text-gray-400">Loading…</p>
          ) : recentJobs.length === 0 ? (
            <p className="p-5 text-sm text-gray-400">No jobs yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                  <th className="text-left px-5 py-3">Book</th>
                  <th className="text-left px-5 py-3">Steps</th>
                  <th className="text-left px-5 py-3">Started</th>
                  <th className="text-right px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentJobs.map(job => {
                  const jr = typeof job.result === 'string'
                    ? (() => { try { return JSON.parse(job.result as string) } catch { return null } })()
                    : job.result
                  const steps = jr?.steps ? Object.keys(jr.steps).join(', ') : 'all'
                  const currentStep = jr?.current_step as string | undefined
                  return (
                    <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-gray-900 font-medium truncate max-w-[260px]">
                          {jr?.metadata?.title || job.book_id}
                        </p>
                        <p className="text-gray-400 text-[10px] mt-0.5 font-mono">{job.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs font-mono">
                        {currentStep && job.status === 'running' ? (
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            {currentStep}
                          </span>
                        ) : steps}
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">
                        {job.created_at ? timeAgo(job.created_at) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Badge status={job.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </PageShell>
  )
}

function KpiCard({ label, value, color = 'text-gray-900' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  )
}
