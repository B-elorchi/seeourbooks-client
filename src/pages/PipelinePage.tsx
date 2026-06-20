import { useState, useRef, lazy, Suspense } from 'react'
import { usePipelineJobs, useJobStatus, useInvalidatePipeline } from '../hooks/usePipeline'
import { retryJob, rerunSteps, cancelJob, skipSteps, batchBackfillArabic, batchRegenPartial } from '../api/admin'
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
  done:    'bg-green-50 text-green-700 border-green-200',
  failed:  'bg-red-50 text-red-600 border-red-200',
  partial: 'bg-orange-50 text-orange-600 border-orange-200',
  skipped: 'bg-gray-100 text-gray-400 border-gray-200',
  running: 'bg-blue-50 text-blue-600 border-blue-200 animate-pulse',
}

const AR_RE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/

function isArabic(text: string) {
  return AR_RE.test(text)
}

function cleanErrorMessage(raw: string | null | undefined): string {
  const msg = String(raw ?? '').trim()
  if (!msg) return msg

  // Rate limit
  if (/429|rate.?limit|too many request/i.test(msg))
    return 'Rate limit reached — the AI provider is busy. Retry in a moment.'

  // Auth / API key
  if (/401|403|unauthorized|forbidden|invalid.?key|api.?key/i.test(msg))
    return 'AI provider authentication failed. Check your API key in Settings.'

  // Timeout
  if (/timeout|timed.?out|time.?out/i.test(msg))
    return 'Request timed out — the AI provider may be slow. Retry.'

  // Server / gateway errors
  if (/502|503|504|bad gateway|service unavailable|gateway/i.test(msg))
    return 'AI provider is temporarily unavailable. Retry in a moment.'
  if (/500|server.?error|internal.?error/i.test(msg))
    return 'AI provider returned a server error. Retry in a moment.'

  // Network / connection
  if (/econnrefused|enotfound|network|connection.?reset|connection.?refused/i.test(msg))
    return 'Could not reach the AI provider. Check the server internet connection.'

  // Context length
  if (/context.?length|token.?limit|maximum.?context|too.?long/i.test(msg))
    return 'Content is too long for the selected model. Try a shorter summary length.'

  // Strip raw API URLs and tidy up
  return msg
    .replace(/https?:\/\/\S+/g, '')           // remove URLs
    .replace(/openrouter[^:]*:\s*/i, '')       // remove "openrouter.ai: " prefix
    .replace(/^Error\s+\d+:\s*/i, '')          // remove "Error 429: " prefix
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 220) || msg.slice(0, 220)
}

// Split page content into paragraphs, filter obvious OCR artifacts (very short
// lines with no Arabic or meaningful Latin — e.g. "Gd", "Ob", "Ble").
function parseParagraphs(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map(s => s.replace(/\n/g, ' ').trim())
    .filter(s => {
      if (!s) return false
      // Keep if it has Arabic characters
      if (AR_RE.test(s)) return true
      // Keep Latin paragraphs with 4+ real words
      const words = s.split(/\s+/).filter(w => /[a-zA-Z0-9@.]{2,}/.test(w))
      return words.length >= 3
    })
}

function ExtractedTextReader({ pages, pageCount }: { pages: { page: number; content: string }[]; pageCount?: number }) {
  const [current, setCurrent] = useState(0)
  const [inputVal, setInputVal] = useState('1')
  const topRef = useRef<HTMLDivElement>(null)
  const total = pages.length
  const p = pages[current]
  const paragraphs = p ? parseParagraphs(p.content) : []
  const pageIsAr = paragraphs.length > 0 && isArabic(paragraphs[0])
  const totalChars = pages.reduce((acc, pg) => acc + pg.content.length, 0)

  function goTo(idx: number) {
    const clamped = Math.max(0, Math.min(total - 1, idx))
    setCurrent(clamped)
    setInputVal(String(clamped + 1))
    topRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  function copyAll() {
    navigator.clipboard.writeText(pages.map(pg => pg.content).join('\n\n'))
  }

  return (
    <div ref={topRef} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
        <div className="text-xs text-gray-500">
          <span className="font-medium text-gray-700">{pageCount ?? total} pages extracted</span>
          <span className="mx-1.5">·</span>
          {totalChars.toLocaleString()} characters
        </div>
        <button onClick={copyAll}
          className="text-xs text-indigo-600 hover:text-indigo-500 transition-colors font-medium">
          Copy all text
        </button>
      </div>

      {/* Page label */}
      <div className="flex items-center gap-2 px-6 pt-5 pb-3">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
          Page {p?.page ?? current + 1}
        </span>
        {pageIsAr && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">AR</span>
        )}
      </div>

      {/* Page content — paragraph-by-paragraph with per-paragraph RTL */}
      <div className="px-6 pb-6 min-h-48 space-y-4">
        {paragraphs.length === 0 ? (
          <p className="text-gray-400 italic text-sm">Empty page</p>
        ) : paragraphs.map((para, i) => {
          const ar = isArabic(para)
          return (
            <p
              key={i}
              dir={ar ? 'rtl' : 'ltr'}
              className={`text-sm text-gray-800 leading-[1.9] ${ar ? 'font-arabic text-right' : 'text-left'}`}
            >
              {para}
            </p>
          )
        })}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50">
        <button
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ← Prev
        </button>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>Page</span>
          <input
            type="number" min={1} max={total}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onBlur={() => goTo(Number(inputVal) - 1)}
            onKeyDown={e => e.key === 'Enter' && goTo(Number(inputVal) - 1)}
            className="w-12 text-center px-1 py-0.5 border border-gray-200 rounded text-xs"
          />
          <span>of {total}</span>
        </div>
        <button
          onClick={() => goTo(current + 1)}
          disabled={current >= total - 1}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  )
}

type StatusFilter = 'all' | 'running' | 'done' | 'failed'
type SourceFilter = 'all' | 'pdf_upload' | 'catalog' | 'custom_json'

const SOURCE_TABS: { key: SourceFilter; label: string; icon: string }[] = [
  { key: 'all',         label: 'All',     icon: '📋' },
  { key: 'pdf_upload',  label: 'PDF',     icon: '📄' },
  { key: 'catalog',     label: 'Catalog', icon: '📚' },
  { key: 'custom_json', label: 'JSON',    icon: '{}' },
]

const SOURCE_BADGE: Record<string, string> = {
  pdf_upload:  'bg-blue-50 text-blue-700 border-blue-200',
  catalog:     'bg-violet-50 text-violet-700 border-violet-200',
  custom_json: 'bg-amber-50 text-amber-700 border-amber-200',
}
const SOURCE_LABEL: Record<string, string> = {
  pdf_upload:  'PDF',
  catalog:     'Catalog',
  custom_json: 'JSON',
}

function jobSource(job: { input?: { source?: string } }): string {
  return job.input?.source ?? 'catalog'
}

const PAGE_SIZES = [25, 50, 100, 500] as const

export default function PipelinePage() {
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage]         = useState(0)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const isFiltered = statusFilter !== 'all'
  const { data: jobs = [], isLoading: loading, isFetching } = usePipelineJobs(
    pageSize,
    page * pageSize,
    isFiltered ? statusFilter : undefined,
  )
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

  // Batch operations (backfill Arabic / regen all partial)
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchMsg,     setBatchMsg]     = useState<string | null>(null)

  // EPUB preview modal
  const [epubPreview, setEpubPreview] = useState<string | null>(null)

  // List returns lightweight rows (metadata extracted, no full result).
  // Always fetch full detail via useJobStatus when a job is selected.
  const { data: detailedJob } = useJobStatus(selectedId)
  const selected = detailedJob || null
  const { invalidateAll } = useInvalidatePipeline()

  // Clear checkboxes whenever the selected job changes
  const prevSelectedId = useState<string | null>(null)
  if (prevSelectedId[0] !== selectedId) {
    prevSelectedId[1](selectedId)
    if (checkedSteps.size > 0) setCheckedSteps(new Set())
  }

  async function handleRetry(jobId: string, steps?: string[]) {
    setRetrying(true)
    setRetryMsg(null)
    try {
      if (steps && steps.length > 0) {
        await rerunSteps(jobId, steps, true)
        const label = steps.length === 1 ? steps[0] : `${steps.length} steps`
        setRetryMsg(`Queued: ${label} ✓`)
      } else {
        await retryJob(jobId)
        setRetryMsg('Queued ✓')
      }
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

  async function handleSkip(steps: string[]) {
    if (!selected || !steps.length) return
    setRegenRunning(true)
    setRegenMsg(null)
    try {
      const res = await skipSteps(selected.id, steps)
      const label = steps.length === 1 ? steps[0] : `${steps.length} steps`
      setRegenMsg(`Skipped ${label} → ${res.status} ✓`)
      setTimeout(() => setRegenMsg(null), 4000)
      setCheckedSteps(new Set())
      invalidateAll()
    } catch (err) {
      setRegenMsg(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRegenRunning(false)
    }
  }

  async function handleBackfillArabic() {
    if (batchRunning) return
    setBatchRunning(true)
    setBatchMsg('Scanning books…')
    try {
      const preview = await batchBackfillArabic(200, true)
      if (!preview.candidates) {
        setBatchMsg('No books need Arabic backfill ✓')
        return
      }
      if (!window.confirm(
        `${preview.candidates} book(s) have an English summary but no Arabic. ` +
        `Launch translate + Arabic audio for them?`
      )) {
        setBatchMsg(null)
        return
      }
      const res = await batchBackfillArabic(preview.candidates, false)
      setBatchMsg(`Queued Arabic backfill for ${res.enqueued ?? 0} book(s) ✓`)
      invalidateAll()
    } catch (err) {
      setBatchMsg(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBatchRunning(false)
      setTimeout(() => setBatchMsg(null), 6000)
    }
  }

  async function handleRegenPartial() {
    if (batchRunning) return
    const partialCount = jobs.filter(j => j.status === 'partial').length
    if (!window.confirm(
      `Re-run incomplete steps for ALL partial jobs${partialCount ? ` (${partialCount} shown)` : ''}? ` +
      `Already-done steps are skipped.`
    )) return
    setBatchRunning(true)
    setBatchMsg('Queuing partial jobs…')
    try {
      const res = await batchRegenPartial(500, false)
      setBatchMsg(`Re-queued ${res.enqueued} partial job(s) ✓`)
      invalidateAll()
    } catch (err) {
      setBatchMsg(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBatchRunning(false)
      setTimeout(() => setBatchMsg(null), 6000)
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

  const filteredJobs = jobs.filter(j => {
    if (sourceFilter !== 'all' && jobSource(j as { input?: { source?: string } }) !== sourceFilter) return false
    if (statusFilter === 'running' && j.status !== 'running' && j.status !== 'queued') return false
    if (statusFilter === 'done'    && j.status !== 'done') return false
    if (statusFilter === 'failed'  && j.status !== 'failed' && j.status !== 'partial' && j.status !== 'cancelled') return false
    return true
  })

  // Guard: result may be a raw JSON string on jobs stored before the JSONB codec fix.
  const rawResult = selected?.result
  const r: PipelineResult | undefined = (() => {
    if (!rawResult) return undefined
    if (typeof rawResult === 'string') {
      try { return JSON.parse(rawResult) as PipelineResult } catch { return undefined }
    }
    return rawResult as PipelineResult
  })()

  const epubUrl      = r?.epub      ? Object.values(r.epub)[0]?.url  : (r?.files?.epub ?? null)
  const videoEntry   = r?.video     ? Object.entries(r.video)[0]     : null
  const videoUrl     = videoEntry?.[1]?.url ?? r?.files?.video ?? null

  return (
    <div className="flex h-full">
      {/* ── Job list sidebar ─────────────────────────────────────────────── */}
      <div className="w-80 shrink-0 border-r border-gray-200 flex flex-col bg-white">
        {/* Header */}
        <div className="px-4 pt-4 pb-2 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Pipeline Jobs</h2>
          <div className="flex gap-1.5 text-xs mb-3">
            {([
              { key: 'all',     label: 'All',     color: 'text-gray-500',  active: 'bg-gray-200 text-gray-800',  count: jobs.length },
              { key: 'running', label: 'running', color: 'text-blue-600',  active: 'bg-blue-100 text-blue-700',  count: jobs.filter(j => j.status === 'running' || j.status === 'queued').length },
              { key: 'done',    label: 'done',    color: 'text-green-600', active: 'bg-green-100 text-green-700',count: jobs.filter(j => j.status === 'done').length },
              { key: 'failed',  label: 'failed',  color: 'text-red-500',   active: 'bg-red-100 text-red-700',   count: jobs.filter(j => j.status === 'failed' || j.status === 'partial' || j.status === 'cancelled').length },
            ] as { key: StatusFilter; label: string; color: string; active: string; count: number }[]).map(s => (
              <button
                key={s.key}
                onClick={() => { setStatusFilter(prev => prev === s.key ? 'all' : s.key); setPage(0) }}
                className={`px-2 py-0.5 rounded-full font-medium transition-colors ${
                  statusFilter === s.key ? s.active : `${s.color} hover:bg-gray-100`
                }`}
              >
                {s.count} {s.label}
              </button>
            ))}
          </div>
          {/* Source filter tabs */}
          <div className="grid grid-cols-4 gap-1">
            {SOURCE_TABS.map(tab => {
              const count = tab.key === 'all'
                ? jobs.length
                : jobs.filter(j => jobSource(j as { input?: { source?: string } }) === tab.key).length
              return (
                <button
                  key={tab.key}
                  onClick={() => setSourceFilter(tab.key)}
                  className={`flex flex-col items-center py-1.5 rounded-md text-[10px] font-medium transition-colors leading-tight ${
                    sourceFilter === tab.key
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="opacity-70">{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Job list */}
        <div className={`overflow-auto flex-1 transition-opacity ${isFetching && !loading ? 'opacity-60' : 'opacity-100'}`}>
          {loading && <p className="text-xs text-gray-500 p-4">Loading…</p>}
          {!loading && filteredJobs.length === 0 && (
            <p className="text-xs text-gray-400 p-4">No jobs in this category.</p>
          )}
          {filteredJobs.map(job => {
            // Lightweight list rows: metadata extracted server-side, no full result
            const meta = (job as unknown as { metadata?: { title?: string; author?: string } }).metadata
            const src = jobSource(job as { input?: { source?: string } })
            const srcBadge = SOURCE_BADGE[src]
            const srcLabel = SOURCE_LABEL[src]
            return (
              <button key={job.id} onClick={() => setSelectedId(job.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  selectedId === job.id ? 'bg-indigo-50' : ''
                }`}>
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="text-xs font-medium text-gray-800 truncate flex-1">
                    {meta?.title ?? job.book_id}
                  </span>
                  <StatusBadge status={job.status} />
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {srcLabel && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${srcBadge}`}>
                      {srcLabel}
                    </span>
                  )}
                  <span className="truncate">{meta?.author ?? '—'}</span>
                  <span>·</span>
                  <span className="shrink-0">{timeAgo(job.created_at)}</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Pagination controls — hidden when a status filter is active (server returns all matches) */}
        <div className={`border-t border-gray-200 px-3 py-2 flex items-center gap-2 bg-white shrink-0 ${isFiltered ? 'hidden' : ''}`}>
          <button
            disabled={page === 0}
            onClick={() => { setPage(p => p - 1); setSelectedId(null) }}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <i className="ti ti-chevron-left text-sm" />
          </button>
          <span className="text-[10px] text-gray-400 flex-1 text-center">
            {page * pageSize + 1}–{page * pageSize + jobs.length}
          </span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(0); setSelectedId(null) }}
            className="text-[10px] border border-gray-200 rounded px-1 py-0.5 text-gray-600 bg-white focus:outline-none"
          >
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
          </select>
          <button
            disabled={jobs.length < pageSize}
            onClick={() => { setPage(p => p + 1); setSelectedId(null) }}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <i className="ti ti-chevron-right text-sm" />
          </button>
        </div>
      </div>

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6">
        {/* Batch actions toolbar — always visible */}
        <div className="mb-5 flex items-center gap-2 flex-wrap">
          <button
            onClick={handleBackfillArabic}
            disabled={batchRunning}
            title="Find catalog books that have an English summary but no Arabic one, and run translate + Arabic audio for them (reuses the existing summary — no re-summarization)."
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
          >
            {batchRunning
              ? <span className="inline-block w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
              : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>}
            Backfill Arabic (missing)
          </button>
          <button
            onClick={handleRegenPartial}
            disabled={batchRunning}
            title="Re-run incomplete steps for every job stuck in 'partial' status. Already-done steps are skipped."
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8 8 0 01-14.83-3M14.418 15H20" /></svg>
            Regen all partial
          </button>
          {batchMsg && (
            <span className={`text-xs ${batchMsg.startsWith('Error') ? 'text-red-600' : 'text-emerald-700'}`}>
              {batchMsg}
            </span>
          )}
        </div>

        {!selected && (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            Select a job to view details
          </div>
        )}

        {selected && (
          <div className="w-full space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-gray-900">
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
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
                    {selected.retry_count}/{selected.max_retries} retries
                  </span>
                )}
                {(selected.status === 'running' || selected.status === 'queued') && (
                  <div className="flex items-center gap-2">
                    {cancelMsg && (
                      <span className={`text-xs ${cancelMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
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
                        <span className={`text-xs ${retryMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                          {retryMsg}
                        </span>
                      )}
                      <button
                        onClick={() => handleRetry(selected.id, failedSteps)}
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
                <div className="bg-white border border-gray-200 rounded-xl p-4">
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
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Steps</p>
                      {checkedSteps.size > 0 && (
                        <span className="text-[11px] text-indigo-600">{checkedSteps.size} selected</span>
                      )}
                    </div>

                    {/* Action buttons */}
                    {!isBusy && (
                      <div className="flex items-center gap-2">
                        {regenMsg && (
                          <span className={`text-xs ${regenMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
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
                        {/* Skip Selected — mark steps as skipped (e.g. failed optional steps) */}
                        {checkedSteps.size > 0 && (
                          <button
                            onClick={() => handleSkip([...checkedSteps])}
                            disabled={regenRunning}
                            title="Mark the selected steps as skipped and recompute the job status (use for optional steps that failed, e.g. on insufficient credits)"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                            </svg>
                            Skip {checkedSteps.size} step{checkedSteps.size > 1 ? 's' : ''}
                          </button>
                        )}
                        {/* Regen All */}
                        <button
                          onClick={() => handleRegen(allStepKeys)}
                          disabled={regenRunning}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 hover:text-white text-xs font-medium transition-colors border border-gray-200 hover:border-indigo-500"
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
                      const errMsg = r.errors?.[step as keyof typeof r.errors] as string | undefined
                      return (
                        <label
                          key={step}
                          title={errMsg ?? undefined}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer select-none transition-all ${
                            isBusy ? 'cursor-default opacity-60' : 'hover:brightness-125'
                          } ${
                            isChecked
                              ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-white ' + (STEP_COLORS[s] ?? 'bg-gray-100 text-gray-500 border-gray-200')
                              : STEP_COLORS[s] ?? 'bg-gray-100 text-gray-500 border-gray-200'
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
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{step}</p>
                            <p className="text-[10px] opacity-60 capitalize">{s}</p>
                            {errMsg && (s === 'failed' || s === 'partial') && (
                              <p className="text-[10px] text-red-600 mt-0.5 leading-tight line-clamp-2 break-words">
                                {cleanErrorMessage(errMsg)}
                              </p>
                            )}
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

            {/* Step errors — shown immediately after the steps panel */}
            {r?.errors && Object.keys(r.errors).length > 0 && (() => {
              // Show step-level errors; filter per-chapter audio/mindmap noise (audio_chapter_0 etc.)
              // but keep audio_blocked and other meaningful keys.
              const stepErrors = Object.entries(r.errors).filter(([k]) =>
                !/^(audio|mindmap|video)_chapter_\d+$/.test(k)
              )
              if (!stepErrors.length) return null
              return (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-red-700 uppercase tracking-wide mb-2">Step Errors</p>
                  <div className="space-y-1.5">
                    {stepErrors.map(([step, msg]) => (
                      <div key={step}>
                        <span className="text-xs font-semibold text-red-700 capitalize">
                          {step.replace(/_/g, ' ')}:{' '}
                        </span>
                        <span className="text-xs text-red-600">{cleanErrorMessage(String(msg))}</span>
                      </div>
                    ))}
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
                <div className={`rounded-xl p-4 border ${ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Summary Coverage Check</p>
                    {qa.model && <span className="text-[11px] text-gray-500 font-mono">{qa.model}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-3xl font-bold ${ok ? 'text-emerald-600' : 'text-red-600'}`}>{qa.score}%</span>
                    <div className="flex-1">
                      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
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
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Quick Summary</p>
                <p className="text-sm text-gray-700 leading-relaxed">{r.quick_summary}</p>
              </div>
            )}

            {/* Assets grid */}
            {r && (
              <div className="grid grid-cols-2 gap-4">

                {/* Cover */}
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">🖼 Cover</p>
                  {r.metadata?.cover_url ? (
                    <>
                      <img src={r.metadata.cover_url} alt={r.metadata.cover_alt_text ?? ''}
                        className="w-full rounded-lg mb-2 object-cover max-h-64" />
                      {r.metadata.cover_alt_text && (
                        <p className="text-xs text-gray-500 leading-relaxed mb-2">{r.metadata.cover_alt_text}</p>
                      )}
                      <a href={r.metadata.cover_url} target="_blank" rel="noreferrer"
                        className="text-xs text-indigo-600 hover:underline">Open image ↗</a>
                    </>
                  ) : <p className="text-xs text-gray-400">Not generated</p>}
                </div>

                {/* Full Audio — one player per language */}
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">🔊 Full Audio</p>
                  {r?.audio && Object.keys(r.audio).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(r.audio).map(([key, a]) => {
                        const lang = key.replace('full_', '').toUpperCase()
                        return (
                          <div key={key}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                lang === 'AR' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              }`}>{lang}</span>
                              {a.duration && <span className="text-xs text-gray-500">{a.duration}</span>}
                            </div>
                            <audio controls src={a.url} className="w-full" style={{ accentColor: '#6366f1' }} />
                            <a href={a.url} target="_blank" rel="noreferrer"
                              className="text-[11px] text-indigo-600 hover:underline mt-1 inline-block">Download MP3 ↗</a>
                          </div>
                        )
                      })}
                    </div>
                  ) : <p className="text-xs text-gray-400">Not generated</p>}
                </div>

                {/* Mind Map */}
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">🗺 Mind Map</p>
                  {r.mindmap?.url ? (
                    <>
                      <div className="aspect-video bg-gray-100 rounded-lg mb-2 overflow-hidden">
                        <iframe src={r.mindmap.url} title="Mind map" className="w-full h-full border-0" />
                      </div>
                      <a href={r.mindmap.url} target="_blank" rel="noreferrer"
                        className="text-xs text-indigo-600 hover:underline">Open ↗</a>
                    </>
                  ) : <p className="text-xs text-gray-400">Not generated</p>}
                </div>

                {/* EPUB */}
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">📚 EPUB</p>
                  {epubUrl ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <svg className="w-8 h-8 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-800 font-medium truncate">
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
                          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium transition-colors border border-gray-200">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download
                        </a>
                      </div>
                    </div>
                  ) : <p className="text-xs text-gray-400">Not generated</p>}
                </div>

                {/* Video (full width if present) */}
                {videoUrl && (
                  <div className="col-span-2 bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
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
                        className="text-indigo-600 hover:underline ml-auto">Download ↗</a>
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* Full summaries — one card per language (original + translated) */}
            {r?.summaries && Object.entries(r.summaries).map(([key, s]) => (
              <div key={key} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Summary</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      s.language === 'ar' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    }`}>
                      {(s.language || 'en').toUpperCase()}
                    </span>
                    {/* @ts-expect-error translated is an extra runtime flag */}
                    {s.translated && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">translated</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{s.word_count} words · {s.style}</span>
                </div>
                <p
                  dir={s.language === 'ar' ? 'rtl' : 'ltr'}
                  className={`text-sm text-gray-700 leading-relaxed whitespace-pre-wrap ${
                    s.language === 'ar' ? 'font-arabic' : ''
                  }`}
                >
                  {s.text}
                </p>
              </div>
            ))}

            {/* Chapters — title + read time only. Per-chapter summary text and
                per-chapter audio are persisted in the DB for downstream use, but
                not displayed in the client UI (only the full-book summary is). */}
            {r?.chapters && r.chapters.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                  Chapters ({r.chapters.length})
                </p>
                <div className="space-y-1 max-h-96 overflow-auto">
                  {r.chapters.map(ch => (
                    <div key={ch.index} className="flex items-center justify-between py-2 px-3 rounded-lg text-sm text-gray-700">
                      <span className="font-medium truncate">{ch.title}</span>
                      <span className="text-xs text-gray-500 shrink-0 ml-3">~{ch.read_time_min} min</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Extracted text reader */}
            {r?.extracted_pages && r.extracted_pages.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">📄 Extracted Text</p>
                <ExtractedTextReader
                  pages={r.extracted_pages}
                  pageCount={r.page_count_extracted}
                />
              </div>
            )}

            {/* Raw JSON */}
            <details className="bg-white border border-gray-200 rounded-xl p-4">
              <summary className="text-xs text-gray-500 cursor-pointer">View full output JSON</summary>
              <pre className="mt-3 text-xs text-gray-600 bg-gray-50 p-3 rounded-lg overflow-auto max-h-96">
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
