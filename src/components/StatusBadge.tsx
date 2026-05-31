type Status = 'queued' | 'running' | 'done' | 'partial' | 'failed'

const styles: Record<Status, string> = {
  queued:  'bg-yellow-900/50 text-yellow-300 border border-yellow-700',
  running: 'bg-blue-900/50   text-blue-300   border border-blue-700   animate-pulse',
  done:    'bg-green-900/50  text-green-300  border border-green-700',
  partial: 'bg-orange-900/50 text-orange-300 border border-orange-700',
  failed:  'bg-red-900/50    text-red-300    border border-red-700',
}

const icons: Record<Status, string> = {
  queued:  '⏳',
  running: '⚙',
  done:    '✓',
  partial: '⚠',
  failed:  '✕',
}

export default function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
      {icons[status]} {status}
    </span>
  )
}
