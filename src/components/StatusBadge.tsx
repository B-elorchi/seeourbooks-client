type Status = 'queued' | 'running' | 'done' | 'partial' | 'failed' | 'cancelled'

const styles: Record<Status, string> = {
  queued:    'bg-yellow-50 text-yellow-700 border border-yellow-200',
  running:   'bg-blue-50   text-blue-700   border border-blue-200   animate-pulse',
  done:      'bg-green-50  text-green-700  border border-green-200',
  partial:   'bg-orange-50 text-orange-700 border border-orange-200',
  failed:    'bg-red-50    text-red-700    border border-red-200',
  cancelled: 'bg-gray-100  text-gray-500   border border-gray-200',
}

const icons: Record<Status, string> = {
  queued:    '⏳',
  running:   '⚙',
  done:      '✓',
  partial:   '⚠',
  failed:    '✕',
  cancelled: '⊘',
}

export default function StatusBadge({ status }: { status: string }) {
  const s = (status as Status) in styles ? (status as Status) : 'failed'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${styles[s]}`}>
      {icons[s]} {status}
    </span>
  )
}
