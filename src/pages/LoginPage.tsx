import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'

export default function LoginPage() {
  const { login, signup, signInWithOAuth, disabled } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/admin'

  const [mode,    setMode]    = useState<'login' | 'signup'>('login')
  const [email,   setEmail]   = useState('')
  const [pwd,     setPwd]     = useState('')
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (disabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 p-8">
        <div className="max-w-md bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-100 mb-2">Auth is disabled</h1>
          <p className="text-sm text-gray-400 mb-4">
            VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not configured.
            The app is running in unauthenticated dev mode.
          </p>
          <button
            onClick={() => navigate('/')}
            className="text-indigo-400 hover:underline text-sm"
          >
            Go to the app →
          </button>
        </div>
      </div>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const fn = mode === 'login' ? login : signup
      const { error } = await fn(email, pwd)
      if (error) setError(error)
      else navigate(redirectTo, { replace: true })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-6">
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h1 className="text-xl font-semibold text-gray-100 mb-1">
          {mode === 'login' ? 'Sign in' : 'Create your account'}
        </h1>
        <p className="text-xs text-gray-500 mb-5">
          SeeOurBook Admin · {mode === 'login' ? 'welcome back' : 'just a few details'}
        </p>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
            />
          </label>

          <label className="block">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Password</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
            />
          </label>

          {error && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3 py-2.5 rounded-lg disabled:opacity-60"
          >
            {loading
              ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
              : (mode === 'login' ? 'Sign in' : 'Sign up')}
          </button>
        </form>

        <div className="my-4 flex items-center gap-2">
          <div className="flex-1 border-t border-gray-800" />
          <span className="text-[10px] uppercase text-gray-600 tracking-wider">or</span>
          <div className="flex-1 border-t border-gray-800" />
        </div>

        <button
          onClick={() => signInWithOAuth('google')}
          className="w-full bg-gray-800 hover:bg-gray-750 border border-gray-700 text-gray-100 text-sm px-3 py-2.5 rounded-lg flex items-center justify-center gap-2"
        >
          <span>Continue with Google</span>
        </button>

        <p className="text-xs text-gray-500 text-center mt-5">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}
            className="text-indigo-400 hover:underline"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
