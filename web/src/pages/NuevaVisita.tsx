import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../context/AuthContext'
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

// Tipos locales para el modal de gestión de unidades
type ModalModo = 'crear' | 'editar'
interface ModalUnidad {
  modo: ModalModo
  unidadId?: number
  numero: string
  sedeId: number | ''
}

export default function NuevaVisita() {
  const navigate = useNavigate()
  const { isCoordinadora } = useAuth()
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

  // Estado del modal de gestión de unidades (coordinadora)
  const [modal, setModal] = useState<ModalUnidad | null>(null)
  const [modalGuardando, setModalGuardando] = useState(false)
  const [modalError, setModalError] = useState('')

  // Modal de confirmación de eliminación
  const [confirmarEliminar, setConfirmarEliminar] = useState<{ id: number; numero: string } | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [mensajeAccion, setMensajeAccion] = useState('')

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

  // Recarga la lista de unidades desde el servidor
  async function recargarUnidades() {
    try {
      const data = await api.get<UnidadEstado[]>('/unidades/estado', { dias: '15' })
      localStorage.setItem(LS_UNIDADES_ESTADO, JSON.stringify(data))
      setTodasUnidades(data)
    } catch {
      // Si falla, mantener la lista actual
    }
  }

  // Abre el modal para crear una nueva unidad
  function abrirCrear() {
    // Preseleccionar la primera sede activa seleccionada si hay exactamente una
    const sedePreseleccionada = sedeIds.size === 1 ? [...sedeIds][0] : ''
    setModal({ modo: 'crear', numero: '', sedeId: sedePreseleccionada })
    setModalError('')
  }

  // Abre el modal para editar una unidad existente
  function abrirEditar(u: UnidadEstado) {
    setModal({
      modo: 'editar',
      unidadId: u.unidad_id,
      numero: u.numero,
      sedeId: u.sede_id ?? '',
    })
    setModalError('')
    setExpandedId(null)
  }

  // Guarda (crear o editar) la unidad desde el modal
  async function guardarModal() {
    if (!modal) return
    if (!modal.numero.trim()) {
      setModalError('El número de unidad es obligatorio')
      return
    }

    setModalGuardando(true)
    setModalError('')

    try {
      const body = {
        numero: modal.numero.trim(),
        sede_id: modal.sedeId !== '' ? modal.sedeId : null,
      }

      if (modal.modo === 'crear') {
        await api.post('/unidades', body)
        setMensajeAccion(`Unidad "${modal.numero.trim()}" creada correctamente`)
      } else {
        await api.put(`/unidades/${modal.unidadId}`, body)
        setMensajeAccion(`Unidad "${modal.numero.trim()}" actualizada correctamente`)
      }

      setModal(null)
      await recargarUnidades()
      setTimeout(() => setMensajeAccion(''), 3000)
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'Error al guardar la unidad')
    } finally {
      setModalGuardando(false)
    }
  }

  // Elimina o desactiva una unidad
  async function eliminarUnidad() {
    if (!confirmarEliminar) return
    setEliminando(true)

    try {
      const resp = await api.delete<{ eliminada: boolean; desactivada: boolean; mensaje: string }>(
        `/unidades/${confirmarEliminar.id}`
      )
      setConfirmarEliminar(null)
      setExpandedId(null)
      setMensajeAccion(resp.mensaje)
      await recargarUnidades()
      setTimeout(() => setMensajeAccion(''), 4000)
    } catch (err) {
      setMensajeAccion(err instanceof ApiError ? err.message : 'Error al eliminar la unidad')
      setConfirmarEliminar(null)
      setTimeout(() => setMensajeAccion(''), 4000)
    } finally {
      setEliminando(false)
    }
  }

  if (loading) {
    return <div className="page" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="spinner" /></div>
  }

  return (
    <div className="page">
      <h1 className="page-title">Nueva Visita</h1>

      {/* Mensaje de acción (creación, edición, eliminación) */}
      {mensajeAccion && (
        <div className="alert alert-success" style={{ marginBottom: 12 }}>{mensajeAccion}</div>
      )}

      {/* Base selector — multi-select */}
      <div className="card nv-base-card">
        <div className="nv-base-header">
          <span className="card-title">Base operativa</span>
          {isCoordinadora && (
            <button className="btn btn-outline nv-btn-agregar-unidad" onClick={abrirCrear}>
              + Unidad
            </button>
          )}
        </div>
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
                        {/* Botones de gestión — solo coordinadora */}
                        {isCoordinadora && (
                          <>
                            <button
                              className="btn btn-outline nv-mini-editar"
                              onClick={() => abrirEditar(u)}
                            >
                              Editar
                            </button>
                            <button
                              className="btn nv-mini-eliminar"
                              onClick={() => setConfirmarEliminar({ id: u.unidad_id, numero: u.numero })}
                            >
                              Eliminar
                            </button>
                          </>
                        )}
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

      {/* Modal crear / editar unidad */}
      {modal && (
        <div className="modal-overlay" onClick={() => { if (!modalGuardando) setModal(null) }}>
          <div className="modal-content nv-modal-unidad" onClick={(e) => e.stopPropagation()}>
            <h3 className="nv-modal-titulo">
              {modal.modo === 'crear' ? 'Nueva unidad' : 'Editar unidad'}
            </h3>

            {modalError && (
              <div className="alert alert-error" style={{ marginBottom: 12 }}>{modalError}</div>
            )}

            <div className="form-group">
              <label>Número *</label>
              <input
                type="text"
                value={modal.numero}
                onChange={(e) => setModal((p) => p ? { ...p, numero: e.target.value } : p)}
                placeholder="Ej: 1023"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Base operativa</label>
              <select
                value={modal.sedeId}
                onChange={(e) => setModal((p) => p ? { ...p, sedeId: e.target.value ? Number(e.target.value) : '' } : p)}
              >
                <option value="">Sin asignar</option>
                {sedes.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>

            <div className="nv-modal-actions">
              <button
                className="btn btn-primary"
                onClick={guardarModal}
                disabled={modalGuardando}
              >
                {modalGuardando ? <span className="spinner spinner-sm" /> : 'Guardar'}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setModal(null)}
                disabled={modalGuardando}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {confirmarEliminar && (
        <div className="modal-overlay" onClick={() => { if (!eliminando) setConfirmarEliminar(null) }}>
          <div className="modal-content nv-modal-unidad" onClick={(e) => e.stopPropagation()}>
            <h3 className="nv-modal-titulo">Eliminar unidad</h3>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.5, marginBottom: 16 }}>
              ¿Eliminar la unidad <strong>{confirmarEliminar.numero}</strong>?
              Si tiene visitas registradas, solo se desactivará en lugar de eliminarse.
            </p>
            <div className="nv-modal-actions">
              <button
                className="btn nv-btn-eliminar-confirmar"
                onClick={eliminarUnidad}
                disabled={eliminando}
              >
                {eliminando ? <span className="spinner spinner-sm" /> : 'Sí, eliminar'}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setConfirmarEliminar(null)}
                disabled={eliminando}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
