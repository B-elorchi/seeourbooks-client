import { useState, useEffect, useRef } from 'react'
import {
  upsertBook, startIngest, getIngestStatus, runPipelineV2,
} from '../../api/admin'
import { PageShell, PageHeader } from './_shared'

const ALL_STEPS: { id: string; label: string }[] = [
  { id: 'summarize',        label: 'Summarize'           },
  { id: 'translate',        label: 'Translate'           },
  { id: 'audio_full',       label: 'Audio (full)'        },
  { id: 'audio_full_translate', label: 'Audio (full, translated)' },
  { id: 'audio_chapters',   label: 'Audio (chapters)'   },
  { id: 'audio_chapters_translate', label: 'Audio (chapters, translated)' },
  { id: 'cover',            label: 'Cover image'         },
  { id: 'alt_text',         label: 'Alt text'            },
  { id: 'mindmap',          label: 'Mind map'            },
  { id: 'mindmap_translate', label: 'Mind map (translated)' },
  { id: 'mindmap_chapters', label: 'Mind map (chapters)' },
  { id: 'mindmap_chapters_translate', label: 'Mind map (chapters, translated)' },
  { id: 'inject_epub',      label: 'Inject EPUB'         },
  { id: 'video',            label: 'Video'               },
]

const BOOKS_LS_KEY = 'admin_books_tab_v1'
function loadBooksState() {
  try { return JSON.parse(localStorage.getItem(BOOKS_LS_KEY) || '{}') } catch { return {} }
}
function saveBooksState(patch: Record<string, unknown>) {
  try {
    const current = loadBooksState()
    localStorage.setItem(BOOKS_LS_KEY, JSON.stringify({ ...current, ...patch }))
  } catch { /* ignore quota errors */ }
}

const inputCls = "w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 placeholder:text-gray-400"
const selectCls = "w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400"

export default function BooksPage() {
  const saved = loadBooksState()

  const [bookId,   setBookIdRaw]   = useState<string>(saved.bookId   ?? '')
  const [title,    setTitleRaw]    = useState<string>(saved.title    ?? '')
  const [author,   setAuthorRaw]   = useState<string>(saved.author   ?? '')
  const [language, setLanguageRaw] = useState<string>(saved.language ?? 'en')

  function setBookId(v: string)   { setBookIdRaw(v);   saveBooksState({ bookId: v }) }
  function setTitle(v: string)    { setTitleRaw(v);    saveBooksState({ title: v }) }
  function setAuthor(v: string)   { setAuthorRaw(v);   saveBooksState({ author: v }) }
  function setLanguage(v: string) { setLanguageRaw(v); saveBooksState({ language: v }) }

  const [upserting,    setUpserting]    = useState(false)
  const [upsertResult, setUpsertResultRaw] = useState<{
    book_id: string; title: string; author: string
  } | null>(saved.upsertResult ?? null)
  const [upsertError, setUpsertError] = useState<string | null>(null)

  function setUpsertResult(v: typeof upsertResult) {
    setUpsertResultRaw(v)
    saveBooksState({ upsertResult: v })
  }

  const [ingesting,    setIngesting]      = useState(false)
  const [ingestResult, setIngestResultRaw] = useState<{
    chunks_saved: number; total_chars: number; txt_url: string; source: string
  } | null>(saved.ingestResult ?? null)
  const [ingestError, setIngestError]  = useState<string | null>(null)
  const [ingestStep,  setIngestStep]   = useState<string>('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function setIngestResult(v: typeof ingestResult) {
    setIngestResultRaw(v)
    saveBooksState({ ingestResult: v })
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  useEffect(() => {
    const restoredId = (loadBooksState().bookId as string | undefined) ?? ''
    if (!restoredId) return
    void getIngestStatus(restoredId).then(s => {
      if (s.status === 'running') { setIngesting(true); startPolling(restoredId) }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => { stopPolling() }, [])

  function startPolling(id: string) {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const s = await getIngestStatus(id)
        if (s.step) setIngestStep(s.step)
        if (s.status === 'done') {
          stopPolling(); setIngesting(false); setIngestStep('')
          setIngestResult({ chunks_saved: s.chunks_saved!, total_chars: s.total_chars!, txt_url: s.txt_url!, source: s.source! })
        } else if (s.status === 'error') {
          stopPolling(); setIngesting(false); setIngestStep('')
          setIngestError(s.error ?? 'Ingest failed')
        }
      } catch { /* network blip — keep polling */ }
    }, 2000)
  }

  const [pipelineSteps,  setPipelineSteps]  = useState<Set<string>>(new Set())
  const [pipelineLength, setPipelineLength] = useState('10min')
  const [pipelineLang,   setPipelineLang]   = useState(saved.language ?? 'en')
  const [launching,      setLaunching]      = useState(false)
  const [launchResult,   setLaunchResult]   = useState<{ job_id: string; status_url: string } | null>(null)
  const [launchError,    setLaunchError]    = useState<string | null>(null)

  function toggleStep(id: string) {
    setPipelineSteps(prev => {
      const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
    })
  }

  async function handleUpsert() {
    if (!bookId.trim()) return
    setUpserting(true); setUpsertResult(null); setUpsertError(null)
    try {
      const res = await upsertBook({ book_id: bookId.trim(), title: title.trim() || undefined, author: author.trim() || undefined, language, status: 'pending' })
      setUpsertResult({ book_id: res.book_id, title: res.title, author: res.author })
      setPipelineLang(language)
    } catch (e: unknown) {
      setUpsertError(e instanceof Error ? e.message : 'Failed')
    } finally { setUpserting(false) }
  }

  async function handleIngest() {
    const targetId = upsertResult?.book_id ?? bookId.trim()
    if (!targetId) return
    setIngesting(true); setIngestResult(null); setIngestError(null); setIngestStep('starting…')
    try {
      await startIngest(targetId)
      startPolling(targetId)
    } catch (e: unknown) {
      setIngesting(false); setIngestStep('')
      setIngestError(e instanceof Error ? e.message : 'Failed to start ingest')
    }
  }

  async function handleLaunch() {
    const targetId = bookId.trim()
    if (!targetId) return
    setLaunching(true); setLaunchResult(null); setLaunchError(null)
    try {
      const res = await runPipelineV2({
        book_id: targetId, language: pipelineLang,
        steps: pipelineSteps.size > 0 ? [...pipelineSteps] : [],
        source: 'catalog', options: { length: pipelineLength, style: 'narrative' },
      })
      setLaunchResult({ job_id: res.job_id, status_url: res.status_url })
      if (!upsertResult && res.title) setUpsertResult({ book_id: res.book_id, title: res.title, author: res.author })
    } catch (e: unknown) {
      setLaunchError(e instanceof Error ? e.message : 'Failed')
    } finally { setLaunching(false) }
  }

  const readyToLaunch = !!(upsertResult?.book_id ?? bookId.trim())

  return (
    <PageShell>
      <PageHeader title="Books" subtitle="Add, ingest and launch pipeline jobs for books" />

      <div className="space-y-6">
        {/* Step 1 */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-800">Step 1 — Add book to database</h2>
            <p className="text-xs text-gray-500 mt-0.5">For Gutenberg books (numeric id) title &amp; author are fetched automatically.</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Book ID <span className="text-red-500">*</span></label>
                <input
                  type="text" value={bookId}
                  onChange={e => { setBookId(e.target.value); setUpsertResult(null); setIngestResult(null); setIngestError(null); stopPolling(); setLaunchResult(null) }}
                  placeholder="84  or  custom-id-xyz"
                  className={inputCls + ' font-mono'}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)} className={selectCls}>
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Title <span className="text-gray-400">(auto-fetched for Gutenberg ids)</span></label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Frankenstein" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Author <span className="text-gray-400">(auto-fetched for Gutenberg ids)</span></label>
                <input type="text" value={author} onChange={e => setAuthor(e.target.value)} placeholder="Mary Shelley" className={inputCls} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleUpsert} disabled={!bookId.trim() || upserting}
                className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
                {upserting ? 'Saving…' : 'Save to database'}
              </button>
              {upsertResult && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  <span><strong>{upsertResult.title}</strong>{upsertResult.author && <span className="text-gray-500"> by {upsertResult.author}</span>}<span className="text-gray-400 font-mono ml-1">[{upsertResult.book_id}]</span></span>
                </div>
              )}
              {upsertError && <p className="text-sm text-red-500">{upsertError}</p>}
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className={`bg-white border rounded-xl overflow-hidden transition-colors ${readyToLaunch ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-800">Step 2 — Ingest book text</h2>
            <p className="text-xs text-gray-500 mt-0.5">Downloads the EPUB (or TXT fallback), extracts text, chunks it and saves to the <code className="text-indigo-600 ml-1">chunks</code> table.</p>
          </div>
          <div className="p-5 flex items-center gap-3 flex-wrap">
            <button onClick={handleIngest} disabled={!readyToLaunch || ingesting}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2">
              {ingesting
                ? <span className="inline-block w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin" />
                : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              }
              {ingesting ? (ingestStep ? `${ingestStep}…` : 'Starting…') : 'Fetch & ingest text'}
            </button>
            {ingestResult && (
              <div className="text-sm text-green-600 flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                <span><strong>{ingestResult.chunks_saved} chunks</strong> saved <span className="text-gray-400">({(ingestResult.total_chars / 1000).toFixed(0)}k chars{ingestResult.source ? ` · from ${ingestResult.source.toUpperCase()}` : ''})</span></span>
              </div>
            )}
            {ingestError && <p className="text-sm text-red-500">{ingestError}</p>}
          </div>
        </div>

        {/* Step 3 */}
        <div className={`bg-white border rounded-xl overflow-hidden transition-colors ${readyToLaunch ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-800">Step 3 — Run pipeline (smart)</h2>
            <p className="text-xs text-gray-500 mt-0.5">Uses <code className="text-indigo-600">/v2/pipeline/run</code> — creates book row and ingests EPUB if needed, then starts the pipeline.</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Language</label>
                <select value={pipelineLang} onChange={e => setPipelineLang(e.target.value)} className={selectCls}>
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Summary length</label>
                <select value={pipelineLength} onChange={e => setPipelineLength(e.target.value)} className={selectCls}>
                  {['3min','5min','10min','15min'].map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-2">Steps <span className="text-gray-400">(leave all unchecked = run everything)</span></label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4">
                {ALL_STEPS.map(s => (
                  <label key={s.id} className="flex items-center gap-2 cursor-pointer group">
                    <input type="checkbox" checked={pipelineSteps.has(s.id)} onChange={() => toggleStep(s.id)} className="accent-indigo-600 w-3.5 h-3.5" />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900">{s.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={handleLaunch} disabled={!readyToLaunch || launching}
                className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {launching ? 'Launching…' : `Run pipeline${pipelineSteps.size > 0 ? ` (${pipelineSteps.size} steps)` : ' (all steps)'}`}
              </button>
              {launchResult && (
                <div className="text-sm text-green-600 flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Queued! <code className="text-xs text-gray-500 font-mono">{launchResult.job_id}</code>
                  <span className="text-gray-400 text-xs">— check Jobs for progress</span>
                </div>
              )}
              {launchError && <p className="text-sm text-red-500">{launchError}</p>}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
