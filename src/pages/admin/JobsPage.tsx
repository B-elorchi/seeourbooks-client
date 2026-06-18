import { useState, useEffect } from 'react'
import { getAdminJobs, retryJob, rerunSteps, cancelJob, deleteJob, autoRetryCreditFailures } from '../../api/admin'
import { PageShell, PageHeader } from './_shared'
import StatusBadge from '../../components/StatusBadge'
import type { PipelineJob } from '../../types'

const STEP_COLORS: Record<string, string> = {
  done:    'bg-green-50 text-green-700',
  failed:  'bg-red-50 text-red-600',
  partial: 'bg-orange-50 text-orange-600',
  skipped: 'bg-gray-100 text-gray-400',
  running: 'bg-blue-50 text-blue-600',
}

const FILTER_STATUSES: string[] = ['all', 'running', 'queued', 'done', 'partial', 'failed', 'cancelled']

const ALL_STEPS: { id: string; label: string }[] = [
  { id: 'summarize',        label: 'Summarize'           },
  { id: 'audio_full',       label: 'Audio (full)'        },
  { id: 'audio_chapters',   label: 'Audio (chapters)'   },
  { id: 'cover',            label: 'Cover image'         },
  { id: 'alt_text',         label: 'Alt text'            },
  { id: 'mindmap',          label: 'Mind map'            },
  { id: 'mindmap_chapters', label: 'Mind map (chapters)' },
  { id: 'inject_epub',      label: 'Inject EPUB'         },
  { id: 'video',            label: 'Video'               },
]

const STEP_SHORT: Record<string, string> = {
  summarize:        'sum',
  audio_full:       'aud',
  audio_chapters:   'aud-ch',
  cover:            'cover',
  alt_text:         'alt',
  mindmap:          'mm',
  mindmap_chapters: 'mm-ch',
  inject_epub:      'epub',
  video:            'video',
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

export default function JobsPage() {
  const [jobs,       setJobs]       = useState<PipelineJob[]>([])
  const [loading,    setLoading]    = useState(true)
  const [retrying,   setRetrying]   = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [rerunning,  setRerunning]  = useState<string | null>(null)
  const [jobStepSel, setJobStepSel] = useState<Record<string, Set<string>>>({})
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [autoRetrying, setAutoRetrying] = useState(false)
  const [autoRetryMsg, setAutoRetryMsg] = useState<string | null>(null)

  async function loadJobs() {
    try { const data = await getAdminJobs(100); setJobs(data) } catch { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => { loadJobs() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRetry(jobId: string) {
    setRetrying(jobId)
    try { await retryJob(jobId); await loadJobs() } catch { /* silent */ }
    finally { setRetrying(null) }
  }

  async function handleCancel(jobId: string) {
    setCancelling(jobId)
    try { await cancelJob(jobId); await loadJobs() } catch { /* silent */ }
    finally { setCancelling(null) }
  }

  async function handleDelete(jobId: string) {
    setDeleting(jobId)
    try { await deleteJob(jobId); setConfirmDel(null); await loadJobs() } catch { /* silent */ }
    finally { setDeleting(null) }
  }

  async function handleAutoRetryCredits() {
    setAutoRetrying(true)
    setAutoRetryMsg(null)
    try {
      const res = await autoRetryCreditFailures()
      setAutoRetryMsg(res.count > 0 ? `Re-queued ${res.count} credit-failed job(s).` : 'No credit-failed jobs to retry or key still exhausted.')
      await loadJobs()
    } catch (e) {
      setAutoRetryMsg(`Error: ${(e as Error).message}`)
    } finally {
      setAutoRetrying(false)
    }
  }

  async function handleRerun(jobId: string, steps: string[]) {
    const key = steps.length === ALL_STEPS.length ? `${jobId}:__all__` : `${jobId}:sel`
    setRerunning(key)
    try {
      await rerunSteps(jobId, steps)
      setJobStepSel(prev => { const n = {...prev}; delete n[jobId]; return n })
      await loadJobs()
    } catch { /* silent */ }
    finally { setRerunning(null) }
  }

  function toggleJobStep(jobId: string, step: string) {
    setJobStepSel(prev => {
      const cur = new Set(prev[jobId] ?? [])
      cur.has(step) ? cur.delete(step) : cur.add(step)
      return { ...prev, [jobId]: cur }
    })
  }

  return (
    <PageShell>
      <PageHeader
        title="Jobs"
        subtitle="Monitor and manage pipeline jobs"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoRetryCredits}
              disabled={autoRetrying}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-colors disabled:opacity-50"
            >
              <i className="ti ti-coin text-sm" aria-hidden="true" />
              {autoRetrying ? 'Checking…' : 'Retry credits'}
            </button>
            <button
              onClick={() => { setLoading(true); loadJobs() }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-colors"
            >
              <i className="ti ti-refresh text-sm" aria-hidden="true" />
              Refresh
            </button>
          </div>
        }
      />

      {autoRetryMsg && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-800">
          {autoRetryMsg}
        </div>
      )}

      {loading ? (
        <div className="p-6 text-sm text-gray-500">Loading jobs…</div>
      ) : !jobs.length ? (
        <div className="p-6 text-sm text-gray-600">No jobs yet.</div>
      ) : (
        <>
        {/* Status filter */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {FILTER_STATUSES.map(status => {
            const count = status === 'all'
              ? jobs.length
              : jobs.filter(j => j.status === status).length
            const active = statusFilter === status
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="capitalize">{status}</span>
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${active ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {count}
                </span>
              </button>
            )
          })}
          {statusFilter !== 'all' && (
            <button
              onClick={() => setStatusFilter('all')}
              className="text-xs text-gray-500 hover:text-gray-800 underline"
            >
              Clear filter
            </button>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                <th className="text-left px-5 py-3">Book</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Steps</th>
                <th className="text-left px-5 py-3">Retries</th>
                <th className="text-left px-5 py-3">Time</th>
                <th className="text-left px-5 py-3">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobs.filter(job => statusFilter === 'all' || job.status === statusFilter).map(job => {
                const jr = typeof job.result === 'string'
                  ? (() => { try { return JSON.parse(job.result as string) } catch { return null } })()
                  : job.result
                const steps        = jr?.steps ?? {}
                const currentStep  = jr?.current_step as string | undefined
                const isRetrying   = retrying === job.id
                const isCancelling = cancelling === job.id
                const canRetry     = job.status === 'failed' || job.status === 'partial'
                const canCancel    = job.status === 'running' || job.status === 'queued'
                const retryCount   = job.retry_count ?? 0
                const maxRetries   = job.max_retries ?? 3

                return (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors align-top">
                    <td className="px-5 py-3">
                      <p className="text-gray-900 font-medium truncate max-w-[180px]">
                        {jr?.metadata?.title ?? job.book_id}
                      </p>
                      <p className="text-xs text-gray-400 font-mono">{job.book_id}</p>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-5 py-3 max-w-xs">
                      {Object.entries(steps).length > 0 ? (() => {
                        const busy = canCancel || !!rerunning?.startsWith(job.id)
                        const sel  = jobStepSel[job.id] ?? new Set<string>()
                        const allKeys    = Object.keys(steps)
                        const allChecked = allKeys.length > 0 && allKeys.every(k => sel.has(k))
                        return (
                          <>
                            <div className="flex flex-wrap gap-1 mb-1">
                              {Object.entries(steps).map(([step, s]) => {
                                const isChecked = sel.has(step)
                                return (
                                  <label
                                    key={step}
                                    title={busy ? String(s) : `Check to select ${step}`}
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-xs select-none transition-all
                                      ${STEP_COLORS[String(s)] ?? 'bg-gray-100 text-gray-500'}
                                      ${busy ? 'cursor-default' : 'cursor-pointer hover:brightness-125'}
                                      ${isChecked ? 'ring-1 ring-white/40' : ''}
                                    `}
                                  >
                                    {!busy && (
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleJobStep(job.id, step)}
                                        className="accent-white w-2.5 h-2.5"
                                        onClick={e => e.stopPropagation()}
                                      />
                                    )}
                                    {STEP_SHORT[step] ?? step}
                                  </label>
                                )
                              })}
                            </div>
                            {!busy && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={allChecked}
                                    onChange={() => setJobStepSel(prev => ({
                                      ...prev,
                                      [job.id]: allChecked ? new Set() : new Set(allKeys),
                                    }))}
                                    className="accent-indigo-500 w-2.5 h-2.5"
                                  />
                                  <span className="text-[10px] text-gray-400">All</span>
                                </label>
                                {sel.size > 0 && (
                                  <button
                                    onClick={() => handleRerun(job.id, [...sel])}
                                    disabled={!!rerunning?.startsWith(job.id)}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 text-white text-[10px] font-medium transition-colors"
                                  >
                                    {rerunning === `${job.id}:sel`
                                      ? <span className="inline-block w-2 h-2 border border-white/40 border-t-white rounded-full animate-spin" />
                                      : null}
                                    Regen {sel.size}
                                  </button>
                                )}
                              </div>
                            )}
                            {currentStep && job.status === 'running' && (
                              <p className="text-[10px] text-yellow-400 mt-1 flex items-center gap-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                                <span className="font-mono">{currentStep}</span>
                              </p>
                            )}
                          </>
                        )
                      })() : <span className="text-xs text-gray-600">—</span>}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {retryCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
                          {retryCount}/{maxRetries}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">{jr?.processing_time ?? '—'}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{timeAgo(job.created_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        {canCancel && (
                          <button
                            onClick={() => handleCancel(job.id)}
                            disabled={isCancelling}
                            title="Stop at next step boundary"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 hover:text-white text-xs font-medium transition-colors border border-gray-200 hover:border-red-600"
                          >
                            {isCancelling
                              ? <span className="inline-block w-3 h-3 border border-current/40 border-t-current rounded-full animate-spin" />
                              : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            }
                            {isCancelling ? 'Cancelling…' : 'Cancel'}
                          </button>
                        )}
                        {canRetry && (
                          <button
                            onClick={() => handleRetry(job.id)}
                            disabled={isRetrying}
                            title="Retry only the failed steps"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 hover:text-white text-xs font-medium transition-colors border border-gray-200 hover:border-amber-500"
                          >
                            {isRetrying
                              ? <span className="inline-block w-3 h-3 border border-current/40 border-t-current rounded-full animate-spin" />
                              : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m0 0a8 8 0 0114.83 2.999M4.582 9H9m11 11v-5h-.581m0 0a8 8 0 01-14.83-3M14.418 15H20" />
                                </svg>
                            }
                            {isRetrying ? 'Retrying…' : 'Retry'}
                          </button>
                        )}
                        {!canCancel && (
                          <button
                            onClick={() => handleRerun(job.id, ALL_STEPS.map(s => s.id))}
                            disabled={!!rerunning?.startsWith(job.id)}
                            title="Regenerate all steps at once"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 hover:text-white text-xs font-medium transition-colors border border-gray-200 hover:border-indigo-500"
                          >
                            {rerunning === `${job.id}:__all__`
                              ? <span className="inline-block w-3 h-3 border border-current/40 border-t-current rounded-full animate-spin" />
                              : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m0 0a8 8 0 0114.83 2.999M4.582 9H9m11 11v-5h-.581m0 0a8 8 0 01-14.83-3M14.418 15H20" />
                                </svg>
                            }
                            Regen All
                          </button>
                        )}
                        {confirmDel === job.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-red-600">Sure?</span>
                            <button onClick={() => handleDelete(job.id)} disabled={deleting === job.id}
                              className="px-2 py-0.5 rounded bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-[10px] font-medium transition-colors">
                              {deleting === job.id ? '…' : 'Yes'}
                            </button>
                            <button onClick={() => setConfirmDel(null)}
                              className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-[10px] font-medium transition-colors">
                              No
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDel(job.id)} title="Delete job permanently"
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 text-xs transition-colors">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </PageShell>
  )
}
