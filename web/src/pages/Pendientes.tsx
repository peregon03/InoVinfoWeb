import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Pendiente } from '../types'
import './Pendientes.css'

const urgenciaColors: Record<string, { bg: string; text: string; label: string }> = {
  vencido: { bg: 'rgba(226,75,74,0.15)', text: 'var(--error)', label: 'Vencido' },
  hoy: { bg: 'rgba(239,108,0,0.15)', text: '#EF6C00', label: 'Hoy' },
  futuro: { bg: 'rgba(46,125,50,0.1)', text: 'var(--success)', label: 'Pendiente' },
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days === 0) return 'hoy'
  if (days === 1) return 'hace 1 día'
  if (days < 30) return `hace ${days} días`
  const months = Math.floor(days / 30)
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`
}

export default function Pendientes() {
  const navigate = useNavigate()
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<Pendiente[]>('/visitas/pendientes')
      .then(setPendientes)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="page" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="spinner" /></div>
  }

  return (
    <div className="page">
      <h1 className="page-title">Pendientes</h1>

      {pendientes.length === 0 ? (
        <div className="empty-state">No hay seguimientos pendientes</div>
      ) : (
        <div className="pend-list">
          {pendientes.map((p) => {
            const urg = urgenciaColors[p.urgencia] || urgenciaColors.futuro
            return (
              <button
                key={p.id}
                className="card pend-card"
                onClick={() => navigate(`/visita/${p.unidad_id}`)}
              >
                <div className="pend-header">
                  <span className="pend-unidad">{p.unidad_numero}</span>
                  <span className="chip" style={{ background: urg.bg, color: urg.text }}>{urg.label}</span>
                </div>
                {p.sede_nombre && <span className="pend-sede">{p.sede_nombre}</span>}
                {p.nota_seguimiento && <p className="pend-nota">{p.nota_seguimiento}</p>}
                <div className="pend-meta">
                  <span className="pend-tecnico">{p.tecnico_nombre}</span>
                  <span className="pend-age">{timeAgo(p.fecha_seguimiento)}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
