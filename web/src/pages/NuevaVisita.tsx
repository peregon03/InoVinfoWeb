import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Unidad, Base, VisitaHoy, Progreso } from '../types'
import './NuevaVisita.css'

export default function NuevaVisita() {
  const navigate = useNavigate()
  const [bases, setBases] = useState<Base[]>([])
  const [baseId, setBaseId] = useState<number | null>(() => {
    const saved = localStorage.getItem('base_id')
    return saved ? Number(saved) : null
  })
  const [unidades, setUnidades] = useState<Unidad[]>([])
  const [visitasHoy, setVisitasHoy] = useState<VisitaHoy[]>([])
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<Base[]>('/catalogos/bases'),
      api.get<Unidad[]>('/catalogos/unidades'),
      api.get<VisitaHoy[]>('/visitas/hoy'),
      api.get<Progreso>('/visitas/progreso', { dias: '15' }),
    ]).then(([b, u, v, p]) => {
      setBases(b)
      setUnidades(u.filter((x) => x.activa))
      setVisitasHoy(v)
      setProgreso(p)
      // Auto-select base if only one
      if (!baseId && b.length === 1) {
        setBaseId(b[0].id)
        localStorage.setItem('base_id', String(b[0].id))
      }
    }).finally(() => setLoading(false))
  }, [])

  function handleBaseChange(id: number) {
    setBaseId(id)
    localStorage.setItem('base_id', String(id))
  }

  const visitadasMap = useMemo(() => {
    const map = new Map<number, VisitaHoy>()
    visitasHoy.forEach((v) => map.set(v.unidad_id, v))
    return map
  }, [visitasHoy])

  const filtered = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return []
    return unidades.filter(
      (u) => u.numero.toLowerCase().includes(q) || (u.placa && u.placa.toLowerCase().includes(q))
    ).slice(0, 20)
  }, [busqueda, unidades])

  const baseNombre = bases.find((b) => b.id === baseId)?.nombre || ''

  if (loading) {
    return <div className="page" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="spinner" /></div>
  }

  return (
    <div className="page">
      <h1 className="page-title">Nueva Visita</h1>

      {/* Base selector */}
      <div className="card nv-base-card">
        <span className="card-title">Base de trabajo</span>
        <div className="nv-base-buttons">
          {bases.map((b) => (
            <button
              key={b.id}
              className={`btn ${baseId === b.id ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => handleBaseChange(b.id)}
            >
              {b.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Progress */}
      {progreso && (
        <div className="card nv-progress-card">
          <div className="nv-progress-info">
            <span className="nv-progress-numbers">{progreso.visitadas} / {progreso.total}</span>
            <span className="nv-progress-label">unidades visitadas en {progreso.dias} días</span>
          </div>
          <div className="nv-progress-bar">
            <div
              className="nv-progress-fill"
              style={{ width: `${progreso.total > 0 ? (progreso.visitadas / progreso.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Search */}
      <div className="nv-search-wrapper">
        <input
          type="text"
          placeholder="Buscar unidad por número o placa..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="nv-search"
          autoFocus
        />
        {busqueda && (
          <button className="nv-search-clear" onClick={() => setBusqueda('')}>
            ✕
          </button>
        )}
      </div>

      {/* Results */}
      {busqueda.trim() && (
        <div className="nv-results">
          {filtered.length === 0 ? (
            <div className="empty-state">No se encontraron unidades</div>
          ) : (
            filtered.map((u) => {
              const visitada = visitadasMap.get(u.id)
              return (
                <button
                  key={u.id}
                  className="card nv-unidad-row"
                  onClick={() => navigate(`/visita/${u.id}`, { state: { unidad: u, baseId, baseNombre } })}
                >
                  <div className="nv-unidad-info">
                    <span className="nv-unidad-numero">{u.numero}</span>
                    {u.placa && <span className="nv-unidad-placa">{u.placa}</span>}
                    {u.sede_nombre && <span className="nv-unidad-sede">{u.sede_nombre}</span>}
                  </div>
                  {visitada && (
                    <span
                      className="chip"
                      style={{ background: visitada.color_hex + '22', color: visitada.color_hex }}
                    >
                      {visitada.estado}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}

      {/* Today's visits summary */}
      {!busqueda.trim() && visitasHoy.length > 0 && (
        <div className="nv-hoy">
          <span className="card-title">Visitas de hoy ({visitasHoy.length})</span>
          <div className="nv-hoy-list">
            {visitasHoy.map((v) => (
              <div key={v.id} className="card nv-hoy-item">
                <span className="nv-unidad-numero">{v.unidad_numero}</span>
                <span className="chip" style={{ background: v.color_hex + '22', color: v.color_hex }}>
                  {v.estado}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
