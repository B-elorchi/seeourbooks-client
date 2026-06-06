/**
 * Auth context — single source of truth for the current session.
 *
 *   const { user, session, loading, login, logout, signup } = useAuth()
 *
 * Mounts a single onAuthStateChange listener on the Supabase client so all
 * components stay in sync (login on one tab updates the others, etc.).
 *
 * Auth-disabled mode (no SUPABASE_URL configured):
 *   - user        = { id: 'dev', email: 'dev@local', is_admin: true }
 *   - loading     = false
 *   - login/etc.  = no-op stubs that resolve immediately
 *   - lets the entire app run unauthenticated for local development
 */
import {
  createContext, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'

import { authEnabled, supabase } from './supabase'

export interface AuthUser {
  id:       string
  email:    string
  is_admin: boolean
}

interface AuthContextValue {
  /** Decoded user from the current session, or null when signed out. */
  user:     AuthUser | null
  /** Raw Supabase session — used by the API client to grab the access token. */
  session:  Session | null
  /** True until the initial session has been resolved (first paint guard). */
  loading:  boolean
  /**
   * True while we're calling /api/auth/me to determine the user's admin status.
   * ProtectedRoute treats this as "loading" so the "Admin access required"
   * panel doesn't flash before the backend verdict arrives.
   */
  adminChecking: boolean
  /** True when Supabase env vars are missing — UI should hide login chrome. */
  disabled: boolean
  login:    (email: string, password: string) => Promise<{ error?: string }>
  signup:   (email: string, password: string) => Promise<{ error?: string }>
  logout:   () => Promise<void>
  /** Trigger Supabase OAuth flow (e.g. 'google', 'github'). */
  signInWithOAuth: (provider: 'google' | 'github' | 'azure') => Promise<{ error?: string }>
}

const DEV_USER: AuthUser = { id: 'dev', email: 'dev@local', is_admin: true }

const noop = async (): Promise<{ error?: string }> => ({})

const defaultValue: AuthContextValue = {
  user:     null,
  session:  null,
  loading:  true,
  adminChecking: false,
  disabled: !authEnabled(),
  login:    noop,
  signup:   noop,
  logout:   async () => {},
  signInWithOAuth: noop,
}

const AuthContext = createContext<AuthContextValue>(defaultValue)


function supabaseUserToAuthUser(u: User | null | undefined): AuthUser | null {
  if (!u) return null
  return {
    id:       u.id,
    email:    u.email ?? '',
    // is_admin can't be derived client-side — the backend decides via
    // ADMIN_EMAILS.  We hit /api/auth/me below to fetch the verdict.
    is_admin: false,
  }
}


export function AuthProvider({ children }: { children: ReactNode }) {
  const disabled = !authEnabled()
  const [user,    setUser]    = useState<AuthUser | null>(disabled ? DEV_USER : null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState<boolean>(!disabled)
  // True between the moment we know we have a session and the moment
  // /api/auth/me responds.  ProtectedRoute treats this as "loading" so
  // the "Admin access required" panel doesn't briefly flash before we
  // have the backend's verdict.
  const [adminChecking, setAdminChecking] = useState<boolean>(false)

  useEffect(() => {
    if (disabled || !supabase) return

    let cancelled = false

    // 1. Initial session fetch
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setUser(supabaseUserToAuthUser(data.session?.user))
      setLoading(false)
    })

    // 2. Live updates (login/logout from other tabs, expiry, etc.)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(supabaseUserToAuthUser(s?.user))
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [disabled])

  // After we have a session, refine the user with backend-decided `is_admin`.
  // The "adminChecking" flag is true for the lifetime of this fetch so
  // ProtectedRoute treats it as still-loading.
  useEffect(() => {
    if (disabled || !session) {
      setAdminChecking(false)
      return
    }
    let cancelled = false
    setAdminChecking(true)

    ;(async () => {
      try {
        const apiBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
        const res = await fetch(`${apiBase}/api/auth/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) {
          // Don't swallow silently — admins debugging "Admin access required"
          // need to see WHY /me failed.
          const body = await res.text().catch(() => '')
          console.warn(
            `[auth] /api/auth/me returned ${res.status}: ${body.slice(0, 200)}`,
            '— admin status cannot be confirmed.',
          )
          return
        }
        const me = await res.json() as { id: string; email: string; is_admin: boolean }
        if (!cancelled) {
          setUser({ id: me.id, email: me.email, is_admin: !!me.is_admin })
        }
      } catch (err) {
        console.warn('[auth] /api/auth/me network error:', err)
      } finally {
        if (!cancelled) setAdminChecking(false)
      }
    })()

    return () => {
      cancelled = true
      setAdminChecking(false)
    }
  }, [disabled, session])

  const value = useMemo<AuthContextValue>(() => ({
    user, session, loading, adminChecking, disabled,
    async login(email, password) {
      if (!supabase) return { error: 'Auth not configured' }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return error ? { error: error.message } : {}
    },
    async signup(email, password) {
      if (!supabase) return { error: 'Auth not configured' }
      const { error } = await supabase.auth.signUp({ email, password })
      return error ? { error: error.message } : {}
    },
    async logout() {
      if (!supabase) return
      await supabase.auth.signOut()
      setSession(null)
      setUser(null)
    },
    async signInWithOAuth(provider) {
      if (!supabase) return { error: 'Auth not configured' }
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      })
      return error ? { error: error.message } : {}
    },
  }), [user, session, loading, adminChecking, disabled])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}


export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
