import { useState, useEffect } from 'react'
import { apiFetch } from '../../api/client'
import { PageShell, PageHeader } from './_shared'

interface AppUser {
  id:         string
  email:      string
  name:       string | null
  role:       'admin' | 'editor' | 'viewer'
  is_active:  boolean
  created_at: string
}

interface ApiKey {
  id:           string
  user_id:      string
  name:         string
  key_prefix:   string
  role:         'admin' | 'editor' | 'viewer'
  is_active:    boolean
  last_used_at: string | null
  expires_at:   string | null
  created_at:   string
}

interface NewKeyResult {
  key:        string
  key_prefix: string
  id:         string
  warning:    string
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  if (!res.ok) throw new Error(await res.text())
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function timeAgo(iso: string | null) {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  return `${Math.floor(m / 1440)}d ago`
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    admin:  'bg-red-50 text-red-700 border border-red-200',
    editor: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    viewer: 'bg-gray-100 text-gray-500 border border-gray-200',
  }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${map[role] ?? map.viewer}`}>
      {role}
    </span>
  )
}

export default function UsersPage() {
  const [users,     setUsers]     = useState<AppUser[]>([])
  const [keys,      setKeys]      = useState<ApiKey[]>([])
  const [loading,   setLoading]   = useState(true)
  const [newKey,    setNewKey]    = useState<NewKeyResult | null>(null)
  const [tab,       setTab]       = useState<'users' | 'keys'>('users')

  // Create user form
  const [email,    setEmail]    = useState('')
  const [name,     setName]     = useState('')
  const [password, setPassword] = useState('')
  const [role,     setRole]     = useState<'admin' | 'editor' | 'viewer'>('viewer')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Create key form
  const [keyUserId,  setKeyUserId]  = useState('')
  const [keyName,    setKeyName]    = useState('')
  const [keyRole,    setKeyRole]    = useState<'admin' | 'editor' | 'viewer'>('viewer')
  const [creatingKey, setCreatingKey] = useState(false)
  const [keyError,   setKeyError]   = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [u, k] = await Promise.all([
        api<AppUser[]>('/api/users'),
        api<ApiKey[]>('/api/users/keys'),
      ])
      setUsers(u ?? [])
      setKeys(k ?? [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  async function createUser() {
    if (!email.trim()) return
    setCreating(true); setCreateError(null)
    try {
      await api('/api/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email:    email.trim(),
          name:     name.trim() || null,
          role,
          password: password.trim() || null,
        }),
      })
      setEmail(''); setName(''); setPassword(''); setRole('viewer')
      await load()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed')
    } finally { setCreating(false) }
  }

  async function toggleUser(userId: string, is_active: boolean) {
    try {
      await api(`/api/users/${userId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ is_active: !is_active }),
      })
      await load()
    } catch { /* silent */ }
  }

  async function deleteUser(userId: string) {
    if (!confirm('Delete this user and all their API keys?')) return
    try { await api(`/api/users/${userId}`, { method: 'DELETE' }); await load() }
    catch { /* silent */ }
  }

  async function createKey() {
    if (!keyUserId || !keyName.trim()) return
    setCreatingKey(true); setKeyError(null); setNewKey(null)
    try {
      const result = await api<NewKeyResult>(`/api/users/${keyUserId}/api-keys`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: keyName.trim(), role: keyRole }),
      })
      setNewKey(result)
      setKeyName('')
      await load()
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : 'Failed')
    } finally { setCreatingKey(false) }
  }

  async function revokeKey(userId: string, keyId: string) {
    if (!confirm('Revoke this API key?')) return
    try { await api(`/api/users/${userId}/api-keys/${keyId}`, { method: 'DELETE' }); await load() }
    catch { /* silent */ }
  }

  return (
    <PageShell>
      <PageHeader
        title="Users & API Keys"
        subtitle="Manage users, roles and API access"
        action={
          <button onClick={() => void load()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-400 hover:text-gray-900 hover:border-gray-600 transition-colors">
            <i className="ti ti-refresh text-sm" aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 w-fit">
        {(['users', 'keys'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-900'
            }`}>
            {t === 'users' ? `Users (${users.length})` : `API Keys (${keys.length})`}
          </button>
        ))}
      </div>

      {tab === 'users' ? (
        <div className="space-y-6">
          {/* Create user */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-800">Add user</h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Email <span className="text-red-500">*</span></label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com"
                    className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 placeholder:text-gray-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Display name"
                    className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 placeholder:text-gray-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Role</label>
                  <select value={role} onChange={e => setRole(e.target.value as typeof role)}
                    className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400">
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs text-gray-400 mb-1">
                    Password <span className="text-gray-400">(optional — set one to create a login the user can sign in with)</span>
                  </label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank for a metadata-only user"
                    autoComplete="new-password"
                    className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 placeholder:text-gray-400" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={createUser} disabled={!email.trim() || creating}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
                  {creating ? 'Creating…' : 'Create user'}
                </button>
                {createError && <p className="text-sm text-red-600">{createError}</p>}
              </div>
            </div>
          </div>

          {/* Users table */}
          {loading ? (
            <p className="text-sm text-gray-500 p-4">Loading…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-gray-600 p-4">No users yet.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-3">User</th>
                    <th className="text-left px-5 py-3">Role</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="text-left px-5 py-3">Created</th>
                    <th className="text-left px-5 py-3">Keys</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-gray-100/40 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-gray-800 font-medium">{u.email}</p>
                        {u.name && <p className="text-xs text-gray-500">{u.name}</p>}
                        <p className="text-[10px] text-gray-700 font-mono">{u.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-5 py-3"><RoleBadge role={u.role} /></td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-50 text-green-700 border border-green-200/50' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                          {u.is_active ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">{timeAgo(u.created_at)}</td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {keys.filter(k => k.user_id === u.id && k.is_active).length} active
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => toggleUser(u.id, u.is_active)}
                            className="text-xs text-gray-400 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors">
                            {u.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button onClick={() => deleteUser(u.id)}
                            className="text-xs text-gray-600 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* New key reveal */}
          {newKey && (
            <div className="bg-green-950/30 border border-green-200/50 rounded-xl p-4">
              <p className="text-sm font-semibold text-green-400 mb-1">API key created — copy it now</p>
              <p className="text-xs text-green-300/70 mb-2">{newKey.warning}</p>
              <code className="block text-sm font-mono bg-gray-50/60 text-green-300 rounded-lg px-3 py-2 break-all select-all">
                {newKey.key}
              </code>
            </div>
          )}

          {/* Create key */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-800">Create API key</h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">User <span className="text-red-500">*</span></label>
                  <select value={keyUserId} onChange={e => setKeyUserId(e.target.value)}
                    className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400">
                    <option value="">— select user —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Key name <span className="text-red-500">*</span></label>
                  <input type="text" value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="Production key"
                    className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 placeholder:text-gray-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Role</label>
                  <select value={keyRole} onChange={e => setKeyRole(e.target.value as typeof keyRole)}
                    className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400">
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={createKey} disabled={!keyUserId || !keyName.trim() || creatingKey}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
                  {creatingKey ? 'Creating…' : 'Generate key'}
                </button>
                {keyError && <p className="text-sm text-red-600">{keyError}</p>}
              </div>
            </div>
          </div>

          {/* Keys table */}
          {loading ? (
            <p className="text-sm text-gray-500 p-4">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-gray-600 p-4">No API keys yet.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-3">Key</th>
                    <th className="text-left px-5 py-3">User</th>
                    <th className="text-left px-5 py-3">Role</th>
                    <th className="text-left px-5 py-3">Last used</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {keys.map(k => {
                    const user = users.find(u => u.id === k.user_id)
                    return (
                      <tr key={k.id} className="hover:bg-gray-100/40 transition-colors">
                        <td className="px-5 py-3">
                          <p className="text-gray-800 font-medium">{k.name}</p>
                          <code className="text-xs text-gray-500 font-mono">{k.key_prefix}…</code>
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-400">{user?.email ?? k.user_id.slice(0, 8)}</td>
                        <td className="px-5 py-3"><RoleBadge role={k.role} /></td>
                        <td className="px-5 py-3 text-xs text-gray-500">{timeAgo(k.last_used_at)}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${k.is_active ? 'bg-green-50 text-green-700 border border-green-200/50' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                            {k.is_active ? 'active' : 'revoked'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {k.is_active && (
                            <button onClick={() => revokeKey(k.user_id, k.id)}
                              className="text-xs text-gray-600 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
