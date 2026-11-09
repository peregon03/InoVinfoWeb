import { useState, useEffect } from 'react'
import { api, ApiError } from '../../lib/api'

interface SedeInfo { id: number; nombre: string }

export default function AdminInformes() {
  const [sedes, setSedes] = useState<SedeInfo[]>([])
  const [sedeId, setSedeId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [linkFotos, setLinkFotos] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ sheetUrl: string; pestana: string; totalVisitas: number } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<SedeInfo[]>('/informes/sedes').then(setSedes)
  }, [])

  async function generar() {
    if (!desde || !hasta || !sedeId) { setError('Completa todos los campos'); return }
    setLoading(true); setError(''); setResult(null)
    try {
      const sede = sedes.find((s) => s.id === Number(sedeId))
      const res = await api.post<{ sheetUrl: string; pestana: string; totalVisitas: number }>('/informes/generar', {
        fechaDesde: desde,
        fechaHasta: hasta,
        sedeId: Number(sedeId),
        sedeNombre: sede?.nombre || '',
        linkFotos,
      })
      setResult(res)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Error al generar')
    } finally { setLoading(false) }
  }

  return (
    <div>
      <h2 className="admin-section-title">Generar informe</h2>

      <div className="card admin-form">
        <div className="form-group">
          <label>Fecha desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Fecha hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Sede</label>
          <select value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
            <option value="">Seleccionar...</option>
            {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Link de fotos (opcional)</label>
          <input value={linkFotos} onChange={(e) => setLinkFotos(e.target.value)} placeholder="URL de la carpeta de fotos" />
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <button className="btn btn-primary btn-block" onClick={generar} disabled={loading}>
          {loading ? 'Generando...' : 'Generar informe'}
        </button>

        {result && (
          <div className="alert alert-success">
            Informe generado: {result.totalVisitas} visitas en "{result.pestana}".{' '}
            <a href={result.sheetUrl} target="_blank" rel="noreferrer">Abrir en Google Sheets</a>
          </div>
        )}
      </div>
    </div>
  )
}
