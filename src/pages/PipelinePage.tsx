import { useState } from 'react'
import { usePipelineJobs, useJobStatus, useInvalidatePipeline } from '../hooks/usePipeline'
import { retryJob, rerunSteps } from '../api/admin'
import type { PipelineResult } from '../types'
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
  const { data: jobs = [], isLoading: loading } = usePipelineJobs()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [retrying,   setRetrying]   = useState(false)
  const [retryMsg,   setRetryMsg]   = useState<string | null>(null)

  // Multi-step checkbox selection
  const [checkedSteps, setCheckedSteps] = useState<Set<string>>(new Set())
  const [regenRunning, setRegenRunning] = useState(false)
  const [regenMsg,     setRegenMsg]     = useState<string | null>(null)

  const selectedJob = jobs.find(j => j.id === selectedId) || null
  const { data: detailedJob } = useJobStatus(
    selectedId && selectedJob?.status === 'running' ? selectedId : null
  )
  const selected = detailedJob || selectedJob
  const { invalidateAll } = useInvalidatePipeline()

  // Clear checkboxes whenever the selected job changes
  const prevSelectedId = useState<string | null>(null)
  if (prevSelectedId[0] !== selectedId) {
    prevSelectedId[1](selectedId)
    if (checkedSteps.size > 0) setCheckedSteps(new Set())
  }

  async function handleRetry(jobId: string) {
    setRetrying(true)
    setRetryMsg(null)
    try {
      await retryJob(jobId)
      setRetryMsg('Queued ✓')
      setTimeout(() => setRetryMsg(null), 3000)
      invalidateAll()
    } catch (err) {
      setRetryMsg(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRetrying(false)
    }
  }

  async function handleRegen(steps: string[]) {
    if (!selected || !steps.length) return
    setRegenRunning(true)
    setRegenMsg(null)
    try {
      await rerunSteps(selected.id, steps)
      const label = steps.length === 1 ? steps[0] : `${steps.length} steps`
      setRegenMsg(`Queued: ${label} ✓`)
      setTimeout(() => setRegenMsg(null), 4000)
      setCheckedSteps(new Set())
      invalidateAll()
    } catch (err) {
      setRegenMsg(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRegenRunning(false)
    }
  }

  function toggleStep(step: string) {
    setCheckedSteps(prev => {
      const next = new Set(prev)
      next.has(step) ? next.delete(step) : next.add(step)
      return next
    })
  }

  // Guard: result may be a raw JSON string on jobs stored before the JSONB codec fix.
  const rawResult = selected?.result
  const r: PipelineResult | undefined = (() => {
    if (!rawResult) return undefined
    if (typeof rawResult === 'string') {
      try { return JSON.parse(rawResult) as PipelineResult } catch { return undefined }
    }
    return rawResult as PipelineResult
  })()

  const summaryEntry = r?.summaries ? Object.values(r.summaries)[0] : null
  const audioEntry   = r?.audio     ? Object.entries(r.audio)[0]    : null

  const chaptersWithAudio = (() => {
    if (!r?.chapters) return r?.chapters
    const filesChapMap: Record<number, string | undefined> = {}
    for (const fc of (r.files?.chapters ?? [])) {
      if (fc.audio_url) filesChapMap[fc.index] = fc.audio_url
    }
    const lang = summaryEntry?.language ?? 'en'
    return r.chapters.map(ch => {
      const audioKey = `audio_${lang}` as keyof typeof ch
      if (ch[audioKey]) return ch
      const fallback = filesChapMap[ch.index]
      if (!fallback) return ch
      return { ...ch, [audioKey]: fallback }
    })
  })()

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
            const jr = typeof job.result === 'string'
              ? (() => { try { return JSON.parse(job.result as string) } catch { return null } })()
              : job.result
            return (
              <button key={job.id} onClick={() => setSelectedId(job.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors ${
                  selectedId === job.id ? 'bg-gray-800' : ''
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
                {selected.retry_count > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/40 text-yellow-400 border border-yellow-800">
                    {selected.retry_count}/{selected.max_retries} retries
                  </span>
                )}
                {(selected.status === 'failed' || selected.status === 'partial') && (() => {
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

            {/* Pipeline steps — checkbox multi-select + Regen Selected / Regen All */}
            {r?.steps && Object.keys(r.steps).length > 0 && (() => {
              const isBusy = selected.status === 'running' || selected.status === 'queued'
              const allStepKeys = Object.keys(r.steps!)
              const allChecked  = allStepKeys.length > 0 && allStepKeys.every(s => checkedSteps.has(s))
              return (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-3 gap-3">
                    <div className="flex items-center gap-2">
                      {/* Select All checkbox */}
                      {!isBusy && (
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={() => setCheckedSteps(allChecked ? new Set() : new Set(allStepKeys))}
                            className="accent-indigo-500 w-3.5 h-3.5"
                          />
                          <span className="text-[11px] text-gray-500">All</span>
                        </label>
                      )}
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Steps</p>
                      {checkedSteps.size > 0 && (
                        <span className="text-[11px] text-indigo-400">{checkedSteps.size} selected</span>
                      )}
                    </div>

                    {/* Action buttons */}
                    {!isBusy && (
                      <div className="flex items-center gap-2">
                        {regenMsg && (
                          <span className={`text-xs ${regenMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                            {regenMsg}
                          </span>
                        )}
                        {/* Regen Selected — only when checkboxes chosen */}
                        {checkedSteps.size > 0 && (
                          <button
                            onClick={() => handleRegen([...checkedSteps])}
                            disabled={regenRunning}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
                          >
                            {regenRunning
                              ? <span className="inline-block w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                              : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8 8 0 01-14.83-3M14.418 15H20" />
                                </svg>
                            }
                            Regen {checkedSteps.size} step{checkedSteps.size > 1 ? 's' : ''}
                          </button>
                        )}
                        {/* Regen All */}
                        <button
                          onClick={() => handleRegen(allStepKeys)}
                          disabled={regenRunning}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-400 hover:text-white text-xs font-medium transition-colors border border-gray-700 hover:border-indigo-500"
                        >
                          {regenRunning && checkedSteps.size === 0
                            ? <span className="inline-block w-3 h-3 border border-current/40 border-t-current rounded-full animate-spin" />
                            : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8 8 0 01-14.83-3M14.418 15H20" />
                              </svg>
                          }
                          Regen All
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Step rows with checkboxes */}
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {Object.entries(r.steps!).map(([step, s]) => {
                      const isChecked = checkedSteps.has(step)
                      return (
                        <label
                          key={step}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer select-none transition-all ${
                            isBusy ? 'cursor-default opacity-60' : 'hover:brightness-125'
                          } ${
                            isChecked
                              ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-gray-900 ' + (STEP_COLORS[s] ?? 'bg-gray-800 text-gray-400 border-gray-700')
                              : STEP_COLORS[s] ?? 'bg-gray-800 text-gray-400 border-gray-700'
                          }`}
                        >
                          {!isBusy && (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleStep(step)}
                              className="accent-indigo-400 w-3.5 h-3.5 shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{step}</p>
                            <p className="text-[10px] opacity-60 capitalize">{s}</p>
                          </div>
                          {s === 'running' && (
                            <span className="ml-auto inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

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
                      <a href={audioEntry[1].url} target="_blank" rel="noreferrer"
                        className="text-xs text-indigo-400 hover:underline">Download MP3 ↗</a>
                    </>
                  ) : (
                    <p className="text-xs text-gray-600">Not generated</p>
                  )}
                </div>

                {/* Mindmap */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Mind Map</p>
                  {r.mindmap?.url ? (
                    <>
                      <div className="aspect-video bg-gray-800 rounded-lg mb-2 overflow-hidden">
                        <iframe src={r.mindmap.url} title="Mind map"
                          className="w-full h-full border-0" />
                      </div>
                      <a href={r.mindmap.url} target="_blank" rel="noreferrer"
                        className="text-xs text-indigo-400 hover:underline">Open SVG ↗</a>
                    </>
                  ) : (
                    <p className="text-xs text-gray-600">Not generated</p>
                  )}
                </div>
              </div>
            )}

            {/* Chapter Audio */}
            {chaptersWithAudio && chaptersWithAudio.some(ch => ch.audio_en || ch.audio_ar) && (() => {
              const audioChapters = chaptersWithAudio.filter(ch => ch.audio_en || ch.audio_ar)
              return (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
                    Chapter Audio ({audioChapters.length})
                  </p>
                  <div className="space-y-3 max-h-96 overflow-auto">
                    {audioChapters.map(ch => (
                      <div key={ch.index} className="border-b border-gray-800 pb-3 last:border-0">
                        <p className="text-sm text-gray-300 mb-2">{ch.title}</p>
                        {ch.audio_en && (
                          <audio controls src={ch.audio_en} className="w-full" style={{ accentColor: '#6366f1' }} />
                        )}
                        {ch.audio_ar && (
                          <audio controls src={ch.audio_ar} className="w-full mt-2" style={{ accentColor: '#10b981' }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

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

            {/* Chapters */}
            {r?.chapters && r.chapters.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
                  Chapters ({r.chapters.length})
                </p>
                <div className="space-y-1 max-h-96 overflow-auto">
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
