import { useState, useEffect } from 'react'
import { api, ApiError } from '../../lib/api'
import './AdminInformes.css'

interface SedeInfo {
  id: number
  nombre: string
}

interface InformeResult {
  totalVisitas: number
  totalUnidades: number
  pestana: string
  sedesNombres: string
  sheetUrl: string | null
  advertencias: string[]
  verificacion: string[]
}

// Devuelve "YYYY-MM-DD" en la zona America/Bogotá
function fechaBogota(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' })
}

function primerDiaMes(): string {
  const hoy = new Date()
  return fechaBogota(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
}

function hoyStr(): string {
  return fechaBogota(new Date())
}

export default function AdminInformes() {
  const [sedes, setSedes] = useState<SedeInfo[]>([])
  const [sedesSeleccionadas, setSedesSeleccionadas] = useState<Set<number>>(new Set())
  const [desde, setDesde] = useState(primerDiaMes)
  const [hasta, setHasta] = useState(hoyStr)
  const [linkFotos, setLinkFotos] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingSedes, setLoadingSedes] = useState(true)
  const [result, setResult] = useState<InformeResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<SedeInfo[]>('/informes/sedes')
      .then(setSedes)
      .catch(() => setError('Error al cargar las sedes'))
      .finally(() => setLoadingSedes(false))
  }, [])

  // ── Selección de sedes ───────────────────────────────────────────────────

  function toggleSede(id: number) {
    setSedesSeleccionadas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function seleccionarTodas() {
    if (sedesSeleccionadas.size === sedes.length) {
      setSedesSeleccionadas(new Set())
    } else {
      setSedesSeleccionadas(new Set(sedes.map((s) => s.id)))
    }
  }

  // ── Presets de fecha ─────────────────────────────────────────────────────

  function aplicarPreset(preset: 'hoy' | 'semana' | 'mes' | 'mes_anterior') {
    const hoy = new Date()
    if (preset === 'hoy') {
      const h = hoyStr()
      setDesde(h)
      setHasta(h)
    } else if (preset === 'semana') {
      const lunes = new Date(hoy)
      lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7))
      setDesde(fechaBogota(lunes))
      setHasta(hoyStr())
    } else if (preset === 'mes') {
      setDesde(primerDiaMes())
      setHasta(hoyStr())
    } else if (preset === 'mes_anterior') {
      const primerDia = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
      const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
      setDesde(fechaBogota(primerDia))
      setHasta(fechaBogota(ultimoDia))
    }
  }

  // ── Generación ───────────────────────────────────────────────────────────

  async function generar() {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await api.post<InformeResult>('/informes/generar', {
        fechaDesde: desde,
        fechaHasta: hasta,
        sedeIds: Array.from(sedesSeleccionadas),
        linkFotos: linkFotos.trim() || undefined,
      })
      setResult(res)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Error al generar el informe')
    } finally {
      setLoading(false)
    }
  }

  const puedeGenerar = sedesSeleccionadas.size > 0 && !!desde && !!hasta && !loading
  const todasSeleccionadas = sedes.length > 0 && sedesSeleccionadas.size === sedes.length

  return (
    <div>
      <h2 className="admin-section-title">Generar informe</h2>

      {/* ── Rango de fechas ── */}
      <div className="card inf-card">
        <div className="card-title">Rango de fechas</div>

        <div className="inf-presets">
          {([
            { label: 'Hoy',          preset: 'hoy' as const },
            { label: 'Esta semana',  preset: 'semana' as const },
            { label: 'Este mes',     preset: 'mes' as const },
            { label: 'Mes anterior', preset: 'mes_anterior' as const },
          ]).map(({ label, preset }) => (
            <button
              key={preset}
              className="inf-preset-btn"
              onClick={() => aplicarPreset(preset)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="inf-fechas">
          <div className="form-group">
            <label>Fecha inicio</label>
            <input
              type="date"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Fecha fin</label>
            <input
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Selección de sedes ── */}
      <div className="card inf-card">
        <div className="inf-sedes-header">
          <span className="card-title" style={{ marginBottom: 0 }}>Bases operativas</span>
          {sedes.length > 1 && (
            <button className="inf-sel-todas-btn" onClick={seleccionarTodas}>
              {todasSeleccionadas ? 'Limpiar' : 'Seleccionar todas'}
            </button>
          )}
        </div>

        {loadingSedes ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <div className="spinner" />
          </div>
        ) : (
          <div className="inf-sedes-chips">
            {sedes.map((s) => {
              const activa = sedesSeleccionadas.has(s.id)
              return (
                <button
                  key={s.id}
                  className={`inf-sede-chip ${activa ? 'activa' : ''}`}
                  onClick={() => toggleSede(s.id)}
                >
                  {activa && <span className="inf-check">✓</span>}
                  {s.nombre}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Link fotos (opcional) ── */}
      <div className="card inf-card">
        <div className="form-group">
          <label>Link de fotos <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(opcional)</span></label>
          <input
            value={linkFotos}
            onChange={(e) => setLinkFotos(e.target.value)}
            placeholder="URL de la carpeta de fotos"
          />
        </div>
      </div>

      {/* ── Estado + botón ── */}
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      <button
        className="btn btn-primary btn-block"
        onClick={generar}
        disabled={!puedeGenerar}
        style={{ marginTop: 4 }}
      >
        {loading ? (
          <>
            <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
            Generando...
          </>
        ) : (
          'Generar informe'
        )}
      </button>

      {/* ── Resultado ── */}
      {result && (
        <div className="card inf-result-card">
          <div className="inf-result-title">Informe generado</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div className="inf-result-stat">
              <span className="inf-result-num">{result.totalVisitas}</span>
              <span className="inf-result-label">visitas</span>
            </div>
            <div className="inf-result-stat">
              <span className="inf-result-num">{result.totalUnidades}</span>
              <span className="inf-result-label">unidades</span>
            </div>
          </div>
          <div className="inf-result-meta">
            <span>Bases: {result.sedesNombres}</span>
          </div>
          <div className="inf-result-meta">
            <span>Pestaña: &ldquo;{result.pestana}&rdquo;</span>
          </div>
          {result.advertencias && result.advertencias.length > 0 && (
            <div className="alert alert-info" style={{ marginTop: 8, fontSize: '0.85rem' }}>
              <strong>Advertencias:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {result.advertencias.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}
          {result.verificacion && result.verificacion.length > 0 && (
            <div className="alert alert-error" style={{ marginTop: 8, fontSize: '0.85rem' }}>
              <strong>Errores de verificacion:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {result.verificacion.map((v, i) => <li key={i}>{v}</li>)}
              </ul>
            </div>
          )}
          {result.sheetUrl ? (
            <a
              href={result.sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary btn-block"
              style={{ marginTop: 12, textDecoration: 'none' }}
            >
              Abrir en Google Sheets
            </a>
          ) : (
            <div className="alert alert-info" style={{ marginTop: 12 }}>
              Datos procesados correctamente. Google Sheets no está conectado — conecta Drive en la pestaña Drive para exportar.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
