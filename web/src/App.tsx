import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import NuevaVisita from './pages/NuevaVisita'
import Visita from './pages/Visita'
import Historial from './pages/Historial'
import Pendientes from './pages/Pendientes'
import Perfil from './pages/Perfil'
import Admin from './pages/Admin'
import OfflineSync from './components/OfflineSync'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { usuario, loading } = useAuth()
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
  if (!usuario) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { usuario, loading } = useAuth()

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh' }}><div className="spinner" /></div>
  }

  return (
    <>
    <OfflineSync />
    <Routes>
      <Route path="/login" element={usuario ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<NuevaVisita />} />
        <Route path="visita/:unidadId" element={<Visita />} />
        <Route path="historial" element={<Historial />} />
        <Route path="pendientes" element={<Pendientes />} />
        <Route path="perfil" element={<Perfil />} />
        <Route path="admin/*" element={<Admin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}
