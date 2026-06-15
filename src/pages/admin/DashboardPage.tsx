import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  useAdminMetrics, useAdminCosts, useAdminJobs, useUserCount,
  useCostsByBook, useCostsByUser, useDailyCosts,
  useInvalidateAdmin,
} from '../../hooks/useAdmin'
import { PageShell, PageHeader, Badge, timeAgo } from './_shared'

const DAYS_OPTIONS = [7, 14, 30, 90]

const STATUS_COLORS: Record<string, string> = {
  done:      '#10b981',
  partial:   '#f59e0b',
  failed:    '#ef4444',
  running:   '#3b82f6',
  queued:    '#a78bfa',
  cancelled: '#6b7280',
}

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a78bfa', '#ec4899', '#14b8a6']

// ── Tooltip helpers ──────────────────────────────────────────────────────────

function UsdTooltip({ active, payload, label }: { active?: boolean; payload?: {value: number}[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow text-xs">
      <p className="text-gray-500 mb-1">{label}</p>
      <p className="font-semibold text-gray-900">${Number(payload[0].value).toFixed(4)}</p>
    </div>
  )
}

function CountTooltip({ active, payload, label }: { active?: boolean; payload?: {value: number}[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow text-xs">
      <p className="text-gray-500 mb-1">{label}</p>
      <p className="font-semibold text-gray-900">{payload[0].value}</p>
    </div>
  )
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: {name: string; value: number}[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow text-xs">
      <p className="text-gray-700 font-medium">{payload[0].name}</p>
      <p className="text-gray-500">${Number(payload[0].value).toFixed(4)}</p>
    </div>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color = 'text-gray-900', sub }: {
  label: string; value: string | number; color?: string; sub?: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [days, setDays] = useState(30)
  const [customOpen, setCustomOpen] = useState(false)
  const [customDays, setCustomDays] = useState('45')
  const isPreset = DAYS_OPTIONS.includes(days)

  function applyCustom() {
    const n = Math.max(1, Math.min(365, parseInt(customDays, 10) || 0))
    if (n > 0) { setDays(n); setCustomDays(String(n)) }
  }

  const { data: jobs = [],   isLoading: jobsLoading } = useAdminJobs(100)
  const { data: metrics }                              = useAdminMetrics()
  const { data: costs }                               = useAdminCosts(days)
  const { data: userCount }                           = useUserCount()
  const { data: byBook  = [] }                        = useCostsByBook(days)
  const { data: byUser  = [] }                        = useCostsByUser(days)
  const { data: dailyCosts = [] }                     = useDailyCosts(days)
  const { invalidateAll }                             = useInvalidateAdmin()

  // Status pie data
  const statusPie = metrics
    ? Object.entries(STATUS_COLORS)
        .map(([k, c]) => ({ name: k, value: ((metrics as unknown) as Record<string, number>)[k] ?? 0, color: c }))
        .filter(d => d.value > 0)
    : []

  // Provider cost pie
  const providerPie = (costs?.by_provider ?? []).slice(0, 6).map((p, i) => ({
    name: p.provider, value: p.cost_usd, color: CHART_COLORS[i % CHART_COLORS.length],
  }))

  // Step cost bar
  const stepBar = (costs?.by_step ?? []).slice(0, 10)

  // Jobs per day (last 14 days from job list)
  const jobsByDay = (() => {
    const map: Record<string, number> = {}
    for (const j of jobs) {
      const d = (j.created_at ?? '').slice(0, 10)
      if (d) map[d] = (map[d] ?? 0) + 1
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([date, count]) => ({ date: date.slice(5), count }))
  })()

  // Success rate
  const successRate = metrics && metrics.total > 0
    ? Math.round(((metrics.done + metrics.partial) / metrics.total) * 100)
    : null

  const recentJobs = jobs.slice(0, 8)

  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        subtitle="System analytics & performance overview"
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {DAYS_OPTIONS.map(d => (
                <button key={d} onClick={() => { setDays(d); setCustomOpen(false) }}
                  className={`px-3 py-1.5 transition-colors ${days === d && !customOpen ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  {d}d
                </button>
              ))}
              <button onClick={() => setCustomOpen(o => !o)}
                className={`px-3 py-1.5 transition-colors border-l border-gray-200 ${(customOpen || !isPreset) ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                {!isPreset ? `${days}d` : 'Custom'}
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
            <button onClick={() => invalidateAll()} disabled={jobsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-colors disabled:opacity-50">
              <i className="ti ti-refresh text-sm" />
              Refresh
            </button>
          </div>
        }
      />

      {/* ── Row 1: KPIs ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        <KpiCard label="Total Jobs"  value={metrics?.total   ?? '—'} />
        <KpiCard label="Done"        value={metrics?.done    ?? '—'} color="text-green-600" />
        <KpiCard label="Partial"     value={metrics?.partial ?? '—'} color="text-orange-500" />
        <KpiCard label="Failed"      value={metrics?.failed  ?? '—'} color="text-red-600" />
        <KpiCard label="Running"     value={metrics?.running ?? '—'} color="text-blue-600" />
        <KpiCard label="Queued"      value={metrics?.queued  ?? '—'} color="text-violet-600" />
        <KpiCard label="Success Rate" value={successRate !== null ? `${successRate}%` : '—'}
          color={successRate !== null ? (successRate >= 80 ? 'text-green-600' : successRate >= 60 ? 'text-orange-500' : 'text-red-600') : 'text-gray-900'} />
        <KpiCard label="API Users"   value={typeof userCount === 'number' ? userCount : '—'} />
      </div>

      {/* ── Row 2: Cost KPIs ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KpiCard label={`Total Cost (${days}d)`} value={costs ? `$${costs.total_cost_usd.toFixed(4)}` : '—'} color="text-indigo-600" />
        <KpiCard label="AI Calls"    value={costs?.total_calls ?? '—'} sub={`last ${days} days`} />
        <KpiCard label="Top Provider"
          value={costs?.by_provider?.[0]?.provider ?? '—'}
          sub={costs?.by_provider?.[0] ? `$${costs.by_provider[0].cost_usd.toFixed(4)}` : undefined} />
        <KpiCard label="Top Step"
          value={costs?.by_step?.[0]?.step ?? '—'}
          sub={costs?.by_step?.[0] ? `$${costs.by_step[0].cost_usd.toFixed(4)}` : undefined} />
      </div>

      {/* ── Row 3: Daily cost trend + Jobs per day ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Section title={`Daily Cost — last ${days} days`}>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            {dailyCosts.length === 0 ? (
              <p className="text-xs text-gray-400 py-8 text-center">No cost data</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={dailyCosts} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                    minTickGap={24} tickFormatter={(v: string) => (v ?? '').slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${v}`} width={50} />
                  <Tooltip content={<UsdTooltip />} />
                  <Area type="monotone" dataKey="cost_usd" stroke="#6366f1" strokeWidth={2}
                    fill="url(#costGrad)" dot={false} name="Cost (USD)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Section>

        <Section title="Jobs per day (last 14 days)">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            {jobsByDay.length === 0 ? (
              <p className="text-xs text-gray-400 py-8 text-center">No job data</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={jobsByDay} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                  <Tooltip content={<CountTooltip />} />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="Jobs" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Section>
      </div>

      {/* ── Row 4: Pie charts ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Section title="Job Status Distribution">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            {statusPie.length === 0 ? (
              <p className="text-xs text-gray-400 py-8 text-center">No data</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={160}>
                  <PieChart>
                    <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={40} outerRadius={70} paddingAngle={2}>
                      {statusPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {statusPie.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="capitalize text-gray-700">{d.name}</span>
                      </div>
                      <span className="font-medium text-gray-900">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>

        <Section title={`Cost by Provider (${days}d)`}>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            {providerPie.length === 0 ? (
              <p className="text-xs text-gray-400 py-8 text-center">No cost data</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={160}>
                  <PieChart>
                    <Pie data={providerPie} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={40} outerRadius={70} paddingAngle={2}>
                      {providerPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {providerPie.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="text-gray-700 truncate max-w-[80px]">{d.name}</span>
                      </div>
                      <span className="font-medium text-gray-900">${d.value.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* ── Row 5: Cost by step bar ──────────────────────────────────────────── */}
      <Section title={`Cost by Pipeline Step (${days}d)`}>
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          {stepBar.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">No cost data</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stepBar} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `$${v}`} />
                <YAxis type="category" dataKey="step" tick={{ fontSize: 10 }} tickLine={false}
                  axisLine={false} width={100} />
                <Tooltip content={<UsdTooltip />} />
                <Bar dataKey="cost_usd" radius={[0, 4, 4, 0]} name="Cost (USD)">
                  {stepBar.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Section>

      {/* ── Row 6: Cost by book + cost by user ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Section title={`Cost per Book (top 10, ${days}d)`}>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {byBook.length === 0 ? (
              <p className="text-xs text-gray-400 p-5">No data</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Book / ID</th>
                    <th className="text-right px-4 py-2.5">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {byBook.slice(0, 10).map((b, i) => (
                    <tr key={b.job_id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400 font-mono w-4 shrink-0">{i + 1}</span>
                          <div className="min-w-0">
                            <span className="text-gray-800 truncate max-w-[200px] block">{b.title}</span>
                            <span className="text-[10px] text-gray-400 font-mono">
                              ID: {b.book_id}{b.job_id ? ` · job ${b.job_id.slice(0, 8)}` : ''}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-indigo-700 align-top">
                        ${b.cost_usd.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Section>

        <Section title={`Cost per User (${days}d)`}>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {byUser.length === 0 ? (
              <p className="text-xs text-gray-400 p-5">No data</p>
            ) : (
              <>
                <div className="p-4 pb-0">
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={byUser.slice(0, 8)} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                        tickFormatter={v => String(v).slice(0, 10)} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44}
                        tickFormatter={v => `$${v}`} />
                      <Tooltip content={<UsdTooltip />} />
                      <Bar dataKey="cost_usd" radius={[4, 4, 0, 0]} name="Cost (USD)">
                        {byUser.slice(0, 8).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <table className="w-full text-xs mt-2">
                  <tbody className="divide-y divide-gray-50">
                    {byUser.slice(0, 8).map((u, i) => (
                      <tr key={u.user_id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 flex items-center gap-2">
                          <span className="text-[10px] text-gray-400 font-mono w-4">{i + 1}</span>
                          <span className="text-gray-800 truncate max-w-[160px]">{u.label}</span>
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-indigo-700">
                          ${u.cost_usd.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </Section>
      </div>

      {/* ── Row 7: Recent jobs ───────────────────────────────────────────────── */}
      <Section
        title="Recent Jobs"
        action={<Link to="/pipeline" className="text-xs text-indigo-600 hover:underline">View all →</Link>}
      >
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {jobsLoading ? (
            <p className="p-5 text-sm text-gray-400">Loading…</p>
          ) : recentJobs.length === 0 ? (
            <p className="p-5 text-sm text-gray-400">No jobs yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                  <th className="text-left px-5 py-3">Book</th>
                  <th className="text-left px-5 py-3 hidden sm:table-cell">Source</th>
                  <th className="text-left px-5 py-3 hidden md:table-cell">Step</th>
                  <th className="text-left px-5 py-3">Started</th>
                  <th className="text-right px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentJobs.map(job => {
                  const jr = typeof job.result === 'string'
                    ? (() => { try { return JSON.parse(job.result as string) } catch { return null } })()
                    : job.result
                  const inp = job.input as { source?: string; title?: string } | undefined
                  const source = inp?.source ?? 'catalog'
                  const currentStep = jr?.current_step as string | undefined
                  const SOURCE_BADGE_CLS: Record<string, string> = {
                    pdf_upload:  'bg-blue-50 text-blue-700',
                    catalog:     'bg-violet-50 text-violet-700',
                    custom_json: 'bg-amber-50 text-amber-700',
                  }
                  const SOURCE_LABEL: Record<string, string> = { pdf_upload: 'PDF', catalog: 'Catalog', custom_json: 'JSON' }
                  return (
                    <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-gray-900 font-medium truncate max-w-[200px]">
                          {jr?.metadata?.title || inp?.title || job.book_id}
                        </p>
                        <p className="text-gray-400 text-[10px] mt-0.5 font-mono">{job.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${SOURCE_BADGE_CLS[source] ?? 'bg-gray-100 text-gray-600'}`}>
                          {SOURCE_LABEL[source] ?? source}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs font-mono hidden md:table-cell">
                        {currentStep && job.status === 'running' ? (
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            {currentStep}
                          </span>
                        ) : '—'}
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
      </Section>
    </PageShell>
  )
}
