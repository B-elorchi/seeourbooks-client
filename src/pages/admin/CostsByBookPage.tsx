import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import {
  useAdminCostsByBook,
  useInvalidateAdmin,
} from '../../hooks/useAdmin'
import {
  PageShell, PageHeader,
} from './_shared'
import {
  DAYS_OPTIONS, CHART_COLORS, UsdTooltip, KpiCard, Section,
} from './DashboardPage'

const PAGE_SIZE = 50

export default function CostsByBookPage() {
  const [days, setDays] = useState(0)
  const [offset, setOffset] = useState(0)
  const [customOpen, setCustomOpen] = useState(false)
  const [customDays, setCustomDays] = useState('45')
  const isPreset = DAYS_OPTIONS.includes(days)

  const { data, isLoading } = useAdminCostsByBook(days, PAGE_SIZE, offset)
  const { invalidateAll } = useInvalidateAdmin()

  function applyCustom() {
    const n = Math.max(1, Math.min(365, parseInt(customDays, 10) || 0))
    if (n > 0) { setDays(n); setCustomDays(String(n)); setOffset(0) }
  }

  const rows = data?.rows ?? []
  const totalCost = rows.reduce((sum, r) => sum + (r.cost_usd || 0), 0)
  const totalJobs = rows.reduce((sum, r) => sum + (r.total_jobs || 0), 0)
  const totalCalls = rows.reduce((sum, r) => sum + (r.total_calls || 0), 0)

  const chartData = rows.slice(0, 15).map(r => ({
    name: r.title.slice(0, 18) + (r.title.length > 18 ? '…' : ''),
    cost_usd: r.cost_usd,
  }))

  return (
    <PageShell>
      <PageHeader
        title="Costs by Book"
        subtitle="All book costs with charts and breakdown tables"
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              <button
                onClick={() => { setDays(0); setOffset(0); setCustomOpen(false) }}
                className={`px-3 py-1.5 transition-colors ${days === 0 && !customOpen ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                All time
              </button>
              {DAYS_OPTIONS.map(d => (
                <button key={d} onClick={() => { setDays(d); setOffset(0); setCustomOpen(false) }}
                  className={`px-3 py-1.5 transition-colors ${days === d && !customOpen ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  {d}d
                </button>
              ))}
              <button onClick={() => setCustomOpen(o => !o)}
                className={`px-3 py-1.5 transition-colors border-l border-gray-200 ${(customOpen || (!isPreset && days !== 0)) ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                {!isPreset && days !== 0 ? `${days}d` : 'Custom'}
              </button>
            </div>
            {customOpen && (
              <div className="flex items-center gap-1 text-xs">
                <span className="text-gray-400">Last</span>
                <input
                  type="number" min={1} max={365} value={customDays}
                  onChange={e => setCustomDays(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') applyCustom() }}
                  className="w-16 border border-gray-200 rounded-md px-2 py-1 text-gray-900 focus:outline-none focus:border-indigo-400"
                />
                <span className="text-gray-400">days</span>
                <button onClick={applyCustom}
                  className="px-2.5 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">
                  Apply
                </button>
              </div>
            )}
            <button onClick={() => invalidateAll()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-colors">
              <i className="ti ti-refresh text-sm" />
              Refresh
            </button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KpiCard label={days ? `Total Cost (${days}d)` : 'Total Cost (all time)'} value={`$${totalCost.toFixed(4)}`} color="text-indigo-600" />
        <KpiCard label="Books" value={rows.length} />
        <KpiCard label="Jobs" value={totalJobs} />
        <KpiCard label="AI Calls" value={totalCalls} />
      </div>

      {/* Chart */}
      <Section title="Top Books by Cost">
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          {chartData.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">No cost data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} width={50} />
                <Tooltip content={<UsdTooltip />} />
                <Bar dataKey="cost_usd" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Section>

      {/* Table */}
      <Section title={`Books table`} action={
        <div className="flex items-center gap-2">
          <button disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
            className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">Prev</button>
          <span className="text-xs text-gray-500">Offset {offset}</span>
          <button disabled={rows.length < PAGE_SIZE} onClick={() => setOffset(o => o + PAGE_SIZE)}
            className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">Next</button>
        </div>
      }>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {isLoading ? (
            <p className="p-5 text-sm text-gray-400">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-5 text-sm text-gray-400">No book cost data.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5">Book</th>
                  <th className="text-left px-4 py-2.5 hidden sm:table-cell">Author</th>
                  <th className="text-right px-4 py-2.5">Jobs</th>
                  <th className="text-right px-4 py-2.5">Calls</th>
                  <th className="text-right px-4 py-2.5">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(b => (
                  <tr key={b.book_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <span className="text-gray-800 truncate max-w-[240px] block">{b.title}</span>
                      <span className="text-[10px] text-gray-400 font-mono">ID: {b.book_id}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 hidden sm:table-cell">{b.author || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{b.total_jobs ?? 0}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{b.total_calls ?? 0}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-indigo-700">${b.cost_usd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Section>
    </PageShell>
  )
}
