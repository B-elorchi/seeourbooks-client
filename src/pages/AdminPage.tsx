import { useState, useEffect } from 'react'
import { getConfig, setConfig, getMetrics, getAdminJobs, retryJob, getCosts } from '../api/admin'
import type { AdminMetrics, PipelineJob, AdminCosts } from '../types'
import StatusBadge from '../components/StatusBadge'

// ── Provider groups (Providers tab) ──────────────────────────────────────────

// Native model names (direct API)
const CLAUDE_MODELS   = ['claude-haiku-4-5-20251001', 'claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7']
const GPT_CHAT_MODELS = ['gpt-4.1-mini', 'gpt-4.1', 'o3-mini', 'o1-mini']
// Image generation models
// OpenAI models → native OpenAI API (OPENAI_API_KEY)
// FLUX / SD models → OpenRouter (OPENROUTER_API_KEY) — these DO support image gen
const OPENAI_IMG_MODELS = ['dall-e-3', 'gpt-image-1', 'dall-e-2']
const OR_IMG_MODELS = [
  'google/gemini-2.5-flash-image',
  'black-forest-labs/flux-1.1-pro',
  'black-forest-labs/flux-schnell',
  'stability-ai/stable-diffusion-3.5-large',
]

// Same models via OpenRouter (vendor/model prefix)
const OR_CLAUDE = CLAUDE_MODELS.map(m => `anthropic/${m}`)
const OR_GPT    = GPT_CHAT_MODELS.map(m => `openai/${m}`)

// ── Option group type ─────────────────────────────────────────────────────────
// Each option list can be flat strings (no grouping) or grouped with a label.
// Set type:'text' to render a free-text input instead of a select dropdown.
type OptGroup = { group: string; items: string[] }
type OptionList = Array<string | OptGroup>

// Helpers to build grouped lists cleanly
const g = (group: string, items: string[]): OptGroup => ({ group, items })

// ── Config rows ───────────────────────────────────────────────────────────────
const PROVIDER_GROUPS: Array<{
  title: string
  rows: Array<{ key: string; label: string; options: OptionList; type?: 'text'; placeholder?: string }>
}> = [
  {
    title: 'Summarization',
    rows: [
      {
        key: 'MODEL_HAIKU', label: 'Chapter model (Pass 1)',
        options: [
          g('🟣 Anthropic — Native API', CLAUDE_MODELS),
          g('🔀 OpenRouter → Anthropic',  OR_CLAUDE),
        ],
      },
      {
        key: 'MODEL_SONNET', label: 'Full summary (Pass 2)',
        options: [
          g('🟣 Anthropic — Native API', CLAUDE_MODELS),
          g('🔀 OpenRouter → Anthropic',  OR_CLAUDE),
        ],
      },
      {
        key: 'MODEL_OPUS', label: 'Tashkeel / Review (AR)',
        options: [
          g('🟣 Anthropic — Native API', CLAUDE_MODELS),
          g('🔀 OpenRouter → Anthropic',  OR_CLAUDE),
        ],
      },
    ],
  },
  {
    title: 'Mind Map',
    rows: [
      {
        key: 'MINDMAP_FORMAT', label: 'Output format',
        options: ['mermaid', 'json'],
      },
      {
        key: 'MODEL_MINDMAP', label: 'Mind map model',
        options: [
          g('🟢 OpenAI — Native API',    GPT_CHAT_MODELS),
          g('🔀 OpenRouter → OpenAI',    OR_GPT),
          g('🟣 Anthropic — Native API', CLAUDE_MODELS),
          g('🔀 OpenRouter → Anthropic', OR_CLAUDE),
        ],
      },
    ],
  },
  {
    title: 'Text-to-Speech',
    rows: [
      { key: 'TTS_PROVIDER_EN', label: 'Provider (EN)', options: ['deepgram', 'elevenlabs', 'cartesia'] },
      { key: 'TTS_VOICE_EN',    label: 'Voice (EN)',    options: ['aura-asteria-en', 'aura-arcas-en', 'aura-luna-en'] },
      // Arabic: Deepgram Aura voices are English-only and cannot pronounce Arabic text.
      // Use elevenlabs (eleven_multilingual_v2 model supports Arabic natively) or
      // cartesia (set TTS_VOICE_AR to a real Arabic voice UUID from play.cartesia.ai).
      { key: 'TTS_PROVIDER_AR', label: 'Provider (AR) — ⚠️ Deepgram is English-only', options: ['cartesia', 'gemini', 'elevenlabs'] },
      {
        key: 'TTS_VOICE_AR', label: 'Voice ID (AR)',
        options: [],
        type: 'text',
        placeholder: 'Cartesia UUID  |  Gemini voice (Kore, Charon, …)  |  ElevenLabs voice ID',
      },
      {
        // Cartesia model snapshot — sonic-3.5-* supports 40+ languages incl. Arabic.
        // sonic-2024-10-19 is English-only and will 400 on Arabic text.
        // See https://docs.cartesia.ai/build-with-cartesia/models
        key: 'CARTESIA_MODEL', label: 'Cartesia model',
        options: [],
        type: 'text',
        placeholder: 'sonic-3.5-2026-05-04',
      },
      {
        // Gemini TTS model via OpenRouter — Flash 2.5 supports Arabic natively.
        // See https://openrouter.ai/models?modality=text-audio
        key: 'GEMINI_TTS_MODEL', label: 'Gemini TTS model',
        options: [],
        type: 'text',
        placeholder: 'google/gemini-2.5-flash-preview-tts',
      },
    ],
  },
  {
    title: 'Cover Image',
    rows: [
      {
        key: 'IMAGE_MODEL', label: 'Model',
        options: [
          g('🟢 OpenAI — Native API',   OPENAI_IMG_MODELS),
          g('🔀 OpenRouter → FLUX / Gemini / SD', OR_IMG_MODELS),
        ],
      },
      { key: 'IMAGE_QUALITY', label: 'Quality', options: ['high', 'standard', 'auto'] },
      {
        // gpt-image-1 valid: 1024x1024 | 1024x1536 | 1536x1024 | auto
        // dall-e-3 valid:    1024x1024 | 1024x1792 | 1792x1024
        // dall-e-2 valid:    1024x1024 | 512x512 | 256x256 (square only)
        // The backend auto-remaps any unsupported size for the selected model.
        key: 'IMAGE_SIZE', label: 'Size',
        options: ['1024x1536', '1024x1024', '1536x1024', 'auto', '1024x1792', '1792x1024', '512x512'],
      },
    ],
  },
  {
    title: 'Alt Text',
    rows: [
      { key: 'ALTTEXT_PROVIDER_EN', label: 'Provider (EN)', options: ['claude', 'openai'] },
      {
        key: 'ALTTEXT_MODEL_EN', label: 'Model (EN)',
        options: [
          g('🟣 Anthropic — Native API', CLAUDE_MODELS),
          g('🟢 OpenAI — Native API',    GPT_CHAT_MODELS),
          g('🔀 OpenRouter → Anthropic', OR_CLAUDE),
          g('🔀 OpenRouter → OpenAI',    OR_GPT),
        ],
      },
      { key: 'ALTTEXT_PROVIDER_AR', label: 'Provider (AR)', options: ['claude', 'openai'] },
      {
        key: 'ALTTEXT_MODEL_AR', label: 'Model (AR)',
        options: [
          g('🟣 Anthropic — Native API', CLAUDE_MODELS),
          g('🟢 OpenAI — Native API',    GPT_CHAT_MODELS),
          g('🔀 OpenRouter → Anthropic', OR_CLAUDE),
          g('🔀 OpenRouter → OpenAI',    OR_GPT),
        ],
      },
    ],
  },
  {
    title: 'Storage',
    rows: [
      { key: 'STORAGE_PROVIDER', label: 'Provider', options: ['spaces', 'minio'] },
    ],
  },
  {
    title: 'Pipeline Steps',
    rows: [
      { key: 'PIPELINE_STEP_TTS',              label: 'Audio (TTS)',      options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_COVER',            label: 'Cover Image',      options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_MINDMAP',          label: 'Mind Map',         options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_ALTTEXT',          label: 'Alt Text',         options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_AUDIO_PROCESSING', label: 'Audio Processing', options: ['true', 'false'] },
    ],
  },
]

// ── Provider badge ────────────────────────────────────────────────────────────
// Detects the provider from the currently selected value and returns a
// coloured pill so the user knows at a glance which API will be called.

type BadgeInfo = { label: string; className: string }

function getProviderBadge(value: string): BadgeInfo | null {
  // OpenRouter — any value containing a "/" vendor prefix
  if (value.startsWith('anthropic/'))
    return { label: 'OpenRouter › Anthropic', className: 'bg-violet-900/50 text-violet-300 border border-violet-700' }
  if (value.startsWith('openai/'))
    return { label: 'OpenRouter › OpenAI',    className: 'bg-violet-900/50 text-violet-300 border border-violet-700' }
  if (value.includes('/'))
    return { label: 'OpenRouter',             className: 'bg-violet-900/50 text-violet-300 border border-violet-700' }

  // Native Anthropic
  if (value.startsWith('claude-'))
    return { label: 'Anthropic',  className: 'bg-orange-900/50 text-orange-300 border border-orange-700' }

  // Native OpenAI (gpt-*, o1-*, o3-*, dall-e-*, gpt-image-*)
  if (value.startsWith('gpt-') || value.startsWith('o1-') || value.startsWith('o3-') ||
      value.startsWith('dall-e') || value.startsWith('gpt-image'))
    return { label: 'OpenAI', className: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700' }

  return null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

// ── Providers tab ─────────────────────────────────────────────────────────────

function ProvidersTab() {
  const [config,  setConfigState] = useState<Record<string, string>>({})
  const [saving,  setSaving]      = useState<string | null>(null)
  const [saved,   setSaved]       = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    getConfig()
      .then(setConfigState)
      .catch(() => {/* fallback to dropdown defaults */})
      .finally(() => setLoading(false))
  }, [])

  async function handleChange(key: string, value: string) {
    setConfigState(prev => ({ ...prev, [key]: value }))
    setSaving(key)
    try {
      await setConfig(key, value)
      setSaved(key)
      setTimeout(() => setSaved(null), 2000)
    } catch { /* silently ignore */ }
    finally { setSaving(null) }
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading config…</div>

  return (
    <div className="space-y-6">
      {PROVIDER_GROUPS.map(group => (
        <div key={group.title} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-200">{group.title}</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {group.rows.map(row => {
              // Resolve the first flat string as fallback default
              const firstFlat = row.options.find(o => typeof o === 'string') as string | undefined
              const firstGroup = row.options.find(o => typeof o !== 'string') as OptGroup | undefined
              const defaultVal = firstFlat ?? firstGroup?.items[0] ?? ''
              const current  = config[row.key] ?? defaultVal
              const isSaving = saving === row.key
              const isSaved  = saved  === row.key
              const badge    = getProviderBadge(current)

              return (
                <div key={row.key} className="flex items-center justify-between px-5 py-3 gap-4">
                  {/* Left: label + key */}
                  <div className="min-w-0">
                    <span className="text-sm text-gray-300">{row.label}</span>
                    <code className="text-xs text-gray-600 block mt-0.5">{row.key}</code>
                  </div>

                  {/* Right: badge + save feedback + select */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Provider badge — shown for model/API values */}
                    {badge && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${badge.className}`}>
                        {badge.label}
                      </span>
                    )}

                    {isSaved  && <span className="text-xs text-green-400 whitespace-nowrap">Saved ✓</span>}
                    {isSaving && <span className="text-xs text-gray-500 whitespace-nowrap">Saving…</span>}

                    {row.type === 'text' ? (
                      <input
                        type="text"
                        value={current}
                        placeholder={row.placeholder ?? ''}
                        onChange={e => handleChange(row.key, e.target.value)}
                        onBlur={e => handleChange(row.key, e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 w-[280px] placeholder:text-gray-600"
                      />
                    ) : (
                    <select
                      value={current}
                      onChange={e => handleChange(row.key, e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 max-w-[280px]"
                    >
                      {row.options.map(opt =>
                        typeof opt === 'string'
                          ? <option key={opt} value={opt}>{opt}</option>
                          : (
                            <optgroup key={opt.group} label={opt.group}>
                              {opt.items.map(o => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </optgroup>
                          )
                      )}
                    </select>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Jobs tab ──────────────────────────────────────────────────────────────────

const STEP_COLORS: Record<string, string> = {
  done:    'bg-green-900/40 text-green-400',
  failed:  'bg-red-900/40 text-red-400',
  partial: 'bg-orange-900/40 text-orange-400',
  skipped: 'bg-gray-800 text-gray-600',
  running: 'bg-blue-900/40 text-blue-400',
}

function JobsTab() {
  const [jobs,     setJobs]     = useState<PipelineJob[]>([])
  const [loading,  setLoading]  = useState(true)
  const [retrying, setRetrying] = useState<string | null>(null)  // job_id being retried

  async function loadJobs() {
    try {
      const data = await getAdminJobs(100)
      setJobs(data)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => { loadJobs() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRetry(jobId: string) {
    setRetrying(jobId)
    try {
      await retryJob(jobId)
      await loadJobs()
    } catch { /* silent */ }
    finally { setRetrying(null) }
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading jobs…</div>
  if (!jobs.length) return <div className="p-6 text-sm text-gray-600">No jobs yet.</div>

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
            <th className="text-left px-5 py-3">Book</th>
            <th className="text-left px-5 py-3">Status</th>
            <th className="text-left px-5 py-3">Steps</th>
            <th className="text-left px-5 py-3">Retries</th>
            <th className="text-left px-5 py-3">Time</th>
            <th className="text-left px-5 py-3">Created</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {jobs.map(job => {
            // Normalize result: handle legacy JSON string rows
            const jr = typeof job.result === 'string'
              ? (() => { try { return JSON.parse(job.result as string) } catch { return null } })()
              : job.result
            const steps      = jr?.steps ?? {}
            const isRetrying = retrying === job.id
            const canRetry   = job.status === 'failed' || job.status === 'partial'
            const retryCount = job.retry_count ?? 0
            const maxRetries = job.max_retries ?? 3

            return (
              <tr key={job.id} className="hover:bg-gray-800/40 transition-colors">
                <td className="px-5 py-3">
                  <p className="text-gray-200 font-medium truncate max-w-[180px]">
                    {jr?.metadata?.title ?? job.book_id}
                  </p>
                  <p className="text-xs text-gray-600 font-mono">{job.book_id}</p>
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(steps).length > 0
                      ? Object.entries(steps).map(([step, s]) => (
                          <span key={step}
                            className={`text-xs px-1.5 py-0.5 rounded font-mono ${STEP_COLORS[String(s)] ?? 'bg-gray-800 text-gray-400'}`}>
                            {step}
                          </span>
                        ))
                      : <span className="text-xs text-gray-600">—</span>
                    }
                  </div>
                </td>
                <td className="px-5 py-3 text-xs">
                  {retryCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-yellow-900/40 text-yellow-400 border border-yellow-800">
                      {retryCount}/{maxRetries}
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-xs text-gray-500">
                  {jr?.processing_time ?? '—'}
                </td>
                <td className="px-5 py-3 text-xs text-gray-500">
                  {timeAgo(job.created_at)}
                </td>
                <td className="px-5 py-3">
                  {canRetry && (
                    <button
                      onClick={() => handleRetry(job.id)}
                      disabled={isRetrying}
                      title="Retry this job (resets retry counter)"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-400 hover:text-white text-xs font-medium transition-colors border border-gray-700 hover:border-indigo-500"
                    >
                      {isRetrying ? (
                        <span className="inline-block w-3 h-3 border border-current/40 border-t-current rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m0 0a8 8 0 0114.83 2.999M4.582 9H9m11 11v-5h-.581m0 0a8 8 0 01-14.83-3M14.418 15H20" />
                        </svg>
                      )}
                      {isRetrying ? 'Retrying…' : 'Retry'}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Costs tab ─────────────────────────────────────────────────────────────────

const COST_DAYS_OPTIONS = [7, 30, 90]

function fmtUSD(n: number): string {
  if (n >= 100) return `$${n.toFixed(2)}`
  if (n >= 1)   return `$${n.toFixed(3)}`
  if (n > 0)    return `$${n.toFixed(4)}`
  return '$0.00'
}

function fmtUnits(n: number, unitType: string): string {
  const abbr = unitType === 'tokens' ? 'tok' : unitType === 'characters' ? 'chars' : unitType
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ${abbr}`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K ${abbr}`
  return `${n.toFixed(0)} ${abbr}`
}

function CostsTab() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [costs,   setCosts]   = useState<AdminCosts   | null>(null)
  const [days,    setDays]    = useState<number>(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getMetrics().catch(() => null),
      getCosts(days).catch(() => null),
    ]).then(([m, c]) => {
      setMetrics(m)
      setCosts(c)
    }).finally(() => setLoading(false))
  }, [days])

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading…</div>

  const Stat = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-semibold ${color}`}>{value}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Job-level metrics (unchanged) */}
      {metrics && (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Total Jobs" value={metrics.total}   color="text-gray-100" />
          <Stat label="Done"       value={metrics.done}    color="text-green-400" />
          <Stat label="Partial"    value={metrics.partial} color="text-orange-400" />
          <Stat label="Failed"     value={metrics.failed}  color="text-red-400" />
          <Stat label="Running"    value={metrics.running} color="text-blue-400" />
          <Stat label="Queued"     value={metrics.queued}  color="text-yellow-400" />
        </div>
      )}

      {/* Range selector + headline cost */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Estimated spend — last {costs?.days ?? days} days
          </p>
          <p className="text-4xl font-semibold text-indigo-400">
            {costs ? fmtUSD(costs.total_cost_usd) : '—'}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {costs ? `${costs.total_calls} external API calls logged` : ''}
          </p>
        </div>
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {COST_DAYS_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                days === d ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {(!costs || costs.total_calls === 0) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-200 mb-2">No usage logged yet</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            Cost rows are written to the{' '}
            <code className="text-xs bg-gray-800 px-1 py-0.5 rounded">usage_logs</code> table
            after each external API call. Run a pipeline job and check back here.
          </p>
        </div>
      )}

      {/* By provider */}
      {costs && costs.by_provider.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-200">Spend by provider</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2">Provider</th>
                <th className="text-right px-5 py-2">Calls</th>
                <th className="text-right px-5 py-2">Units</th>
                <th className="text-right px-5 py-2">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {costs.by_provider.map(row => (
                <tr key={row.provider} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-2 text-gray-200 font-medium">{row.provider}</td>
                  <td className="px-5 py-2 text-right text-gray-400">{row.calls}</td>
                  <td className="px-5 py-2 text-right text-gray-400 font-mono text-xs">
                    {row.units > 0 ? row.units.toLocaleString() : '—'}
                  </td>
                  <td className="px-5 py-2 text-right text-indigo-400 font-mono">
                    {fmtUSD(row.cost_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* By step */}
      {costs && costs.by_step.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-200">Spend by pipeline step</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2">Step</th>
                <th className="text-right px-5 py-2">Calls</th>
                <th className="text-right px-5 py-2">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {costs.by_step.map(row => (
                <tr key={row.step} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-2 text-gray-200 font-medium font-mono text-xs">{row.step}</td>
                  <td className="px-5 py-2 text-right text-gray-400">{row.calls}</td>
                  <td className="px-5 py-2 text-right text-indigo-400 font-mono">
                    {fmtUSD(row.cost_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* By model */}
      {costs && costs.by_model.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-200">Spend by model</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2">Model</th>
                <th className="text-left px-5 py-2">Provider</th>
                <th className="text-right px-5 py-2">Calls</th>
                <th className="text-right px-5 py-2">Units</th>
                <th className="text-right px-5 py-2">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {costs.by_model.map(row => (
                <tr key={row.model} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-2 text-gray-200 font-mono text-xs">{row.model}</td>
                  <td className="px-5 py-2 text-gray-500 text-xs">{row.provider}</td>
                  <td className="px-5 py-2 text-right text-gray-400">{row.calls}</td>
                  <td className="px-5 py-2 text-right text-gray-400 font-mono text-xs">
                    {row.units > 0 ? fmtUnits(row.units, row.unit_type) : '—'}
                  </td>
                  <td className="px-5 py-2 text-right text-indigo-400 font-mono">
                    {fmtUSD(row.cost_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-600">
        Cost figures are estimates based on published provider rates. Actual billing may differ.
      </p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'providers' | 'jobs' | 'costs'

const TABS: { id: Tab; label: string }[] = [
  { id: 'providers', label: 'Providers' },
  { id: 'jobs',      label: 'Jobs'      },
  { id: 'costs',     label: 'Costs'     },
]

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('providers')

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-100 mb-1">Admin Panel</h1>
      <p className="text-sm text-gray-500 mb-6">
        Configure AI providers and monitor pipeline jobs. Changes take effect on the next job — no restart needed.
      </p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'providers' && <ProvidersTab />}
      {tab === 'jobs'      && <JobsTab />}
      {tab === 'costs'     && <CostsTab />}
    </div>
  )
}
