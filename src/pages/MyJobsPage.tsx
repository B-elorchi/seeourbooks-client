import { useEffect, useState } from 'react'
import { PageShell, PageHeader, Badge, timeAgo } from './admin/_shared'
import { getMyJobs, type MyJob } from '../api/me'

/**
 * Editor/viewer view of their own summary jobs. No cost data.
 */
export default function MyJobsPage() {
  const [jobs, setJobs] = useState<MyJob[] | null>(null)
  const [err, setErr]   = useState<string | null>(null)

  useEffect(() => {
    getMyJobs().then(setJobs).catch(e => setErr(String(e)))
  }, [])

  return (
    <PageShell>
      <PageHeader title="My Jobs" subtitle="Summary jobs you created" />

      {err && <p className="text-sm text-red-600 mb-4">{err}</p>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Book</th>
              <th className="text-left font-medium px-4 py-2.5">Length</th>
              <th className="text-left font-medium px-4 py-2.5">Language</th>
              <th className="text-left font-medium px-4 py-2.5">Status</th>
              <th className="text-left font-medium px-4 py-2.5">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {jobs?.length ? jobs.map(j => (
              <tr key={String(j.id)} className="text-gray-700">
                <td className="px-4 py-2.5 font-mono text-xs">{j.book_id}</td>
                <td className="px-4 py-2.5">{j.length ?? '—'}</td>
                <td className="px-4 py-2.5">{j.language ?? '—'}</td>
                <td className="px-4 py-2.5"><Badge status={j.status} /></td>
                <td className="px-4 py-2.5 text-gray-400">{j.created_at ? timeAgo(j.created_at) : '—'}</td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                {jobs === null ? 'Loading…' : 'No jobs yet — create one from the Summary page.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
