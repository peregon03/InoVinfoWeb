import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Layout.css'

const navItems = [
  { to: '/', icon: '＋', label: 'Nueva', exact: true },
  { to: '/historial', icon: '☰', label: 'Historial' },
  { to: '/pendientes', icon: '⏰', label: 'Pendientes' },
  { to: '/perfil', icon: '👤', label: 'Perfil' },
]

export default function Layout() {
  const { isCoordinadora, tienePermiso } = useAuth()
  const location = useLocation()

  const items = [...navItems]
  if (isCoordinadora || tienePermiso('EDITAR_CATALOGOS') || tienePermiso('EXPORTAR_SHEETS')) {
    items.push({ to: '/admin', icon: '⚙', label: 'Admin' })
  }

  // Hide nav on visita detail
  const hideNav = location.pathname.startsWith('/visita/')

  return (
    <div className="layout">
      <main className="layout-main">
        <Outlet />
      </main>
      {!hideNav && (
        <nav className="bottom-nav">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
