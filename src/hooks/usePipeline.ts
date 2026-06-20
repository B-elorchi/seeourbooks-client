import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { listJobs, getJobStatus } from '../api/pipeline'
import type { PipelineJob } from '../types'

export const pipelineKeys = {
  all: ['pipeline'] as const,
  jobs: () => [...pipelineKeys.all, 'jobs'] as const,
  job: (id: string) => [...pipelineKeys.all, 'job', id] as const,
}

export function usePipelineJobs(limit = 50, offset = 0, status?: string) {
  const isFiltered = !!status && status !== 'all'
  return useQuery<PipelineJob[]>({
    queryKey: [...pipelineKeys.jobs(), limit, offset, status ?? 'all'],
    queryFn:  () => listJobs(isFiltered ? 2000 : limit, isFiltered ? 0 : offset, status),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const data = query.state.data as PipelineJob[] | undefined
      const hasActive = data?.some(j => j.status === 'running' || j.status === 'queued')
      return hasActive ? 5000 : 15000
    },
    staleTime: 4000,
    retry: 3,
  })
}

export function useJobStatus(jobId: string | null) {
  return useQuery<PipelineJob>({
    queryKey: pipelineKeys.job(jobId || ''),
    queryFn:  () => getJobStatus(jobId!),
    enabled:  !!jobId,
    refetchInterval: 3000,
    staleTime: 3000,
    retry: 3,
  })
}

export function useInvalidatePipeline() {
  const queryClient = useQueryClient()
  return {
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
    },
    invalidateJob: (jobId: string) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.job(jobId) })
    },
    updateJob: (jobId: string, updater: (old: PipelineJob | undefined) => PipelineJob | undefined) => {
      queryClient.setQueryData(pipelineKeys.job(jobId), updater)
    },
  }
}
