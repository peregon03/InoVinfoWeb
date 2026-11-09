import { useAuth } from '../context/AuthContext'
import './Perfil.css'

export default function Perfil() {
  const { usuario, logout } = useAuth()

  if (!usuario) return null

  return (
    <div className="page">
      <h1 className="page-title">Perfil</h1>

      <div className="card perfil-card">
        <div className="perfil-avatar">
          {usuario.nombre.charAt(0).toUpperCase()}
        </div>
        <h2 className="perfil-nombre">{usuario.nombre}</h2>
        <p className="perfil-email">{usuario.email}</p>
        <span className="chip perfil-rol" style={{
          background: usuario.rol === 'coordinadora' ? 'rgba(212,168,67,0.15)' : 'rgba(26,58,92,0.4)',
          color: usuario.rol === 'coordinadora' ? 'var(--accent)' : 'var(--text)',
        }}>
          {usuario.rol === 'coordinadora' ? 'Coordinadora' : 'Técnico'}
        </span>

        {usuario.permisos.length > 0 && (
          <div className="perfil-permisos">
            <span className="card-title">Permisos</span>
            <div className="perfil-permisos-list">
              {usuario.permisos.map((p) => (
                <span key={p} className="chip" style={{ background: 'var(--primary)', color: 'var(--text)' }}>{p}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <button className="btn btn-outline btn-block" onClick={logout} style={{ marginTop: 16 }}>
        Cerrar sesión
      </button>
    </div>
  )
}
