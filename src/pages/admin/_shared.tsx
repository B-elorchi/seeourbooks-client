/** Shared admin UI primitives — imported by all admin sub-pages. */

export function PageHeader({
  title, subtitle, action,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6 w-full">
      {children}
    </div>
  )
}

export function Card({
  children, className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl ${className}`}>
      {children}
    </div>
  )
}

export function StatCard({
  label, value, sub, color = 'text-gray-900',
}: {
  label: string
  value: string | number
  sub?: string
  color?: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-3">{children}</h2>
  )
}

export function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    done:      'bg-green-50 text-green-700 border border-green-200',
    running:   'bg-blue-50  text-blue-700  border border-blue-200',
    queued:    'bg-yellow-50 text-yellow-700 border border-yellow-200',
    failed:    'bg-red-50   text-red-700   border border-red-200',
    cancelled: 'bg-gray-100 text-gray-500   border border-gray-200',
    partial:   'bg-orange-50 text-orange-700 border border-orange-200',
  }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

export function fmtUSD(n: number) {
  return `$${n.toFixed(4)}`
}
