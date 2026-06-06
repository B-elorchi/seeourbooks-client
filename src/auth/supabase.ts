/**
 * Supabase client instance.
 *
 * Reads VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from the build env.
 * When either is missing we still export a `null` so the rest of the
 * codebase can detect "auth disabled" and degrade gracefully — useful
 * for local dev without a Supabase project.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null

export function authEnabled(): boolean {
  return supabase !== null
}
