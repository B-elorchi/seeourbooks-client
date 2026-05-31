/**
 * Resolves an API path to a fully-qualified URL.
 *
 *   import.meta.env.VITE_API_URL   →  prepended to every API path
 *   (not set in dev)               →  paths stay relative so the vite proxy
 *                                     in vite.config.ts handles them
 *
 * Used by every fetch() call in the api/ folder so that one env var
 * controls where the front-end talks to the API.
 */
const API_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

export function apiUrl(path: string): string {
  // Already absolute — leave untouched
  if (/^https?:\/\//i.test(path)) return path
  if (!path.startsWith('/')) path = '/' + path
  return API_URL + path
}
