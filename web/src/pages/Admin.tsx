import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AdminEquipo from './admin/AdminEquipo'
import AdminCatalogos from './admin/AdminCatalogos'
import AdminInformes from './admin/AdminInformes'
import AdminImportar from './admin/AdminImportar'
import AdminDrive from './admin/AdminDrive'
import './Admin.css'

export default function Admin() {
  const { isCoordinadora, tienePermiso } = useAuth()

  const tabs = []
  if (isCoordinadora) {
    tabs.push({ to: '/admin/equipo', label: 'Equipo' })
  }
  tabs.push({ to: '/admin/catalogos', label: 'Catálogos' })
  if (isCoordinadora || tienePermiso('EXPORTAR_SHEETS')) {
    tabs.push({ to: '/admin/informes', label: 'Informes' })
  }
  if (isCoordinadora) {
    tabs.push({ to: '/admin/importar', label: 'Importar' })
    tabs.push({ to: '/admin/drive', label: 'Drive' })
  }

  return (
    <div className="page">
      <h1 className="page-title">Administración</h1>

      <div className="admin-tabs">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => `admin-tab ${isActive ? 'active' : ''}`}
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <div className="admin-content">
        <Routes>
          <Route path="equipo" element={isCoordinadora ? <AdminEquipo /> : <Navigate to="/admin/catalogos" />} />
          <Route path="catalogos" element={<AdminCatalogos />} />
          <Route path="informes" element={<AdminInformes />} />
          <Route path="importar" element={isCoordinadora ? <AdminImportar /> : <Navigate to="/admin/catalogos" />} />
          <Route path="drive" element={isCoordinadora ? <AdminDrive /> : <Navigate to="/admin/catalogos" />} />
          <Route index element={<Navigate to={tabs[0]?.to || '/admin/catalogos'} replace />} />
        </Routes>
      </div>
    </div>
  )
}
