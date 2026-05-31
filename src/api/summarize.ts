import { apiUrl } from './client'

export type SseEvent =
  | { event: 'cached';     data: { summary: string; word_count: number } }
  | { event: 'status';     data: { msg: string; total?: number } }
  | { event: 'chunk_done'; data: { index: number; total: number } }
  | { event: 'token';      data: { text: string } }
  | { event: 'done';       data: { summary: string; word_count: number; job_id: number } }
  | { event: 'error';      data: { msg: string } }

export function streamSummary(
  bookId: string,
  length: string,
  style: string,
  language: string,
  onEvent: (e: SseEvent) => void,
  onDone: () => void,
  onError: (err: string) => void,
): () => void {
  const controller = new AbortController()

  fetch(apiUrl('/api/summarize'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ book_id: bookId, length, style, language }),
    signal:  controller.signal,
  }).then(async (res) => {
    if (!res.ok || !res.body) { onError('Request failed'); return }
    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let   buffer  = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) { onDone(); break }
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        if (!part.trim() || part.startsWith(':')) continue
        const lines = part.split('\n')
        const ev    = lines.find(l => l.startsWith('event:'))?.slice(6).trim()
        const raw   = lines.find(l => l.startsWith('data:'))?.slice(5).trim()
        if (ev && raw) {
          try { onEvent({ event: ev, data: JSON.parse(raw) } as SseEvent) }
          catch { /* ignore malformed */ }
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') onError(String(err))
  })

  return () => controller.abort()
}
