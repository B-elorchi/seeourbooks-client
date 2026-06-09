import type {
  AdminMetrics, PipelineJob, AdminCosts,
  OpenRouterModelsResponse, OpenRouterModality,
  CatalogTablesResponse, CatalogResponse,
} from '../types'
import { apiFetch } from './client'

// ── Provider config ───────────────────────────────────────────────────────────

export async function getConfig(): Promise<Record<string, string>> {
  const res = await apiFetch('/api/admin/config')
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function setConfig(key: string, value: string): Promise<void> {
  const res = await apiFetch('/api/admin/config', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ key, value }),
  })
  if (!res.ok) throw new Error(await res.text())
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export async function getMetrics(): Promise<AdminMetrics> {
  const res = await apiFetch('/api/admin/metrics')
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ── Jobs (admin view — full detail) ──────────────────────────────────────────

export async function getAdminJobs(limit = 100): Promise<PipelineJob[]> {
  const res = await apiFetch(`/api/admin/jobs?limit=${limit}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function retryJob(jobId: string): Promise<{ job_id: string; status: string }> {
  const res = await apiFetch(`/api/admin/jobs/${jobId}/retry`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function rerunSteps(jobId: string, steps: string[]): Promise<{ job_id: string; status: string }> {
  const res = await apiFetch(`/api/admin/jobs/${jobId}/rerun`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ steps }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ── Costs ─────────────────────────────────────────────────────────────────────

export async function getCosts(days = 30): Promise<AdminCosts> {
  const res = await apiFetch(`/api/admin/costs?days=${days}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ── OpenRouter live model list (cached server-side for 1h) ──────────────────

export async function getOpenRouterModels(
  modality: OpenRouterModality = 'all',
): Promise<OpenRouterModelsResponse> {
  const res = await apiFetch(`/api/admin/openrouter-models?modality=${modality}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ── Books ─────────────────────────────────────────────────────────────────────

export interface BookUpsertPayload {
  book_id:      string
  title?:       string
  author?:      string
  language?:    string
  year?:        number
  pages?:       number
  grade_level?: string
  genres?:      string[]
  status?:      string
}

export async function upsertBook(payload: BookUpsertPayload): Promise<{
  ok: boolean; book_id: string; title: string; author: string; action: string; next: string
}> {
  const res = await apiFetch('/api/admin/books', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getBook(bookId: string): Promise<Record<string, unknown>> {
  const res = await apiFetch(`/api/admin/books/${encodeURIComponent(bookId)}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function startIngest(bookId: string): Promise<{
  ok: boolean; book_id: string; status: string; status_url: string
}> {
  const res = await apiFetch(`/api/admin/books/${encodeURIComponent(bookId)}/ingest`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getIngestStatus(bookId: string): Promise<{
  status: string; book_id: string; title?: string; source?: string;
  chunks_saved?: number; total_chars?: number; txt_url?: string;
  error?: string; step?: string;
}> {
  const res = await apiFetch(`/api/admin/books/${encodeURIComponent(bookId)}/ingest/status`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/** @deprecated use startIngest + getIngestStatus */
export async function ingestBook(bookId: string) { return startIngest(bookId) }

export async function runPipeline(payload: {
  book_id: string; language?: string; steps?: string[];
  options?: { length?: string; style?: string }; source?: string
}): Promise<{ job_id: string; status: string; status_url: string }> {
  const res = await apiFetch('/api/pipeline/run', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/**
 * v2 smart pipeline — one call does everything:
 * ensures book row exists, ingests EPUB/TXT if no chunks, then runs the pipeline.
 */
export async function runPipelineV2(payload: {
  book_id: string
  language?: string
  source?: string
  steps?: string[]
  options?: { length?: string; style?: string }
}): Promise<{
  ok: boolean
  job_id: string
  status: string
  status_url: string
  book_id: string
  title: string
  author: string
}> {
  const res = await apiFetch('/api/v2/pipeline/run', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function cancelJob(jobId: string): Promise<{ ok: boolean; message: string }> {
  const res = await apiFetch(`/api/pipeline/jobs/${jobId}/cancel`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteJob(jobId: string): Promise<{ ok: boolean; job_id: string; message: string }> {
  const res = await apiFetch(`/api/admin/jobs/${jobId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ── Catalog inspector ────────────────────────────────────────────────────────

export async function getCatalogTables(): Promise<CatalogTablesResponse> {
  const res = await apiFetch('/api/admin/catalog/tables')
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getCatalog(
  table: string,
  opts: { limit?: number; offset?: number; book_id?: string } = {},
): Promise<CatalogResponse> {
  const params = new URLSearchParams()
  if (opts.limit  !== undefined) params.set('limit',  String(opts.limit))
  if (opts.offset !== undefined) params.set('offset', String(opts.offset))
  if (opts.book_id)              params.set('book_id', opts.book_id)
  const q = params.toString() ? `?${params.toString()}` : ''
  const res = await apiFetch(`/api/admin/catalog/${encodeURIComponent(table)}${q}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
