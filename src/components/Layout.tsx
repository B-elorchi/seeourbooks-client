import { NavLink } from 'react-router-dom'

const nav = [
  { to: '/',         label: 'Summary Generator' },
  { to: '/pipeline', label: 'Pipeline Jobs'      },
  { to: '/admin',    label: 'Admin'              },
]

export default function Layout({ children }: { children: React.ReactNode }) {
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
        <div className="px-5 py-4 border-t border-gray-800">
          <span className="text-xs text-gray-600">API: 127.0.0.1:8080</span>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
