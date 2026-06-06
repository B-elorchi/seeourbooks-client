/**
 * Resolves an API path to a fully-qualified URL, and exposes a `fetch`
 * helper that automatically attaches the Supabase access token.
 *
 *   import.meta.env.VITE_API_URL   →  prepended to every API path
 *   (not set in dev)               →  paths stay relative so the vite proxy
 *                                     in vite.config.ts handles them
 *
 * Used by every fetch() call in the api/ folder so that one env var
 * controls where the front-end talks to the API, and every request is
 * auth-aware.
 */
import { supabase } from '../auth/supabase'

const API_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

export function apiUrl(path: string): string {
  // Already absolute — leave untouched
  if (/^https?:\/\//i.test(path)) return path
  if (!path.startsWith('/')) path = '/' + path
  return API_URL + path
}

/**
 * Same shape as window.fetch — adds the Supabase Bearer token to the
 * Authorization header when a session is active.  Use this for every
 * call from the frontend instead of the global fetch so authenticated
 * endpoints work end-to-end.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = apiUrl(input)

  const headers = new Headers(init.headers || {})
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`)
      }
    } catch {
      /* swallow — request will go unauthenticated */
    }
  }

  return fetch(url, { ...init, headers })
}
