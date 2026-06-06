/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL the front-end uses for every /api/... call.
   *
   *   Development : not set → calls stay relative and hit the vite proxy
   *                 configured in vite.config.ts
   *   Production  : set in .env.production, e.g.
   *                 VITE_API_URL=https://seeourbooks-api.elorchi.com
   */
  readonly VITE_API_URL?: string

  /** Supabase project URL — e.g. https://abc.supabase.co */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase anon (public) key — safe to ship in the bundle */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
