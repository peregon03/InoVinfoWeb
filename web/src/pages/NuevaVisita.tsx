import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Sede, UnidadEstado, EstadoVisita, Suministro } from '../types'
import './NuevaVisita.css'

// Claves de localStorage compartidas con Visita.tsx
const LS_SEDES = 'cache_sedes'
const LS_ESTADOS = 'cache_estados'
const LS_SUMINISTROS = 'cache_suministros'
const LS_UNIDADES_ESTADO = 'cache_unidades_estado'

function lsParse<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

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

// Color mapping for mini-cards
const ESTADO_COLORS: Record<string, string> = {
  'OK': '#2E7D32',
  'Con novedad': '#8BC34A',
  'Inoperativa': '#E24B4A',
  'Sin llaves': '#757575',
  'No está en la base': '#757575',
  'Pendiente': '#757575',
  'Bat. desconectada': '#757575',
}
const COLOR_SIN_REVISAR = '#555'

function getCardColor(u: UnidadEstado): string {
  if (!u.ultimo_estado) return COLOR_SIN_REVISAR
  return ESTADO_COLORS[u.ultimo_estado] || '#757575'
}

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
  const [sedes, setSedes] = useState<Sede[]>([])
  const [sedeIds, setSedeIds] = useState<Set<number>>(() => {
    const saved = localStorage.getItem('sede_ids')
    if (saved) {
      try { return new Set(JSON.parse(saved) as number[]) } catch { /* ignore */ }
    }
    return new Set()
  })
  const [todasUnidades, setTodasUnidades] = useState<UnidadEstado[]>([])
  const [filtro, setFiltro] = useState<FiltroKey>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<Sede[]>('/catalogos/sedes').then((data) => {
        localStorage.setItem(LS_SEDES, JSON.stringify(data))
        return data
      }).catch(() => lsParse<Sede[]>(LS_SEDES) ?? []),
      api.get<UnidadEstado[]>('/unidades/estado', { dias: '15' }).then((data) => {
        localStorage.setItem(LS_UNIDADES_ESTADO, JSON.stringify(data))
        return data
      }).catch(() => lsParse<UnidadEstado[]>(LS_UNIDADES_ESTADO) ?? []),
      // Precargar estados y suministros para que Visita funcione offline
      api.get<EstadoVisita[]>('/catalogos/estados').then((data) => {
        localStorage.setItem(LS_ESTADOS, JSON.stringify(data))
      }).catch(() => {}),
      api.get<Suministro[]>('/catalogos/suministros').then((data) => {
        localStorage.setItem(LS_SUMINISTROS, JSON.stringify(data))
      }).catch(() => {}),
    ]).then(([s, u]) => {
      setSedes((s as Sede[]).filter((x) => x.activa))
      setTodasUnidades(u as UnidadEstado[])
      if (sedeIds.size === 0 && (s as Sede[]).length === 1) {
        const initial = new Set([(s as Sede[])[0].id])
        setSedeIds(initial)
        localStorage.setItem('sede_ids', JSON.stringify([...initial]))
      }
    }).finally(() => setLoading(false))
  }, [])

  function toggleSede(id: number) {
    setSedeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem('sede_ids', JSON.stringify([...next]))
      return next
    })
    setFiltro('todas')
    setBusqueda('')
    setExpandedId(null)
  }

  const unidadesPorSede = useMemo(() => {
    if (sedeIds.size === 0) return []
    return todasUnidades.filter((u) => u.sede_id != null && sedeIds.has(u.sede_id))
  }, [todasUnidades, sedeIds])

  const contadores = useMemo(() => {
    const c: Record<FiltroKey, number> = {
      todas: unidadesPorSede.length,
      faltan: 0, ok: 0, novedad: 0, inoperativa: 0, sin_llaves: 0, otras: 0, alertas: 0,
    }
    for (const u of unidadesPorSede) {
      const cat = clasificar(u)
      c[cat]++
      if (u.seguimientos_abiertos > 0) c.alertas++
    }
    return c
  }, [unidadesPorSede])

  const progreso = useMemo(() => {
    const total = unidadesPorSede.length
    const visitadas = unidadesPorSede.filter((u) => u.ultimo_estado != null).length
    return { visitadas, total }
  }, [unidadesPorSede])

  const listaFiltrada = useMemo(() => {
    let list = unidadesPorSede

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
  }, [unidadesPorSede, filtro, busqueda])

  const sedeNombres = sedes.filter((s) => sedeIds.has(s.id)).map((s) => s.nombre).join(' · ')

  function toggleFiltro(key: FiltroKey) {
    setFiltro((prev) => (prev === key ? 'todas' : key))
    setExpandedId(null)
  }

  if (loading) {
    return <div className="page" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="spinner" /></div>
  }

  return (
    <div className="page">
      <h1 className="page-title">Nueva Visita</h1>

      {/* Base selector — multi-select */}
      <div className="card nv-base-card">
        <span className="card-title">Base operativa</span>
        <div className="nv-base-buttons">
          {sedes.map((s) => (
            <button
              key={s.id}
              className={`btn ${sedeIds.has(s.id) ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => toggleSede(s.id)}
            >
              {s.nombre}
            </button>
          ))}
        </div>
        {sedeIds.size > 1 && (
          <p className="nv-base-selected">{sedeNombres}</p>
        )}
      </div>

      {sedeIds.size > 0 ? (
        <>
          {/* Progress bar */}
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

          {/* 8 counters */}
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

          {/* Compact unit cards grid */}
          <div className="nv-cards-grid">
            {listaFiltrada.length === 0 ? (
              <div className="empty-state" style={{ gridColumn: '1 / -1' }}>No se encontraron unidades</div>
            ) : (
              listaFiltrada.map((u) => {
                const color = getCardColor(u)
                const isExpanded = expandedId === u.unidad_id
                return (
                  <div key={u.unidad_id} className={`nv-mini-card ${isExpanded ? 'expanded' : ''}`}>
                    <button
                      className="nv-mini-btn"
                      style={{ background: color + '25', borderColor: color, color }}
                      onClick={() => setExpandedId(isExpanded ? null : u.unidad_id)}
                    >
                      <span className="nv-mini-num">{u.numero}</span>
                      {u.seguimientos_abiertos > 0 && <span className="nv-mini-alert">!</span>}
                    </button>
                    {isExpanded && (
                      <div className="nv-mini-detail">
                        {u.sede_nombre && <span className="nv-mini-sede">{u.sede_nombre}</span>}
                        <span className="nv-mini-estado">
                          {u.ultimo_estado || 'Sin revisar'}
                        </span>
                        {u.placa && <span className="nv-mini-placa">{u.placa}</span>}
                        <button
                          className="btn btn-outline nv-mini-historial"
                          onClick={() => navigate('/historial', { state: { unidadId: u.unidad_id, unidadNumero: u.numero } })}
                        >
                          Historial
                        </button>
                        <button
                          className="btn btn-primary nv-mini-revisar"
                          onClick={() => navigate(`/visita/${u.unidad_id}`, { state: { unidad: { id: u.unidad_id, numero: u.numero, placa: u.placa, sede_id: u.sede_id, sede_nombre: u.sede_nombre, activa: true }, sedeNombre: u.sede_nombre || '' } })}
                        >
                          Revisar
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </>
      ) : (
        <div className="empty-state">Selecciona una o más bases operativas</div>
      )}
    </div>
  )
}
