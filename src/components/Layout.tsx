import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// Shown always
const mainNav = [
  { to: '/admin',          label: 'Dashboard',  icon: 'ti-layout-dashboard', exact: true },
  { to: '/admin/jobs',     label: 'Jobs',       icon: 'ti-list-check'   },
  { to: '/pipeline',       label: 'Job Details', icon: 'ti-subtask'     },
  { to: '/admin/books',    label: 'Books',      icon: 'ti-book'         },
  { to: '/documents',      label: 'Documents',  icon: 'ti-file-upload'  },
]

const manageNav = [
  { to: '/admin/users',       label: 'Users & Keys', icon: 'ti-users'      },
  { to: '/admin/costs/books', label: 'Costs by Book', icon: 'ti-book-2'    },
  { to: '/admin/costs/users', label: 'Costs by User', icon: 'ti-user-dollar' },
  { to: '/admin/analytics',   label: 'Analytics',    icon: 'ti-chart-bar'  },
  { to: '/admin/catalog',     label: 'Database',     icon: 'ti-database'   },
]

const configNav = [
  { to: '/admin/settings', label: 'Settings',  icon: 'ti-settings'     },
]

// Non-admin users (editor/viewer) see a scoped, cost-free view of their own work
const publicNav = [
  { to: '/',          label: 'Dashboard',     icon: 'ti-layout-dashboard', exact: true },
  { to: '/summary',   label: 'Summary',       icon: 'ti-sparkles'    },
  { to: '/my-jobs',   label: 'My Jobs',       icon: 'ti-activity'    },
  { to: '/documents', label: 'My Documents',  icon: 'ti-file-upload' },
]

function NavItem({ to, label, icon, exact }: { to: string; label: string; icon: string; exact?: boolean }) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
          isActive
            ? 'text-blue-600 font-medium'
            : 'text-gray-600 hover:text-gray-900'
        }`
      }
    >
      <i className={`ti ${icon} text-base`} aria-hidden="true" />
      {label}
    </NavLink>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, disabled } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const inAdmin   = location.pathname.startsWith('/admin')

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="h-screen bg-white text-gray-900 flex overflow-hidden">
      <aside className="w-56 shrink-0 border-r border-gray-200 flex flex-col bg-[#f5f5f0]">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-gray-200/60">
          <span className="text-gray-900 font-semibold text-sm tracking-wide">SeeOurBook</span>
          <span className="block text-[11px] text-gray-500 mt-0.5 tracking-wider">
            {inAdmin ? 'Admin Dashboard' : 'Book Summarizer'}
          </span>
        </div>

        <nav className="flex flex-col p-3 flex-1 gap-0.5 overflow-y-auto">
          {(user?.is_admin || disabled) ? (
            <>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest px-3 pt-1 pb-2">Main</p>
              {mainNav.map(n => <NavItem key={n.to} {...n} exact={n.exact} />)}

              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest px-3 pt-4 pb-2">Manage</p>
              {manageNav.map(n => <NavItem key={n.to} {...n} />)}

              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest px-3 pt-4 pb-2">Configure</p>
              {configNav.map(n => <NavItem key={n.to} {...n} />)}
            </>
          ) : (
            <>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest px-3 pt-1 pb-2">Main</p>
              {publicNav.map(n => <NavItem key={n.to} {...n} exact={n.to === '/'} />)}
            </>
          )}
        </nav>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-gray-200/60">
          {disabled ? (
            <p className="text-[11px] text-gray-400 px-2">Auth disabled (dev)</p>
          ) : user ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 px-2">
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-700 font-medium shrink-0">
                  {(user.email?.[0] ?? '?').toUpperCase()}
                </div>
                <p className="text-xs text-gray-600 truncate flex-1" title={user.email}>{user.email}</p>
              </div>
              <div className="flex items-center justify-between px-2">
                {user.is_admin && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">
                    admin
                  </span>
                )}
                <button onClick={handleLogout} className="ml-auto text-[11px] text-gray-400 hover:text-gray-700 transition-colors">
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <NavLink to="/login" className="text-xs text-blue-600 hover:underline px-2">Sign in →</NavLink>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-white">{children}</main>
    </div>
  )
}
