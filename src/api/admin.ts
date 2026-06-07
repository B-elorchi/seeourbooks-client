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
