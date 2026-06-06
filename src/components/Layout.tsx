import { NavLink, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'

const nav = [
  { to: '/',          label: 'Summary Generator' },
  { to: '/pipeline',  label: 'Pipeline Jobs'     },
  { to: '/documents', label: 'Documents'         },
  { to: '/admin',     label: 'Admin'             },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, disabled } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-gray-800 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-800">
          <span className="text-indigo-400 font-semibold text-sm tracking-wide">SeeOurBook</span>
        </div>
        <nav className="flex flex-col gap-1 p-3 flex-1">
          {nav.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User panel */}
        <div className="px-3 py-3 border-t border-gray-800">
          {disabled ? (
            <p className="text-[11px] text-gray-600 px-2">Auth disabled (dev mode)</p>
          ) : user ? (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-300 truncate px-2" title={user.email}>
                {user.email}
              </p>
              <div className="flex items-center justify-between gap-2 px-2">
                {user.is_admin && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-900/40 text-indigo-300 border border-indigo-800">
                    admin
                  </span>
                )}
                <button
                  onClick={handleLogout}
                  className="ml-auto text-[11px] text-gray-400 hover:text-gray-100"
                >
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <NavLink to="/login" className="text-xs text-indigo-400 hover:underline px-2">
              Sign in →
            </NavLink>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
