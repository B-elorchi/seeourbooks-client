import { useState, useRef } from 'react'
import { streamSummary } from '../api/summarize'

const LENGTHS  = ['3min', '5min', '10min', '15min']
const STYLES   = ['narrative', 'bullets', 'academic']
const LANGS    = [{ value: 'en', label: 'English' }, { value: 'ar', label: 'Arabic' }]

export default function SummaryPage() {
  const [bookId,   setBookId]   = useState('')
  const [length,   setLength]   = useState('5min')
  const [style,    setStyle]    = useState('narrative')
  const [language, setLanguage] = useState('en')

  const [status,   setStatus]   = useState('')
  const [chunks,   setChunks]   = useState({ done: 0, total: 0 })
  const [text,     setText]     = useState('')
  const [wordCount,setWordCount]= useState(0)
  const [running,  setRunning]  = useState(false)
  const [cached,   setCached]   = useState(false)

  const stopRef = useRef<(() => void) | null>(null)

  function start() {
    if (!bookId.trim()) return
    setText(''); setStatus(''); setWordCount(0); setCached(false)
    setChunks({ done: 0, total: 0 }); setRunning(true)

    stopRef.current = streamSummary(
      bookId.trim(), length, style, language,
      (e) => {
        if (e.event === 'cached') {
          setText(e.data.summary); setWordCount(e.data.word_count); setCached(true)
        }
        if (e.event === 'status')     setStatus(e.data.msg)
        if (e.event === 'chunk_done') setChunks({ done: e.data.index + 1, total: e.data.total })
        if (e.event === 'token')      setText(prev => prev + e.data.text)
        if (e.event === 'done')       setWordCount(e.data.word_count)
        if (e.event === 'error')      setStatus(`Error: ${e.data.msg}`)
      },
      () => setRunning(false),
      (err) => { setStatus(`Error: ${err}`); setRunning(false) },
    )
  }

  function stop() {
    stopRef.current?.()
    setRunning(false)
  }

  const isAr = language === 'ar'

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-100 mb-1">Summary Generator</h1>
      <p className="text-sm text-gray-500 mb-8">Generate a streaming book summary via Claude</p>

      {/* Form */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5 mb-6">
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">Book ID</label>
          <input
            value={bookId}
            onChange={e => setBookId(e.target.value)}
            placeholder="e.g. 84"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Length</label>
            <select value={length} onChange={e => setLength(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500">
              {LENGTHS.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Style</label>
            <select value={style} onChange={e => setStyle(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500">
              {STYLES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Language</label>
            <select value={language} onChange={e => setLanguage(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500">
              {LANGS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={start} disabled={running || !bookId.trim()}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg py-2 text-sm font-medium transition-colors">
            {running ? 'Generating…' : 'Generate'}
          </button>
          {running && (
            <button onClick={stop}
              className="px-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg py-2 text-sm transition-colors">
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {(status || chunks.total > 0) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 space-y-2">
          {status && <p className="text-xs text-gray-400">{status}</p>}
          {chunks.total > 0 && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Chunks</span>
                <span>{chunks.done} / {chunks.total}</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${(chunks.done / chunks.total) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Output */}
      {text && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Summary</span>
              {cached && <span className="text-xs bg-green-900/50 text-green-400 border border-green-700 px-2 py-0.5 rounded">cached</span>}
            </div>
            {wordCount > 0 && <span className="text-xs text-gray-500">{wordCount} words</span>}
          </div>
          <p dir={isAr ? 'rtl' : 'ltr'}
            className={`text-sm text-gray-200 leading-relaxed whitespace-pre-wrap ${isAr ? 'font-arabic' : ''}`}>
            {text}
            {running && <span className="inline-block w-0.5 h-4 bg-indigo-400 ml-0.5 animate-pulse" />}
          </p>
        </div>
      )}
    </div>
  )
}
