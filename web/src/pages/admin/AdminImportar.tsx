import { useState, useRef } from 'react'
import { api, ApiError } from '../../lib/api'

interface ImportResult {
  sedesCreadas: number
  unidadesCreadas: number
  unidadesActualizadas: number
  sinPlaca: number
  advertencias: string[]
  errores: string[]
}

export default function AdminImportar() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function importar() {
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('Selecciona un archivo .xlsx'); return }

    setLoading(true); setError(''); setResult(null)
    const fd = new FormData()
    fd.append('archivo', file)

    try {
      const res = await api.upload<ImportResult>('/importar/excel', fd)
      setResult(res)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Error al importar')
    } finally { setLoading(false) }
  }

  return (
    <div>
      <h2 className="admin-section-title">Importar unidades desde Excel</h2>

      <div className="card admin-form">
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Sube un archivo .xlsx con columnas: <strong>no_interno</strong> (requerido), <strong>sede</strong> (requerido), <strong>placa</strong> (opcional).
        </p>
        <input ref={fileRef} type="file" accept=".xlsx" />

        {error && <div className="alert alert-error">{error}</div>}

        <button className="btn btn-primary btn-block" onClick={importar} disabled={loading}>
          {loading ? 'Importando...' : 'Importar'}
        </button>

        {result && (
          <div className="alert alert-success">
            <strong>Importación completa:</strong><br />
            Sedes creadas: {result.sedesCreadas}<br />
            Unidades creadas: {result.unidadesCreadas}<br />
            Unidades actualizadas: {result.unidadesActualizadas}<br />
            Sin placa: {result.sinPlaca}
            {result.advertencias.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <strong>Advertencias:</strong>
                <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                  {result.advertencias.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
            {result.errores.length > 0 && (
              <div style={{ marginTop: 8, color: 'var(--error)' }}>
                <strong>Errores:</strong>
                <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                  {result.errores.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
