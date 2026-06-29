import type { PipelineReq, PipelineJob, PipelineResult } from '../types'
import { apiFetch } from './client'

export async function runPipeline(req: PipelineReq): Promise<{ job_id: string; status_url: string }> {
  const res = await apiFetch('/api/pipeline/run', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(req),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getJobStatus(jobId: string): Promise<PipelineJob> {
  const res = await apiFetch(`/api/pipeline/status/${jobId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getJobOutput(bookId: string): Promise<PipelineResult> {
  const res = await apiFetch(`/api/pipeline/output/${bookId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function listJobs(limit = 50, offset = 0, status?: string, dateFilter?: string): Promise<PipelineJob[]> {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (status && status !== 'all') qs.set('status', status)
    if (dateFilter) qs.set('date', dateFilter)
  const res = await apiFetch(`/api/pipeline/jobs?${qs}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
