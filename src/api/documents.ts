import { apiFetch, apiUrl } from './client'
import { supabase } from '../auth/supabase'

// ── Response shapes ───────────────────────────────────────────────────────────

export interface DocumentListItem {
  id:                string
  original_filename: string
  status:            string
  progress:          number
  page_count?:       number | null
  language?:         string | null
  created_at:        string
}

export interface DocumentListResponse {
  count:     number
  documents: DocumentListItem[]
}

export interface DocumentStatus {
  documentId:    string
  status:        string   // uploaded | processing | ocr_completed | text_extracted | ai_processed | completed | failed
  progress:      number
  page_count?:   number | null
  language?:     string | null
  error_message?: string | null
}

export interface DocumentPage {
  page:    number
  content: string
}

export interface DocumentTextResponse {
  documentId: string
  pages:      DocumentPage[]
}

export interface DocumentSummary {
  documentId: string
  summary:    string
  provider?:  string | null
  model?:     string | null
}

export interface DocumentStructured {
  documentId: string
  title:      string
  summary:    string
  topics:     unknown[]
  keywords:   unknown[]
  authors:    unknown[]
  entities:   unknown[]
  chapters:   unknown[]
  raw:        Record<string, unknown>
}

// ── API helpers ───────────────────────────────────────────────────────────────

export async function listDocuments(limit = 50): Promise<DocumentListResponse> {
  const res = await apiFetch(`/api/documents?limit=${limit}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function uploadDocument(file: File): Promise<{ documentId: string; status: string }> {
  // multipart upload — manage Authorization header manually so the browser
  // can set the multipart boundary itself.
  const form = new FormData()
  form.append('file', file)

  const headers: Record<string, string> = {}
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (token) headers['Authorization'] = `Bearer ${token}`
    } catch { /* swallow */ }
  }

  const res = await fetch(apiUrl('/api/documents/upload'), {
    method:  'POST',
    headers,
    body:    form,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function startProcessing(documentId: string): Promise<{ documentId: string; status: string }> {
  const res = await apiFetch(`/api/documents/${documentId}/process`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getDocumentStatus(documentId: string): Promise<DocumentStatus> {
  const res = await apiFetch(`/api/documents/${documentId}/status`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getDocumentText(documentId: string): Promise<DocumentTextResponse> {
  const res = await apiFetch(`/api/documents/${documentId}/text`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getDocumentSummary(documentId: string): Promise<DocumentSummary> {
  const res = await apiFetch(`/api/documents/${documentId}/summary`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getDocumentStructured(documentId: string): Promise<DocumentStructured> {
  const res = await apiFetch(`/api/documents/${documentId}/json`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
