/**
 * Documents page — OCR + AI structured extraction pipeline.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  listDocuments, uploadDocument, startProcessing,
  getDocumentStatus, getDocumentText, getDocumentSummary, getDocumentStructured,
  type DocumentListItem, type DocumentStatus,
  type DocumentTextResponse, type DocumentSummary, type DocumentStructured,
} from '../api/documents'

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
  uploaded:        'bg-gray-100 text-gray-500 border border-gray-200',
  processing:      'bg-blue-50 text-blue-600 border border-blue-200 animate-pulse',
  ocr_completed:   'bg-blue-50 text-blue-600 border border-blue-200 animate-pulse',
  text_extracted:  'bg-blue-50 text-blue-600 border border-blue-200 animate-pulse',
  ai_processed:    'bg-blue-50 text-blue-600 border border-blue-200 animate-pulse',
  completed:       'bg-green-50 text-green-700 border border-green-200',
  failed:          'bg-red-50 text-red-600 border border-red-200',
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

  const [status,     setStatus]     = useState<DocumentStatus | null>(null)
  const [summary,    setSummary]    = useState<DocumentSummary | null>(null)
  const [structured, setStructured] = useState<DocumentStructured | null>(null)
  const [pages,      setPages]      = useState<DocumentTextResponse | null>(null)
  const [tab,        setTab]        = useState<'summary' | 'read' | 'structured' | 'pages'>('summary')
  const [retrying,   setRetrying]   = useState(false)
  const [retryMsg,   setRetryMsg]   = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const statusRef = useRef<DocumentStatus | null>(null)
  useEffect(() => { statusRef.current = status }, [status])
  const pagesLoadedRef = useRef(false)
  useEffect(() => { pagesLoadedRef.current = pages !== null }, [pages])

  const reloadList = useCallback(async () => {
    try {
      const data = await listDocuments(100)
      setDocs(data.documents)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { void reloadList() }, [reloadList])

  useEffect(() => {
    if (!selectedId && docs.length > 0) setSelectedId(docs[0].id)
  }, [docs, selectedId])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false

    async function loadDetails(id: string) {
      try {
        const s = await getDocumentStatus(id)
        if (cancelled) return
        setStatus(s)

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

    setStatus(null); setSummary(null); setStructured(null); setPages(null)
    statusRef.current = null; pagesLoadedRef.current = false

    void loadDetails(selectedId)

    const interval = setInterval(() => {
      const current = statusRef.current
      if (current && TERMINAL_STATES.has(current.status)) return
      void loadDetails(selectedId)
    }, 3000)

    return () => { cancelled = true; clearInterval(interval) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  useEffect(() => {
    if (!status || TERMINAL_STATES.has(status.status)) return
    const id = setInterval(reloadList, 4000)
    return () => clearInterval(id)
  }, [status, reloadList])

  async function handleRetry(id: string) {
    setRetrying(true); setRetryMsg(null)
    try {
      await startProcessing(id)
      setRetryMsg('Re-queued ✓')
      setStatus(null); setSummary(null); setStructured(null); setPages(null)
      statusRef.current = null; pagesLoadedRef.current = false
      await reloadList()
      setTimeout(() => setRetryMsg(null), 3000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('already processing') || msg.includes('409')) {
        setRetryMsg('Already processing — polling will resume')
      } else {
        setRetryMsg(`Error: ${msg.slice(0, 120)}`)
      }
      setTimeout(() => setRetryMsg(null), 5000)
    } finally { setRetrying(false) }
  }

  async function handleUpload(file: File) {
    setUploadError(null); setUploading(true)
    try {
      const { documentId } = await uploadDocument(file)
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
    <div className="flex h-full bg-white">
      {/* ── Sidebar ── */}
      <div className="w-80 shrink-0 border-r border-gray-200 flex flex-col bg-white">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Documents</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">OCR + AI structured extraction for PDFs.</p>
        </div>

        <div className="p-4 border-b border-gray-200 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            disabled={uploading}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) void handleUpload(f)
            }}
            className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 file:cursor-pointer file:disabled:opacity-50"
          />
          {uploading && (
            <p className="text-[11px] text-blue-600 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 border border-blue-400/40 border-t-blue-600 rounded-full animate-spin" />
              Uploading + starting processing…
            </p>
          )}
          {uploadError && (
            <p className="text-[11px] text-red-600 break-all bg-red-50 border border-red-200 rounded-lg p-2">
              {uploadError}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {docs.length === 0 && (
            <p className="text-xs text-gray-400 p-4">No documents yet — upload a PDF above.</p>
          )}
          {docs.map(doc => (
            <button
              key={doc.id}
              onClick={() => setSelectedId(doc.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                selectedId === doc.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-gray-800 truncate" title={doc.original_filename}>
                  {doc.original_filename}
                </span>
                <StatusBadge status={doc.status} />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                {doc.page_count != null && <span>{doc.page_count} pages</span>}
                {doc.page_count != null && <span>·</span>}
                <span>{timeAgo(doc.created_at)}</span>
                {doc.progress > 0 && doc.progress < 100 && (
                  <><span>·</span><span className="text-blue-600">{doc.progress}%</span></>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main panel ── */}
      <div className="flex-1 overflow-auto">
        {!selectedDoc && (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            Pick a document from the left, or upload one to begin.
          </div>
        )}

        {selectedDoc && (
          <div className="p-6 max-w-4xl mx-auto space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-gray-900 break-all">
                  {selectedDoc.original_filename}
                </h1>
                <p className="text-xs text-gray-400 font-mono mt-1">{selectedDoc.id}</p>
              </div>
              {status && <StatusBadge status={status.status} />}
            </div>

            {/* Progress bar */}
            {status && (() => {
              const isFailed   = status.status === 'failed'
              const isComplete = status.status === 'completed'
              const pct = status.progress > 0
                ? status.progress
                : (STAGE_PROGRESS[status.status] ?? 0)
              const barColor = isFailed ? 'bg-red-500' : isComplete ? 'bg-green-500' : 'bg-indigo-500'
              return (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                    <span className="uppercase tracking-wide">
                      {isFailed ? 'Failed at stage' : isComplete ? 'Done' : 'Processing'}
                    </span>
                    <span className={`font-mono ${isFailed ? 'text-red-500' : isComplete ? 'text-green-600' : 'text-blue-600'}`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {['uploaded','processing','ocr_completed','text_extracted','ai_processed','completed'].map(s => {
                      const isCurrent = s === status.status
                      const hasPassed = stagePassed(s, status.status) || isComplete
                      return (
                        <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          isCurrent && isFailed
                            ? 'bg-red-50 text-red-600 border border-red-200'
                            : isCurrent
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : hasPassed
                                ? 'bg-green-50 text-green-600 border border-green-200'
                                : 'bg-gray-100 text-gray-400 border border-gray-200'
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

            {/* Failure banner */}
            {status?.status === 'failed' && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Processing failed</p>
                  <button
                    onClick={() => handleRetry(selectedDoc.id)}
                    disabled={retrying}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-red-50 border border-red-200 text-red-600 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {retrying ? (
                      <span className="inline-block w-3 h-3 border border-red-400/40 border-t-red-600 rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m0 0a8 8 0 0114.83 2.999M4.582 9H9m11 11v-5h-.581m0 0a8 8 0 01-14.83-3M14.418 15H20" />
                      </svg>
                    )}
                    {retrying ? 'Retrying…' : 'Retry processing'}
                  </button>
                </div>
                {status.error_message && (
                  <p className="text-xs text-red-500 break-words font-mono leading-relaxed">{status.error_message}</p>
                )}
                {retryMsg && <p className="text-[11px] text-green-600 mt-2">{retryMsg}</p>}
              </div>
            )}

            {/* Re-run for non-failed */}
            {status && status.status !== 'failed' && (
              <div className="flex items-center justify-end gap-3">
                {retryMsg && <p className="text-[11px] text-green-600">{retryMsg}</p>}
                <button
                  onClick={() => handleRetry(selectedDoc.id)}
                  disabled={retrying || (status.status !== 'completed' && status.status !== 'uploaded')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {retrying ? (
                    <span className="inline-block w-3 h-3 border border-gray-300 border-t-gray-600 rounded-full animate-spin" />
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
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex gap-0.5 border-b border-gray-200 bg-gray-50">
                  {([
                    ['summary',    'Summary',         !!summary],
                    ['read',       'Read',            !!pages?.pages.length],
                    ['structured', 'Structured JSON', !!structured],
                    ['pages',      `Pages (${pages?.pages.length ?? 0})`, !!pages?.pages.length],
                  ] as const).map(([key, label, ready]) => (
                    <button
                      key={key}
                      onClick={() => setTab(key)}
                      className={`px-4 py-2.5 text-xs font-medium transition-colors ${
                        tab === key
                          ? 'bg-white text-gray-900 border-b-2 border-indigo-500'
                          : ready
                            ? 'text-gray-500 hover:text-gray-800'
                            : 'text-gray-300 cursor-not-allowed'
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
                            <span className="px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 font-mono">
                              {summary.provider}
                            </span>
                          )}
                          {summary.model && <span className="font-mono text-gray-400">{summary.model}</span>}
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                          {summary.summary || '(no summary text)'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">Summary not generated yet.</p>
                    )
                  )}

                  {tab === 'read' && (
                    pages?.pages.length ? (
                      <BookReader
                        pages={pages.pages}
                        rtl={(status?.language ?? '').toLowerCase().startsWith('ar')}
                      />
                    ) : (
                      <p className="text-xs text-gray-400">No extracted text yet.</p>
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
                          <summary className="text-[11px] text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600">
                            Raw JSON
                          </summary>
                          <pre className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded p-3 overflow-auto max-h-96 mt-2 font-mono">
                            {JSON.stringify(structured.raw, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">Structured analysis not generated yet.</p>
                    )
                  )}

                  {tab === 'pages' && (
                    pages?.pages.length ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] text-gray-500">
                            {pages.pages.length} page{pages.pages.length === 1 ? '' : 's'} extracted
                            {' · '}
                            {pages.pages.reduce((n, p) => n + p.content.length, 0).toLocaleString()} characters
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              const all = pages.pages.map(p => `--- Page ${p.page} ---\n${p.content}`).join('\n\n')
                              navigator.clipboard?.writeText(all).catch(() => {})
                            }}
                            className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50">
                            Copy all text
                          </button>
                        </div>
                        <div className="space-y-4 max-h-[70vh] overflow-auto pr-1">
                          {pages.pages.map(p => (
                            <div key={p.page} className="border-l-2 border-indigo-300 pl-3">
                              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Page {p.page}</p>
                              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                                {p.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">Pages not extracted yet.</p>
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

function stagePassed(stage: string, currentStatus: string): boolean {
  const order = ['uploaded','processing','ocr_completed','text_extracted','ai_processed','completed']
  return order.indexOf(stage) < order.indexOf(currentStatus)
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-sm text-gray-800 ${mono ? 'font-mono' : 'font-medium'}`}>{value}</p>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value || value === '— ') return null
  return (
    <div>
      <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-gray-700">{value}</p>
    </div>
  )
}

/**
 * Book-style reader for the extracted text.
 *
 * Renders one PDF page at a time as clean, typeset prose (serif column,
 * comfortable measure) with prev/next paging — a reading experience instead of
 * the raw page dump. Supports RTL for Arabic documents.
 */
function BookReader({ pages, rtl }: { pages: { page: number; content: string }[]; rtl: boolean }) {
  const [idx, setIdx] = useState(0)
  const total = pages.length
  // Clamp if the page list shrinks between renders.
  const safeIdx = Math.min(idx, total - 1)
  const current = pages[safeIdx]

  // Split into paragraphs on blank lines so we get real spacing, not one blob.
  const paragraphs = useMemo(
    () => (current?.content ?? '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean),
    [current],
  )

  const go = (delta: number) => setIdx(i => Math.max(0, Math.min(total - 1, i + delta)))

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => go(-1)}
          disabled={safeIdx === 0}
          className="px-3 py-1.5 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
          ← Previous
        </button>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Page</span>
          <input
            type="number"
            min={1}
            max={total}
            value={safeIdx + 1}
            onChange={e => {
              const n = parseInt(e.target.value, 10)
              if (!Number.isNaN(n)) setIdx(Math.max(0, Math.min(total - 1, n - 1)))
            }}
            className="w-14 text-center bg-gray-100 border border-gray-200 rounded-md px-1.5 py-1 text-gray-800" />
          <span>of {total} <span className="text-gray-400">(PDF p.{current?.page})</span></span>
        </div>
        <button
          onClick={() => go(1)}
          disabled={safeIdx >= total - 1}
          className="px-3 py-1.5 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
          Next →
        </button>
      </div>

      {/* Page sheet */}
      <div className="bg-[#fdfdfb] border border-gray-200 rounded-xl shadow-sm mx-auto max-w-2xl px-8 sm:px-12 py-10 min-h-[60vh]">
        <article
          dir={rtl ? 'rtl' : 'ltr'}
          className="prose-reader"
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: '1.05rem',
            lineHeight: 1.9,
            color: '#2d2d2d',
            textAlign: rtl ? 'right' : 'justify',
          }}
        >
          {paragraphs.length ? paragraphs.map((p, i) => (
            <p key={i} style={{ margin: '0 0 1.1em', whiteSpace: 'pre-wrap' }}>{p}</p>
          )) : (
            <p className="text-gray-400" style={{ fontFamily: 'inherit' }}>(this page is blank)</p>
          )}
        </article>
      </div>

      <p className="text-center text-[11px] text-gray-400">— {current?.page} —</p>
    </div>
  )
}

function ListField({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={`${item}-${i}`}
            className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
