import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMetrics, getCosts, getAdminJobs } from '../api/admin'
import { apiFetch } from '../api/client'
import type { AdminMetrics, AdminCosts, PipelineJob } from '../types'

// Query keys for caching
export const adminKeys = {
  all: ['admin'] as const,
  metrics: () => [...adminKeys.all, 'metrics'] as const,
  costs: (days: number) => [...adminKeys.all, 'costs', days] as const,
  jobs: (limit: number) => [...adminKeys.all, 'jobs', limit] as const,
  users: () => [...adminKeys.all, 'users'] as const,
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

// Hook to fetch costs
export function useAdminCosts(days = 1) {
  return useQuery<AdminCosts>({
    queryKey: adminKeys.costs(days),
    queryFn: () => getCosts(days),
    staleTime: 10_000,
    retry: 3,
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
