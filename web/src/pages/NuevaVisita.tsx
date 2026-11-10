import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Base, UnidadEstado } from '../types'
import './NuevaVisita.css'

const FILTROS = [
  { key: 'todas', label: 'Todas' },
  { key: 'faltan', label: 'Faltan' },
  { key: 'ok', label: 'OK' },
  { key: 'novedad', label: 'Novedad' },
  { key: 'inoperativa', label: 'Inoperat.' },
  { key: 'sin_llaves', label: 'Sin llaves' },
  { key: 'otras', label: 'Otras' },
  { key: 'alertas', label: 'Alertas' },
] as const

type FiltroKey = typeof FILTROS[number]['key']

function clasificar(u: UnidadEstado): FiltroKey {
  if (!u.ultimo_estado) return 'faltan'
  if (u.ultimo_estado === 'OK') return 'ok'
  if (u.ultimo_estado === 'Con novedad') return 'novedad'
  if (u.ultimo_estado === 'Inoperativa') return 'inoperativa'
  if (u.ultimo_estado === 'Sin llaves') return 'sin_llaves'
  return 'otras'
}

export default function NuevaVisita() {
  const navigate = useNavigate()
  const [bases, setBases] = useState<Base[]>([])
  const [baseId, setBaseId] = useState<number | null>(() => {
    const saved = localStorage.getItem('base_id')
    return saved ? Number(saved) : null
  })
  const [todasUnidades, setTodasUnidades] = useState<UnidadEstado[]>([])
  const [filtro, setFiltro] = useState<FiltroKey>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<Base[]>('/catalogos/bases'),
      api.get<UnidadEstado[]>('/unidades/estado', { dias: '15' }),
    ]).then(([b, u]) => {
      setBases(b.filter((x) => x.activa))
      setTodasUnidades(u)
      if (!baseId && b.length === 1) {
        setBaseId(b[0].id)
        localStorage.setItem('base_id', String(b[0].id))
      }
    }).finally(() => setLoading(false))
  }, [])

  function handleBaseChange(id: number) {
    setBaseId(id)
    localStorage.setItem('base_id', String(id))
    setFiltro('todas')
    setBusqueda('')
  }

  // Units filtered by selected base:
  // - Units whose last visit was at this base
  // - Units without any visit (sin revisar) — they appear in all bases
  const unidadesPorBase = useMemo(() => {
    if (!baseId) return todasUnidades
    return todasUnidades.filter(
      (u) => u.ultima_base_id === baseId || !u.ultimo_estado
    )
  }, [todasUnidades, baseId])

  // Counters based on the base-filtered list
  const contadores = useMemo(() => {
    const c: Record<FiltroKey, number> = {
      todas: unidadesPorBase.length,
      faltan: 0, ok: 0, novedad: 0, inoperativa: 0, sin_llaves: 0, otras: 0, alertas: 0,
    }
    for (const u of unidadesPorBase) {
      const cat = clasificar(u)
      c[cat]++
      if (u.seguimientos_abiertos > 0) c.alertas++
    }
    return c
  }, [unidadesPorBase])

  // Progress bar based on base-filtered list
  const progreso = useMemo(() => {
    const total = unidadesPorBase.length
    const visitadas = unidadesPorBase.filter((u) => u.ultimo_estado != null).length
    return { visitadas, total }
  }, [unidadesPorBase])

  // Filtered + searched list
  const listaFiltrada = useMemo(() => {
    let list = unidadesPorBase

    if (filtro !== 'todas') {
      if (filtro === 'alertas') {
        list = list.filter((u) => u.seguimientos_abiertos > 0)
      } else {
        list = list.filter((u) => clasificar(u) === filtro)
      }
    }

    const q = busqueda.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (u) => u.numero.toLowerCase().includes(q) || (u.placa && u.placa.toLowerCase().includes(q))
      )
    }

    return list
  }, [unidadesPorBase, filtro, busqueda])

  const baseNombre = bases.find((b) => b.id === baseId)?.nombre || ''

  function toggleFiltro(key: FiltroKey) {
    setFiltro((prev) => (prev === key ? 'todas' : key))
  }

  if (loading) {
    return <div className="page" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="spinner" /></div>
  }

  return (
    <div className="page">
      <h1 className="page-title">Nueva Visita</h1>

      {/* Base selector */}
      <div className="card nv-base-card">
        <span className="card-title">Base operativa</span>
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

      {/* Progress bar */}
      {baseId && (
        <div className="card nv-progress-card">
          <div className="nv-progress-info">
            <span className="nv-progress-numbers">{progreso.visitadas} / {progreso.total}</span>
            <span className="nv-progress-label">unidades visitadas en 15 días</span>
          </div>
          <div className="nv-progress-bar">
            <div
              className="nv-progress-fill"
              style={{ width: `${progreso.total > 0 ? (progreso.visitadas / progreso.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Show counters and list only when a base is selected */}
      {baseId ? (
        <>
          {/* 8 counters grid */}
          <div className="nv-counters">
            {FILTROS.map((f) => (
              <button
                key={f.key}
                className={`nv-counter-box ${filtro === f.key ? 'active' : ''}`}
                onClick={() => toggleFiltro(f.key)}
              >
                <span className="nv-counter-num">{contadores[f.key]}</span>
                <span className="nv-counter-label">{f.label}</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="nv-search-wrapper">
            <input
              type="text"
              placeholder="Buscar unidad por numero o placa..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="nv-search"
            />
            {busqueda && (
              <button className="nv-search-clear" onClick={() => setBusqueda('')}>
                ✕
              </button>
            )}
          </div>

          {/* Unit list */}
          <div className="nv-unit-list">
            {listaFiltrada.length === 0 ? (
              <div className="empty-state">No se encontraron unidades</div>
            ) : (
              listaFiltrada.map((u) => {
                const sinRevisar = !u.ultimo_estado
                return (
                  <div
                    key={u.unidad_id}
                    className={`card nv-unit-row ${sinRevisar ? 'sin-revisar' : ''}`}
                    style={!sinRevisar && u.color_hex ? { borderLeftColor: u.color_hex } : undefined}
                  >
                    <div className="nv-unit-left">
                      <span className="nv-unidad-numero">{u.numero}</span>
                      {u.sede_nombre && <span className="nv-unidad-sede">{u.sede_nombre}</span>}
                      <div className="nv-unit-status-row">
                        {sinRevisar ? (
                          <span className="chip chip-sin-revisar">Sin revisar</span>
                        ) : (
                          <span className="chip" style={{ background: (u.color_hex || '#888') + '22', color: u.color_hex || '#888' }}>
                            {u.ultimo_estado}
                          </span>
                        )}
                        {u.seguimientos_abiertos > 0 && (
                          <span className="nv-seg-badge" title="Seguimientos abiertos">{u.seguimientos_abiertos}</span>
                        )}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary nv-revisar-btn"
                      onClick={() => navigate(`/visita/${u.unidad_id}`, { state: { unidad: { id: u.unidad_id, numero: u.numero, placa: u.placa, sede_id: u.sede_id, sede_nombre: u.sede_nombre, activa: true }, baseId, baseNombre } })}
                    >
                      Revisar
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </>
      ) : (
        <div className="empty-state">Selecciona una base operativa para ver las unidades</div>
      )}
    </div>
  )
}
