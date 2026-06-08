import { useEffect, useRef, useState } from 'react'
// epubjs is framework-agnostic; we mount it into a div ref.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - epubjs ships incomplete types
import ePub from 'epubjs'

interface TocItem {
  label: string
  href: string
  subitems?: TocItem[]
}

export default function EpubReader({ url, onClose }: { url: string; onClose: () => void }) {
  const viewerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renditionRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookRef = useRef<any>(null)

  const [toc, setToc]         = useState<TocItem[]>([])
  const [showToc, setShowToc] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [chapterLabel, setChapterLabel] = useState('')

  useEffect(() => {
    if (!viewerRef.current) return
    let cancelled = false

    setLoading(true)
    setError(null)

    let book: ReturnType<typeof ePub>
    try {
      book = ePub(url)
      bookRef.current = book
      const rendition = book.renderTo(viewerRef.current, {
        width: '100%',
        height: '100%',
        flow: 'paginated',
        spread: 'auto',
      })
      renditionRef.current = rendition

      rendition.display().then(() => {
        if (!cancelled) setLoading(false)
      }).catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to render EPUB')
          setLoading(false)
        }
      })

      // Load table of contents
      book.loaded.navigation.then((nav: { toc: TocItem[] }) => {
        if (!cancelled) setToc(nav.toc ?? [])
      })

      // Track current chapter label
      rendition.on('relocated', (location: { start: { href: string } }) => {
        const item = book.navigation?.get(location.start.href)
        if (item && !cancelled) setChapterLabel(item.label?.trim() ?? '')
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open EPUB')
      setLoading(false)
    }

    return () => {
      cancelled = true
      try { renditionRef.current?.destroy() } catch { /* ignore */ }
      try { bookRef.current?.destroy() } catch { /* ignore */ }
    }
  }, [url])

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') renditionRef.current?.next()
      if (e.key === 'ArrowLeft')  renditionRef.current?.prev()
      if (e.key === 'Escape')     onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function go(href: string) {
    renditionRef.current?.display(href)
  }

  function renderTocItems(items: TocItem[], depth = 0) {
    return items.map((it, i) => (
      <div key={`${it.href}-${i}`}>
        <button
          onClick={() => go(it.href)}
          className="block w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white rounded transition-colors truncate"
          style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
          title={it.label.trim()}
        >
          {it.label.trim()}
        </button>
        {it.subitems && it.subitems.length > 0 && renderTocItems(it.subitems, depth + 1)}
      </div>
    ))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setShowToc(v => !v)}
            title="Toggle contents"
            className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm text-gray-300 truncate">{chapterLabel || 'EPUB Preview'}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a href={url} target="_blank" rel="noreferrer"
            className="text-xs text-indigo-400 hover:underline px-2">Download ↗</a>
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="p-1.5 rounded-lg hover:bg-red-700 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* ToC sidebar */}
        {showToc && (
          <div className="w-72 shrink-0 bg-gray-900 border-r border-gray-800 overflow-auto py-2">
            <p className="px-3 py-1 text-[11px] uppercase tracking-wide text-gray-500 font-medium">Contents</p>
            {toc.length > 0
              ? renderTocItems(toc)
              : <p className="px-3 py-2 text-xs text-gray-600">No contents</p>}
          </div>
        )}

        {/* Reader pane */}
        <div className="relative flex-1 bg-white">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
              <span className="inline-block w-8 h-8 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10 p-6 text-center">
              <p className="text-sm text-red-600 mb-2">Could not load EPUB preview</p>
              <p className="text-xs text-gray-500 mb-4">{error}</p>
              <a href={url} target="_blank" rel="noreferrer"
                className="text-sm text-indigo-600 hover:underline">Download the file instead ↗</a>
            </div>
          )}
          <div ref={viewerRef} className="w-full h-full" />

          {/* Prev / Next */}
          <button
            onClick={() => renditionRef.current?.prev()}
            className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 transition-colors"
            title="Previous (←)"
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => renditionRef.current?.next()}
            className="absolute right-0 top-0 bottom-0 w-12 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 transition-colors"
            title="Next (→)"
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
