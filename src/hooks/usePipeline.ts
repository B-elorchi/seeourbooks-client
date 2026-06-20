import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { listJobs, getJobStatus } from '../api/pipeline'
import type { PipelineJob } from '../types'

export const pipelineKeys = {
  all: ['pipeline'] as const,
  jobs: () => [...pipelineKeys.all, 'jobs'] as const,
  job: (id: string) => [...pipelineKeys.all, 'job', id] as const,
}

export function usePipelineJobs(limit = 50, offset = 0) {
  return useQuery<PipelineJob[]>({
    queryKey: [...pipelineKeys.jobs(), limit, offset],
    queryFn:  () => listJobs(limit, offset),
    placeholderData: keepPreviousData,  // show old page while next page loads
    refetchInterval: 3000,
    staleTime: 5000,
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
