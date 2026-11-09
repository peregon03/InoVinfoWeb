import { useState, useEffect } from 'react'
import { api, ApiError } from '../../lib/api'
import type { Usuario } from '../../types'

const PERMISOS = ['EDITAR_CATALOGOS', 'VER_TODAS_VISITAS', 'EXPORTAR_SHEETS']

export default function AdminEquipo() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [changePwdId, setChangePwdId] = useState<number | null>(null)
  const [newPwd, setNewPwd] = useState('')

  useEffect(() => {
    api.get<Usuario[]>('/usuarios').then(setUsuarios).finally(() => setLoading(false))
  }, [])

  async function crearTecnico() {
    setSaving(true)
    setError('')
    try {
      const res = await api.post<{ usuario: Usuario }>('/auth/crear-tecnico', { nombre, email, password })
      setUsuarios((p) => [...p, { ...res.usuario, permisos: [], activo: true }])
      setShowForm(false)
      setNombre(''); setEmail(''); setPassword('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Error')
    } finally { setSaving(false) }
  }

  async function toggleActivo(u: Usuario) {
    try {
      await api.put(`/usuarios/${u.id}/estado`, { activo: !u.activo })
      setUsuarios((p) => p.map((x) => x.id === u.id ? { ...x, activo: !x.activo } : x))
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Error')
    }
  }

  async function togglePermiso(u: Usuario, permiso: string) {
    const permisos = u.permisos.includes(permiso)
      ? u.permisos.filter((p) => p !== permiso)
      : [...u.permisos, permiso]
    try {
      await api.put(`/usuarios/${u.id}/permisos`, { permisos })
      setUsuarios((p) => p.map((x) => x.id === u.id ? { ...x, permisos } : x))
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Error')
    }
  }

  async function cambiarPwd() {
    if (!changePwdId || newPwd.length < 6) return
    try {
      await api.put(`/usuarios/${changePwdId}/password`, { password: newPwd })
      setChangePwdId(null)
      setNewPwd('')
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Error')
    }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 className="admin-section-title" style={{ marginBottom: 0 }}>Equipo técnico</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Técnico'}
        </button>
      </div>

      {showForm && (
        <div className="card admin-form">
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group">
            <label>Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} />
          </div>
          <button className="btn btn-primary" onClick={crearTecnico} disabled={saving || !nombre || !email || password.length < 6}>
            {saving ? 'Creando...' : 'Crear técnico'}
          </button>
        </div>
      )}

      <div className="admin-list">
        {usuarios.map((u) => (
          <div key={u.id} className="card">
            <div className="admin-list-item">
              <div>
                <span className="item-name">{u.nombre}</span>
                <br />
                <span className="item-meta">{u.email} · {u.rol}</span>
              </div>
              <button
                className={`btn ${u.activo ? 'btn-outline' : 'btn-secondary'}`}
                style={{ minHeight: 36, fontSize: '0.8rem' }}
                onClick={() => toggleActivo(u)}
              >
                {u.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>

            {u.rol === 'tecnico' && (
              <div style={{ padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {PERMISOS.map((p) => (
                  <button
                    key={p}
                    className={`chip`}
                    style={{
                      background: u.permisos.includes(p) ? 'rgba(212,168,67,0.15)' : 'var(--bg)',
                      color: u.permisos.includes(p) ? 'var(--accent)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      border: '1px solid ' + (u.permisos.includes(p) ? 'var(--accent)' : 'var(--surface-border)'),
                    }}
                    onClick={() => togglePermiso(u, p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            <div style={{ padding: '0 16px 12px' }}>
              {changePwdId === u.id ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="password" placeholder="Nueva contraseña (mín. 6)" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn btn-primary" style={{ minHeight: 40, fontSize: '0.8rem' }} onClick={cambiarPwd}>OK</button>
                  <button className="btn btn-outline" style={{ minHeight: 40, fontSize: '0.8rem' }} onClick={() => { setChangePwdId(null); setNewPwd('') }}>X</button>
                </div>
              ) : (
                <button className="btn btn-outline" style={{ minHeight: 32, fontSize: '0.78rem' }} onClick={() => setChangePwdId(u.id)}>
                  Cambiar contraseña
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
