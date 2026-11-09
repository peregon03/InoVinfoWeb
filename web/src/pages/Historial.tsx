import { useState, useEffect } from 'react'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { Visita, Unidad } from '../types'
import './Historial.css'

function getDriveThumbUrl(foto: { url: string; drive_file_id?: string | null }, size = 400): string {
  const fileId = foto.drive_file_id || extractDriveId(foto.url)
  if (fileId) return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`
  return foto.url
}

function extractDriveId(url: string): string | null {
  const m = url.match(/[?&]id=([^&]+)/) || url.match(/\/d\/([^/]+)/)
  return m ? m[1] : null
}

export default function Historial() {
  const { isCoordinadora } = useAuth()
  const [unidades, setUnidades] = useState<Unidad[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [unidadId, setUnidadId] = useState<number | null>(null)
  const [visitas, setVisitas] = useState<Visita[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    api.get<Unidad[]>('/catalogos/unidades').then((u) => setUnidades(u.filter((x) => x.activa)))
  }, [])

  function buscar(uid: number) {
    setUnidadId(uid)
    setLoading(true)
    setError('')
    api.get<Visita[]>('/visitas', { unidad_id: String(uid) })
      .then((v) => setVisitas(v))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }

  async function eliminar(id: number) {
    if (!confirm('¿Eliminar esta visita? Esta acción no se puede deshacer.')) return
    try {
      await api.delete(`/visitas/${id}`)
      setVisitas((p) => p.filter((v) => v.id !== id))
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Error al eliminar')
    }
  }

  const filtered = busqueda.trim()
    ? unidades.filter((u) =>
        u.numero.toLowerCase().includes(busqueda.toLowerCase()) ||
        (u.placa && u.placa.toLowerCase().includes(busqueda.toLowerCase()))
      ).slice(0, 15)
    : []

  const checklistLabels: Record<string, string> = {
    delantera: 'Cám. delantera', trasera: 'Cám. trasera', cabina: 'Cám. cabina',
    lateral: 'Cám. lateral', directa: 'Cám. directa',
    monitor_vision_directa: 'Monitor visión directa', visor_principal: 'Visor principal',
    telo: 'Telo', gps: 'GPS', wifi: 'WiFi',
  }

  return (
    <div className="page">
      <h1 className="page-title">Historial</h1>

      <div className="hist-search-wrapper">
        <input
          type="text"
          placeholder="Buscar unidad..."
          value={busqueda}
          onChange={(e) => { setBusqueda(e.target.value); setUnidadId(null) }}
        />
        {busqueda && !unidadId && (
          <div className="hist-suggestions">
            {filtered.map((u) => (
              <button key={u.id} className="hist-suggestion" onClick={() => { setBusqueda(u.numero); buscar(u.id) }}>
                <strong>{u.numero}</strong> {u.placa && <span>({u.placa})</span>} {u.sede_nombre && <span className="hist-sede">{u.sede_nombre}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>}

      {!loading && unidadId && visitas.length === 0 && (
        <div className="empty-state">No hay visitas registradas para esta unidad</div>
      )}

      <div className="hist-list">
        {visitas.map((v) => {
          const expanded = expandedId === v.id
          const fotosAntes = (v.fotos_detalle || []).filter((f) => f.tipo === 'antes')
          const fotosDespues = (v.fotos_detalle || []).filter((f) => f.tipo === 'despues')
          // Fallback if no fotos_detalle
          const fotosPlain = (!v.fotos_detalle || v.fotos_detalle.length === 0) ? v.fotos : []

          return (
            <div key={v.id} className="card hist-card" onClick={() => setExpandedId(expanded ? null : v.id)}>
              <div className="hist-card-header">
                <div>
                  <span className="hist-fecha">
                    {new Date(v.created_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', year: 'numeric' })}
                    {' '}
                    {new Date(v.created_at).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="hist-tecnico">{v.tecnico_nombre}</span>
                </div>
                <span className="chip" style={{ background: v.color_hex + '22', color: v.color_hex }}>{v.estado}</span>
              </div>

              {v.sede_nombre && (
                <p className="hist-meta">{v.sede_nombre}{v.base_nombre ? ` · base ${v.base_nombre}` : ''}</p>
              )}

              {expanded && (
                <div className="hist-detail" onClick={(e) => e.stopPropagation()}>
                  {v.observacion_estructurada && (
                    <div className="hist-obs">{v.observacion_estructurada}</div>
                  )}

                  {(v.atraso_hora_min != null || v.dias_grabacion != null) && (
                    <div className="hist-grabacion">
                      {v.atraso_hora_min != null && <span>Atraso: {v.atraso_hora_min} min</span>}
                      {v.dias_grabacion != null && <span>Grabación: {v.dias_grabacion} días</span>}
                      {v.h264_plus && <span>H264+</span>}
                    </div>
                  )}

                  {v.checklist && (
                    <div className="hist-checklist">
                      <span className="hist-label">Checklist (fallas y ausencias):</span>
                      {Object.entries(v.checklist).map(([grupo, items]) =>
                        Object.entries(items as Record<string, string>)
                          .filter(([, val]) => val === 'falla' || val === 'no_tiene')
                          .map(([key, val]) => (
                            <span key={key} className={`chip hist-check-chip ${val === 'falla' ? 'falla' : 'no-tiene'}`}>
                              {checklistLabels[key] || key}: {val === 'falla' ? 'Falla' : 'No tiene'}
                            </span>
                          ))
                      )}
                    </div>
                  )}

                  {v.suministros.length > 0 && (
                    <div className="hist-suministros">
                      <span className="hist-label">Suministros:</span>
                      {v.suministros.map((s, i) => (
                        <span key={i} className="chip" style={{ background: 'var(--primary)', color: 'var(--text)' }}>
                          {s.nombre}{s.cantidad > 1 ? ` x${s.cantidad}` : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  {v.es_extraordinaria && <span className="chip hist-tag" style={{ background: 'rgba(239,108,0,0.15)', color: '#EF6C00' }}>Extraordinaria</span>}
                  {v.es_otra_sede && <span className="chip hist-tag" style={{ background: 'rgba(92,107,192,0.15)', color: '#5C6BC0' }}>Otra sede</span>}

                  {/* Fotos Antes */}
                  {fotosAntes.length > 0 && (
                    <div className="hist-fotos-section">
                      <span className="hist-label">Fotos - Antes:</span>
                      <div className="hist-fotos">
                        {fotosAntes.map((f) => (
                          <img key={f.id} src={getDriveThumbUrl(f)} alt="" onClick={() => setLightbox(getDriveThumbUrl(f, 1600))} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fotos Despues */}
                  {fotosDespues.length > 0 && (
                    <div className="hist-fotos-section">
                      <span className="hist-label">Fotos - Después:</span>
                      <div className="hist-fotos">
                        {fotosDespues.map((f) => (
                          <img key={f.id} src={getDriveThumbUrl(f)} alt="" onClick={() => setLightbox(getDriveThumbUrl(f, 1600))} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fallback plain fotos */}
                  {fotosPlain.length > 0 && (
                    <div className="hist-fotos-section">
                      <span className="hist-label">Fotos:</span>
                      <div className="hist-fotos">
                        {fotosPlain.map((url, i) => (
                          <img key={i} src={url} alt="" onClick={() => setLightbox(url)} />
                        ))}
                      </div>
                    </div>
                  )}

                  {v.requiere_seguimiento && (
                    <div className="hist-seguimiento">
                      <span className="hist-label">Seguimiento: {v.fecha_seguimiento}</span>
                      {v.nota_seguimiento && <p>{v.nota_seguimiento}</p>}
                    </div>
                  )}

                  {isCoordinadora && (
                    <button className="btn btn-danger" style={{ marginTop: 12 }} onClick={() => eliminar(v.id)}>
                      Eliminar visita
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
          <button className="lightbox-close">✕</button>
        </div>
      )}
    </div>
  )
}
