import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { construirObservacion, generarHallazgoAutomatico } from '../lib/observacion'
import { procesarFoto, MAX_FOTOS_TOTAL } from '../lib/fotos'
import type { Unidad, Sede, EstadoVisita, Suministro, Checklist, Visita } from '../types'
import './Visita.css'

// Qué secciones se muestran por estado
const SECCIONES: Record<string, Record<string, boolean>> = {
  'OK':                  { fotoAntes: true, grabacion: true, checklist: false, hallazgo: false, suministros: true, fotoDespues: true, opciones: true },
  'Con novedad':         { fotoAntes: true, grabacion: true, checklist: true,  hallazgo: true,  suministros: true, fotoDespues: true, opciones: true },
  'Inoperativa':         { fotoAntes: true, grabacion: false, checklist: false, hallazgo: false, suministros: false, fotoDespues: false, opciones: true },
  'Sin llaves':          { fotoAntes: true, grabacion: false, checklist: false, hallazgo: false, suministros: false, fotoDespues: false, opciones: true },
  'No está en la base':  { fotoAntes: true, grabacion: false, checklist: false, hallazgo: false, suministros: false, fotoDespues: false, opciones: true },
  'Pendiente':           { fotoAntes: false, grabacion: false, checklist: false, hallazgo: false, suministros: false, fotoDespues: false, opciones: true },
}

const CAMARAS = ['delantera', 'trasera', 'cabina', 'lateral', 'directa'] as const
const EQUIPOS = [
  { key: 'monitor_vision_directa', label: 'Monitor visión directa' },
  { key: 'visor_principal', label: 'Visor principal' },
  { key: 'telo', label: 'Telo (pantalla táctil)' },
  { key: 'gps', label: 'GPS' },
  { key: 'wifi', label: 'WiFi / credenciales' },
] as const

type CheckVal = 'bien' | 'falla' | 'no_tiene'

interface FotoLocal {
  id: string
  file: File
  preview: string
  tipo: 'antes' | 'despues'
}

interface SuministroSel {
  suministro_id: number
  nombre: string
  cantidad: number
}

export default function Visita() {
  const { unidadId } = useParams<{ unidadId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as { unidad?: Unidad; baseId?: number; baseNombre?: string } | null

  const [unidad, setUnidad] = useState<Unidad | null>(state?.unidad || null)
  const [sedes, setSedes] = useState<Sede[]>([])
  const [estados, setEstados] = useState<EstadoVisita[]>([])
  const [suministrosCat, setSuministrosCat] = useState<Suministro[]>([])
  const [loading, setLoading] = useState(true)

  // Estado del formulario
  const [estadoId, setEstadoId] = useState<number | null>(null)
  const [estadoNombre, setEstadoNombre] = useState('')
  const [sedeId, setSedeId] = useState<number | null>(null)
  const [atrasoMin, setAtrasoMin] = useState<string>('')
  const [diasGrabacion, setDiasGrabacion] = useState<string>('')
  const [h264Plus, setH264Plus] = useState(false)

  // Checklist
  const [camaras, setCamaras] = useState<Record<string, CheckVal>>({
    delantera: 'bien', trasera: 'bien', cabina: 'bien', lateral: 'bien', directa: 'bien',
  })
  const [equipos, setEquipos] = useState<Record<string, CheckVal>>({
    monitor_vision_directa: 'bien', visor_principal: 'bien', telo: 'bien', gps: 'bien', wifi: 'bien',
  })
  const [camarasOpen, setCamarasOpen] = useState(false)

  // Hallazgo
  const [hallazgo, setHallazgo] = useState('')

  // Suministros
  const [suministros, setSuministros] = useState<SuministroSel[]>([])
  const [showSumSelector, setShowSumSelector] = useState(false)
  const [sumBusqueda, setSumBusqueda] = useState('')

  // Fotos
  const [fotosAntes, setFotosAntes] = useState<FotoLocal[]>([])
  const [fotosDespues, setFotosDespues] = useState<FotoLocal[]>([])
  const fotosAntesRef = useRef<HTMLInputElement>(null)
  const fotosAntesGalRef = useRef<HTMLInputElement>(null)
  const fotosDespuesRef = useRef<HTMLInputElement>(null)
  const fotosDespuesGalRef = useRef<HTMLInputElement>(null)

  // Opciones adicionales
  const [esExtraordinaria, setEsExtraordinaria] = useState(false)
  const [esOtraSede, setEsOtraSede] = useState(false)
  const [requiereSeguimiento, setRequiereSeguimiento] = useState(false)
  const [fechaSeguimiento, setFechaSeguimiento] = useState('')
  const [notaSeguimiento, setNotaSeguimiento] = useState('')

  // Vista previa de observación
  const [obsEditada, setObsEditada] = useState('')
  const [showObsPreview, setShowObsPreview] = useState(false)

  // Estado del guardado
  const [saving, setSaving] = useState(false)
  const [fotoProgress, setFotoProgress] = useState<{ current: number; total: number; failed: string[] } | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const baseId = state?.baseId || Number(localStorage.getItem('base_id')) || null
  const baseNombre = state?.baseNombre || localStorage.getItem('base_nombre') || ''

  // Carga catálogos y datos previos de la unidad
  useEffect(() => {
    const uid = Number(unidadId)
    Promise.all([
      api.get<Sede[]>('/catalogos/sedes'),
      api.get<EstadoVisita[]>('/catalogos/estados'),
      api.get<Suministro[]>('/catalogos/suministros'),
      !unidad ? api.get<Unidad[]>('/catalogos/unidades') : Promise.resolve(null),
      api.get<Visita[]>('/visitas', { unidad_id: String(uid) }),
    ]).then(([s, e, sum, uArr, visitas]) => {
      setSedes(s.filter((x) => x.activa))

      // Solo los 6 estados web, en el orden definido
      const webStates = ['OK', 'Con novedad', 'Inoperativa', 'Sin llaves', 'No está en la base', 'Pendiente']
      const ordered = webStates.map((name) => e.find((x) => x.nombre === name)).filter(Boolean) as EstadoVisita[]
      setEstados(ordered)

      setSuministrosCat(sum.filter((x) => x.activo))

      if (!unidad && uArr) {
        const found = uArr.find((u) => u.id === uid)
        if (found) setUnidad(found)
        if (found?.sede_id) setSedeId(found.sede_id)
      } else if (unidad?.sede_id) {
        setSedeId(unidad.sede_id)
      }

      // Pre-carga únicamente los valores "no_tiene" de la última visita
      if (visitas && visitas.length > 0) {
        const last = visitas[0]
        if (last.checklist) {
          const prevCam = last.checklist.camaras || {}
          const prevEq = last.checklist.equipos || {}
          setCamaras((prev) => {
            const next = { ...prev }
            for (const [k, v] of Object.entries(prevCam)) {
              if (v === 'no_tiene') next[k] = 'no_tiene'
            }
            return next
          })
          setEquipos((prev) => {
            const next = { ...prev }
            for (const [k, v] of Object.entries(prevEq)) {
              if (v === 'no_tiene') next[k] = 'no_tiene'
            }
            return next
          })
        }
      }
    }).finally(() => setLoading(false))
  }, [unidadId])

  const secciones = SECCIONES[estadoNombre] || {}
  const totalFotos = fotosAntes.length + fotosDespues.length

  function handleEstado(e: EstadoVisita) {
    setEstadoId(e.id)
    setEstadoNombre(e.nombre)
    if (e.nombre === 'Pendiente') {
      setRequiereSeguimiento(true)
    }
  }

  function addFotos(files: FileList | null, tipo: 'antes' | 'despues') {
    if (!files) return
    const remaining = MAX_FOTOS_TOTAL - totalFotos
    const arr = Array.from(files).slice(0, remaining)
    const newFotos: FotoLocal[] = arr.map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      preview: URL.createObjectURL(f),
      tipo,
    }))
    if (tipo === 'antes') setFotosAntes((p) => [...p, ...newFotos])
    else setFotosDespues((p) => [...p, ...newFotos])
  }

  function removeFoto(id: string, tipo: 'antes' | 'despues') {
    if (tipo === 'antes') setFotosAntes((p) => p.filter((f) => f.id !== id))
    else setFotosDespues((p) => p.filter((f) => f.id !== id))
  }

  function addSuministro(s: Suministro) {
    if (suministros.find((x) => x.suministro_id === s.id)) return
    setSuministros((p) => [...p, { suministro_id: s.id, nombre: s.nombre, cantidad: 1 }])
    setShowSumSelector(false)
    setSumBusqueda('')
  }

  function updateSumCant(id: number, delta: number) {
    setSuministros((p) =>
      p.map((s) => s.suministro_id === id ? { ...s, cantidad: Math.max(1, s.cantidad + delta) } : s)
    )
  }

  function removeSuministro(id: number) {
    setSuministros((p) => p.filter((s) => s.suministro_id !== id))
  }

  // Construye la observación automática en base a los valores del formulario
  const observacionAuto = useMemo(() => {
    if (!estadoNombre) return ''
    let h = hallazgo.trim()
    if (!h && estadoNombre === 'Con novedad') {
      h = generarHallazgoAutomatico({ camaras, equipos })
    }
    return construirObservacion({
      estado: estadoNombre,
      hallazgo: h,
      esExtraordinaria,
      esOtraSede,
      baseNombre,
    })
  }, [estadoNombre, hallazgo, camaras, equipos, esExtraordinaria, esOtraSede, baseNombre])

  function validate(): string | null {
    if (!estadoId) return 'Selecciona un estado'
    if (estadoNombre === 'Con novedad') {
      const hasFalla = Object.values(camaras).includes('falla') || Object.values(equipos).includes('falla')
      if (!hallazgo.trim() && !hasFalla) return 'Con novedad requiere un hallazgo o al menos un ítem en falla'
    }
    if (estadoNombre === 'Pendiente' && !fechaSeguimiento) return 'Pendiente requiere fecha de seguimiento'
    return null
  }

  async function handleSave() {
    const err = validate()
    if (err) { setError(err); return }

    setSaving(true)
    setError('')
    setFotoProgress(null)

    try {
      // Usa la observación editada si el técnico abrió el preview
      const obs = showObsPreview ? obsEditada : observacionAuto

      const checklist: Checklist | null = secciones.checklist ? { camaras, equipos } : null
      const hallazgoFinal = secciones.hallazgo
        ? (hallazgo.trim() || generarHallazgoAutomatico(checklist))
        : null

      const body: Record<string, unknown> = {
        unidad_id: Number(unidadId),
        estado_id: estadoId,
        observacion_estructurada: obs || null,
        novedad_texto: hallazgoFinal || null,
        sede_id: sedeId,
        base_id: baseId,
        es_extraordinaria: esExtraordinaria,
        es_otra_sede: esOtraSede,
        requiere_seguimiento: requiereSeguimiento || estadoNombre === 'Pendiente',
        fecha_seguimiento: (requiereSeguimiento || estadoNombre === 'Pendiente') ? fechaSeguimiento || null : null,
        nota_seguimiento: (requiereSeguimiento || estadoNombre === 'Pendiente') ? notaSeguimiento || null : null,
        suministros: secciones.suministros
          ? suministros.map((s) => ({ suministro_id: s.suministro_id, cantidad: s.cantidad }))
          : [],
      }

      if (secciones.grabacion) {
        if (atrasoMin) body.atraso_hora_min = Number(atrasoMin)
        if (diasGrabacion) body.dias_grabacion = Number(diasGrabacion)
        body.h264_plus = h264Plus
      }

      if (checklist) body.checklist = checklist

      const visita = await api.post<{ id: number }>('/visitas', body)

      // Subida de fotos una a una con progreso
      const allFotos = [...fotosAntes, ...fotosDespues]
      if (allFotos.length > 0) {
        const failed: string[] = []
        setFotoProgress({ current: 0, total: allFotos.length, failed: [] })

        for (let i = 0; i < allFotos.length; i++) {
          try {
            const blob = await procesarFoto(allFotos[i].file, unidad?.numero || '')
            const fd = new FormData()
            fd.append('foto', blob, `foto_${i}.jpg`)
            fd.append('tipo', allFotos[i].tipo)
            await api.upload(`/visitas/${visita.id}/fotos`, fd)
          } catch {
            failed.push(allFotos[i].preview)
          }
          setFotoProgress({ current: i + 1, total: allFotos.length, failed })
        }

        if (failed.length > 0) {
          setFotoProgress((p) => p ? { ...p, failed } : null)
          setError(`La visita se guardó pero ${failed.length} foto(s) fallaron. Puedes reintentar.`)
          setSaving(false)
          return
        }
      }

      setSaved(true)
      setTimeout(() => navigate('/', { replace: true }), 1500)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('Error al guardar la visita')
      setSaving(false)
    }
  }

  // Resumen del estado de cámaras para el acordeón
  const camarasSummary = useMemo(() => {
    const vals = Object.values(camaras)
    const fallas = vals.filter((v) => v === 'falla').length
    const noTiene = vals.filter((v) => v === 'no_tiene').length
    const bien = vals.filter((v) => v === 'bien').length
    if (fallas === 0 && noTiene === 0) return `${bien} bien`
    const parts: string[] = []
    if (fallas) parts.push(`${fallas} falla`)
    if (noTiene) parts.push(`${noTiene} no tiene`)
    return parts.join(' · ')
  }, [camaras])

  const hasCamaraFalla = Object.values(camaras).includes('falla')

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
        <div className="spinner" />
      </div>
    )
  }

  if (saved) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 16 }}>
        <div style={{ fontSize: '3rem' }}>✓</div>
        <h2>Visita guardada</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Redirigiendo...</p>
      </div>
    )
  }

  return (
    <div className="page visita-page">
      {/* Encabezado con número de unidad y sede */}
      <div className="visita-header">
        <button className="back-btn" onClick={() => navigate(-1)}>←</button>
        <div>
          <h1 className="visita-unidad-num">{unidad?.numero || unidadId}</h1>
          <p className="visita-sub">
            {sedes.find((s) => s.id === (sedeId || unidad?.sede_id))?.nombre || 'Sin sede'}
            {baseNombre && ` · base ${baseNombre}`}
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* 1. ESTADO */}
      <div className="card visita-section">
        <span className="card-title">Estado de la unidad</span>
        <div className="estado-grid">
          {estados.map((e) => (
            <button
              key={e.id}
              className={`estado-btn ${estadoId === e.id ? 'selected' : ''}`}
              style={{
                '--estado-color': e.color_hex,
                background: estadoId === e.id ? e.color_hex + '22' : undefined,
                borderColor: estadoId === e.id ? e.color_hex : undefined,
                color: estadoId === e.id ? e.color_hex : undefined,
              } as React.CSSProperties}
              onClick={() => handleEstado(e)}
            >
              {e.nombre}
            </button>
          ))}
        </div>

        <div className="form-group" style={{ marginTop: 16 }}>
          <label>Unidad de negocio</label>
          <select value={sedeId || ''} onChange={(e) => setSedeId(Number(e.target.value) || null)}>
            <option value="">Seleccionar...</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. FOTO ANTES */}
      {secciones.fotoAntes && (
        <div className="card visita-section">
          <span className="card-title">Foto del antes</span>
          <p className="visita-help">Monitor encendido antes de intervenir. Cada foto queda marcada con el número de la unidad.</p>
          <div className="foto-actions">
            <button className="btn btn-secondary" onClick={() => fotosAntesRef.current?.click()} disabled={totalFotos >= MAX_FOTOS_TOTAL}>
              Tomar
            </button>
            <button className="btn btn-outline" onClick={() => fotosAntesGalRef.current?.click()} disabled={totalFotos >= MAX_FOTOS_TOTAL}>
              Cargar
            </button>
            <input ref={fotosAntesRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => addFotos(e.target.files, 'antes')} />
            <input ref={fotosAntesGalRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFotos(e.target.files, 'antes')} />
          </div>
          {fotosAntes.length > 0 && (
            <div className="foto-grid">
              {fotosAntes.map((f) => (
                <div key={f.id} className="foto-thumb">
                  <img src={f.preview} alt="" />
                  <button className="foto-remove" onClick={() => removeFoto(f.id, 'antes')}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. GRABACION */}
      {secciones.grabacion && (
        <div className="card visita-section">
          <span className="card-title">Grabación</span>
          <div className="grabacion-fields">
            <div className="form-group">
              <label>Atraso de la hora (min)</label>
              <input
                type="text"
                inputMode="numeric"
                value={atrasoMin}
                onChange={(e) => setAtrasoMin(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
              />
            </div>
            <div className="form-group">
              <label>Días de grabación</label>
              <input
                type="text"
                inputMode="numeric"
                value={diasGrabacion}
                onChange={(e) => setDiasGrabacion(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
              />
            </div>
          </div>
          <label className="check-label">
            <input type="checkbox" checked={h264Plus} onChange={(e) => setH264Plus(e.target.checked)} />
            <span>Grabación en H264+ activada</span>
          </label>
        </div>
      )}

      {/* 4. CAMARAS Y EQUIPOS */}
      {secciones.checklist && (
        <div className="card visita-section">
          <span className="card-title">Cámaras y equipos</span>

          {/* Acordeón de cámaras */}
          <div className={`checklist-group ${hasCamaraFalla ? 'has-falla' : ''}`}>
            <button className="checklist-accordion" onClick={() => setCamarasOpen(!camarasOpen)}>
              <span>Cámaras</span>
              <span className="checklist-summary">{camarasSummary}</span>
              <span className={`accordion-arrow ${camarasOpen ? 'open' : ''}`}>▼</span>
            </button>
            {camarasOpen && (
              <div className="checklist-items">
                {CAMARAS.map((cam) => (
                  <div key={cam} className="checklist-row">
                    <span className="checklist-label">{cam.charAt(0).toUpperCase() + cam.slice(1)}</span>
                    <div className="checklist-btns">
                      {(['bien', 'falla', 'no_tiene'] as const).map((val) => (
                        <button
                          key={val}
                          className={`check-btn ${camaras[cam] === val ? `active-${val}` : ''}`}
                          onClick={() => setCamaras((p) => ({ ...p, [cam]: val }))}
                        >
                          {val === 'bien' ? 'Bien' : val === 'falla' ? 'Falla' : 'No tiene'}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Filas de equipos */}
          {EQUIPOS.map((eq) => (
            <div key={eq.key} className="checklist-row">
              <span className="checklist-label">{eq.label}</span>
              <div className="checklist-btns">
                {(['bien', 'falla', 'no_tiene'] as const).map((val) => (
                  <button
                    key={val}
                    className={`check-btn ${equipos[eq.key] === val ? `active-${val}` : ''}`}
                    onClick={() => setEquipos((p) => ({ ...p, [eq.key]: val }))}
                  >
                    {val === 'bien' ? 'Bien' : val === 'falla' ? 'Falla' : 'No tiene'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. HALLAZGO */}
      {secciones.hallazgo && (
        <div className="card visita-section">
          <span className="card-title">Hallazgo</span>
          <p className="visita-help">Qué se encontró. Se agrega después de "durante la inspección..."</p>
          <textarea
            value={hallazgo}
            onChange={(e) => setHallazgo(e.target.value)}
            placeholder="Ej: la pantalla presenta rayas de colores por daño en la board"
            rows={3}
          />
        </div>
      )}

      {/* 6. SUMINISTROS */}
      {secciones.suministros && (
        <div className="card visita-section">
          <span className="card-title">Suministros y cambios</span>
          {suministros.map((s) => (
            <div key={s.suministro_id} className="sum-row">
              <span className="sum-nombre">{s.nombre}</span>
              <div className="sum-stepper">
                <button onClick={() => updateSumCant(s.suministro_id, -1)}>−</button>
                <span>{s.cantidad}</span>
                <button onClick={() => updateSumCant(s.suministro_id, 1)}>+</button>
              </div>
              <button className="sum-remove" onClick={() => removeSuministro(s.suministro_id)}>✕</button>
            </div>
          ))}
          {showSumSelector ? (
            <div className="sum-selector">
              <input
                type="text"
                placeholder="Buscar suministro..."
                value={sumBusqueda}
                onChange={(e) => setSumBusqueda(e.target.value)}
                autoFocus
              />
              <div className="sum-list">
                {suministrosCat
                  .filter((s) => !suministros.find((x) => x.suministro_id === s.id))
                  .filter((s) => !sumBusqueda || s.nombre.toLowerCase().includes(sumBusqueda.toLowerCase()))
                  .slice(0, 10)
                  .map((s) => (
                    <button key={s.id} className="sum-option" onClick={() => addSuministro(s)}>
                      {s.nombre}
                    </button>
                  ))}
              </div>
              <button
                className="btn btn-outline"
                onClick={() => { setShowSumSelector(false); setSumBusqueda('') }}
                style={{ marginTop: 8 }}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button className="btn btn-secondary" onClick={() => setShowSumSelector(true)} style={{ marginTop: 8 }}>
              + Agregar suministro
            </button>
          )}
        </div>
      )}

      {/* 7. FOTO DESPUES */}
      {secciones.fotoDespues && (
        <div className="card visita-section">
          <span className="card-title">Foto del después</span>
          <div className="foto-actions">
            <button className="btn btn-secondary" onClick={() => fotosDespuesRef.current?.click()} disabled={totalFotos >= MAX_FOTOS_TOTAL}>
              Tomar
            </button>
            <button className="btn btn-outline" onClick={() => fotosDespuesGalRef.current?.click()} disabled={totalFotos >= MAX_FOTOS_TOTAL}>
              Cargar
            </button>
            <input ref={fotosDespuesRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => addFotos(e.target.files, 'despues')} />
            <input ref={fotosDespuesGalRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFotos(e.target.files, 'despues')} />
          </div>
          {fotosDespues.length > 0 && (
            <div className="foto-grid">
              {fotosDespues.map((f) => (
                <div key={f.id} className="foto-thumb">
                  <img src={f.preview} alt="" />
                  <button className="foto-remove" onClick={() => removeFoto(f.id, 'despues')}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 8. MAS OPCIONES */}
      {secciones.opciones && (
        <div className="card visita-section">
          <span className="card-title">Más opciones</span>
          <label className="check-label">
            <input type="checkbox" checked={esExtraordinaria} onChange={(e) => setEsExtraordinaria(e.target.checked)} />
            <span>Hubo visita extraordinaria (a solicitud del área de mantenimiento)</span>
          </label>
          <label className="check-label">
            <input type="checkbox" checked={esOtraSede} onChange={(e) => setEsOtraSede(e.target.checked)} />
            <span>Es de otra sede: agregar "(Unidad revisada en base operativa {baseNombre || '...'})"</span>
          </label>

          {estadoNombre !== 'Pendiente' && (
            <label className="check-label" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={requiereSeguimiento} onChange={(e) => setRequiereSeguimiento(e.target.checked)} />
              <span>Requiere seguimiento</span>
            </label>
          )}

          {(requiereSeguimiento || estadoNombre === 'Pendiente') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <div className="form-group">
                <label>Fecha de seguimiento</label>
                <input type="date" value={fechaSeguimiento} onChange={(e) => setFechaSeguimiento(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Nota de seguimiento</label>
                <textarea
                  value={notaSeguimiento}
                  onChange={(e) => setNotaSeguimiento(e.target.value)}
                  rows={2}
                  placeholder="Nota..."
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* OBSERVACION — vista previa y edición opcional */}
      {estadoNombre && estadoNombre !== 'Pendiente' && (
        <div className="card visita-section">
          <span className="card-title">Observación (vista previa)</span>
          {!showObsPreview ? (
            <>
              <p className="obs-preview-text">{observacionAuto || '—'}</p>
              <button
                className="btn btn-outline"
                onClick={() => { setObsEditada(observacionAuto); setShowObsPreview(true) }}
                style={{ marginTop: 8 }}
              >
                Editar observación
              </button>
            </>
          ) : (
            <textarea
              value={obsEditada}
              onChange={(e) => setObsEditada(e.target.value)}
              rows={4}
              style={{ marginTop: 8 }}
            />
          )}
        </div>
      )}

      {/* Progreso de subida de fotos */}
      {fotoProgress && (
        <div className="card visita-section">
          <span className="card-title">Subiendo fotos ({fotoProgress.current}/{fotoProgress.total})</span>
          <div className="nv-progress-bar" style={{ marginTop: 8 }}>
            <div
              className="nv-progress-fill"
              style={{ width: `${(fotoProgress.current / fotoProgress.total) * 100}%` }}
            />
          </div>
          {fotoProgress.failed.length > 0 && (
            <p className="alert alert-error" style={{ marginTop: 8 }}>
              {fotoProgress.failed.length} foto(s) fallaron
            </p>
          )}
        </div>
      )}

      {/* Barra fija de guardado */}
      <div className="visita-save-bar">
        <button
          className="btn btn-primary btn-block"
          onClick={handleSave}
          disabled={saving || !estadoId}
        >
          {saving ? <span className="spinner" /> : 'Guardar visita'}
        </button>
      </div>
    </div>
  )
}
