import type { PipelineReq, PipelineJob, PipelineResult } from '../types'
import { apiUrl } from './client'

export async function runPipeline(req: PipelineReq): Promise<{ job_id: string; status_url: string }> {
  const res = await fetch(apiUrl('/api/pipeline/run'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(req),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getJobStatus(jobId: string): Promise<PipelineJob> {
  const res = await fetch(apiUrl(`/api/pipeline/status/${jobId}`))
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getJobOutput(bookId: string): Promise<PipelineResult> {
  const res = await fetch(apiUrl(`/api/pipeline/output/${bookId}`))
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function listJobs(limit = 50): Promise<PipelineJob[]> {
  const res = await fetch(apiUrl(`/api/pipeline/jobs?limit=${limit}`))
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
