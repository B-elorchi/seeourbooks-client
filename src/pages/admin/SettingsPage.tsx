import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  getConfig, setConfig,
  getOpenRouterModels, getElevenLabsVoices, previewTTS,
} from '../../api/admin'
import type { ElevenLabsVoice } from '../../api/admin'
import { PageShell, PageHeader } from './_shared'

// ── Model groups ──────────────────────────────────────────────────────────────
const CLAUDE_MODELS   = ['claude-haiku-4-5-20251001', 'claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7']
const GPT_CHAT_MODELS = ['gpt-4.1-mini', 'gpt-4.1', 'o3-mini', 'o1-mini']
const OPENAI_IMG_MODELS = ['dall-e-3', 'gpt-image-1', 'dall-e-2']
const OR_IMG_MODELS = [
  'google/gemini-2.5-flash-image',
  'black-forest-labs/flux-1.1-pro',
  'black-forest-labs/flux-schnell',
  'stability-ai/stable-diffusion-3.5-large',
]
const OR_CLAUDE = CLAUDE_MODELS.map(m => `anthropic/${m}`)
const OR_GPT    = GPT_CHAT_MODELS.map(m => `openai/${m}`)

// ── Option types ──────────────────────────────────────────────────────────────
type OptGroup  = { group: string; items: string[] }
type OptionList = Array<string | OptGroup>
type RowType   = 'text' | 'combo'
const g = (group: string, items: string[]): OptGroup => ({ group, items })

function flattenOptions(opts: OptionList): string[] {
  const out: string[] = []
  for (const o of opts) {
    if (typeof o === 'string') out.push(o)
    else out.push(...o.items)
  }
  return out
}

// ── Provider badge ────────────────────────────────────────────────────────────
type BadgeInfo = { label: string; className: string }
function getProviderBadge(value: string): BadgeInfo | null {
  if (value.startsWith('anthropic/'))
    return { label: 'OpenRouter › Anthropic', className: 'bg-violet-50 text-violet-700 border border-violet-200' }
  if (value.startsWith('openai/'))
    return { label: 'OpenRouter › OpenAI', className: 'bg-violet-50 text-violet-700 border border-violet-200' }
  if (value.includes('/'))
    return { label: 'OpenRouter', className: 'bg-violet-50 text-violet-700 border border-violet-200' }
  if (value.startsWith('claude-'))
    return { label: 'Anthropic', className: 'bg-orange-50 text-orange-700 border border-orange-200' }
  if (value.startsWith('gpt-') || value.startsWith('o1-') || value.startsWith('o3-') ||
      value.startsWith('dall-e') || value.startsWith('gpt-image'))
    return { label: 'OpenAI', className: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700' }
  return null
}

// ── TTS voice catalog ─────────────────────────────────────────────────────────
// Gender-tagged voice lists used by the admin TTS picker and preview grid.

type VoiceGender = 'Female' | 'Male'
type TtsVoiceEntry = { name: string; gender: VoiceGender }

const GEMINI_VOICES: TtsVoiceEntry[] = [
  { name: 'Achernar',      gender: 'Female' },
  { name: 'Achird',        gender: 'Male'   },
  { name: 'Algenib',       gender: 'Male'   },
  { name: 'Algieba',       gender: 'Male'   },
  { name: 'Alnilam',       gender: 'Male'   },
  { name: 'Aoede',         gender: 'Female' },
  { name: 'Autonoe',       gender: 'Female' },
  { name: 'Callirrhoe',    gender: 'Female' },
  { name: 'Charon',        gender: 'Male'   },
  { name: 'Despina',       gender: 'Female' },
  { name: 'Enceladus',     gender: 'Male'   },
  { name: 'Erinome',       gender: 'Female' },
  { name: 'Fenrir',        gender: 'Male'   },
  { name: 'Gacrux',        gender: 'Female' },
  { name: 'Iapetus',       gender: 'Male'   },
  { name: 'Kore',          gender: 'Female' },
  { name: 'Laomedeia',     gender: 'Female' },
  { name: 'Leda',          gender: 'Female' },
  { name: 'Orus',          gender: 'Male'   },
  { name: 'Puck',          gender: 'Male'   },
  { name: 'Pulcherrima',   gender: 'Female' },
  { name: 'Rasalgethi',    gender: 'Male'   },
  { name: 'Sadachbia',     gender: 'Male'   },
  { name: 'Sadaltager',    gender: 'Male'   },
  { name: 'Schedar',       gender: 'Male'   },
  { name: 'Sulafat',       gender: 'Female' },
  { name: 'Umbriel',       gender: 'Male'   },
  { name: 'Vindemiatrix',  gender: 'Female' },
  { name: 'Zephyr',        gender: 'Female' },
  { name: 'Zubenelgenubi', gender: 'Male'   },
]

const OPENAI_VOICES: TtsVoiceEntry[] = [
  { name: 'alloy',   gender: 'Female' },
  { name: 'echo',    gender: 'Male'   },
  { name: 'fable',   gender: 'Male'   },
  { name: 'onyx',    gender: 'Male'   },
  { name: 'nova',    gender: 'Female' },
  { name: 'shimmer', gender: 'Female' },
  { name: 'coral',   gender: 'Female' },
  { name: 'verse',   gender: 'Male'   },
  { name: 'ballad',  gender: 'Male'   },
  { name: 'ash',     gender: 'Male'   },
  { name: 'sage',    gender: 'Female' },
  { name: 'marin',   gender: 'Female' },
  { name: 'cedar',   gender: 'Male'   },
]

const DEEPGRAM_VOICES: TtsVoiceEntry[] = [
  { name: 'aura-asteria-en', gender: 'Female' },
  { name: 'aura-arcas-en',   gender: 'Male'   },
  { name: 'aura-luna-en',    gender: 'Female' },
]

const _GEMINI_NAME_SET = new Set(GEMINI_VOICES.map(v => v.name))

const genderSymbol = (g: VoiceGender) => g === 'Female' ? '♀' : '♂'
const genderColor  = (g: VoiceGender) => g === 'Female' ? 'text-pink-500' : 'text-sky-500'
const genderLabel  = (g: VoiceGender) => g === 'Female' ? 'Female' : 'Male'

const _TTS_PROVIDER_DEFAULTS: Record<'EN' | 'AR', string> = { EN: 'deepgram', AR: 'cartesia' }
function ttsProvider(cfg: Record<string, string>, lang: 'EN' | 'AR'): string {
  return (cfg[`TTS_PROVIDER_${lang}`] || _TTS_PROVIDER_DEFAULTS[lang]).toLowerCase()
}
function ttsUsesProvider(cfg: Record<string, string>, provider: string): boolean {
  return ttsProvider(cfg, 'EN') === provider || ttsProvider(cfg, 'AR') === provider
}

// ── Config groups ─────────────────────────────────────────────────────────────
type VoiceGridSpec = { provider: 'openrouter' | 'gemini'; modelKey: string; lang: 'en' | 'ar' }

type ConfigRow = {
  key: string; label: string; options: OptionList; type?: RowType
  placeholder?: string; labelMap?: Record<string, string>
  // When set, the row only renders if the predicate returns true for the
  // current config. Used to show provider-specific fields (ElevenLabs voices,
  // Cartesia IDs, …) only when that provider is actually selected.
  showIf?: (cfg: Record<string, string>) => boolean
  // Full-width voice-grid selector (replaces the standard select/combo input).
  voiceGrid?: VoiceGridSpec
}

const PROVIDER_GROUPS: Array<{
  title: string
  rows: ConfigRow[]
}> = [
  {
    title: 'Summarization',
    rows: [
      { key: 'MODEL_CHUNK',  label: 'Chapter model (Pass 1)',  options: [g('🔀 OpenRouter → OpenAI', OR_GPT), g('🟣 Anthropic — Native API', CLAUDE_MODELS), g('🔀 OpenRouter → Anthropic', OR_CLAUDE)] },
      { key: 'MODEL_SONNET', label: 'Full summary (Pass 2)',   options: [g('🟣 Anthropic — Native API', CLAUDE_MODELS), g('🔀 OpenRouter → Anthropic', OR_CLAUDE)] },
      { key: 'MODEL_OPUS',   label: 'Tashkeel / Review (AR)',  options: [g('🟣 Anthropic — Native API', CLAUDE_MODELS), g('🔀 OpenRouter → Anthropic', OR_CLAUDE)] },
      { key: 'CHUNK_WORDS_EN',         label: 'Chunk size — words per chunk (EN)',               options: [], type: 'text', placeholder: '1500' },
      { key: 'CHUNK_WORDS_AR',         label: 'Chunk size — words per chunk (AR)',               options: [], type: 'text', placeholder: '1500' },
      { key: 'SUMMARY_MAX_WORDS_EN',   label: 'Max summary words (EN) — 0 = use length preset', options: [], type: 'text', placeholder: '0 = preset (3/5/10/15 min)' },
      { key: 'SUMMARY_MAX_WORDS_AR',   label: 'Max summary words (AR) — 0 = use length preset', options: [], type: 'text', placeholder: '0 = preset (3/5/10/15 min)' },
      { key: 'CHAPTER_SUMMARY_MAX_WORDS', label: 'Max words per chapter summary — 0 = default', options: [], type: 'text', placeholder: '0 = default (3-5 sentences)' },
      { key: 'SUMMARY_LENGTH_SMALL_EN', label: 'Preset: small summary length — EN (chars)', options: [], type: 'text', placeholder: '1500' },
      { key: 'SUMMARY_LENGTH_SMALL_AR', label: 'Preset: small summary length — AR (chars)', options: [], type: 'text', placeholder: '1200' },
      { key: 'SUMMARY_LENGTH_MEDIUM_EN', label: 'Preset: medium summary length — EN (chars)', options: [], type: 'text', placeholder: '3000' },
      { key: 'SUMMARY_LENGTH_MEDIUM_AR', label: 'Preset: medium summary length — AR (chars)', options: [], type: 'text', placeholder: '2500' },
      { key: 'SUMMARY_LENGTH_LARGE_EN', label: 'Preset: large summary length — EN (chars)', options: [], type: 'text', placeholder: '6000' },
      { key: 'SUMMARY_LENGTH_LARGE_AR', label: 'Preset: large summary length — AR (chars)', options: [], type: 'text', placeholder: '5000' },
      { key: 'SUMMARY_QA_ENABLED',    label: 'Summary coverage check — gate audio',             options: ['true', 'false'] },
      { key: 'SUMMARY_QA_MODEL',      label: 'Coverage check model (scores 0-100)',             options: [g('🔀 OpenRouter → DeepSeek', ['deepseek/deepseek-chat', 'deepseek/deepseek-r1', 'deepseek/deepseek-chat-v3.1']), g('🔀 OpenRouter → OpenAI', OR_GPT), g('🟣 Anthropic — Native API', CLAUDE_MODELS)], type: 'combo', placeholder: 'deepseek/deepseek-chat' },
      { key: 'SUMMARY_QA_THRESHOLD',  label: 'Min coverage score to allow audio (%)',           options: [], type: 'text', placeholder: '70' },
      { key: 'TRANSLATE_SUMMARY_ENABLED', label: 'Translate summary to other language (EN↔AR) — default when no explicit translate step', options: ['true', 'false'] },
      { key: 'TRANSLATE_MODEL',       label: 'Translation model',                               options: [g('🟣 Anthropic — Native API', CLAUDE_MODELS), g('🔀 OpenRouter → Anthropic', OR_CLAUDE), g('🔀 OpenRouter → OpenAI', OR_GPT), g('🔀 OpenRouter → DeepSeek', ['deepseek/deepseek-chat'])], type: 'combo', placeholder: 'Pick a translation model…' },
    ],
  },
  {
    title: 'Pipeline Steps',
    rows: [
      { key: 'PIPELINE_STEP_SUMMARIZE',                label: 'Summarize',                  options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_TRANSLATE',                label: 'Translate',                  options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_TTS',                      label: 'Audio — master switch (TTS)', options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_AUDIO_PROCESSING',         label: 'Audio — post-processing',    options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_AUDIO_FULL',               label: 'Audio — full book',          options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_AUDIO_FULL_TRANSLATE',     label: 'Audio — full book (translated)', options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_AUDIO_CHAPTERS',           label: 'Audio — chapters',           options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_AUDIO_CHAPTERS_TRANSLATE', label: 'Audio — chapters (translated)', options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_COVER',                    label: 'Cover image',                options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_ALTTEXT',                  label: 'Alt text',                   options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_MINDMAP',                  label: 'Mind map — full book',       options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_MINDMAP_TRANSLATE',        label: 'Mind map — full book (translated)', options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_MINDMAP_CHAPTERS',         label: 'Mind map — chapters',        options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_MINDMAP_CHAPTERS_TRANSLATE', label: 'Mind map — chapters (translated)', options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_INJECT_EPUB',              label: 'Inject EPUB',                options: ['true', 'false'] },
      { key: 'PIPELINE_STEP_VIDEO',                    label: 'Video',                      options: ['true', 'false'] },
    ],
  },
  {
    title: 'Mind Map',
    rows: [
      { key: 'MINDMAP_FORMAT',           label: 'Output format',               options: ['mermaid', 'json'] },
      { key: 'MODEL_MINDMAP',            label: 'Mind map model',              options: [g('🟢 OpenAI — Native API', GPT_CHAT_MODELS), g('🔀 OpenRouter → OpenAI', OR_GPT), g('🟣 Anthropic — Native API', CLAUDE_MODELS), g('🔀 OpenRouter → Anthropic', OR_CLAUDE)] },
      { key: 'MINDMAP_JSON_MAX_TOKENS',  label: 'JSON max tokens (0 = unlimited)', options: [], type: 'text', placeholder: '0 = unlimited (recommended)' },
    ],
  },
  {
    title: 'Text-to-Speech',
    rows: [
      { key: 'TTS_PROVIDER_EN',        label: 'Provider (EN)',                 options: ['deepgram', 'elevenlabs', 'cartesia', 'openrouter', 'gemini'] },
      { key: 'TTS_PROVIDER_AR',        label: 'Provider (AR) — ⚠️ Deepgram is EN-only', options: ['cartesia', 'elevenlabs', 'openrouter', 'gemini'] },

      // Deepgram (EN only)
      {
        key: 'TTS_VOICE_EN', label: 'Deepgram voice (EN)',
        options: DEEPGRAM_VOICES.map(v => v.name), type: 'combo', placeholder: 'aura-asteria-en',
        labelMap: Object.fromEntries(DEEPGRAM_VOICES.map(v => [v.name, `${v.name} — ${genderSymbol(v.gender)} ${genderLabel(v.gender)}`])),
        showIf: c => ttsProvider(c, 'EN') === 'deepgram',
      },

      // ElevenLabs — voices populated live from the API.
      {
        key: 'ELEVENLABS_VOICE_EN', label: 'ElevenLabs voice (EN)',
        options: [], type: 'combo', placeholder: 'Pick an ElevenLabs voice…',
        showIf: c => ttsProvider(c, 'EN') === 'elevenlabs',
      },
      {
        key: 'ELEVENLABS_VOICE_AR', label: 'ElevenLabs voice (AR)',
        options: [], type: 'combo', placeholder: 'Pick an ElevenLabs voice…',
        showIf: c => ttsProvider(c, 'AR') === 'elevenlabs',
      },

      // Cartesia — model + per-language voice UUIDs.
      {
        key: 'CARTESIA_MODEL', label: 'Cartesia model',
        options: [], type: 'text', placeholder: 'sonic-3.5-2026-05-04',
        showIf: c => ttsUsesProvider(c, 'cartesia'),
      },
      {
        key: 'CARTESIA_VOICE_EN', label: 'Cartesia voice ID (EN)',
        options: [], type: 'text', placeholder: 'a0e99841-438c-4a64-b679-ae501e7d6091',
        showIf: c => ttsProvider(c, 'EN') === 'cartesia',
      },
      {
        key: 'CARTESIA_VOICE_AR', label: 'Cartesia voice ID (AR)',
        options: [], type: 'text', placeholder: 'voice UUID from play.cartesia.ai/voices',
        showIf: c => ttsProvider(c, 'AR') === 'cartesia',
      },

      // Gemini native — model + voice (shared across EN/AR).
      {
        key: 'GEMINI_TTS_MODEL', label: 'Gemini TTS model',
        options: ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview'], type: 'combo', placeholder: 'gemini-2.5-flash-preview-tts',
        showIf: c => ttsUsesProvider(c, 'gemini'),
      },
      {
        key: 'GEMINI_TTS_VOICE', label: 'Gemini TTS voice',
        options: GEMINI_VOICES.map(v => v.name), type: 'combo', placeholder: 'Kore',
        labelMap: Object.fromEntries(GEMINI_VOICES.map(v => [v.name, `${v.name} — ${genderSymbol(v.gender)} ${genderLabel(v.gender)}`])),
        showIf: c => ttsUsesProvider(c, 'gemini'),
      },

      // OpenRouter — model drives which voice names are valid (Google models → Gemini voices, OpenAI models → OpenAI voices).
      {
        key: 'OPENROUTER_TTS_MODEL', label: 'OpenRouter TTS model',
        options: ['google/gemini-2.5-flash-preview-tts', 'google/gemini-3.1-flash-tts-preview', 'openai/gpt-audio', 'openai/gpt-audio-mini'], type: 'combo', placeholder: 'google/gemini-2.5-flash-preview-tts',
        showIf: c => ttsUsesProvider(c, 'openrouter'),
      },
      {
        key: 'OPENROUTER_TTS_VOICE_EN', label: 'OpenRouter TTS voice (EN) — click ▶ to preview',
        options: [], voiceGrid: { provider: 'openrouter', modelKey: 'OPENROUTER_TTS_MODEL', lang: 'en' },
        showIf: c => ttsProvider(c, 'EN') === 'openrouter',
      },
      {
        key: 'OPENROUTER_TTS_VOICE_AR', label: 'OpenRouter TTS voice (AR) — click ▶ to preview',
        options: [], voiceGrid: { provider: 'openrouter', modelKey: 'OPENROUTER_TTS_MODEL', lang: 'ar' },
        showIf: c => ttsProvider(c, 'AR') === 'openrouter',
      },

      // Gemini TTS style / profile (applies to native Gemini and OpenRouter Google models).
      {
        key: 'GEMINI_TTS_AUDIO_STYLE', label: 'Gemini audio style',
        options: ['single', 'multi', 'podcast', 'audiobook', 'news', 'bedtime', 'custom'], type: 'combo', placeholder: 'single',
        showIf: c => ttsUsesProvider(c, 'gemini') || ttsUsesProvider(c, 'openrouter'),
      },
      {
        key: 'GEMINI_TTS_SPEAKER1_VOICE', label: 'Speaker 1 voice (multi/podcast)',
        options: GEMINI_VOICES.map(v => v.name), type: 'combo', placeholder: 'Kore',
        labelMap: Object.fromEntries(GEMINI_VOICES.map(v => [v.name, `${v.name} — ${genderSymbol(v.gender)} ${genderLabel(v.gender)}`])),
        showIf: c => (ttsUsesProvider(c, 'gemini') || ttsUsesProvider(c, 'openrouter')) && (c.GEMINI_TTS_AUDIO_STYLE === 'multi' || c.GEMINI_TTS_AUDIO_STYLE === 'podcast'),
      },
      {
        key: 'GEMINI_TTS_SPEAKER2_VOICE', label: 'Speaker 2 voice (multi/podcast)',
        options: GEMINI_VOICES.map(v => v.name), type: 'combo', placeholder: 'Puck',
        labelMap: Object.fromEntries(GEMINI_VOICES.map(v => [v.name, `${v.name} — ${genderSymbol(v.gender)} ${genderLabel(v.gender)}`])),
        showIf: c => (ttsUsesProvider(c, 'gemini') || ttsUsesProvider(c, 'openrouter')) && (c.GEMINI_TTS_AUDIO_STYLE === 'multi' || c.GEMINI_TTS_AUDIO_STYLE === 'podcast'),
      },
      {
        key: 'GEMINI_TTS_SPEAKER1_NAME', label: 'Speaker 1 name (multi/podcast)',
        options: [], type: 'text', placeholder: 'Host',
        showIf: c => (ttsUsesProvider(c, 'gemini') || ttsUsesProvider(c, 'openrouter')) && (c.GEMINI_TTS_AUDIO_STYLE === 'multi' || c.GEMINI_TTS_AUDIO_STYLE === 'podcast'),
      },
      {
        key: 'GEMINI_TTS_SPEAKER2_NAME', label: 'Speaker 2 name (multi/podcast)',
        options: [], type: 'text', placeholder: 'Guest',
        showIf: c => (ttsUsesProvider(c, 'gemini') || ttsUsesProvider(c, 'openrouter')) && (c.GEMINI_TTS_AUDIO_STYLE === 'multi' || c.GEMINI_TTS_AUDIO_STYLE === 'podcast'),
      },
      {
        key: 'GEMINI_TTS_STYLE_PROMPT', label: 'Custom style prompt (custom / override)',
        options: [], type: 'text', placeholder: 'e.g. Read dramatically, like a movie trailer.',
        showIf: c => ttsUsesProvider(c, 'gemini') || ttsUsesProvider(c, 'openrouter'),
      },
    ],
  },
  {
    title: 'Cover Image',
    rows: [
      { key: 'IMAGE_MODEL_EN', label: 'Model (EN)', type: 'combo', placeholder: 'Pick or type any OpenRouter / OpenAI model name…', options: [g('🟢 OpenAI — Native API', OPENAI_IMG_MODELS), g('🔀 OpenRouter → FLUX / Gemini / SD', OR_IMG_MODELS)] },
      { key: 'IMAGE_MODEL_AR', label: 'Model (AR)', type: 'combo', placeholder: 'Pick or type any OpenRouter / OpenAI model name…', options: [g('🟢 OpenAI — Native API', OPENAI_IMG_MODELS), g('🔀 OpenRouter → FLUX / Gemini / SD', OR_IMG_MODELS)] },
      { key: 'IMAGE_QUALITY',  label: 'Quality',   options: ['high', 'standard', 'auto'] },
      { key: 'IMAGE_SIZE',     label: 'Size',      options: ['1024x1536', '1024x1024', '1536x1024', 'auto', '1024x1792', '1792x1024', '512x512'] },
      { key: 'IMAGE_PROMPT_MAX_CHARS',  label: 'Max cover prompt chars (OpenRouter image context ceiling)', options: [], type: 'text', placeholder: '3000' },
      { key: 'IMAGE_SUMMARY_MAX_CHARS', label: 'Max summary chars inside cover prompt',                    options: [], type: 'text', placeholder: '1200' },
    ],
  },
  {
    title: 'Alt Text',
    rows: [
      { key: 'ALTTEXT_PROVIDER_EN', label: 'Provider (EN)', options: ['claude', 'openai'] },
      { key: 'ALTTEXT_MODEL_EN',    label: 'Model (EN)',    options: [g('🟣 Anthropic — Native API', CLAUDE_MODELS), g('🟢 OpenAI — Native API', GPT_CHAT_MODELS), g('🔀 OpenRouter → Anthropic', OR_CLAUDE), g('🔀 OpenRouter → OpenAI', OR_GPT)] },
      { key: 'ALTTEXT_PROVIDER_AR', label: 'Provider (AR)', options: ['claude', 'openai'] },
      { key: 'ALTTEXT_MODEL_AR',    label: 'Model (AR)',    options: [g('🟣 Anthropic — Native API', CLAUDE_MODELS), g('🟢 OpenAI — Native API', GPT_CHAT_MODELS), g('🔀 OpenRouter → Anthropic', OR_CLAUDE), g('🔀 OpenRouter → OpenAI', OR_GPT)] },
    ],
  },
  {
    title: 'Storage',
    rows: [
      { key: 'STORAGE_PROVIDER', label: 'Provider', options: ['spaces', 'minio'] },
    ],
  },
  {
    title: 'Video Generation',
    rows: [
      { key: 'VIDEO_PROVIDER',     label: 'Provider',    options: ['moviepy', 'svd', 'cogvideox'] },
      { key: 'VIDEO_ORIENTATION',  label: 'Orientation', options: ['portrait', 'landscape'] },
      { key: 'VIDEO_FPS',          label: 'Frame rate',  options: ['24', '30', '60'] },
      { key: 'VIDEO_BITRATE',      label: 'Bitrate',     options: ['2500k', '3500k', '5000k', '8000k'] },
    ],
  },
  {
    title: 'EPUB Source',
    rows: [
      { key: 'BOOK_FILES_BASE_URL', label: 'Base URL for /books/{english|arabic}/{book_id}.epub', options: [], type: 'text', placeholder: 'https://files.seeourbooks.com' },
    ],
  },
  {
    title: 'Documents Pipeline (PDF → OCR → AI)',
    rows: [
      { key: 'DOC_AI_PROVIDER',      label: 'AI Provider',   options: ['openrouter', 'deepseek', 'openai', 'claude'] },
      { key: 'DOC_AI_MODEL',         label: 'AI Model',      type: 'combo', placeholder: 'deepseek/deepseek-chat', options: [g('🌟 Recommended', ['deepseek/deepseek-chat', 'deepseek/deepseek-chat-v3-0324', 'google/gemini-2.5-flash-preview', 'qwen/qwen2.5-72b-instruct']), g('💎 Higher quality', ['anthropic/claude-sonnet-4-6', 'openai/gpt-4.1-mini', 'openai/gpt-4.1', 'meta-llama/llama-3.3-70b-instruct']), g('🟣 Native Anthropic', CLAUDE_MODELS), g('🟢 Native OpenAI', GPT_CHAT_MODELS)] },
      { key: 'DOC_OCR_LANGUAGES',    label: 'OCR Languages (tesseract codes)', options: [], type: 'text', placeholder: 'ara+eng' },
      { key: 'DOC_CHUNK_SIZE_WORDS', label: 'Chunk size (words)',  options: [], type: 'text', placeholder: '750' },
      { key: 'EMBEDDING_PROVIDER',   label: 'Embedding Provider', options: ['', 'openrouter', 'openai', 'deepseek'] },
      { key: 'EMBEDDING_MODEL',      label: 'Embedding Model',    type: 'combo', placeholder: 'openai/text-embedding-3-small', options: [g('🌟 Recommended (OpenRouter)', ['openai/text-embedding-3-small', 'openai/text-embedding-3-large', 'voyageai/voyage-3', 'voyageai/voyage-3-large', 'cohere/embed-multilingual-v3.0']), g('🟢 OpenAI native', ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'])] },
    ],
  },
  {
    title: 'Reliability — Model Fallback',
    rows: [
      { key: 'ENABLE_MODEL_FALLBACK',            label: 'Auto-fallback on model failure',  options: ['true', 'false'] },
      { key: 'FALLBACK_claude-haiku-4-5-20251001', label: 'Fallback chain — Haiku',       options: [], type: 'text', placeholder: 'anthropic/claude-haiku-4-5, openai/gpt-4.1-mini, gpt-4.1-mini' },
      { key: 'FALLBACK_claude-sonnet-4-6',       label: 'Fallback chain — Sonnet',        options: [], type: 'text', placeholder: 'anthropic/claude-sonnet-4-6, openai/gpt-4.1, gpt-4.1' },
      { key: 'FALLBACK_claude-opus-4-7',         label: 'Fallback chain — Opus',          options: [], type: 'text', placeholder: 'anthropic/claude-opus-4-7, openai/gpt-4.1, gpt-4.1' },
      { key: 'FALLBACK_gpt-4.1-mini',            label: 'Fallback chain — gpt-4.1-mini', options: [], type: 'text', placeholder: 'openai/gpt-4.1-mini, anthropic/claude-haiku-4-5, claude-haiku-4-5' },
    ],
  },
  {
    title: 'Security — API Keys',
    rows: [
      { key: 'API_KEY_AUTH_ENABLED', label: 'Require X-API-Key header on all requests', options: ['false', 'true'] },
    ],
  },
  {
    title: 'Watermarks',
    rows: [
      { key: 'WATERMARK_TEXT',     label: 'Watermark text (stamped on covers, audio ID3, mindmaps)', options: [], type: 'text', placeholder: 'SeeOurBook.com' },
      { key: 'WATERMARK_POSITION', label: 'Cover image watermark position',                           options: ['bottom-right', 'bottom-left', 'top-right', 'top-left'] },
      { key: 'AUDIO_WATERMARK_TEXT_EN', label: 'Spoken audio intro (EN) — read at the start of audio', options: [], type: 'text', placeholder: 'SeeOurBook presents' },
      { key: 'AUDIO_WATERMARK_TEXT_AR', label: 'Spoken audio intro (AR) — read at the start of audio', options: [], type: 'text', placeholder: 'Seeourbook تقدم لكم' },
    ],
  },
]

// ── Searchable combo dropdown ─────────────────────────────────────────────────
function SearchableSelect({ value, options, placeholder, onChange, labelMap }: {
  value: string; options: OptionList; placeholder?: string
  onChange: (v: string) => void; labelMap?: Record<string, string>
}) {
  const lbl = (v: string) => labelMap?.[v] ?? v
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos]     = useState<{ top: number; left: number; width: number } | null>(null)
  const buttonRef         = useRef<HTMLButtonElement>(null)
  const popoverRef        = useRef<HTMLDivElement>(null)
  const POPOVER_WIDTH = 360

  function updatePosition() {
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const left = Math.max(8, rect.right - POPOVER_WIDTH)
    let top = rect.bottom + 4
    if (top + 360 > window.innerHeight && rect.top > 360) top = rect.top - 360 - 4
    setPos({ top, left, width: POPOVER_WIDTH })
  }

  useEffect(() => {
    if (!open) return
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => { window.removeEventListener('scroll', updatePosition, true); window.removeEventListener('resize', updatePosition) }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (!buttonRef.current?.contains(t) && !popoverRef.current?.contains(t)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const matches = (s: string) => !query || s.toLowerCase().includes(query.toLowerCase()) || lbl(s).toLowerCase().includes(query.toLowerCase())
  const flatTop: string[] = []; const grouped: OptGroup[] = []
  for (const o of options) {
    if (typeof o === 'string') { if (matches(o)) flatTop.push(o) }
    else { const items = o.items.filter(matches); if (items.length > 0) grouped.push({ group: o.group, items }) }
  }
  const allValues = flattenOptions(options)
  const showCustomCommit = query.trim() !== '' && !allValues.includes(query.trim())
  function commit(v: string) { onChange(v); setOpen(false); setQuery('') }
  const totalMatches = flatTop.length + grouped.reduce((s, gg) => s + gg.items.length, 0)

  const popover = open && pos ? (
    <div ref={popoverRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-lg shadow-2xl">
      <input type="text" autoFocus value={query} onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setQuery('') }; if (e.key === 'Enter' && showCustomCommit) commit(query.trim()) }}
        placeholder="Search models…  (or paste a custom name)"
        className="w-full px-3 py-2 bg-gray-50 border-b border-gray-200 text-sm text-gray-900 focus:outline-none placeholder:text-gray-400 rounded-t-lg" />
      <div className="max-h-72 overflow-y-auto">
        {flatTop.map(opt => (
          <button key={opt} type="button" onClick={() => commit(opt)}
            className={`block w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-indigo-50 ${value === opt ? 'bg-indigo-50 text-indigo-700' : 'text-gray-800'}`}>
            {lbl(opt)}
          </button>
        ))}
        {grouped.map(grp => (
          <div key={grp.group}>
            <div className="sticky top-0 px-3 py-1 text-[11px] uppercase tracking-wide text-gray-500 bg-white/95 border-b border-gray-200">{grp.group}</div>
            {grp.items.map(opt => (
              <button key={opt} type="button" onClick={() => commit(opt)}
                className={`block w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-indigo-50 ${value === opt ? 'bg-indigo-50 text-indigo-700' : 'text-gray-800'}`}>
                {lbl(opt)}
              </button>
            ))}
          </div>
        ))}
        {totalMatches === 0 && !showCustomCommit && (
          <div className="px-3 py-4 text-center text-sm text-gray-500">No models match "{query}"</div>
        )}
        {showCustomCommit && (
          <button type="button" onClick={() => commit(query.trim())}
            className="block w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 border-t border-gray-200 text-gray-700">
            ✏️ Use "<span className="font-mono text-indigo-600">{query.trim()}</span>" as custom
          </button>
        )}
      </div>
      <div className="px-3 py-1.5 border-t border-gray-200 text-[11px] text-gray-600 flex justify-between rounded-b-lg">
        <span>{totalMatches} model{totalMatches === 1 ? '' : 's'}</span>
        <span>Esc to close · Enter to use custom</span>
      </div>
    </div>
  ) : null

  return (
    <>
      <button ref={buttonRef} type="button" onClick={() => setOpen(o => !o)}
        className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 w-[320px] text-left flex items-center justify-between gap-2 hover:border-gray-600">
        <span className={`truncate ${value ? 'font-mono' : 'text-gray-500'}`}>{value ? lbl(value) : (placeholder || 'Select…')}</span>
        <span className="text-gray-500 text-xs">▾</span>
      </button>
      {popover && createPortal(popover, document.body)}
    </>
  )
}

// ── Prompt rows ───────────────────────────────────────────────────────────────
const PROMPT_ROWS: Array<{ key: string; label: string; description: string; variables: string[] }> = [
  { key: 'PROMPT_COVER',           label: 'Cover Image Prompt',      description: 'Sent to the image generation model. Controls the visual style of the generated cover.', variables: ['{title}', '{author}', '{details}', '{summary}', '{genre_hint}'] },
  { key: 'PROMPT_MINDMAP_MERMAID', label: 'Mind Map Prompt — Mermaid', description: 'Used when MINDMAP_FORMAT = mermaid. Must output valid Mermaid graph TD syntax.', variables: ['{title}', '{summary}', '{lang_note}'] },
  { key: 'PROMPT_MINDMAP_JSON',    label: 'Mind Map Prompt — JSON',   description: 'Used when MINDMAP_FORMAT = json. Must output the exact JSON structure.', variables: ['{title}', '{summary}', '{lang_note}'] },
]

// ── Voice preview ─────────────────────────────────────────────────────────────
const VOICE_PRESETS: Record<string, { text: string }> = {
  en: { text: 'Hello, this is a voice preview for English text-to-speech.' },
  ar: { text: 'مرحباً، هذا معاينة صوتية للنص العربي.' },
}

// Which voices are valid for an OpenRouter TTS model depends on the model vendor.
function openRouterVoicesForModel(model: string): TtsVoiceEntry[] {
  // OpenRouter serves Gemini TTS models with native Gemini voice names and
  // returns raw PCM; OpenAI audio models use OpenAI voice names and return MP3.
  if (model?.startsWith('google/')) return GEMINI_VOICES
  return OPENAI_VOICES
}

function openRouterDefaultVoice(model: string): string {
  if (model?.startsWith('google/')) return 'Kore'
  return 'alloy'
}

// ── Inline preview button ─────────────────────────────────────────────────────
function VoicePreviewButton({ provider, model, voice, language, disabled }: {
  provider: string; model: string; voice: string; language: string; disabled?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  async function handleClick() {
    if (!voice || loading) return
    setLoading(true); setError(null); setAudioUrl(null)
    try {
      const result = await previewTTS({ text: VOICE_PRESETS[language]?.text || VOICE_PRESETS.en.text, provider, model, voice, language })
      const url = `data:${result.mime_type};base64,${result.audio_base64}`
      setAudioUrl(url)
      setTimeout(() => { audioRef.current?.play().catch(() => {}) }, 100)
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setLoading(false) }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading || !voice}
        title="Preview voice"
        className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading
          ? <span className="inline-block w-4 h-4 border border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
          : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        }
      </button>
      {error && <span className="text-[11px] text-red-600 max-w-[200px] truncate" title={error}>{error}</span>}
      {audioUrl && <audio ref={audioRef} src={audioUrl} className="hidden" onEnded={() => setAudioUrl(null)} />}
    </div>
  )
}

// ── Voice grid with gender icons and inline preview ───────────────────────────
function TtsVoiceGrid({
  voices, current, onChange, previewProvider, previewModel, previewLang,
}: {
  voices: TtsVoiceEntry[]
  current: string
  onChange: (v: string) => void
  previewProvider: string
  previewModel: string
  previewLang: 'en' | 'ar'
}) {
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [audioUrl,   setAudioUrl]   = useState<string | null>(null)
  const [audioErr,   setAudioErr]   = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  async function handlePreview(voiceName: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (previewing) return
    setPreviewing(voiceName); setAudioUrl(null); setAudioErr(null)
    try {
      const result = await previewTTS({
        text:     VOICE_PRESETS[previewLang]?.text || VOICE_PRESETS.en.text,
        provider: previewProvider,
        model:    previewModel,
        voice:    voiceName,
        language: previewLang,
      })
      const url = `data:${result.mime_type};base64,${result.audio_base64}`
      setAudioUrl(url)
      setTimeout(() => { audioRef.current?.play().catch(() => {}) }, 50)
    } catch (err) {
      setAudioErr(err instanceof Error ? err.message : String(err))
    } finally {
      setPreviewing(null)
    }
  }

  const geminiVoices = voices.filter(v => _GEMINI_NAME_SET.has(v.name))
  const openaiVoices = voices.filter(v => !_GEMINI_NAME_SET.has(v.name))

  const VoiceChip = ({ v }: { v: TtsVoiceEntry }) => {
    const isSelected = current === v.name
    const isSpinning = previewing === v.name
    return (
      <div
        onClick={() => onChange(v.name)}
        title={`${v.gender} · click to select`}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all select-none
          ${isSelected
            ? 'bg-indigo-600 border-indigo-500 text-white'
            : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:text-gray-900'
          }`}
      >
        <span className={`text-[13px] leading-none ${genderColor(v.gender)} ${isSelected ? 'text-white' : ''}`}>
          {genderSymbol(v.gender)}
        </span>
        <span>{v.name}</span>
        <button
          type="button"
          onClick={e => handlePreview(v.name, e)}
          title={`Preview ${v.name} voice`}
          className={`ml-0.5 transition-opacity ${isSelected ? 'text-white/80 hover:text-white' : 'text-gray-400 hover:text-indigo-600'}`}
        >
          {isSpinning
            ? <span className="inline-block w-3 h-3 border border-current/30 border-t-current rounded-full animate-spin" />
            : <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          }
        </button>
      </div>
    )
  }

  return (
    <div className="mt-1 space-y-3">
      {geminiVoices.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">
            Gemini Voices — for <code className="text-gray-400">google/*</code> models
          </p>
          <div className="flex flex-wrap gap-1.5">
            {geminiVoices.map(v => <VoiceChip key={v.name} v={v} />)}
          </div>
        </div>
      )}
      {openaiVoices.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">
            OpenAI Voices — for <code className="text-gray-400">openai/*</code> models
          </p>
          <div className="flex flex-wrap gap-1.5">
            {openaiVoices.map(v => <VoiceChip key={v.name} v={v} />)}
          </div>
        </div>
      )}
      {audioUrl && <audio ref={audioRef} controls src={audioUrl} className="w-full h-8 mt-1" />}
      {audioErr && <p className="text-[11px] text-red-600 mt-1 truncate">Preview failed: {audioErr}</p>}
    </div>
  )
}

// ── Sections ──────────────────────────────────────────────────────────────────
function ConfigRowView({
  row, config, saving, saved, onChange,
}: {
  row: ConfigRow
  config: Record<string, string>
  saving: string | null
  saved: string | null
  onChange: (key: string, value: string) => void
}) {
  const firstFlat  = row.options.find(o => typeof o === 'string') as string | undefined
  const firstGroup = row.options.find(o => typeof o !== 'string') as OptGroup | undefined
  const defaultVal = firstFlat ?? firstGroup?.items[0] ?? ''
  const current  = config[row.key] ?? defaultVal
  const isSaving = saving === row.key
  const isSaved  = saved  === row.key
  const badge    = getProviderBadge(current)

  if (row.voiceGrid) {
    const previewModel = config[row.voiceGrid.modelKey] || (
      row.voiceGrid.provider === 'openrouter'
        ? 'google/gemini-2.5-flash-preview-tts'
        : config.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts'
    )
    const voices = row.voiceGrid.provider === 'openrouter'
      ? openRouterVoicesForModel(previewModel)
      : GEMINI_VOICES
    return (
      <div className="px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-sm text-gray-700">{row.label}</span>
            <code className="text-xs text-gray-600 block mt-0.5">{row.key}</code>
          </div>
          <div className="flex items-center gap-2">
            {isSaved  && <span className="text-xs text-green-400 whitespace-nowrap">Saved ✓</span>}
            {isSaving && <span className="text-xs text-gray-500 whitespace-nowrap">Saving…</span>}
            {current && <span className="text-xs text-gray-600 font-mono bg-gray-100 px-2 py-0.5 rounded">{current}</span>}
          </div>
        </div>
        <TtsVoiceGrid
          voices={voices}
          current={current}
          onChange={v => onChange(row.key, v)}
          previewProvider={row.voiceGrid.provider}
          previewModel={previewModel}
          previewLang={row.voiceGrid.lang}
        />
      </div>
    )
  }

  const isVoiceRow = row.key === 'GEMINI_TTS_VOICE' || row.key === 'TTS_VOICE_EN'
  const previewModelForVoice =
    row.key === 'GEMINI_TTS_VOICE' ? (config.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts') :
    row.key === 'TTS_VOICE_EN' ? current : ''
  const previewProviderForVoice =
    row.key === 'GEMINI_TTS_VOICE' ? 'gemini' :
    row.key === 'TTS_VOICE_EN' ? 'deepgram' : ''

  return (
    <div className="flex items-center justify-between px-5 py-3 gap-4">
      <div className="min-w-0">
        <span className="text-sm text-gray-700">{row.label}</span>
        <code className="text-xs text-gray-600 block mt-0.5">{row.key}</code>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge && <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${badge.className}`}>{badge.label}</span>}
        {isSaved  && <span className="text-xs text-green-400 whitespace-nowrap">Saved ✓</span>}
        {isSaving && <span className="text-xs text-gray-500 whitespace-nowrap">Saving…</span>}
        {row.type === 'text' ? (
          <input type="text" value={current} placeholder={row.placeholder ?? ''}
            onChange={e => onChange(row.key, e.target.value)}
            onBlur={e => onChange(row.key, e.target.value)}
            className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 w-[280px] placeholder:text-gray-400" />
        ) : row.type === 'combo' ? (
          <SearchableSelect value={current} options={row.options} placeholder={row.placeholder ?? 'Pick or search a model…'} onChange={v => onChange(row.key, v)} labelMap={row.labelMap} />
        ) : (
          <select value={current} onChange={e => onChange(row.key, e.target.value)}
            className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 max-w-[280px]">
            {row.options.map(opt =>
              typeof opt === 'string'
                ? <option key={opt} value={opt}>{opt}</option>
                : <optgroup key={opt.group} label={opt.group}>{opt.items.map(o => <option key={o} value={o}>{o}</option>)}</optgroup>
            )}
          </select>
        )}
        {isVoiceRow && (
          <VoicePreviewButton
            provider={previewProviderForVoice}
            model={previewModelForVoice}
            voice={current}
            language={row.key === 'TTS_VOICE_EN' ? 'en' : 'en'}
          />
        )}
      </div>
    </div>
  )
}

function ProvidersSection() {
  const [config,  setConfigState] = useState<Record<string, string>>({})
  const [saving,  setSaving]      = useState<string | null>(null)
  const [saved,   setSaved]       = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  const [orImageModels, setOrImageModels] = useState<string[] | null>(null)
  const [orChatModels,  setOrChatModels]  = useState<string[] | null>(null)
  const [orVisionModels, setOrVisionModels] = useState<string[] | null>(null)
  const [elVoices, setElVoices] = useState<ElevenLabsVoice[] | null>(null)

  useEffect(() => {
    getConfig().then(setConfigState).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    getOpenRouterModels('image').then(r => { if (r.models?.length) setOrImageModels(r.models.map(m => m.id)) }).catch(() => {})
    getOpenRouterModels('chat').then(r => { if (r.models?.length) setOrChatModels(r.models.map(m => m.id)) }).catch(() => {})
    getOpenRouterModels('vision').then(r => { if (r.models?.length) setOrVisionModels(r.models.map(m => m.id)) }).catch(() => {})
  }, [])

  // Only hit the ElevenLabs API when ElevenLabs is the active TTS provider —
  // avoids a needless (and noisy) upstream call on every Settings mount.
  const usesElevenLabs = config.TTS_PROVIDER_EN === 'elevenlabs' || config.TTS_PROVIDER_AR === 'elevenlabs'
  useEffect(() => {
    if (!usesElevenLabs || elVoices) return
    getElevenLabsVoices().then(r => { if (r.voices?.length) setElVoices(r.voices) }).catch(() => {})
  }, [usesElevenLabs, elVoices])

  const providerGroups = useMemo(() => {
    const liveImage = orImageModels?.length ? orImageModels : OR_IMG_MODELS
    const liveImageLabel = orImageModels?.length ? `🔀 OpenRouter — Live (${liveImage.length} image models)` : '🔀 OpenRouter → FLUX / Gemini / SD'
    const liveChat = orChatModels?.length ? orChatModels : null
    const liveChatLabel = liveChat ? `🔀 OpenRouter — Live (${liveChat.length} chat models)` : '🔀 OpenRouter'
    const liveVision = orVisionModels?.length ? orVisionModels : null
    const liveVisionLabel = liveVision ? `🔀 OpenRouter — Live (${liveVision.length} vision models)` : '🔀 OpenRouter'

    const CHAT_ROW_KEYS   = new Set(['MODEL_CHUNK', 'MODEL_SONNET', 'MODEL_OPUS', 'MODEL_MINDMAP', 'DOC_AI_MODEL'])
    const VISION_ROW_KEYS = new Set(['ALTTEXT_MODEL_EN', 'ALTTEXT_MODEL_AR'])
    const IMAGE_ROW_KEYS  = new Set(['IMAGE_MODEL_EN', 'IMAGE_MODEL_AR'])

    function buildElevenLabsOptions(lang: 'en' | 'ar'): { options: OptionList; labelMap: Record<string, string> } | null {
      if (!elVoices?.length) return null
      const labelMap: Record<string, string> = {}
      for (const v of elVoices) {
        const meta = [v.accent || v.language, v.gender].filter(Boolean).join(', ')
        labelMap[v.voice_id] = meta ? `${v.name} · ${meta}` : v.name
      }
      const isLangMatch = (v: ElevenLabsVoice) => {
        const l = (v.language || '').toLowerCase(); const a = (v.accent || '').toLowerCase()
        if (lang === 'ar') return l.includes('ar') || a.includes('arab')
        return l.includes('en') || a.includes('english') || a.includes('american') || a.includes('british')
      }
      const matched = elVoices.filter(isLangMatch).map(v => v.voice_id)
      const others  = elVoices.filter(v => !isLangMatch(v)).map(v => v.voice_id)
      const groups: OptGroup[] = []
      if (matched.length) groups.push(g(lang === 'ar' ? '🟢 Arabic voices' : '🟢 English voices', matched))
      if (others.length)  groups.push(g('All other voices', others))
      return { options: groups, labelMap }
    }
    const elEN = buildElevenLabsOptions('en')
    const elAR = buildElevenLabsOptions('ar')

    return PROVIDER_GROUPS.map(group => ({
      ...group,
      rows: group.rows.map(row => {
        if (IMAGE_ROW_KEYS.has(row.key)) return { ...row, type: 'combo' as RowType, options: [g('🟢 OpenAI — Native API', OPENAI_IMG_MODELS), g(liveImageLabel, liveImage)] as OptionList }
        if (CHAT_ROW_KEYS.has(row.key)) {
          const base = (row.options.filter(o => typeof o !== 'string') as OptGroup[]).filter(gg => !gg.group.startsWith('🔀'))
          return { ...row, type: 'combo' as RowType, options: liveChat ? [...base, g(liveChatLabel, liveChat)] : row.options }
        }
        if (VISION_ROW_KEYS.has(row.key)) {
          const base = (row.options.filter(o => typeof o !== 'string') as OptGroup[]).filter(gg => !gg.group.startsWith('🔀'))
          return { ...row, type: 'combo' as RowType, options: liveVision ? [...base, g(liveVisionLabel, liveVision)] : row.options }
        }
        if (row.key === 'ELEVENLABS_VOICE_EN' && elEN) return { ...row, type: 'combo' as RowType, options: elEN.options, labelMap: elEN.labelMap }
        if (row.key === 'ELEVENLABS_VOICE_AR' && elAR) return { ...row, type: 'combo' as RowType, options: elAR.options, labelMap: elAR.labelMap }
        return row
      }),
    }))
  }, [orImageModels, orChatModels, orVisionModels, elVoices])

  async function handleChange(key: string, value: string) {
    setConfigState(prev => ({ ...prev, [key]: value }))
    setSaving(key)
    try { await setConfig(key, value); setSaved(key); setTimeout(() => setSaved(null), 2000) }
    catch { /* silent */ }
    finally { setSaving(null) }
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading config…</div>

  return (
    <div className="space-y-6">
      {providerGroups.map(group => {
        // Hide rows gated behind a provider selection that isn't active.
        const visibleRows = group.rows.filter(row => !row.showIf || row.showIf(config))
        if (visibleRows.length === 0) return null
        return (
        <div key={group.title} className="bg-white border border-gray-200 rounded-xl overflow-visible">
          <div className="px-5 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-800">{group.title}</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {visibleRows.map(row => (
              <ConfigRowView
                key={row.key}
                row={row}
                config={config}
                saving={saving}
                saved={saved}
                onChange={handleChange}
              />
            ))}
          </div>
        </div>
        )
      })}
    </div>
  )
}

function PromptsSection() {
  const [config,  setConfigState] = useState<Record<string, string>>({})
  const [drafts,  setDrafts]      = useState<Record<string, string>>({})
  const [saving,  setSaving]      = useState<string | null>(null)
  const [saved,   setSaved]       = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    getConfig().then(cfg => {
      setConfigState(cfg)
      const initial: Record<string, string> = {}
      for (const row of PROMPT_ROWS) initial[row.key] = cfg[row.key] ?? ''
      setDrafts(initial)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function handleSave(key: string) {
    setSaving(key)
    try { await setConfig(key, drafts[key] ?? ''); setConfigState(prev => ({ ...prev, [key]: drafts[key] ?? '' })); setSaved(key); setTimeout(() => setSaved(null), 2000) }
    catch { /* silent */ }
    finally { setSaving(null) }
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading prompts…</div>

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Edit AI prompts for image generation and mind maps. Changes take effect on the next pipeline job.</p>
      {PROMPT_ROWS.map(row => {
        const draft    = drafts[row.key] ?? ''
        const original = config[row.key] ?? ''
        const isDirty  = draft !== original
        const isSaving = saving === row.key
        const isSaved  = saved  === row.key
        return (
          <div key={row.key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">{row.label}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{row.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {row.variables.map(v => <code key={v} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-indigo-600 border border-gray-200">{v}</code>)}
                </div>
              </div>
              <code className="text-xs text-gray-600 shrink-0 mt-0.5">{row.key}</code>
            </div>
            <div className="p-4">
              <textarea value={draft} onChange={e => setDrafts(prev => ({ ...prev, [row.key]: e.target.value }))} rows={12} spellCheck={false}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 font-mono focus:outline-none focus:border-indigo-400 resize-y leading-relaxed placeholder:text-gray-400" />
            </div>
            <div className="px-4 pb-4 flex items-center gap-3">
              <button onClick={() => handleSave(row.key)} disabled={!isDirty || isSaving}
                className="px-4 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {isSaving ? 'Saving…' : 'Save'}
              </button>
              {isDirty && !isSaving && <button onClick={() => setDrafts(prev => ({ ...prev, [row.key]: config[row.key] ?? '' }))} className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors">Discard</button>}
              {isSaved && <span className="text-xs text-green-400">Saved ✓</span>}
              {isDirty && !isSaving && <span className="text-xs text-amber-400 ml-auto">Unsaved changes</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function VoicesSection() {
  type Provider = 'gemini' | 'openrouter' | 'cartesia' | 'elevenlabs' | 'deepgram'

  const providerModels: Record<Provider, string[]> = {
    gemini:     ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview'],
    openrouter: ['google/gemini-2.5-flash-preview-tts', 'google/gemini-3.1-flash-tts-preview', 'openai/gpt-audio', 'openai/gpt-audio-mini'],
    cartesia:   ['sonic-3.5-2026-05-04'],
    elevenlabs: ['eleven_multilingual_v2'],
    deepgram:   ['aura-asteria-en'],
  }

  function voicesFor(provider: Provider, model: string): TtsVoiceEntry[] {
    if (provider === 'openrouter') return openRouterVoicesForModel(model)
    if (provider === 'gemini') return GEMINI_VOICES
    if (provider === 'deepgram') return DEEPGRAM_VOICES
    return []
  }

  function defaultVoice(provider: Provider, model: string): string {
    if (provider === 'openrouter') return openRouterDefaultVoice(model)
    const vs = voicesFor(provider, model)
    return vs[0]?.name || ''
  }

  const [provider, setProvider]   = useState<Provider>('openrouter')
  const [model, setModel]         = useState(providerModels.openrouter[0])
  const [voice, setVoice]         = useState(defaultVoice('openrouter', providerModels.openrouter[0]))
  const [language, setLanguage]   = useState<'en' | 'ar'>('en')
  const [previewText, setPreviewText] = useState(VOICE_PRESETS.en.text)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [audioUrl, setAudioUrl]   = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function handleSetProvider(p: Provider) {
    setProvider(p)
    const m = providerModels[p][0] || ''
    setModel(m)
    setVoice(defaultVoice(p, m))
  }

  function handleSetModel(m: string) {
    setModel(m)
    setVoice(defaultVoice(provider, m))
  }

  function handleSetLanguage(lang: 'en' | 'ar') {
    setLanguage(lang)
    setPreviewText(VOICE_PRESETS[lang]?.text || VOICE_PRESETS.en.text)
  }

  async function handlePreview() {
    setLoading(true); setError(null); setAudioUrl(null)
    try {
      const result = await previewTTS({ text: previewText, provider, model, voice, language })
      const url = `data:${result.mime_type};base64,${result.audio_base64}`
      setAudioUrl(url)
      setTimeout(() => { audioRef.current?.play().catch(() => {}) }, 100)
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setLoading(false) }
  }

  const availableModels = providerModels[provider] || []
  const availableVoices = voicesFor(provider, model)

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">TTS Voice Preview</h2>
        <p className="text-xs text-gray-500 mb-4">Test voices before running a pipeline job.</p>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Provider</label>
            <div className="flex gap-2 flex-wrap">
              {(['openrouter', 'gemini', 'cartesia', 'elevenlabs', 'deepgram'] as const).map(p => (
                <button key={p} onClick={() => handleSetProvider(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${provider === p ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400 hover:text-gray-800 border border-gray-200'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Language</label>
            <div className="flex gap-2">
              {(['en', 'ar'] as const).map(lang => (
                <button key={lang} onClick={() => handleSetLanguage(lang)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${language === lang ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400 hover:text-gray-800 border border-gray-200'}`}>
                  {lang === 'en' ? 'English' : 'Arabic'}
                </button>
              ))}
            </div>
            {provider === 'deepgram' && language === 'ar' && <p className="text-xs text-red-600 mt-1">⚠️ Deepgram is English-only</p>}
          </div>
          {availableModels.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Model</label>
              <select value={model} onChange={e => handleSetModel(e.target.value)}
                className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 w-full">
                {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}
          {provider === 'openrouter' || provider === 'gemini' || provider === 'deepgram' ? (
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Voice</label>
              <TtsVoiceGrid
                voices={availableVoices}
                current={voice}
                onChange={setVoice}
                previewProvider={provider}
                previewModel={model}
                previewLang={language}
              />
            </div>
          ) : (
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Voice</label>
              <input type="text" value={voice} onChange={e => setVoice(e.target.value)}
                placeholder={provider === 'cartesia' ? 'Cartesia voice UUID' : 'ElevenLabs voice ID'}
                className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 w-full" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Preview text</label>
            <textarea value={previewText} onChange={e => setPreviewText(e.target.value)} rows={3}
              className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 w-full resize-none" />
          </div>
          <button onClick={handlePreview} disabled={loading || !voice}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
            {loading ? <span className="inline-block w-4 h-4 border border-white/40 border-t-white rounded-full animate-spin" /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            {loading ? 'Generating…' : 'Preview Voice'}
          </button>
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3"><p className="text-xs text-red-700 font-medium">Preview failed</p><p className="text-xs text-red-600 mt-1">{error}</p></div>}
          {audioUrl && <div className="bg-gray-100 border border-gray-200 rounded-lg p-3"><audio ref={audioRef} controls src={audioUrl} className="w-full" /></div>}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
type SubTab = 'providers' | 'prompts' | 'voices'

export default function SettingsPage() {
  const [tab, setTab] = useState<SubTab>('providers')

  return (
    <PageShell>
      <PageHeader title="Settings" subtitle="Configure AI providers, prompts and voices" />

      <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 w-fit">
        {([['providers','Providers'], ['prompts','Prompts'], ['voices','Voices']] as [SubTab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-900'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'providers' && <ProvidersSection />}
      {tab === 'prompts'   && <PromptsSection />}
      {tab === 'voices'    && <VoicesSection />}
    </PageShell>
  )
}
