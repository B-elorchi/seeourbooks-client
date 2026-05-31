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
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
