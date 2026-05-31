import { useState, useEffect, useCallback } from 'react'
import { listJobs, getJobStatus } from '../api/pipeline'
import { retryJob } from '../api/admin'
import type { PipelineJob, PipelineResult } from '../types'
import StatusBadge from '../components/StatusBadge'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

const STEP_COLORS: Record<string, string> = {
  done:    'bg-green-900/40 text-green-400 border-green-800',
  failed:  'bg-red-900/40 text-red-400 border-red-800',
  partial: 'bg-orange-900/40 text-orange-400 border-orange-800',
  skipped: 'bg-gray-800 text-gray-600 border-gray-700',
  running: 'bg-blue-900/40 text-blue-400 border-blue-800 animate-pulse',
}

export default function PipelinePage() {
  const [jobs,      setJobs]      = useState<PipelineJob[]>([])
  const [selected,  setSelected]  = useState<PipelineJob | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [retrying,  setRetrying]  = useState(false)
  const [retryMsg,  setRetryMsg]  = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const data = await listJobs()
      setJobs(data)
      if (selected && ['queued', 'running'].includes(selected.status)) {
        const updated = await getJobStatus(selected.id)
        setSelected(updated)
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [selected])

  useEffect(() => {
    fetchJobs()
    const id = setInterval(fetchJobs, 3000)
    return () => clearInterval(id)
  }, [fetchJobs])

  async function handleRetry(jobId: string) {
    setRetrying(true)
    setRetryMsg(null)
    try {
      await retryJob(jobId)
      setRetryMsg('Queued ✓')
      setTimeout(() => setRetryMsg(null), 3000)
      await fetchJobs()
    } catch (err) {
      setRetryMsg(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRetrying(false)
    }
  }

  // Guard: result may be a raw JSON string on jobs stored before the JSONB codec fix.
  // Parse it if so; otherwise use it directly.
  const rawResult = selected?.result
  const r: PipelineResult | undefined = (() => {
    if (!rawResult) return undefined
    if (typeof rawResult === 'string') {
      try { return JSON.parse(rawResult) as PipelineResult } catch { return undefined }
    }
    return rawResult as PipelineResult
  })()

  // Derive first available summary and audio from the keyed objects
  const summaryEntry = r?.summaries ? Object.values(r.summaries)[0] : null
  const audioEntry   = r?.audio     ? Object.entries(r.audio)[0]    : null  // ["full_en", {...}]

  return (
    <div className="flex h-screen">

      {/* ── Job list sidebar ─────────────────────────────────────────────── */}
      <div className="w-80 shrink-0 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-200">Pipeline Jobs</h2>
          <div className="flex gap-3 mt-2 text-xs text-gray-500">
            <span className="text-blue-400">{jobs.filter(j => j.status === 'running').length} running</span>
            <span className="text-green-400">{jobs.filter(j => j.status === 'done').length} done</span>
            <span className="text-red-400">{jobs.filter(j => j.status === 'failed').length} failed</span>
          </div>
        </div>
        <div className="overflow-auto flex-1">
          {loading && <p className="text-xs text-gray-500 p-4">Loading…</p>}
          {!loading && jobs.length === 0 && (
            <p className="text-xs text-gray-600 p-4">No jobs yet.</p>
          )}
          {jobs.map(job => {
            // Normalize result: handle legacy JSON string rows
            const jr = typeof job.result === 'string'
              ? (() => { try { return JSON.parse(job.result as string) } catch { return null } })()
              : job.result
            return (
              <button key={job.id} onClick={() => setSelected(job)}
                className={`w-full text-left px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors ${
                  selected?.id === job.id ? 'bg-gray-800' : ''
                }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-200 truncate">
                    {jr?.metadata?.title ?? job.book_id}
                  </span>
                  <StatusBadge status={job.status} />
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{jr?.metadata?.author ?? '—'}</span>
                  <span>·</span>
                  <span>{timeAgo(job.created_at)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6">
        {!selected && (
          <div className="h-full flex items-center justify-center text-gray-600 text-sm">
            Select a job to view details
          </div>
        )}

        {selected && (
          <div className="max-w-3xl space-y-6">

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-gray-100">
                  {r?.metadata?.title ?? selected.book_id}
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {r?.metadata?.author}
                  {r?.metadata?.year && ` · ${r.metadata.year}`}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge status={selected.status} />
                {r?.processing_time && (
                  <span className="text-xs text-gray-500">{r.processing_time}</span>
                )}

                {/* Retry counter badge */}
                {selected.retry_count > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/40 text-yellow-400 border border-yellow-800">
                    {selected.retry_count}/{selected.max_retries} retries
                  </span>
                )}

                {/* Retry button — available for failed or partial jobs */}
                {(selected.status === 'failed' || selected.status === 'partial') && (() => {
                  // Compute which steps will be retried so we can show a tooltip
                  const failedSteps = r?.steps
                    ? Object.entries(r.steps).filter(([, s]) => s === 'failed').map(([k]) => k)
                    : []
                  const tipText = failedSteps.length
                    ? `Will retry: ${failedSteps.join(', ')}`
                    : 'Will retry all steps'
                  return (
                    <div className="flex items-center gap-2">
                      {retryMsg && (
                        <span className={`text-xs ${retryMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                          {retryMsg}
                        </span>
                      )}
                      <button
                        onClick={() => handleRetry(selected.id)}
                        disabled={retrying}
                        title={tipText}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
                      >
                        {retrying ? (
                          <span className="inline-block w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m0 0a8 8 0 0114.83 2.999M4.582 9H9m11 11v-5h-.581m0 0a8 8 0 01-14.83-3M14.418 15H20" />
                          </svg>
                        )}
                        {retrying ? 'Retrying…' : failedSteps.length ? `Retry ${failedSteps.length} step${failedSteps.length > 1 ? 's' : ''}` : 'Retry'}
                      </button>
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Step status pills */}
            {r?.steps && Object.keys(r.steps).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(r.steps).map(([step, s]) => (
                  <span key={step}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium ${
                      STEP_COLORS[s] ?? 'bg-gray-800 text-gray-400 border-gray-700'
                    }`}>
                    {step}
                  </span>
                ))}
              </div>
            )}

            {/* Quick summary */}
            {r?.quick_summary && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Quick Summary</p>
                <p className="text-sm text-gray-200 leading-relaxed">{r.quick_summary}</p>
              </div>
            )}

            {/* Assets grid */}
            {r && (
              <div className="grid grid-cols-3 gap-4">

                {/* Cover */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Cover</p>
                  {r?.metadata?.cover_url ? (
                    <>
                      <img src={r.metadata.cover_url} alt={r.metadata.cover_alt_text ?? ''}
                        className="w-full rounded-lg mb-2 object-cover aspect-[2/3]" />
                      {r.metadata.cover_alt_text && (
                        <p className="text-xs text-gray-500 leading-relaxed">{r.metadata.cover_alt_text}</p>
                      )}
                      <a href={r.metadata.cover_url} target="_blank" rel="noreferrer"
                        className="text-xs text-indigo-400 hover:underline mt-2 block">Open ↗</a>
                    </>
                  ) : (
                    <p className="text-xs text-gray-600">Not generated</p>
                  )}
                </div>

                {/* Audio */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
                    Full Audio
                    {audioEntry && (
                      <span className="normal-case text-gray-600 ml-1">({audioEntry[0]})</span>
                    )}
                  </p>
                  {audioEntry?.[1]?.url ? (
                    <>
                      <audio controls src={audioEntry[1].url}
                        className="w-full mb-2" style={{ accentColor: '#6366f1' }} />
                      <p className="text-xs text-gray-500">
                        {audioEntry[1].duration && `${audioEntry[1].duration}`}
                        {audioEntry[1].size_mb  && ` · ${audioEntry[1].size_mb} MB`}
                      </p>
                      <a href={audioEntry[1].url} target="_blank" rel="noreferrer"
                        className="text-xs text-indigo-400 hover:underline mt-1 block">Download ↗</a>
                    </>
                  ) : (
                    <p className="text-xs text-gray-600">Not generated</p>
                  )}
                </div>

                {/* Mind map */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Mind Map</p>
                  {r.mindmap?.url ? (
                    <>
                      <iframe src={r.mindmap.url} title="Mind map"
                        className="w-full h-32 rounded border border-gray-700 mb-2" />
                      <a href={r.mindmap.url} target="_blank" rel="noreferrer"
                        className="text-xs text-indigo-400 hover:underline">Open ↗</a>
                    </>
                  ) : (
                    <p className="text-xs text-gray-600">Not generated</p>
                  )}
                </div>
              </div>
            )}

            {/* Full summary */}
            {summaryEntry && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Summary</p>
                  <span className="text-xs text-gray-600">
                    {summaryEntry.word_count} words · {summaryEntry.style}
                  </span>
                </div>
                <p
                  dir={summaryEntry.language === 'ar' ? 'rtl' : 'ltr'}
                  className={`text-sm text-gray-200 leading-relaxed whitespace-pre-wrap ${
                    summaryEntry.language === 'ar' ? 'font-arabic' : ''
                  }`}
                >
                  {summaryEntry.text}
                </p>
              </div>
            )}

            {/* Chapter Audio — only shown when at least one chapter has audio */}
            {r?.chapters && r.chapters.some(ch => ch.audio_en || ch.audio_ar) && (() => {
              const audioChapters = r.chapters.filter(ch => ch.audio_en || ch.audio_ar)
              return (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
                    Chapter Audio ({audioChapters.length})
                  </p>
                  <div className="space-y-3">
                    {audioChapters.map(ch => (
                      <div key={ch.index} className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-200 font-medium truncate">
                              <span className="text-gray-500 mr-2">{ch.index}.</span>
                              {ch.title}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">~{ch.read_time_min} min read</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {ch.audio_en && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-900/40 text-indigo-300 border border-indigo-800 font-mono">EN</span>
                            )}
                            {ch.audio_ar && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-900/40 text-emerald-300 border border-emerald-800 font-mono">AR</span>
                            )}
                          </div>
                        </div>

                        {ch.audio_en && (
                          <div className="mb-2">
                            <audio controls src={ch.audio_en} className="w-full" style={{ accentColor: '#6366f1' }} />
                            <a href={ch.audio_en} target="_blank" rel="noreferrer"
                               className="text-[11px] text-indigo-400 hover:underline mt-1 inline-block">Download EN ↗</a>
                          </div>
                        )}
                        {ch.audio_ar && (
                          <div>
                            <audio controls src={ch.audio_ar} className="w-full" style={{ accentColor: '#10b981' }} />
                            <a href={ch.audio_ar} target="_blank" rel="noreferrer"
                               className="text-[11px] text-emerald-400 hover:underline mt-1 inline-block">Download AR ↗</a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Chapters */}
            {r?.chapters && r.chapters.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
                  Chapters ({r.chapters.length})
                </p>
                <div className="space-y-2">
                  {r.chapters.map(ch => (
                    <details key={ch.index} className="group">
                      <summary className="flex items-center justify-between cursor-pointer py-2 px-3 rounded-lg hover:bg-gray-800 text-sm text-gray-300">
                        <span className="font-medium">{ch.title}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">~{ch.read_time_min} min</span>
                          {ch.audio_en && (
                            <a href={ch.audio_en} target="_blank" rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-xs text-indigo-400 hover:underline">EN ↗</a>
                          )}
                          {ch.audio_ar && (
                            <a href={ch.audio_ar} target="_blank" rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-xs text-indigo-400 hover:underline">AR ↗</a>
                          )}
                        </div>
                      </summary>
                      <div className="px-3 pb-3 text-xs text-gray-400 leading-relaxed">
                        {ch.summary}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {r?.errors && Object.keys(r.errors).length > 0 && (
              <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4">
                <p className="text-xs font-medium text-red-400 uppercase tracking-wide mb-2">Step Errors</p>
                {Object.entries(r.errors).map(([step, msg]) => (
                  <p key={step} className="text-xs text-red-300">
                    <span className="font-medium">{step}:</span> {msg}
                  </p>
                ))}
              </div>
            )}

            {/* Raw JSON */}
            <details className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <summary className="text-xs text-gray-400 cursor-pointer">View full output JSON</summary>
              <pre className="mt-3 text-xs text-gray-400 overflow-auto max-h-96">
                {JSON.stringify(selected, null, 2)}
              </pre>
            </details>

          </div>
        )}
      </div>
    </div>
  )
}
