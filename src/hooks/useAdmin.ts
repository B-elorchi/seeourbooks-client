import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMetrics, getQueuedMetrics, getCosts, getAdminJobs, getBookCostDetails, timeoutStuckJobs } from '../api/admin'
import { apiFetch } from '../api/client'
import type { AdminMetrics, QueuedMetrics, AdminCosts, PipelineJob, BookCostDetails } from '../types'

export interface CostByBook  { job_id: string; book_id: string; title: string; user_id?: string; cost_usd: number }
export interface CostByUser  { user_id: string; label: string; cost_usd: number }
export interface DailyCost   { date: string; cost_usd: number }

export interface CostByBookFull {
  book_id: string
  title: string
  author?: string
  user_id?: string
  total_jobs?: number
  total_calls?: number
  cost_usd: number
  first_call_at?: string
  last_call_at?: string
}

export interface CostByUserFull {
  user_id: string
  label: string
  role?: string
  total_jobs?: number
  total_calls?: number
  cost_usd: number
  first_call_at?: string
  last_call_at?: string
}

export interface PaginatedCostResponse<T> {
  days: number
  limit: number
  offset: number
  rows: T[]
}

// Query keys for caching
export const adminKeys = {
  all: ['admin'] as const,
  metrics: () => [...adminKeys.all, 'metrics'] as const,
  costs: (days: number) => [...adminKeys.all, 'costs', days] as const,
  costsByBook: (days: number) => [...adminKeys.all, 'costs-by-book', days] as const,
  costsByUser: (days: number) => [...adminKeys.all, 'costs-by-user', days] as const,
  costsDaily:  (days: number) => [...adminKeys.all, 'costs-daily', days] as const,
  jobs: (limit: number) => [...adminKeys.all, 'jobs', limit] as const,
  users: () => [...adminKeys.all, 'users'] as const,
  queued: (minutes: number) => [...adminKeys.all, 'queued', minutes] as const,
  bookCost: (bookId: string, days: number) => [...adminKeys.all, 'book-cost', bookId, days] as const,
}

// Hook to fetch admin metrics
export function useAdminMetrics() {
  return useQuery<AdminMetrics>({
    queryKey: adminKeys.metrics(),
    queryFn: () => getMetrics(),
    staleTime: 10_000,
    retry: 3,
  })
}

// Hook to fetch focused queued-job metrics (live refresh)
export function useAdminQueuedMetrics(minutes = 10) {
  return useQuery<QueuedMetrics>({
    queryKey: adminKeys.queued(minutes),
    queryFn: () => getQueuedMetrics(minutes),
    staleTime: 3_000,
    refetchInterval: 3_000,
    retry: 3,
  })
}

// Hook to fetch costs
export function useAdminCosts(days = 1) {
  return useQuery<AdminCosts>({
    queryKey: adminKeys.costs(days),
    queryFn: () => getCosts(days),
    staleTime: 10_000,
    retry: 3,
  })
}

export function useCostsByBook(days = 30) {
  return useQuery<CostByBook[]>({
    queryKey: adminKeys.costsByBook(days),
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/costs/by-book?days=${days}&limit=20`)
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 60_000,
  })
}

export function useCostsByUser(days = 30) {
  return useQuery<CostByUser[]>({
    queryKey: adminKeys.costsByUser(days),
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/costs/by-user?days=${days}`)
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 60_000,
  })
}

export function useDailyCosts(days = 30) {
  return useQuery<DailyCost[]>({
    queryKey: adminKeys.costsDaily(days),
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/costs/daily?days=${days}`)
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 60_000,
  })
}

export function useAdminCostsByBook(days = 0, limit = 100, offset = 0) {
  return useQuery<PaginatedCostResponse<CostByBookFull>>({
    queryKey: [...adminKeys.all, 'costs-books', days, limit, offset],
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/costs/books?days=${days}&limit=${limit}&offset=${offset}`)
      if (!res.ok) throw new Error('Failed to fetch book costs')
      return res.json()
    },
    staleTime: 60_000,
  })
}

export function useAdminCostsByUser(days = 0, limit = 100, offset = 0) {
  return useQuery<PaginatedCostResponse<CostByUserFull>>({
    queryKey: [...adminKeys.all, 'costs-users', days, limit, offset],
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/costs/users?days=${days}&limit=${limit}&offset=${offset}`)
      if (!res.ok) throw new Error('Failed to fetch user costs')
      return res.json()
    },
    staleTime: 60_000,
  })
}

// Hook to fetch admin jobs
export function useAdminJobs(limit = 50) {
  return useQuery<PipelineJob[]>({
    queryKey: adminKeys.jobs(limit),
    queryFn: () => getAdminJobs(limit),
    refetchInterval: 3000,
    staleTime: 3000,
    retry: 3,
  })
}

// Hook to fetch per-step cost details for a single book
export function useBookCostDetails(bookId: string | null, days = 0) {
  return useQuery<BookCostDetails>({
    queryKey: adminKeys.bookCost(bookId ?? '', days),
    queryFn: () => getBookCostDetails(bookId!, days),
    enabled: !!bookId,
    staleTime: 10_000,
    retry: 2,
  })
}

// Mutation to mark long-running stuck jobs as failed
export function useTimeoutStuckJobs() {
  return {
    mutate: timeoutStuckJobs,
  }
}

// Hook to fetch user count
export function useUserCount() {
  return useQuery<number>({
    queryKey: adminKeys.users(),
    queryFn: async () => {
      const res = await apiFetch('/api/users')
      if (!res.ok) throw new Error('Failed to fetch users')
      const data = await res.json()
      return (data as unknown[]).length
    },
    staleTime: 60_000,
    retry: 2,
  })
}

// Hook to invalidate admin data
export function useInvalidateAdmin() {
  const queryClient = useQueryClient()

  return {
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.all })
    },
    invalidateMetrics: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.metrics() })
    },
    invalidateJobs: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.all })
    },
  }
}
