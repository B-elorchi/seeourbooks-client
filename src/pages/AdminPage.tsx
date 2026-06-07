import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  getConfig, setConfig, getMetrics, getAdminJobs, retryJob, getCosts,
  getOpenRouterModels,
  getCatalogTables, getCatalog,
} from '../api/admin'
import type { AdminMetrics, PipelineJob, AdminCosts, CatalogTableMeta } from '../types'
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
// type:
//   undefined → <select> dropdown (default)
//   'text'    → free-text <input> only
//   'combo'   → <select> dropdown with an extra "✏️ Other (custom)…" item;
//               picking it reveals a text input where the user types any value
type OptGroup = { group: string; items: string[] }
type OptionList = Array<string | OptGroup>
type RowType = 'text' | 'combo'

// Helpers to build grouped lists cleanly
const g = (group: string, items: string[]): OptGroup => ({ group, items })

// Flatten OptionList → plain string[] (used by the searchable combo to detect custom values).
function flattenOptions(opts: OptionList): string[] {
  const out: string[] = []
  for (const o of opts) {
    if (typeof o === 'string') out.push(o)
    else out.push(...o.items)
  }
  return out
}

// ── Config rows ───────────────────────────────────────────────────────────────
const PROVIDER_GROUPS: Array<{
  title: string
  rows: Array<{ key: string; label: string; options: OptionList; type?: RowType; placeholder?: string }>
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
        key: 'IMAGE_MODEL_EN', label: 'Model (EN)',
        type: 'combo',
        placeholder: 'Pick or type any OpenRouter / OpenAI model name…',
        options: [
          g('🟢 OpenAI — Native API',   OPENAI_IMG_MODELS),
          g('🔀 OpenRouter → FLUX / Gemini / SD', OR_IMG_MODELS),
        ],
      },
      {
        key: 'IMAGE_MODEL_AR', label: 'Model (AR)',
        type: 'combo',
        placeholder: 'Pick or type any OpenRouter / OpenAI model name…',
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
      { key: 'PIPELINE_STEP_INJECT_EPUB',      label: 'Inject EPUB',      options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_VIDEO',            label: 'Video',            options: ['true', 'false'] },
    ],
  },
  {
    title: 'Video Generation',
    rows: [
      {
        key: 'VIDEO_PROVIDER',
        label: 'Provider',
        options: [
          'moviepy',
          'svd',
          'cogvideox',
        ],
      },
      {
        key: 'VIDEO_ORIENTATION',
        label: 'Orientation',
        options: ['portrait', 'landscape'],
      },
      {
        key: 'VIDEO_FPS',
        label: 'Frame rate',
        options: ['24', '30', '60'],
      },
      {
        key: 'VIDEO_BITRATE',
        label: 'Bitrate',
        options: ['2500k', '3500k', '5000k', '8000k'],
      },
    ],
  },
  {
    title: 'EPUB Source',
    rows: [
      {
        key: 'BOOK_FILES_BASE_URL',
        label: 'Base URL for /books/{english|arabic}/{book_id}.epub',
        options: [],
        type: 'text',
        placeholder: 'https://files.seeourbooks.com',
      },
    ],
  },
  {
    title: 'Documents Pipeline (PDF → OCR → AI)',
    rows: [
      {
        key: 'DOC_AI_PROVIDER',
        label: 'AI Provider',
        options: ['openrouter', 'deepseek', 'openai', 'claude'],
      },
      {
        // Live list of OpenRouter chat models is injected dynamically in
        // ProvidersTab.useMemo — same treatment as MODEL_HAIKU / SONNET / OPUS.
        // Hardcoded fallbacks below show as a quick-pick when the live list
        // hasn't loaded yet (cold start, OpenRouter unreachable, etc.).
        key: 'DOC_AI_MODEL',
        label: 'AI Model',
        type: 'combo',
        placeholder: 'deepseek/deepseek-chat',
        options: [
          g('🌟 Recommended (OpenRouter — cheap)', [
            'deepseek/deepseek-chat',           // DeepSeek V3 — $0.14 / 1M tokens
            'deepseek/deepseek-chat-v3-0324',   // Pinned snapshot
            'google/gemini-2.5-flash-preview',
            'qwen/qwen2.5-72b-instruct',
          ]),
          g('💎 OpenRouter — higher quality', [
            'anthropic/claude-sonnet-4-6',
            'openai/gpt-4.1-mini',
            'openai/gpt-4.1',
            'meta-llama/llama-3.3-70b-instruct',
          ]),
          g('🟣 Native Anthropic (uses ANTHROPIC_API_KEY)', CLAUDE_MODELS),
          g('🟢 Native OpenAI (uses OPENAI_API_KEY)',      GPT_CHAT_MODELS),
        ],
      },
      {
        key: 'DOC_OCR_LANGUAGES',
        label: 'OCR Languages (tesseract codes)',
        options: [],
        type: 'text',
        placeholder: 'ara+eng',
      },
      {
        key: 'DOC_CHUNK_SIZE_WORDS',
        label: 'Chunk size (words per knowledge_chunks row)',
        options: [],
        type: 'text',
        placeholder: '750',
      },
      {
        key: 'EMBEDDING_PROVIDER',
        label: 'Embedding Provider',
        // (empty option = disabled — chunks saved without vectors)
        // openrouter = any vendor/model via your OPENROUTER_API_KEY
        // openai     = native OpenAI API key
        // deepseek   = native DeepSeek API key
        options: ['', 'openrouter', 'openai', 'deepseek'],
      },
      {
        key: 'EMBEDDING_MODEL',
        label: 'Embedding Model',
        type: 'combo',
        placeholder: 'openai/text-embedding-3-small',
        options: [
          g('🌟 Recommended (OpenRouter)', [
            'openai/text-embedding-3-small',     // cheap, fast, 1536 dims
            'openai/text-embedding-3-large',     // higher quality, 3072 dims
            'voyageai/voyage-3',                 // best for retrieval
            'voyageai/voyage-3-large',
            'mistralai/mistral-embed',
            'cohere/embed-multilingual-v3.0',    // best for Arabic + multilingual
            'cohere/embed-english-v3.0',
          ]),
          g('🟢 OpenAI native (uses OPENAI_API_KEY)', [
            'text-embedding-3-small',
            'text-embedding-3-large',
            'text-embedding-ada-002',
          ]),
        ],
      },
    ],
  },
  {
    title: 'Reliability — Model Fallback',
    rows: [
      {
        key: 'ENABLE_MODEL_FALLBACK',
        label: 'Auto-fallback on model failure',
        options: ['true', 'false'],
      },
      {
        // Optional per-model overrides — comma-separated list of fallback models
        // tried in order when the primary fails with a recoverable error
        // (credit out, rate-limit, 5xx, timeout). Leave blank to use the
        // built-in default chain in ai_client.py.
        key: 'FALLBACK_claude-haiku-4-5-20251001',
        label: 'Fallback chain — Haiku',
        options: [],
        type: 'text',
        placeholder: 'anthropic/claude-haiku-4-5, openai/gpt-4.1-mini, gpt-4.1-mini',
      },
      {
        key: 'FALLBACK_claude-sonnet-4-6',
        label: 'Fallback chain — Sonnet',
        options: [],
        type: 'text',
        placeholder: 'anthropic/claude-sonnet-4-6, openai/gpt-4.1, gpt-4.1',
      },
      {
        key: 'FALLBACK_claude-opus-4-7',
        label: 'Fallback chain — Opus',
        options: [],
        type: 'text',
        placeholder: 'anthropic/claude-opus-4-7, openai/gpt-4.1, gpt-4.1',
      },
      {
        key: 'FALLBACK_gpt-4.1-mini',
        label: 'Fallback chain — gpt-4.1-mini',
        options: [],
        type: 'text',
        placeholder: 'openai/gpt-4.1-mini, anthropic/claude-haiku-4-5, claude-haiku-4-5',
      },
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

// ── Searchable popover dropdown ──────────────────────────────────────────────
// Used by combo-type rows so users can search through hundreds of live
// OpenRouter models instead of scrolling a giant native <select>.
//
// Behaviour:
//   - Closed state shows the current value (or placeholder) in a button.
//   - Click opens a popover with a search box + filtered, grouped list.
//   - Typing filters across every option in every group.
//   - If the typed query doesn't match an option, a "Use {query} as custom"
//     row appears at the bottom — same UX as the previous "Other..." entry.
//   - Click outside / press Escape to close.

function SearchableSelect({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string
  options: OptionList
  placeholder?: string
  onChange: (v: string) => void
}) {
  const [open, setOpen]         = useState(false)
  const [query, setQuery]       = useState('')
  const [pos, setPos]           = useState<{ top: number; left: number; width: number } | null>(null)
  const buttonRef               = useRef<HTMLButtonElement>(null)
  const popoverRef              = useRef<HTMLDivElement>(null)

  const POPOVER_WIDTH = 360

  // Recompute popover position relative to the button — keeps it pinned
  // even as the user scrolls the admin panel.
  function updatePosition() {
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    // Anchor the popover's right edge to the button's right edge.
    const left = Math.max(8, rect.right - POPOVER_WIDTH)
    // Drop down by default; if the popover would clip the bottom of the
    // viewport, flip it above the button instead.
    let top = rect.bottom + 4
    const estimatedHeight = 360
    if (top + estimatedHeight > window.innerHeight && rect.top > estimatedHeight) {
      top = rect.top - estimatedHeight - 4
    }
    setPos({ top, left, width: POPOVER_WIDTH })
  }

  useEffect(() => {
    if (!open) return
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Close on click outside — check both the button AND the portal'd popover
  // because they live in different DOM trees.
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const target = e.target as Node
      const insideButton  = buttonRef.current?.contains(target)
      const insidePopover = popoverRef.current?.contains(target)
      if (!insideButton && !insidePopover) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Filter the option list against the search query
  const matches = (s: string) =>
    !query || s.toLowerCase().includes(query.toLowerCase())

  const flatTop:    string[]   = []
  const grouped:    OptGroup[] = []
  for (const o of options) {
    if (typeof o === 'string') {
      if (matches(o)) flatTop.push(o)
    } else {
      const items = o.items.filter(matches)
      if (items.length > 0) grouped.push({ group: o.group, items })
    }
  }

  // "Use custom value" row appears when the query doesn't exactly match any
  // existing option — lets the admin paste in fresh model ids.
  const allValues = flattenOptions(options)
  const showCustomCommit = query.trim() !== '' && !allValues.includes(query.trim())

  function commit(v: string) {
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  const totalMatches = flatTop.length + grouped.reduce((s, g) => s + g.items.length, 0)

  // ── Popover (rendered via Portal at document.body to escape parent
  //    overflow-hidden + create its own stacking context) ────────────────
  const popover = open && pos ? (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top:      pos.top,
        left:     pos.left,
        width:    pos.width,
        zIndex:   9999,
      }}
      className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl"
    >
      <input
        type="text"
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); setQuery('') }
          if (e.key === 'Enter' && showCustomCommit) commit(query.trim())
        }}
        placeholder="Search models…  (or paste a custom name)"
        className="w-full px-3 py-2 bg-gray-950 border-b border-gray-800 text-sm text-gray-100 focus:outline-none placeholder:text-gray-600 rounded-t-lg"
      />

      <div className="max-h-72 overflow-y-auto">
        {/* Flat (ungrouped) options */}
        {flatTop.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => commit(opt)}
            className={`block w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-indigo-700/40 ${
              value === opt ? 'bg-indigo-900/40 text-indigo-200' : 'text-gray-200'
            }`}
          >
            {opt}
          </button>
        ))}

        {/* Grouped options */}
        {grouped.map(grp => (
          <div key={grp.group}>
            <div className="sticky top-0 px-3 py-1 text-[11px] uppercase tracking-wide text-gray-500 bg-gray-900/95 border-b border-gray-800">
              {grp.group}
            </div>
            {grp.items.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => commit(opt)}
                className={`block w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-indigo-700/40 ${
                  value === opt ? 'bg-indigo-900/40 text-indigo-200' : 'text-gray-200'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        ))}

        {/* Empty state */}
        {totalMatches === 0 && !showCustomCommit && (
          <div className="px-3 py-4 text-center text-sm text-gray-500">
            No models match “{query}”
          </div>
        )}

        {/* Commit-as-custom row */}
        {showCustomCommit && (
          <button
            type="button"
            onClick={() => commit(query.trim())}
            className="block w-full text-left px-3 py-2 text-sm hover:bg-indigo-700/40 border-t border-gray-800 text-gray-300"
          >
            ✏️ Use “<span className="font-mono text-indigo-300">{query.trim()}</span>” as custom
          </button>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-gray-800 text-[11px] text-gray-600 flex justify-between rounded-b-lg">
        <span>{totalMatches} model{totalMatches === 1 ? '' : 's'}</span>
        <span>Esc to close · Enter to use custom</span>
      </div>
    </div>
  ) : null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 w-[320px] text-left flex items-center justify-between gap-2 hover:border-gray-600"
      >
        <span className={`truncate ${value ? 'font-mono' : 'text-gray-500'}`}>
          {value || placeholder || 'Select…'}
        </span>
        <span className="text-gray-500 text-xs">▾</span>
      </button>

      {popover && createPortal(popover, document.body)}
    </>
  )
}


// ── Providers tab ─────────────────────────────────────────────────────────────

function ProvidersTab() {
  const [config,  setConfigState] = useState<Record<string, string>>({})
  const [saving,  setSaving]      = useState<string | null>(null)
  const [saved,   setSaved]       = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  // Live OpenRouter model lists — fetched once per tab mount.  Server-side
  // caches each modality for an hour, so refreshing the page is cheap.
  // Falls back to the hardcoded lists on failure.
  const [orImageModels, setOrImageModels] = useState<string[] | null>(null)
  const [orChatModels,  setOrChatModels]  = useState<string[] | null>(null)
  const [orVisionModels, setOrVisionModels] = useState<string[] | null>(null)

  useEffect(() => {
    getConfig()
      .then(setConfigState)
      .catch(() => {/* fallback to dropdown defaults */})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // Kick off all three live lists in parallel — independent of each other,
    // each one falls back independently if its request fails.
    getOpenRouterModels('image')
      .then(r => { if (r.models?.length) setOrImageModels(r.models.map(m => m.id)) })
      .catch(() => {})
    getOpenRouterModels('chat')
      .then(r => { if (r.models?.length) setOrChatModels(r.models.map(m => m.id)) })
      .catch(() => {})
    getOpenRouterModels('vision')
      .then(r => { if (r.models?.length) setOrVisionModels(r.models.map(m => m.id)) })
      .catch(() => {})
  }, [])

  // Build the live PROVIDER_GROUPS by injecting the live OpenRouter lists
  // into the dropdowns for image, chat, and vision model rows.
  const providerGroups = useMemo(() => {
    // ── Image rows: IMAGE_MODEL_EN, IMAGE_MODEL_AR ──────────────────────────
    const liveImage = orImageModels && orImageModels.length > 0 ? orImageModels : OR_IMG_MODELS
    const liveImageLabel = orImageModels && orImageModels.length > 0
      ? `🔀 OpenRouter — Live (${liveImage.length} image models)`
      : '🔀 OpenRouter → FLUX / Gemini / SD'

    // ── Chat rows: MODEL_HAIKU, MODEL_SONNET, MODEL_OPUS, MODEL_MINDMAP ─────
    // Live list contains 200+ models; admin can search.  Hardcoded native
    // Claude / GPT lists stay at the top so common picks are still 1-click.
    const liveChat = orChatModels && orChatModels.length > 0 ? orChatModels : null
    const liveChatLabel = liveChat
      ? `🔀 OpenRouter — Live (${liveChat.length} chat models)`
      : '🔀 OpenRouter'

    // ── Vision rows: ALTTEXT_MODEL_EN, ALTTEXT_MODEL_AR ─────────────────────
    const liveVision = orVisionModels && orVisionModels.length > 0 ? orVisionModels : null
    const liveVisionLabel = liveVision
      ? `🔀 OpenRouter — Live (${liveVision.length} vision models)`
      : '🔀 OpenRouter'

    // Per-row options builders
    const buildChatOptions = (existing: OptionList): OptionList => {
      const base = existing.filter(o => typeof o !== 'string') as OptGroup[]
      const native = base.filter(g => !g.group.startsWith('🔀'))
      return liveChat
        ? [...native, g(liveChatLabel, liveChat)]
        : existing
    }

    const buildVisionOptions = (existing: OptionList): OptionList => {
      const base = existing.filter(o => typeof o !== 'string') as OptGroup[]
      const native = base.filter(g => !g.group.startsWith('🔀'))
      return liveVision
        ? [...native, g(liveVisionLabel, liveVision)]
        : existing
    }

    const CHAT_ROW_KEYS = new Set([
      'MODEL_HAIKU', 'MODEL_SONNET', 'MODEL_OPUS', 'MODEL_MINDMAP',
      // DOC_AI_MODEL: documents pipeline summary + structured JSON.
      // Inherits the same searchable live-OpenRouter combo treatment.
      'DOC_AI_MODEL',
    ])
    const VISION_ROW_KEYS = new Set(['ALTTEXT_MODEL_EN', 'ALTTEXT_MODEL_AR'])
    const IMAGE_ROW_KEYS = new Set(['IMAGE_MODEL_EN', 'IMAGE_MODEL_AR'])

    return PROVIDER_GROUPS.map(group => ({
      ...group,
      rows: group.rows.map(row => {
        if (IMAGE_ROW_KEYS.has(row.key)) {
          return {
            ...row,
            type: 'combo' as RowType,
            options: [
              g('🟢 OpenAI — Native API', OPENAI_IMG_MODELS),
              g(liveImageLabel, liveImage),
            ] as OptionList,
          }
        }
        if (CHAT_ROW_KEYS.has(row.key)) {
          return { ...row, type: 'combo' as RowType, options: buildChatOptions(row.options) }
        }
        if (VISION_ROW_KEYS.has(row.key)) {
          return { ...row, type: 'combo' as RowType, options: buildVisionOptions(row.options) }
        }
        return row
      }),
    }))
  }, [orImageModels, orChatModels, orVisionModels])

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
      {providerGroups.map(group => (
        <div key={group.title} className="bg-gray-900 border border-gray-800 rounded-xl overflow-visible">
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
                    ) : row.type === 'combo' ? (
                      <SearchableSelect
                        value={current}
                        options={row.options}
                        placeholder={row.placeholder ?? 'Pick or search a model…'}
                        onChange={v => handleChange(row.key, v)}
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

// ── Catalog tab ───────────────────────────────────────────────────────────────
// Read-only inspector for Supabase tables.  Lets the admin verify what's
// actually stored in books / chunks / covers / pipeline_jobs / etc.

const CATALOG_PAGE_SIZE = 50

function formatCellValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v
  try { return JSON.stringify(v) } catch { return String(v) }
}

function CatalogTab() {
  const [tables,   setTables]   = useState<CatalogTableMeta[]>([])
  const [table,    setTable]    = useState<string>('books')
  const [bookId,   setBookId]   = useState<string>('')
  const [offset,   setOffset]   = useState<number>(0)
  const [rows,     setRows]     = useState<Record<string, unknown>[]>([])
  const [loading,  setLoading]  = useState<boolean>(false)
  const [error,    setError]    = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)  // "row:col" key

  // Load the list of allowed tables once on mount
  useEffect(() => {
    getCatalogTables()
      .then(r => setTables(r.tables))
      .catch(() => { /* keep dropdown disabled until reload */ })
  }, [])

  const tableMeta = useMemo(
    () => tables.find(t => t.name === table),
    [tables, table],
  )

  const supportsBookIdFilter = tableMeta?.supports_book_id ?? false

  async function load(nextOffset: number = offset) {
    setLoading(true)
    setError(null)
    try {
      const data = await getCatalog(table, {
        limit:  CATALOG_PAGE_SIZE,
        offset: nextOffset,
        book_id: supportsBookIdFilter && bookId.trim() ? bookId.trim() : undefined,
      })
      setRows(data.rows)
      setOffset(data.offset)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  // Reload whenever the table changes or the user presses search
  useEffect(() => {
    setOffset(0)
    void load(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table])

  // Detect columns from the first row (each table has a different shape)
  const columns = rows.length > 0 ? Object.keys(rows[0]) : []

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <label className="text-xs text-gray-500 uppercase tracking-wide">Table</label>
        <select
          value={table}
          onChange={e => setTable(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 max-w-[260px]"
        >
          {tables.map(t => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
          {tables.length === 0 && <option value={table}>{table}</option>}
        </select>

        {supportsBookIdFilter && (
          <>
            <label className="text-xs text-gray-500 uppercase tracking-wide ml-2">
              book_id
            </label>
            <input
              type="text"
              value={bookId}
              onChange={e => setBookId(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setOffset(0); void load(0) } }}
              placeholder="e.g. 12345"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 w-[180px]"
            />
            <button
              onClick={() => { setOffset(0); void load(0) }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-3 py-1.5 rounded-lg"
            >
              Search
            </button>
            {bookId && (
              <button
                onClick={() => { setBookId(''); setOffset(0); void load(0) }}
                className="text-xs text-gray-400 hover:text-gray-200"
              >
                Clear
              </button>
            )}
          </>
        )}

        <div className="flex-1" />

        <button
          onClick={() => void load(offset)}
          disabled={loading}
          className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4 text-sm text-red-300">
          <span className="font-medium">Error:</span> {error}
        </div>
      )}

      {/* Empty / loading */}
      {!loading && !error && rows.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-sm text-gray-500 text-center">
          No rows {bookId ? `for book_id=${bookId}` : 'returned'} from{' '}
          <code className="text-gray-400 bg-gray-800 px-1 py-0.5 rounded">{table}</code>.
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[640px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-[10px] text-gray-500 uppercase tracking-wide sticky top-0 bg-gray-900">
                  {columns.map(c => (
                    <th
                      key={c}
                      className="text-left px-3 py-2 font-medium whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-800/30 transition-colors align-top">
                    {columns.map(c => {
                      const cellKey = `${i}:${c}`
                      const raw     = row[c]
                      const text    = formatCellValue(raw)
                      const isLong  = text.length > 80
                      const isOpen  = expanded === cellKey
                      const isNull  = raw === null || raw === undefined
                      return (
                        <td
                          key={c}
                          className={`px-3 py-2 align-top ${isNull ? 'text-gray-600 italic' : 'text-gray-300'}`}
                        >
                          {isLong && !isOpen ? (
                            <button
                              onClick={() => setExpanded(cellKey)}
                              className="text-left text-gray-300 hover:text-indigo-300 font-mono"
                              title="Click to expand"
                            >
                              {text.slice(0, 80)}…
                            </button>
                          ) : isLong && isOpen ? (
                            <div>
                              <pre className="text-[11px] text-gray-300 whitespace-pre-wrap max-w-[640px] font-mono">{text}</pre>
                              <button
                                onClick={() => setExpanded(null)}
                                className="mt-1 text-[10px] text-gray-500 hover:text-gray-300"
                              >
                                ▴ Collapse
                              </button>
                            </div>
                          ) : (
                            <span className={isNull ? '' : 'font-mono'}>{text}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 text-xs text-gray-500">
            <span>
              Showing rows <span className="text-gray-300">{offset + 1}–{offset + rows.length}</span>
              {' '}from <code className="text-gray-400 bg-gray-800 px-1 py-0.5 rounded">{table}</code>
              {bookId && supportsBookIdFilter && (
                <> · filtered <code className="text-gray-400 bg-gray-800 px-1 py-0.5 rounded">book_id={bookId}</code></>
              )}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => void load(Math.max(0, offset - CATALOG_PAGE_SIZE))}
                disabled={offset === 0 || loading}
                className="px-3 py-1 rounded border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <button
                onClick={() => void load(offset + CATALOG_PAGE_SIZE)}
                disabled={rows.length < CATALOG_PAGE_SIZE || loading}
                className="px-3 py-1 rounded border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ── Prompts tab ───────────────────────────────────────────────────────────────

const PROMPT_ROWS: Array<{
  key:         string
  label:       string
  description: string
  variables:   string[]
}> = [
  {
    key:         'PROMPT_COVER',
    label:       'Cover Image Prompt',
    description: 'Sent to the image generation model (DALL-E, FLUX, Gemini…). Controls the visual style and text layout of the generated book cover.',
    variables:   ['{title}', '{author}', '{details}', '{summary}', '{genre_hint}'],
  },
  {
    key:         'PROMPT_MINDMAP_MERMAID',
    label:       'Mind Map Prompt — Mermaid',
    description: 'Used when MINDMAP_FORMAT = mermaid. The model must output valid Mermaid graph TD syntax.',
    variables:   ['{title}', '{summary}', '{lang_note}'],
  },
  {
    key:         'PROMPT_MINDMAP_JSON',
    label:       'Mind Map Prompt — JSON',
    description: 'Used when MINDMAP_FORMAT = json. The model must output the exact JSON structure shown in the prompt.',
    variables:   ['{title}', '{summary}', '{lang_note}'],
  },
]

function PromptsTab() {
  const [config,  setConfigState] = useState<Record<string, string>>({})
  const [drafts,  setDrafts]      = useState<Record<string, string>>({})
  const [saving,  setSaving]      = useState<string | null>(null)
  const [saved,   setSaved]       = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    getConfig()
      .then(cfg => {
        setConfigState(cfg)
        const initial: Record<string, string> = {}
        for (const row of PROMPT_ROWS) initial[row.key] = cfg[row.key] ?? ''
        setDrafts(initial)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(key: string) {
    setSaving(key)
    try {
      await setConfig(key, drafts[key] ?? '')
      setConfigState(prev => ({ ...prev, [key]: drafts[key] ?? '' }))
      setSaved(key)
      setTimeout(() => setSaved(null), 2000)
    } catch { /* silently ignore */ }
    finally { setSaving(null) }
  }

  function handleReset(key: string) {
    // Pull the current saved value back into the draft
    setDrafts(prev => ({ ...prev, [key]: config[key] ?? '' }))
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading prompts…</div>

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Edit the AI prompts used for image generation and mind maps. Use the placeholder variables
        listed under each prompt — the pipeline replaces them at runtime.
        Changes take effect on the next pipeline job.
      </p>

      {PROMPT_ROWS.map(row => {
        const draft    = drafts[row.key] ?? ''
        const original = config[row.key] ?? ''
        const isDirty  = draft !== original
        const isSaving = saving === row.key
        const isSaved  = saved  === row.key

        return (
          <div key={row.key} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3 border-b border-gray-800 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-200">{row.label}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{row.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {row.variables.map(v => (
                    <code key={v} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800 text-indigo-300 border border-gray-700">
                      {v}
                    </code>
                  ))}
                </div>
              </div>
              <code className="text-xs text-gray-600 shrink-0 mt-0.5">{row.key}</code>
            </div>

            {/* Textarea */}
            <div className="p-4">
              <textarea
                value={draft}
                onChange={e => setDrafts(prev => ({ ...prev, [row.key]: e.target.value }))}
                rows={12}
                spellCheck={false}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 font-mono focus:outline-none focus:border-indigo-500 resize-y leading-relaxed placeholder:text-gray-600"
              />
            </div>

            {/* Footer actions */}
            <div className="px-4 pb-4 flex items-center gap-3">
              <button
                onClick={() => handleSave(row.key)}
                disabled={!isDirty || isSaving}
                className="px-4 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>

              {isDirty && !isSaving && (
                <button
                  onClick={() => handleReset(row.key)}
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
                >
                  Discard
                </button>
              )}

              {isSaved && (
                <span className="text-xs text-green-400">Saved ✓</span>
              )}

              {isDirty && !isSaving && (
                <span className="text-xs text-amber-400 ml-auto">Unsaved changes</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}


// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'providers' | 'prompts' | 'jobs' | 'costs' | 'catalog'

const TABS: { id: Tab; label: string }[] = [
  { id: 'providers', label: 'Providers' },
  { id: 'prompts',   label: 'Prompts'   },
  { id: 'jobs',      label: 'Jobs'      },
  { id: 'costs',     label: 'Costs'     },
  { id: 'catalog',   label: 'Catalog'   },
]

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('providers')

  return (
    <div className="p-8 max-w-6xl mx-auto">
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
      {tab === 'prompts'   && <PromptsTab />}
      {tab === 'jobs'      && <JobsTab />}
      {tab === 'costs'     && <CostsTab />}
      {tab === 'catalog'   && <CatalogTab />}
    </div>
  )
}
