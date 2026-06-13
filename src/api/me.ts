import { apiFetch } from './client'

export interface MyMetrics {
  total: number
  done: number
  partial: number
  failed: number
  running: number
  queued: number
}

export interface MyJob {
  id: number | string
  book_id: string
  length?: string
  style?: string
  language?: string
  status: string
  error_msg?: string | null
  created_at?: string
}

export async function getMyMetrics(): Promise<MyMetrics> {
  const res = await apiFetch('/api/me/metrics')
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getMyJobs(limit = 100): Promise<MyJob[]> {
  const res = await apiFetch(`/api/me/jobs?limit=${limit}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
