import { useState, useEffect } from 'react'
import { getMetrics, getCosts } from '../../api/admin'
import { PageShell, PageHeader } from './_shared'
import type { AdminMetrics, AdminCosts } from '../../types'

function fmtUSD(n: number): string {
  if (n >= 100) return `$${n.toFixed(2)}`
  if (n >= 1)   return `$${n.toFixed(3)}`
  return `$${n.toFixed(4)}`
}

function fmtUnits(n: number, unitType: string): string {
  if (unitType === 'tokens') return `${(n / 1000).toFixed(1)}k tok`
  if (unitType === 'chars')  return `${(n / 1000).toFixed(1)}k ch`
  if (unitType === 'seconds') return `${n.toFixed(1)}s`
  return String(n)
}

const COST_DAYS_OPTIONS = [7, 30, 90]

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [costs,   setCosts]   = useState<AdminCosts   | null>(null)
  const [days,    setDays]    = useState<number>(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getMetrics().catch(() => null),
      getCosts(days).catch(() => null),
    ]).then(([m, c]) => {
      setMetrics(m)
      setCosts(c)
    }).finally(() => setLoading(false))
  }, [days])

  const Stat = ({ label, value, color = 'text-gray-900' }: { label: string; value: string | number; color?: string }) => (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-semibold ${color}`}>{value}</p>
    </div>
  )

  return (
    <PageShell>
      <PageHeader title="Analytics" subtitle="Cost tracking and usage metrics" />

      {loading ? (
        <div className="p-6 text-sm text-gray-500">Loading…</div>
      ) : (
        <div className="space-y-6">
          {metrics && (
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Total Jobs" value={metrics.total}    />
              <Stat label="Done"       value={metrics.done}    color="text-green-600" />
              <Stat label="Partial"    value={metrics.partial} color="text-orange-500" />
              <Stat label="Failed"     value={metrics.failed}  color="text-red-600" />
              <Stat label="Running"    value={metrics.running} color="text-blue-600" />
              <Stat label="Queued"     value={metrics.queued}  color="text-yellow-600" />
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                Estimated spend — last {costs?.days ?? days} days
              </p>
              <p className="text-4xl font-semibold text-indigo-600">
                {costs ? fmtUSD(costs.total_cost_usd) : '—'}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {costs ? `${costs.total_calls} external API calls logged` : ''}
              </p>
            </div>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {COST_DAYS_OPTIONS.map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    days === d ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {(!costs || costs.total_calls === 0) && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-gray-800 mb-2">No usage logged yet</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                Cost rows are written to the{' '}
                <code className="text-xs bg-gray-100 px-1 py-0.5 rounded text-gray-700">usage_logs</code> table
                after each external API call. Run a pipeline job and check back here.
              </p>
            </div>
          )}

          {costs && costs.by_provider.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-800">Spend by provider</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-2">Provider</th>
                    <th className="text-right px-5 py-2">Calls</th>
                    <th className="text-right px-5 py-2">Units</th>
                    <th className="text-right px-5 py-2">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {costs.by_provider.map(row => (
                    <tr key={row.provider} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-2 text-gray-800 font-medium">{row.provider}</td>
                      <td className="px-5 py-2 text-right text-gray-400">{row.calls}</td>
                      <td className="px-5 py-2 text-right text-gray-400 font-mono text-xs">
                        {row.units > 0 ? row.units.toLocaleString() : '—'}
                      </td>
                      <td className="px-5 py-2 text-right text-indigo-400 font-mono">
                        {fmtUSD(row.cost_usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {costs && costs.by_step.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-800">Spend by pipeline step</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-2">Step</th>
                    <th className="text-right px-5 py-2">Calls</th>
                    <th className="text-right px-5 py-2">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {costs.by_step.map(row => (
                    <tr key={row.step} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-2 text-gray-800 font-medium font-mono text-xs">{row.step}</td>
                      <td className="px-5 py-2 text-right text-gray-400">{row.calls}</td>
                      <td className="px-5 py-2 text-right text-indigo-600 font-mono">{fmtUSD(row.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {costs && costs.by_model.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-800">Spend by model</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-2">Model</th>
                    <th className="text-left px-5 py-2">Provider</th>
                    <th className="text-right px-5 py-2">Calls</th>
                    <th className="text-right px-5 py-2">Units</th>
                    <th className="text-right px-5 py-2">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {costs.by_model.map(row => (
                    <tr key={row.model} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-2 text-gray-800 font-mono text-xs">{row.model}</td>
                      <td className="px-5 py-2 text-gray-500 text-xs">{row.provider}</td>
                      <td className="px-5 py-2 text-right text-gray-400">{row.calls}</td>
                      <td className="px-5 py-2 text-right text-gray-400 font-mono text-xs">
                        {row.units > 0 ? fmtUnits(row.units, row.unit_type) : '—'}
                      </td>
                      <td className="px-5 py-2 text-right text-indigo-400 font-mono">
                        {fmtUSD(row.cost_usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-gray-400">
            Cost figures are estimates based on published provider rates. Actual billing may differ.
          </p>
        </div>
      )}
    </PageShell>
  )
}
