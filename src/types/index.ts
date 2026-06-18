// ── Pipeline request ──────────────────────────────────────────────────────────

export interface Chapter {
  index: number
  title: string
  text:  string
}

export interface PipelineOptions {
  length: string   // '3min' | '5min' | '10min' | '15min'
  style:  string   // 'narrative' | 'bullets' | 'academic'
  length_preset?: 'small' | 'medium' | 'large' | 'custom' | null
  max_chars?:     number | null
  audio_style?:   'single' | 'multi' | 'podcast' | 'audiobook' | 'news' | 'bedtime' | 'custom' | null
}

export interface PipelineReq {
  book_id:     string
  title?:      string
  author?:     string
  language:    'en' | 'ar'
  year?:       number
  pages?:      number
  grade_level?: string
  genres:      string[]
  chapters:    Chapter[]
  steps:       string[]   // [] = all steps
  options:     PipelineOptions
  source:      'catalog' | 'custom_json' | 'pdf_upload'
}

// ── Pipeline result (output JSON) ────────────────────────────────────────────

export interface ChapterResult {
  index:          number
  title:          string
  summary:        string
  read_time_min:  number
  audio_en?:      string
  audio_ar?:      string
  mindmap_url?:   string
  mindmap_en_url?: string
  mindmap_ar_url?: string
  mindmap_format?: 'mermaid' | 'json'
  mindmap_data?:  unknown      // parsed JSON tree when format = 'json'
}

export interface AudioAsset {
  url:      string
  duration?: string   // "9:18"
  size_mb?:  number
}

export interface SummaryAsset {
  text:       string
  word_count: number
  style:      string
  language:   string
}

export interface FileChapterEntry {
  index:           number
  title?:          string
  audio_url?:      string
  audio_en_url?:   string
  audio_ar_url?:   string
  mindmap_url?:    string
  mindmap_en_url?: string
  mindmap_ar_url?: string
}

export interface FilesAsset {
  cover?:      string
  audio_full?: string
  mindmap?:    string
  epub?:       string
  video?:      string
  chapters?:   FileChapterEntry[]
}

export interface PipelineResult {
  book_id:         string
  status:          'done' | 'partial' | 'failed'
  generated_at:    string
  processing_time: string
  steps: Record<string, 'done' | 'failed' | 'partial' | 'skipped' | 'running' | 'pending'>
  metadata: {
    title?:         string
    author?:        string
    year?:          number
    pages?:         number
    grade_level?:   string
    genres:         string[]
    cover_url?:     string
    cover_alt_text?: string
  }
  quick_summary:  string
  summary_qa?:    {
    score:      number
    passed:     boolean
    threshold?: number
    covered?:   boolean
    missing?:   string[]
    reason?:    string
    model?:     string
  } | null
  summaries:      Record<string, SummaryAsset>    // e.g. "10min_en"
  audio:          Record<string, AudioAsset>       // e.g. "full_en"
  mindmap?:       { url: string; data?: unknown }
  mindmap_en?:    { url: string; data?: unknown }
  mindmap_ar?:    { url: string; data?: unknown }
  epub?:          Record<string, { url: string }> | null  // e.g. {"enriched_en": {"url": "..."}}
  video?:         Record<string, VideoAsset> | null       // e.g. {"summary_en": {url, duration_seconds, ...}}
  chapters:              ChapterResult[]
  errors:                Record<string, string>
  files?:                FilesAsset   // Legacy field for older jobs
  extracted_pages?:      { page: number; content: string }[]
  page_count_extracted?: number
}

export interface VideoAsset {
  url:              string
  duration_seconds?: number | null
  size_mb?:         number | null
  width?:           number | null
  height?:          number | null
  provider?:        string | null
  silent?:          boolean | null   // true → slideshow without TTS narration
}

// ── Pipeline job (Supabase row) ───────────────────────────────────────────────

export interface PipelineJob {
  id:          string
  book_id:     string
  status:      'queued' | 'running' | 'done' | 'partial' | 'failed' | 'cancelled'
  input?:      Partial<PipelineReq>
  result?:     PipelineResult | string   // may arrive as a JSON string on legacy rows
  error_msg?:  string
  retry_count: number
  max_retries: number
  created_at:  string
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export interface AdminMetrics {
  total:   number
  done:    number
  partial: number
  failed:  number
  running: number
  queued:  number
}

export interface QueuedMetrics {
  minutes:                 number
  queued_last_n_minutes:   number
  queued_with_progress:    number
  queued_total:            number
}

export interface CostByProvider {
  provider: string
  calls:    number
  cost_usd: number
  units:    number
}

export interface CostByStep {
  step:     string
  calls:    number
  cost_usd: number
}

export interface BookCostModel {
  model:    string
  provider: string
  calls:    number
  cost_usd: number
}

export interface BookCostStep {
  step:     string
  calls:    number
  cost_usd: number
  models:   BookCostModel[]
}

export interface BookCostJob {
  job_id:   string
  calls:    number
  cost_usd: number
}

export interface BookCostDetails {
  book_id:        string
  total_cost_usd: number
  total_calls:    number
  steps:          BookCostStep[]
  jobs:           BookCostJob[]
}

export interface BookCoverPrompt {
  book_id:       string
  prompt:        string
  summary_chars: number
}

export interface CostByModel {
  model:     string
  provider:  string
  calls:     number
  cost_usd:  number
  units:     number
  unit_type: string
}

export interface AdminCosts {
  days:            number
  total_calls:     number
  total_cost_usd:  number
  by_provider:     CostByProvider[]
  by_step:         CostByStep[]
  by_model:        CostByModel[]
}

// ── OpenRouter live model list ───────────────────────────────────────────────

export interface OpenRouterModel {
  id:       string         // e.g. "google/gemini-2.5-flash-image"
  name:     string         // e.g. "Google: Gemini 2.5 Flash Image"
  context?: number | null  // context_length when present
}

export type OpenRouterModality = 'all' | 'image' | 'vision' | 'chat'

export interface OpenRouterModelsResponse {
  modality: OpenRouterModality
  count:    number
  models:   OpenRouterModel[]
}

// ── Catalog inspector (admin Catalog tab) ────────────────────────────────────

export interface CatalogTableMeta {
  name:              string
  default_order:     string
  supports_book_id:  boolean
}

export interface CatalogTablesResponse {
  tables: CatalogTableMeta[]
}

export interface CatalogResponse {
  table:  string
  limit:  number
  offset: number
  count:  number
  rows:   Record<string, unknown>[]
}
