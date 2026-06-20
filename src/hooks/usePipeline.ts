import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listJobs, getJobStatus } from '../api/pipeline'
import type { PipelineJob } from '../types'

// Query keys for caching
export const pipelineKeys = {
  all: ['pipeline'] as const,
  jobs: () => [...pipelineKeys.all, 'jobs'] as const,
  job: (id: string) => [...pipelineKeys.all, 'job', id] as const,
}

// Hook to fetch all jobs with caching and pagination
export function usePipelineJobs(limit = 50, offset = 0) {
  return useQuery<PipelineJob[]>({
    queryKey: [...pipelineKeys.jobs(), limit, offset],
    queryFn: () => listJobs(limit, offset),
    refetchInterval: 3000,
    staleTime: 5000,
    retry: 3,
  })
}

// Hook to fetch a single job with caching
export function useJobStatus(jobId: string | null) {
  return useQuery<PipelineJob>({
    queryKey: pipelineKeys.job(jobId || ''),
    queryFn: () => getJobStatus(jobId!),
    // Only fetch when jobId is provided
    enabled: !!jobId,
    // Poll every 3 seconds for live updates
    refetchInterval: 3000,
    // Keep data fresh for 3 seconds
    staleTime: 3000,
    // Retry failed requests 3 times
    retry: 3,
  })
}

// Hook to manually invalidate/update cache
export function useInvalidatePipeline() {
  const queryClient = useQueryClient()
  
  return {
    // Invalidate all pipeline data
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
    },
    // Invalidate specific job
    invalidateJob: (jobId: string) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.job(jobId) })
    },
    // Update job data in cache immediately
    updateJob: (jobId: string, updater: (old: PipelineJob | undefined) => PipelineJob | undefined) => {
      queryClient.setQueryData(pipelineKeys.job(jobId), updater)
    },
  }
}
