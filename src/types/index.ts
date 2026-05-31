// ── Pipeline request ──────────────────────────────────────────────────────────

export interface Chapter {
  index: number
  title: string
  text:  string
}

export interface PipelineOptions {
  length: string   // '3min' | '5min' | '10min' | '15min'
  style:  string   // 'narrative' | 'bullets' | 'academic'
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
  index:         number
  title:         string
  summary:       string
  read_time_min: number
  audio_en?:     string
  audio_ar?:     string
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

export interface PipelineResult {
  book_id:         string
  status:          'done' | 'partial' | 'failed'
  generated_at:    string
  processing_time: string
  steps: Record<string, 'done' | 'failed' | 'partial' | 'skipped' | 'running'>
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
  summaries:      Record<string, SummaryAsset>    // e.g. "10min_en"
  audio:          Record<string, AudioAsset>       // e.g. "full_en"
  mindmap?:       { url: string }
  chapters:       ChapterResult[]
  errors:         Record<string, string>
}

// ── Pipeline job (Supabase row) ───────────────────────────────────────────────

export interface PipelineJob {
  id:          string
  book_id:     string
  status:      'queued' | 'running' | 'done' | 'partial' | 'failed'
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
