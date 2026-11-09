import { useState, useEffect } from 'react'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import type { Sede, Base, Unidad, Suministro, TipoNovedad } from '../../types'

type Tab = 'sedes' | 'bases' | 'unidades' | 'suministros' | 'tipos-novedad'

export default function AdminCatalogos() {
  const { isCoordinadora, tienePermiso } = useAuth()
  const canEdit = isCoordinadora || tienePermiso('EDITAR_CATALOGOS')
  const [tab, setTab] = useState<Tab>(isCoordinadora ? 'sedes' : 'suministros')

  const tabs: { key: Tab; label: string; coord: boolean }[] = [
    { key: 'sedes', label: 'Sedes', coord: true },
    { key: 'bases', label: 'Bases', coord: true },
    { key: 'unidades', label: 'Unidades', coord: true },
    { key: 'suministros', label: 'Suministros', coord: false },
    { key: 'tipos-novedad', label: 'Tipos novedad', coord: false },
  ]

  const visibleTabs = tabs.filter((t) => isCoordinadora || !t.coord)

  return (
    <div>
      <div className="admin-tabs" style={{ marginBottom: 12 }}>
        {visibleTabs.map((t) => (
          <button key={t.key} className={`admin-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sedes' && <SedesPanel canEdit={canEdit} />}
      {tab === 'bases' && <BasesPanel canEdit={canEdit} />}
      {tab === 'unidades' && <UnidadesPanel canEdit={canEdit} />}
      {tab === 'suministros' && <SuministrosPanel canEdit={canEdit} />}
      {tab === 'tipos-novedad' && <TiposNovedadPanel canEdit={canEdit} />}
    </div>
  )
}

function SedesPanel({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<Sede[]>([])
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')

  useEffect(() => {
    api.get<Sede[]>('/catalogos/sedes').then(setItems).finally(() => setLoading(false))
  }, [])

  async function crear() {
    if (!nombre.trim()) return
    try {
      const s = await api.post<Sede>('/catalogos/sedes', { nombre: nombre.trim() })
      setItems((p) => [...p, s])
      setNombre('')
    } catch (e) { alert(e instanceof ApiError ? e.message : 'Error') }
  }

  async function toggle(s: Sede) {
    try {
      await api.put(`/catalogos/sedes/${s.id}`, { nombre: s.nombre, activa: !s.activa })
      setItems((p) => p.map((x) => x.id === s.id ? { ...x, activa: !x.activa } : x))
    } catch (e) { alert(e instanceof ApiError ? e.message : 'Error') }
  }

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      {canEdit && (
        <div className="admin-inline-form">
          <input placeholder="Nueva sede..." value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && crear()} />
          <button className="btn btn-primary" onClick={crear}>Agregar</button>
        </div>
      )}
      <div className="admin-list">
        {items.map((s) => (
          <div key={s.id} className="card admin-list-item">
            <span className="item-name" style={{ opacity: s.activa ? 1 : 0.5 }}>{s.nombre}</span>
            {canEdit && (
              <button className={`btn ${s.activa ? 'btn-outline' : 'btn-secondary'}`} style={{ minHeight: 36, fontSize: '0.8rem' }} onClick={() => toggle(s)}>
                {s.activa ? 'Desactivar' : 'Activar'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function BasesPanel({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<Base[]>([])
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')

  useEffect(() => {
    api.get<Base[]>('/catalogos/bases').then(setItems).finally(() => setLoading(false))
  }, [])

  async function crear() {
    if (!nombre.trim()) return
    try {
      const b = await api.post<Base>('/catalogos/bases', { nombre: nombre.trim() })
      setItems((p) => [...p, b])
      setNombre('')
    } catch (e) { alert(e instanceof ApiError ? e.message : 'Error') }
  }

  async function toggle(b: Base) {
    try {
      await api.put(`/catalogos/bases/${b.id}`, { nombre: b.nombre, activa: !b.activa })
      setItems((p) => p.map((x) => x.id === b.id ? { ...x, activa: !x.activa } : x))
    } catch (e) { alert(e instanceof ApiError ? e.message : 'Error') }
  }

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      {canEdit && (
        <div className="admin-inline-form">
          <input placeholder="Nueva base..." value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && crear()} />
          <button className="btn btn-primary" onClick={crear}>Agregar</button>
        </div>
      )}
      <div className="admin-list">
        {items.map((b) => (
          <div key={b.id} className="card admin-list-item">
            <span className="item-name" style={{ opacity: b.activa ? 1 : 0.5 }}>{b.nombre}</span>
            {canEdit && (
              <button className={`btn ${b.activa ? 'btn-outline' : 'btn-secondary'}`} style={{ minHeight: 36, fontSize: '0.8rem' }} onClick={() => toggle(b)}>
                {b.activa ? 'Desactivar' : 'Activar'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function UnidadesPanel({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<Unidad[]>([])
  const [sedes, setSedes] = useState<Sede[]>([])
  const [loading, setLoading] = useState(true)
  const [numero, setNumero] = useState('')
  const [sedeId, setSedeId] = useState<string>('')

  useEffect(() => {
    Promise.all([
      api.get<Unidad[]>('/catalogos/unidades'),
      api.get<Sede[]>('/catalogos/sedes'),
    ]).then(([u, s]) => { setItems(u); setSedes(s) }).finally(() => setLoading(false))
  }, [])

  async function crear() {
    if (!numero.trim()) return
    try {
      const u = await api.post<Unidad>('/catalogos/unidades', { numero: numero.trim(), sede_id: sedeId ? Number(sedeId) : undefined })
      setItems((p) => [...p, u])
      setNumero(''); setSedeId('')
    } catch (e) { alert(e instanceof ApiError ? e.message : 'Error') }
  }

  async function toggle(u: Unidad) {
    try {
      await api.put(`/catalogos/unidades/${u.id}`, { numero: u.numero, sede_id: u.sede_id, activa: !u.activa })
      setItems((p) => p.map((x) => x.id === u.id ? { ...x, activa: !x.activa } : x))
    } catch (e) { alert(e instanceof ApiError ? e.message : 'Error') }
  }

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      {canEdit && (
        <div className="admin-inline-form" style={{ flexWrap: 'wrap' }}>
          <input placeholder="Número..." value={numero} onChange={(e) => setNumero(e.target.value)} style={{ minWidth: 100 }} />
          <select value={sedeId} onChange={(e) => setSedeId(e.target.value)} style={{ minWidth: 120 }}>
            <option value="">Sede...</option>
            {sedes.filter((s) => s.activa).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <button className="btn btn-primary" onClick={crear}>Agregar</button>
        </div>
      )}
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>{items.length} unidades</p>
      <div className="admin-list">
        {items.slice(0, 50).map((u) => (
          <div key={u.id} className="card admin-list-item">
            <div>
              <span className="item-name" style={{ opacity: u.activa ? 1 : 0.5 }}>{u.numero}</span>
              {u.placa && <span className="item-meta" style={{ marginLeft: 8 }}>{u.placa}</span>}
              {u.sede_nombre && <span className="item-meta" style={{ marginLeft: 8 }}>{u.sede_nombre}</span>}
            </div>
            {canEdit && (
              <button className={`btn ${u.activa ? 'btn-outline' : 'btn-secondary'}`} style={{ minHeight: 36, fontSize: '0.8rem' }} onClick={() => toggle(u)}>
                {u.activa ? 'Desactivar' : 'Activar'}
              </button>
            )}
          </div>
        ))}
        {items.length > 50 && <p className="empty-state">Mostrando 50 de {items.length}</p>}
      </div>
    </div>
  )
}

function SuministrosPanel({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<Suministro[]>([])
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')

  useEffect(() => {
    api.get<Suministro[]>('/catalogos/suministros').then(setItems).finally(() => setLoading(false))
  }, [])

  async function crear() {
    if (!nombre.trim()) return
    try {
      const s = await api.post<Suministro>('/catalogos/suministros', { nombre: nombre.trim() })
      setItems((p) => [...p, s])
      setNombre('')
    } catch (e) { alert(e instanceof ApiError ? e.message : 'Error') }
  }

  async function toggle(s: Suministro) {
    try {
      await api.put(`/catalogos/suministros/${s.id}`, { nombre: s.nombre, activo: !s.activo })
      setItems((p) => p.map((x) => x.id === s.id ? { ...x, activo: !x.activo } : x))
    } catch (e) { alert(e instanceof ApiError ? e.message : 'Error') }
  }

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      {canEdit && (
        <div className="admin-inline-form">
          <input placeholder="Nuevo suministro..." value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && crear()} />
          <button className="btn btn-primary" onClick={crear}>Agregar</button>
        </div>
      )}
      <div className="admin-list">
        {items.map((s) => (
          <div key={s.id} className="card admin-list-item">
            <div>
              <span className="item-name" style={{ opacity: s.activo ? 1 : 0.5 }}>{s.nombre}</span>
              {s.categoria && <span className="item-meta" style={{ marginLeft: 8 }}>{s.categoria}</span>}
            </div>
            {canEdit && (
              <button className={`btn ${s.activo ? 'btn-outline' : 'btn-secondary'}`} style={{ minHeight: 36, fontSize: '0.8rem' }} onClick={() => toggle(s)}>
                {s.activo ? 'Desactivar' : 'Activar'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function TiposNovedadPanel({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<TipoNovedad[]>([])
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')

  useEffect(() => {
    api.get<TipoNovedad[]>('/catalogos/tipos-novedad').then(setItems).finally(() => setLoading(false))
  }, [])

  async function crear() {
    if (!nombre.trim()) return
    try {
      const t = await api.post<TipoNovedad>('/catalogos/tipos-novedad', { nombre: nombre.trim() })
      setItems((p) => [...p, t])
      setNombre('')
    } catch (e) { alert(e instanceof ApiError ? e.message : 'Error') }
  }

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      {canEdit && (
        <div className="admin-inline-form">
          <input placeholder="Nuevo tipo..." value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && crear()} />
          <button className="btn btn-primary" onClick={crear}>Agregar</button>
        </div>
      )}
      <div className="admin-list">
        {items.map((t) => (
          <div key={t.id} className="card admin-list-item">
            <span className="item-name" style={{ opacity: t.activo ? 1 : 0.5 }}>{t.nombre}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
