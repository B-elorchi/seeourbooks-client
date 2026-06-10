import { useState, lazy, Suspense } from 'react'
import { usePipelineJobs, useJobStatus, useInvalidatePipeline } from '../hooks/usePipeline'
import { retryJob, rerunSteps, cancelJob } from '../api/admin'
import type { PipelineResult } from '../types'
import StatusBadge from '../components/StatusBadge'

// Lazy-loaded so the heavy epubjs library only downloads when a preview opens.
const EpubReader = lazy(() => import('../components/EpubReader'))

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

  // Cancel job
  const [cancelling, setCancelling] = useState(false)
  const [cancelMsg,  setCancelMsg]  = useState<string | null>(null)

  // EPUB preview modal
  const [epubPreview, setEpubPreview] = useState<string | null>(null)

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

  async function handleCancel(jobId: string) {
    setCancelling(true)
    setCancelMsg(null)
    try {
      await cancelJob(jobId)
      setCancelMsg('Cancelled ✓')
      setTimeout(() => setCancelMsg(null), 3000)
      invalidateAll()
    } catch (err) {
      setCancelMsg(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setCancelling(false)
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
const epubUrl      = r?.epub      ? Object.values(r.epub)[0]?.url  : (r?.files?.epub ?? null)
  const videoEntry   = r?.video     ? Object.entries(r.video)[0]     : null
  const videoUrl     = videoEntry?.[1]?.url ?? r?.files?.video ?? null

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
                {(selected.status === 'running' || selected.status === 'queued') && (
                  <div className="flex items-center gap-2">
                    {cancelMsg && (
                      <span className={`text-xs ${cancelMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                        {cancelMsg}
                      </span>
                    )}
                    <button
                      onClick={() => handleCancel(selected.id)}
                      disabled={cancelling}
                      title="Request cancellation — job will stop at the next step boundary"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
                    >
                      {cancelling ? (
                        <span className="inline-block w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      {cancelling ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </div>
                )}
                {(selected.status === 'failed' || selected.status === 'partial' || selected.status === 'cancelled') && (() => {
                  const failedSteps = r?.steps
                    ? Object.entries(r.steps).filter(([, s]) => s === 'failed' || s === 'running' || s === 'pending').map(([k]) => k)
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

            {/* Summary coverage QA */}
            {r?.summary_qa && typeof r.summary_qa.score === 'number' && r.summary_qa.score >= 0 && (() => {
              const qa = r.summary_qa!
              const thr = qa.threshold ?? 70
              const ok = qa.passed
              return (
                <div className={`rounded-xl p-4 border ${ok ? 'bg-emerald-950/30 border-emerald-900/50' : 'bg-red-950/30 border-red-900/50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Summary Coverage Check</p>
                    {qa.model && <span className="text-[11px] text-gray-500 font-mono">{qa.model}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-3xl font-bold ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{qa.score}%</span>
                    <div className="flex-1">
                      <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                        <div className={`h-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.max(0, Math.min(100, qa.score))}%` }} />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {ok ? `Passed — ≥ ${thr}% required` : `Below threshold (${thr}%) — audio blocked until summary improves`}
                      </p>
                    </div>
                  </div>
                  {qa.reason && <p className="text-xs text-gray-400 mt-2">{qa.reason}</p>}
                  {qa.missing && qa.missing.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Missing points</p>
                      <ul className="list-disc list-inside text-xs text-gray-400 space-y-0.5">
                        {qa.missing.slice(0, 8).map((m, i) => <li key={i}>{m}</li>)}
                      </ul>
                    </div>
                  )}
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
              <div className="grid grid-cols-2 gap-4">

                {/* Cover */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">🖼 Cover</p>
                  {r.metadata?.cover_url ? (
                    <>
                      <img src={r.metadata.cover_url} alt={r.metadata.cover_alt_text ?? ''}
                        className="w-full rounded-lg mb-2 object-cover max-h-64" />
                      {r.metadata.cover_alt_text && (
                        <p className="text-xs text-gray-500 leading-relaxed mb-2">{r.metadata.cover_alt_text}</p>
                      )}
                      <a href={r.metadata.cover_url} target="_blank" rel="noreferrer"
                        className="text-xs text-indigo-400 hover:underline">Open image ↗</a>
                    </>
                  ) : <p className="text-xs text-gray-600">Not generated</p>}
                </div>

                {/* Full Audio — one player per language */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">🔊 Full Audio</p>
                  {r?.audio && Object.keys(r.audio).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(r.audio).map(([key, a]) => {
                        const lang = key.replace('full_', '').toUpperCase()
                        return (
                          <div key={key}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                lang === 'AR' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-indigo-900/40 text-indigo-300'
                              }`}>{lang}</span>
                              {a.duration && <span className="text-xs text-gray-500">{a.duration}</span>}
                            </div>
                            <audio controls src={a.url} className="w-full" style={{ accentColor: '#6366f1' }} />
                            <a href={a.url} target="_blank" rel="noreferrer"
                              className="text-[11px] text-indigo-400 hover:underline mt-1 inline-block">Download MP3 ↗</a>
                          </div>
                        )
                      })}
                    </div>
                  ) : <p className="text-xs text-gray-600">Not generated</p>}
                </div>

                {/* Mind Map */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">🗺 Mind Map</p>
                  {r.mindmap?.url ? (
                    <>
                      <div className="aspect-video bg-gray-800 rounded-lg mb-2 overflow-hidden">
                        <iframe src={r.mindmap.url} title="Mind map" className="w-full h-full border-0" />
                      </div>
                      <a href={r.mindmap.url} target="_blank" rel="noreferrer"
                        className="text-xs text-indigo-400 hover:underline">Open ↗</a>
                    </>
                  ) : <p className="text-xs text-gray-600">Not generated</p>}
                </div>

                {/* EPUB */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">📚 EPUB</p>
                  {epubUrl ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                        <svg className="w-8 h-8 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-200 font-medium truncate">
                            {epubUrl.split('/').pop() ?? 'book.epub'}
                          </p>
                          <p className="text-xs text-gray-500 truncate mt-0.5">{epubUrl}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEpubPreview(epubUrl)}
                          className="flex items-center justify-center gap-2 flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Preview
                        </button>
                        <a href={epubUrl} target="_blank" rel="noreferrer"
                          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium transition-colors border border-gray-700">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download
                        </a>
                      </div>
                    </div>
                  ) : <p className="text-xs text-gray-600">Not generated</p>}
                </div>

                {/* Video (full width if present) */}
                {videoUrl && (
                  <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
                      🎬 Video
                      {videoEntry && <span className="normal-case text-gray-600 ml-1">({videoEntry[0]})</span>}
                    </p>
                    <video controls src={videoUrl} className="w-full rounded-lg mb-2 max-h-72"
                      poster={r.metadata?.cover_url ?? undefined} />
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      {videoEntry?.[1]?.duration_seconds && (
                        <span>Duration: {Math.floor(videoEntry[1].duration_seconds / 60)}:{String(videoEntry[1].duration_seconds % 60).padStart(2, '0')}</span>
                      )}
                      {videoEntry?.[1]?.size_mb && <span>Size: {videoEntry[1].size_mb.toFixed(1)} MB</span>}
                      {videoEntry?.[1]?.provider && <span>Provider: {videoEntry[1].provider}</span>}
                      <a href={videoUrl} target="_blank" rel="noreferrer"
                        className="text-indigo-400 hover:underline ml-auto">Download ↗</a>
                    </div>
                  </div>
                )}

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

            {/* Full summaries — one card per language (original + translated) */}
            {r?.summaries && Object.entries(r.summaries).map(([key, s]) => (
              <div key={key} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Summary</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      s.language === 'ar' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-indigo-900/40 text-indigo-300'
                    }`}>
                      {(s.language || 'en').toUpperCase()}
                    </span>
                    {/* @ts-expect-error translated is an extra runtime flag */}
                    {s.translated && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300">translated</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-600">{s.word_count} words · {s.style}</span>
                </div>
                <p
                  dir={s.language === 'ar' ? 'rtl' : 'ltr'}
                  className={`text-sm text-gray-200 leading-relaxed whitespace-pre-wrap ${
                    s.language === 'ar' ? 'font-arabic' : ''
                  }`}
                >
                  {s.text}
                </p>
              </div>
            ))}

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

      {/* EPUB preview modal */}
      {epubPreview && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
            <span className="inline-block w-8 h-8 border-2 border-gray-600 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        }>
          <EpubReader url={epubPreview} onClose={() => setEpubPreview(null)} />
        </Suspense>
      )}
    </div>
  )
}
