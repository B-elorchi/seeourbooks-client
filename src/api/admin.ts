import type { AdminMetrics, PipelineJob, AdminCosts } from '../types'

// ── Provider config ───────────────────────────────────────────────────────────

export async function getConfig(): Promise<Record<string, string>> {
  const res = await fetch('/api/admin/config')
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function setConfig(key: string, value: string): Promise<void> {
  const res = await fetch('/api/admin/config', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ key, value }),
  })
  if (!res.ok) throw new Error(await res.text())
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export async function getMetrics(): Promise<AdminMetrics> {
  const res = await fetch('/api/admin/metrics')
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ── Jobs (admin view — full detail) ──────────────────────────────────────────

export async function getAdminJobs(limit = 100): Promise<PipelineJob[]> {
  const res = await fetch(`/api/admin/jobs?limit=${limit}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function retryJob(jobId: string): Promise<{ job_id: string; status: string }> {
  const res = await fetch(`/api/admin/jobs/${jobId}/retry`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ── Costs ─────────────────────────────────────────────────────────────────────

export async function getCosts(days = 30): Promise<AdminCosts> {
  const res = await fetch(`/api/admin/costs?days=${days}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
