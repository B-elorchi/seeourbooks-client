/**
 * Documents page — OCR + AI structured extraction pipeline.
 *
 * Left:  list of uploaded PDFs with status badge + upload button
 * Right: selected document's details — status, summary, structured JSON,
 *        and a preview of the extracted text per page.
 *
 * Polling: the selected document is polled every 3s while it's in a
 * non-terminal status (uploaded / processing / ocr_completed / text_extracted /
 * ai_processed).  The poll automatically stops when it reaches `completed` or
 * `failed`.  When polling completes, the full list is also refreshed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  listDocuments, uploadDocument, startProcessing,
  getDocumentStatus, getDocumentText, getDocumentSummary, getDocumentStructured,
  type DocumentListItem, type DocumentStatus,
  type DocumentTextResponse, type DocumentSummary, type DocumentStructured,
} from '../api/documents'

// Progress that the UI should display, derived from status when the
// backend hasn't filled it in yet.  Makes the bar feel responsive even
// before the first real progress write lands.
const STAGE_PROGRESS: Record<string, number> = {
  uploaded:       2,
  processing:     8,
  ocr_completed:  30,
  text_extracted: 55,
  ai_processed:   85,
  completed:      100,
  failed:         100,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  uploaded:        'bg-gray-800 text-gray-400 border border-gray-700',
  processing:      'bg-blue-900/40 text-blue-300 border border-blue-800 animate-pulse',
  ocr_completed:   'bg-blue-900/40 text-blue-300 border border-blue-800 animate-pulse',
  text_extracted:  'bg-blue-900/40 text-blue-300 border border-blue-800 animate-pulse',
  ai_processed:    'bg-blue-900/40 text-blue-300 border border-blue-800 animate-pulse',
  completed:       'bg-green-900/40 text-green-300 border border-green-800',
  failed:          'bg-red-900/40 text-red-300 border border-red-800',
}

const TERMINAL_STATES = new Set(['completed', 'failed'])

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  return `${Math.floor(m / 1440)}d ago`
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? STATUS_COLORS.uploaded
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wide ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const [docs, setDocs]               = useState<DocumentListItem[]>([])
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [uploading, setUploading]     = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Selected document details — fetched on selection + on poll tick
  const [status,     setStatus]     = useState<DocumentStatus | null>(null)
  const [summary,    setSummary]    = useState<DocumentSummary | null>(null)
  const [structured, setStructured] = useState<DocumentStructured | null>(null)
  const [pages,      setPages]      = useState<DocumentTextResponse | null>(null)
  const [tab,        setTab]        = useState<'summary' | 'structured' | 'pages'>('summary')
  const [retrying,   setRetrying]   = useState(false)
  const [retryMsg,   setRetryMsg]   = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  // Refs that the polling interval reads — using state in the interval's
  // closure traps the initial value forever, so we read from a ref instead.
  const statusRef = useRef<DocumentStatus | null>(null)
  useEffect(() => { statusRef.current = status }, [status])
  const pagesLoadedRef = useRef(false)
  useEffect(() => { pagesLoadedRef.current = pages !== null }, [pages])

  // ── Load the list ───────────────────────────────────────────────────────────
  const reloadList = useCallback(async () => {
    try {
      const data = await listDocuments(100)
      setDocs(data.documents)
    } catch { /* silent — keep previous state */ }
  }, [])

  useEffect(() => { void reloadList() }, [reloadList])

  // ── Auto-select first document on load ─────────────────────────────────────
  useEffect(() => {
    if (!selectedId && docs.length > 0) setSelectedId(docs[0].id)
  }, [docs, selectedId])

  // ── Selected-document polling ──────────────────────────────────────────────
  // Polls /status every 3s.  Reads CURRENT status from a ref (not the captured
  // state in the closure) so the "stop on terminal" check actually works.
  // Lazily fetches summary/structured/pages once each stage is reached.
  useEffect(() => {
    if (!selectedId) return

    let cancelled = false

    async function loadDetails(id: string) {
      try {
        const s = await getDocumentStatus(id)
        if (cancelled) return
        setStatus(s)

        // Fetch heavy assets only when they're ready
        if (['ai_processed', 'completed'].includes(s.status)) {
          try {
            const [sum, str] = await Promise.all([
              getDocumentSummary(id).catch(() => null),
              getDocumentStructured(id).catch(() => null),
            ])
            if (!cancelled) {
              if (sum) setSummary(sum)
              if (str) setStructured(str)
            }
          } catch { /* ignore */ }
        }
        if (['text_extracted', 'ai_processed', 'completed'].includes(s.status)
            && !pagesLoadedRef.current) {
          try {
            const p = await getDocumentText(id)
            if (!cancelled) setPages(p)
          } catch { /* ignore */ }
        }
      } catch { /* silent */ }
    }

    // Reset details whenever selection changes
    setStatus(null)
    setSummary(null)
    setStructured(null)
    setPages(null)
    statusRef.current = null
    pagesLoadedRef.current = false

    void loadDetails(selectedId)

    const interval = setInterval(() => {
      // Read CURRENT status from ref — closure state is stale here
      const current = statusRef.current
      if (current && TERMINAL_STATES.has(current.status)) return
      void loadDetails(selectedId)
    }, 3000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // Refresh list while non-terminal so badges keep up
  useEffect(() => {
    if (!status || TERMINAL_STATES.has(status.status)) return
    const id = setInterval(reloadList, 4000)
    return () => clearInterval(id)
  }, [status, reloadList])

  // ── Retry handler ──────────────────────────────────────────────────────────
  // Calls POST /api/documents/{id}/process — the processor is idempotent, so
  // re-invoking it resumes from whatever stage was last completed in the
  // documents row (status → uploaded / ocr_completed / text_extracted / ...).
  async function handleRetry(id: string) {
    setRetrying(true)
    setRetryMsg(null)
    try {
      await startProcessing(id)
      setRetryMsg('Re-queued ✓')
      // Reset detail-cache so the user immediately sees fresh polling
      setStatus(null)
      setSummary(null)
      setStructured(null)
      setPages(null)
      statusRef.current = null
      pagesLoadedRef.current = false
      await reloadList()
      setTimeout(() => setRetryMsg(null), 3000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // 409 means it's already processing — surface that nicely
      if (msg.includes('already processing') || msg.includes('409')) {
        setRetryMsg('Already processing — polling will resume')
      } else {
        setRetryMsg(`Error: ${msg.slice(0, 120)}`)
      }
      setTimeout(() => setRetryMsg(null), 5000)
    } finally {
      setRetrying(false)
    }
  }

  // ── Upload handler ─────────────────────────────────────────────────────────
  async function handleUpload(file: File) {
    setUploadError(null)
    setUploading(true)
    try {
      const { documentId } = await uploadDocument(file)
      // Immediately kick off processing — the spec says these are two calls,
      // but for the UI we want one-click upload-and-process.
      try { await startProcessing(documentId) } catch { /* keep going */ }
      await reloadList()
      setSelectedId(documentId)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const selectedDoc = useMemo(
    () => docs.find(d => d.id === selectedId) ?? null,
    [docs, selectedId],
  )

  return (
    <div className="flex h-screen">
      {/* ── Sidebar: upload + list ─────────────────────────────────────────── */}
      <div className="w-80 shrink-0 border-r border-gray-800 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-200">Documents</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            OCR + AI structured extraction for PDFs.
          </p>
        </div>

        {/* Upload */}
        <div className="p-4 border-b border-gray-800 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            disabled={uploading}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) void handleUpload(f)
            }}
            className="block w-full text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 file:cursor-pointer file:disabled:opacity-50"
          />
          {uploading && (
            <p className="text-[11px] text-blue-300 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 border border-blue-300/40 border-t-blue-300 rounded-full animate-spin" />
              Uploading + starting processing…
            </p>
          )}
          {uploadError && (
            <p className="text-[11px] text-red-300 break-all bg-red-950/30 border border-red-900/40 rounded-lg p-2">
              {uploadError}
            </p>
          )}
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-auto">
          {docs.length === 0 && (
            <p className="text-xs text-gray-600 p-4">No documents yet — upload a PDF above.</p>
          )}
          {docs.map(doc => (
            <button
              key={doc.id}
              onClick={() => setSelectedId(doc.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors ${
                selectedId === doc.id ? 'bg-gray-800' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-gray-200 truncate" title={doc.original_filename}>
                  {doc.original_filename}
                </span>
                <StatusBadge status={doc.status} />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                {doc.page_count != null && <span>{doc.page_count} pages</span>}
                {doc.page_count != null && <span>·</span>}
                <span>{timeAgo(doc.created_at)}</span>
                {doc.progress > 0 && doc.progress < 100 && (
                  <>
                    <span>·</span>
                    <span className="text-blue-400">{doc.progress}%</span>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main: selected document details ───────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {!selectedDoc && (
          <div className="h-full flex items-center justify-center text-gray-600 text-sm">
            Pick a document from the left, or upload one to begin.
          </div>
        )}

        {selectedDoc && (
          <div className="p-6 max-w-4xl mx-auto space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-gray-100 break-all">
                  {selectedDoc.original_filename}
                </h1>
                <p className="text-xs text-gray-500 font-mono mt-1">{selectedDoc.id}</p>
              </div>
              {status && <StatusBadge status={status.status} />}
            </div>

            {/* Progress bar — always visible (more useful than hiding it on terminal) */}
            {status && (() => {
              const isFailed   = status.status === 'failed'
              const isComplete = status.status === 'completed'
              // Use backend's progress, else fall back to the stage's nominal %
              const pct = status.progress > 0
                ? status.progress
                : (STAGE_PROGRESS[status.status] ?? 0)
              const barColor = isFailed
                ? 'bg-red-500'
                : isComplete
                  ? 'bg-green-500'
                  : 'bg-indigo-500'
              return (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                    <span className="uppercase tracking-wide">
                      {isFailed ? 'Failed at stage' : isComplete ? 'Done' : 'Processing'}
                    </span>
                    <span className={`font-mono ${
                      isFailed ? 'text-red-400'
                        : isComplete ? 'text-green-400'
                        : 'text-blue-400'
                    }`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {['uploaded','processing','ocr_completed','text_extracted','ai_processed','completed'].map(s => {
                      const isCurrent = s === status.status
                      const hasPassed = stagePassed(s, status.status) || isComplete
                      return (
                        <span key={s}
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                            isCurrent && isFailed
                              ? 'bg-red-900/60 text-red-200 border border-red-700'
                              : isCurrent
                                ? 'bg-blue-900/60 text-blue-200 border border-blue-700'
                                : hasPassed
                                  ? 'bg-green-900/30 text-green-400 border border-green-800/30'
                                  : 'bg-gray-800 text-gray-600 border border-gray-700'
                          }`}>
                          {s}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Stats grid */}
            {status && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Pages"    value={status.page_count != null ? String(status.page_count) : '—'} />
                <Stat label="Language" value={status.language ? status.language.toUpperCase() : '—'} />
                <Stat label="Status"   value={status.status} mono />
                <Stat label="Progress" value={`${status.progress}%`} />
              </div>
            )}

            {/* Failure banner + Retry button */}
            {status?.status === 'failed' && (
              <div className="bg-red-950/40 border border-red-900/50 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-xs font-medium text-red-400 uppercase tracking-wide">
                    Processing failed
                  </p>
                  <button
                    onClick={() => handleRetry(selectedDoc.id)}
                    disabled={retrying}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-800/60 border border-red-800 text-red-200 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {retrying ? (
                      <span className="inline-block w-3 h-3 border border-red-300/40 border-t-red-300 rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m0 0a8 8 0 0114.83 2.999M4.582 9H9m11 11v-5h-.581m0 0a8 8 0 01-14.83-3M14.418 15H20" />
                      </svg>
                    )}
                    {retrying ? 'Retrying…' : 'Retry processing'}
                  </button>
                </div>
                {status.error_message && (
                  <p className="text-xs text-red-300 break-words font-mono leading-relaxed">
                    {status.error_message}
                  </p>
                )}
                {retryMsg && (
                  <p className="text-[11px] text-green-400 mt-2">{retryMsg}</p>
                )}
              </div>
            )}

            {/* Action bar for non-failed docs: lets users force a re-run */}
            {status && status.status !== 'failed' && (
              <div className="flex items-center justify-end gap-3">
                {retryMsg && (
                  <p className="text-[11px] text-green-400">{retryMsg}</p>
                )}
                <button
                  onClick={() => handleRetry(selectedDoc.id)}
                  disabled={retrying || (status.status !== 'completed' && status.status !== 'uploaded')}
                  title={
                    status.status === 'completed' ? 'Re-run AI analysis from scratch'
                    : status.status === 'uploaded' ? 'Start processing'
                    : 'Already in progress'
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {retrying ? (
                    <span className="inline-block w-3 h-3 border border-current/40 border-t-current rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m0 0a8 8 0 0114.83 2.999M4.582 9H9m11 11v-5h-.581m0 0a8 8 0 01-14.83-3M14.418 15H20" />
                    </svg>
                  )}
                  {status.status === 'uploaded' ? 'Start processing' : 'Re-run'}
                </button>
              </div>
            )}

            {/* Tabs */}
            {status && status.status !== 'uploaded' && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="flex gap-0.5 border-b border-gray-800">
                  {([
                    ['summary',    'Summary',         !!summary],
                    ['structured', 'Structured JSON', !!structured],
                    ['pages',      `Pages (${pages?.pages.length ?? 0})`, !!pages?.pages.length],
                  ] as const).map(([key, label, ready]) => (
                    <button
                      key={key}
                      onClick={() => setTab(key)}
                      className={`px-4 py-2.5 text-xs font-medium transition-colors ${
                        tab === key
                          ? 'bg-gray-800 text-gray-100'
                          : ready
                            ? 'text-gray-400 hover:text-gray-100'
                            : 'text-gray-600 cursor-not-allowed'
                      }`}
                      disabled={!ready}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="p-4">
                  {tab === 'summary' && (
                    summary ? (
                      <div>
                        <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-2">
                          {summary.provider && (
                            <span className="px-1.5 py-0.5 rounded-full bg-indigo-900/40 text-indigo-300 border border-indigo-800 font-mono">
                              {summary.provider}
                            </span>
                          )}
                          {summary.model && <span className="font-mono">{summary.model}</span>}
                        </div>
                        <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                          {summary.summary || '(no summary text)'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600">Summary not generated yet.</p>
                    )
                  )}

                  {tab === 'structured' && (
                    structured ? (
                      <div className="space-y-4">
                        <Field label="Title"    value={structured.title} />
                        <Field label="Authors"  value={(structured.authors as string[]).join(', ')} />
                        <ListField label="Topics"   items={structured.topics as string[]} />
                        <ListField label="Keywords" items={structured.keywords as string[]} />
                        <ListField label="Entities" items={(structured.entities as { name: string; type?: string }[]).map(e => `${e.name}${e.type ? ` (${e.type})` : ''}`)} />
                        <details className="mt-4">
                          <summary className="text-[11px] text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-300">
                            Raw JSON
                          </summary>
                          <pre className="text-[11px] text-gray-300 bg-gray-950 border border-gray-800 rounded p-3 overflow-auto max-h-96 mt-2 font-mono">
                            {JSON.stringify(structured.raw, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600">Structured analysis not generated yet.</p>
                    )
                  )}

                  {tab === 'pages' && (
                    pages?.pages.length ? (
                      <div className="space-y-3 max-h-[600px] overflow-auto">
                        {pages.pages.slice(0, 20).map(p => (
                          <div key={p.page} className="border-l-2 border-indigo-800 pl-3">
                            <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                              Page {p.page}
                            </p>
                            <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap line-clamp-12 max-h-48 overflow-hidden">
                              {p.content}
                            </p>
                          </div>
                        ))}
                        {pages.pages.length > 20 && (
                          <p className="text-[11px] text-gray-600 text-center">
                            Showing first 20 of {pages.pages.length} pages.
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600">Pages not extracted yet.</p>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Stage progression helper ─────────────────────────────────────────────────

function stagePassed(stage: string, currentStatus: string): boolean {
  const order = ['uploaded','processing','ocr_completed','text_extracted','ai_processed','completed']
  return order.indexOf(stage) < order.indexOf(currentStatus)
}

// ── Small presentation helpers ───────────────────────────────────────────────

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-sm text-gray-200 ${mono ? 'font-mono' : 'font-medium'}`}>{value}</p>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value || value === '— ') return null
  return (
    <div>
      <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-gray-200">{value}</p>
    </div>
  )
}

function ListField({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={`${item}-${i}`}
            className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
