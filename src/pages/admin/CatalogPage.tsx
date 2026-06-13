import { useState, useEffect, useMemo } from 'react'
import { getCatalogTables, getCatalog } from '../../api/admin'
import { PageShell, PageHeader } from './_shared'
import type { CatalogTableMeta } from '../../types'

const CATALOG_PAGE_SIZE = 50

function formatCellValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v
  try { return JSON.stringify(v) } catch { return String(v) }
}

export default function CatalogPage() {
  const [tables,   setTables]   = useState<CatalogTableMeta[]>([])
  const [table,    setTable]    = useState<string>('books')
  const [bookId,   setBookId]   = useState<string>('')
  const [offset,   setOffset]   = useState<number>(0)
  const [rows,     setRows]     = useState<Record<string, unknown>[]>([])
  const [loading,  setLoading]  = useState<boolean>(false)
  const [error,    setError]    = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    getCatalogTables()
      .then(r => setTables(r.tables))
      .catch(() => {})
  }, [])

  const tableMeta = useMemo(() => tables.find(t => t.name === table), [tables, table])
  const supportsBookIdFilter = tableMeta?.supports_book_id ?? false

  async function load(nextOffset: number = offset) {
    setLoading(true)
    setError(null)
    try {
      const data = await getCatalog(table, {
        limit:  CATALOG_PAGE_SIZE,
        offset: nextOffset,
        book_id: supportsBookIdFilter && bookId.trim() ? bookId.trim() : undefined,
      })
      setRows(data.rows)
      setOffset(data.offset)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setOffset(0)
    void load(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table])

  const columns = rows.length > 0 ? Object.keys(rows[0]) : []

  return (
    <PageShell>
      <PageHeader title="Database" subtitle="Read-only inspector for Supabase tables" />

      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <label className="text-xs text-gray-500 uppercase tracking-wide">Table</label>
          <select
            value={table}
            onChange={e => setTable(e.target.value)}
            className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 max-w-[260px]"
          >
            {tables.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            {tables.length === 0 && <option value={table}>{table}</option>}
          </select>

          {supportsBookIdFilter && (
            <>
              <label className="text-xs text-gray-500 uppercase tracking-wide ml-2">book_id</label>
              <input
                type="text"
                value={bookId}
                onChange={e => setBookId(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { setOffset(0); void load(0) } }}
                placeholder="e.g. 12345"
                className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 w-[180px]"
              />
              <button
                onClick={() => { setOffset(0); void load(0) }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-3 py-1.5 rounded-lg"
              >
                Search
              </button>
              {bookId && (
                <button
                  onClick={() => { setBookId(''); setOffset(0); void load(0) }}
                  className="text-xs text-gray-400 hover:text-gray-800"
                >
                  Clear
                </button>
              )}
            </>
          )}

          <div className="flex-1" />
          <button
            onClick={() => void load(offset)}
            disabled={loading}
            className="bg-gray-100 hover:bg-gray-100 border border-gray-200 text-gray-800 text-sm px-3 py-1.5 rounded-lg disabled:opacity-50"
          >
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
            <span className="font-medium">Error:</span> {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-sm text-gray-500 text-center">
            No rows {bookId ? `for book_id=${bookId}` : 'returned'} from{' '}
            <code className="text-gray-400 bg-gray-100 px-1 py-0.5 rounded text-gray-700">{table}</code>.
          </div>
        )}

        {rows.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[640px]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-[10px] text-gray-500 uppercase tracking-wide sticky top-0 bg-white">
                    {columns.map(c => (
                      <th key={c} className="text-left px-3 py-2 font-medium whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/50">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-100/30 transition-colors align-top">
                      {columns.map(c => {
                        const cellKey = `${i}:${c}`
                        const raw     = row[c]
                        const text    = formatCellValue(raw)
                        const isLong  = text.length > 80
                        const isOpen  = expanded === cellKey
                        const isNull  = raw === null || raw === undefined
                        return (
                          <td key={c} className={`px-3 py-2 align-top ${isNull ? 'text-gray-600 italic' : 'text-gray-800'}`}>
                            {isLong && !isOpen ? (
                              <button
                                onClick={() => setExpanded(cellKey)}
                                className="text-left text-gray-600 hover:text-indigo-600 font-mono"
                                title="Click to expand"
                              >
                                {text.slice(0, 80)}…
                              </button>
                            ) : isLong && isOpen ? (
                              <div>
                                <pre className="text-[11px] text-gray-700 whitespace-pre-wrap max-w-[640px] font-mono">{text}</pre>
                                  <button onClick={() => setExpanded(null)} className="mt-1 text-[10px] text-gray-500 hover:text-gray-700">
                                  ▴ Collapse
                                </button>
                              </div>
                            ) : (
                              <span className={isNull ? '' : 'font-mono'}>{text}</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-xs text-gray-500">
              <span>
                Showing rows <span className="text-gray-700">{offset + 1}–{offset + rows.length}</span>
                {' '}from <code className="text-gray-400 bg-gray-100 px-1 py-0.5 rounded text-gray-700">{table}</code>
                {bookId && supportsBookIdFilter && (
                  <> · filtered <code className="text-gray-400 bg-gray-100 px-1 py-0.5 rounded text-gray-700">book_id={bookId}</code></>
                )}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => void load(Math.max(0, offset - CATALOG_PAGE_SIZE))}
                  disabled={offset === 0 || loading}
                  className="px-3 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => void load(offset + CATALOG_PAGE_SIZE)}
                  disabled={rows.length < CATALOG_PAGE_SIZE || loading}
                  className="px-3 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}
