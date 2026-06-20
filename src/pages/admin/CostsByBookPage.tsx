import { useState } from 'react'
import { createPortal } from 'react-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import {
  useAdminCostsByBook,
  useBookCostDetails,
  useInvalidateAdmin,
} from '../../hooks/useAdmin'
import { getBookCoverPrompt } from '../../api/admin'
import {
  PageShell, PageHeader,
} from './_shared'
import {
  DAYS_OPTIONS, CHART_COLORS, UsdTooltip, KpiCard, Section,
} from './DashboardPage'

const PAGE_SIZE = 50

function fmtDur(sec: number | null | undefined): string {
  if (!sec) return '—'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h}h ${rm}m` : `${h}h`
}

export default function CostsByBookPage() {
  const [days, setDays] = useState(0)
  const [offset, setOffset] = useState(0)
  const [customOpen, setCustomOpen] = useState(false)
  const [customDays, setCustomDays] = useState('45')
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null)
  const [promptModal, setPromptModal] = useState<{ bookId: string; title: string; prompt: string; loading: boolean } | null>(null)
  const isPreset = DAYS_OPTIONS.includes(days)

  const { data, isLoading } = useAdminCostsByBook(days, PAGE_SIZE, offset)
  const { data: details } = useBookCostDetails(expandedBookId, days)
  const { invalidateAll } = useInvalidateAdmin()

  async function openPrompt(bookId: string, title: string) {
    setPromptModal({ bookId, title, prompt: '', loading: true })
    try {
      const data = await getBookCoverPrompt(bookId)
      setPromptModal({ bookId, title, prompt: data.prompt, loading: false })
    } catch (e) {
      setPromptModal({ bookId, title, prompt: `Error: ${(e as Error).message}`, loading: false })
    }
  }

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
                  <th className="px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(b => {
                  const isExpanded = expandedBookId === b.book_id
                  return (
                    <>
                      <tr
                        key={b.book_id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedBookId(isExpanded ? null : b.book_id)}
                      >
                        <td className="px-4 py-2.5">
                          <span className="text-gray-800 truncate max-w-[240px] block">{b.title}</span>
                          <span className="text-[10px] text-gray-400 font-mono">ID: {b.book_id}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 hidden sm:table-cell">{b.author || '—'}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{b.total_jobs ?? 0}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{b.total_calls ?? 0}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-indigo-700">
                          <span className="mr-2">${b.cost_usd.toFixed(4)}</span>
                          <i className={`ti ti-chevron-${isExpanded ? 'up' : 'down'} text-gray-400`} />
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); openPrompt(b.book_id, b.title) }}
                            className="text-[10px] px-2 py-1 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors"
                          >
                            Prompt
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="px-4 py-3 bg-gray-50/50">
                            <div className="border border-gray-200 rounded-lg bg-white p-3">
                              <p className="text-xs font-semibold text-gray-700 mb-2">Cost by step</p>
                              {!details ? (
                                <p className="text-xs text-gray-400">Loading…</p>
                              ) : details.steps.length === 0 ? (
                                <p className="text-xs text-gray-400">No step cost data.</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-500 border-b border-gray-100">
                                      <th className="text-left py-1.5">Step</th>
                                      <th className="text-left py-1.5">Model</th>
                                      <th className="text-left py-1.5 hidden sm:table-cell">Provider</th>
                                      <th className="text-right py-1.5">Calls</th>
                                      <th className="text-right py-1.5">Time</th>
                                      <th className="text-right py-1.5">Cost</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {details.steps.map(s => (
                                      <>
                                        <tr key={s.step} className="border-b border-gray-100 bg-gray-50/50">
                                          <td className="py-1.5 font-medium text-gray-800">{s.step}</td>
                                          <td className="py-1.5 text-gray-400">—</td>
                                          <td className="py-1.5 hidden sm:table-cell" />
                                          <td className="py-1.5 text-right text-gray-700">{s.calls}</td>
                                          <td className="py-1.5 text-right text-gray-500 font-mono">{fmtDur(s.duration_sec)}</td>
                                          <td className="py-1.5 text-right font-semibold text-indigo-700">${s.cost_usd.toFixed(4)}</td>
                                        </tr>
                                        {s.models.map(m => (
                                          <tr key={`${s.step}-${m.model}`} className="border-b border-gray-50 last:border-0">
                                            <td className="py-1.5 pl-4 text-gray-400" />
                                            <td className="py-1.5 text-gray-700 font-mono">{m.model}</td>
                                            <td className="py-1.5 hidden sm:table-cell text-gray-500">{m.provider}</td>
                                            <td className="py-1.5 text-right text-gray-600">{m.calls}</td>
                                            <td className="py-1.5 text-right text-gray-400" />
                                            <td className="py-1.5 text-right font-medium text-indigo-700">${m.cost_usd.toFixed(4)}</td>
                                          </tr>
                                        ))}
                                      </>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              {details && details.jobs.length > 1 && (
                                <>
                                  <p className="text-xs font-semibold text-gray-700 mt-3 mb-2">Cost by job</p>
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-gray-500 border-b border-gray-100">
                                        <th className="text-left py-1.5">Job ID</th>
                                        <th className="text-right py-1.5">Calls</th>
                                        <th className="text-right py-1.5">Time</th>
                                        <th className="text-right py-1.5">Cost</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {details.jobs.map(j => (
                                        <tr key={j.job_id} className="border-b border-gray-50 last:border-0">
                                          <td className="py-1.5 text-gray-700 font-mono">{j.job_id.slice(0, 12)}…</td>
                                          <td className="py-1.5 text-right text-gray-600">{j.calls}</td>
                                          <td className="py-1.5 text-right text-gray-500 font-mono">{fmtDur(j.duration_sec)}</td>
                                          <td className="py-1.5 text-right font-medium text-indigo-700">${j.cost_usd.toFixed(4)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </>
                              )}
                              {details && (
                                <p className="text-[10px] text-gray-400 mt-2 text-right">
                                  Total: ${details.total_cost_usd.toFixed(4)} · {details.total_calls} calls · {fmtDur(details.total_duration_sec)}
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Section>

      {promptModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPromptModal(null)}>
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900 truncate pr-4">Cover prompt — {promptModal.title}</p>
              <button onClick={() => setPromptModal(null)} className="text-gray-400 hover:text-gray-600"><i className="ti ti-x" /></button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              {promptModal.loading ? (
                <p className="text-xs text-gray-400">Loading prompt…</p>
              ) : (
                <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 border border-gray-100 rounded-lg p-3">{promptModal.prompt}</pre>
              )}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-100">
              <button
                onClick={() => navigator.clipboard.writeText(promptModal.prompt)}
                disabled={promptModal.loading}
                className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Copy
              </button>
              <button onClick={() => setPromptModal(null)} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </PageShell>
  )
}
