import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import type { DriveEstado } from '../../types'

export default function AdminDrive() {
  const [searchParams] = useSearchParams()
  const [estado, setEstado] = useState<DriveEstado | null>(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Verificar resultado del callback OAuth
    const drive = searchParams.get('drive')
    if (drive === 'ok') setMessage('Google Drive conectado exitosamente')
    if (drive === 'error') setMessage('Error al conectar: ' + (searchParams.get('motivo') || 'desconocido'))

    api.get<DriveEstado>('/google/drive/estado')
      .then(setEstado)
      .catch(() => setEstado({ conectado: false, email: null, carpetaUrl: null, error: 'No se pudo verificar el estado' }))
      .finally(() => setLoading(false))
  }, [])

  async function conectar() {
    try {
      const res = await api.post<{ url: string }>('/google/oauth/iniciar')
      window.location.href = res.url
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Error')
    }
  }

  async function desconectar() {
    if (!confirm('¿Desconectar Google Drive? Las fotos nuevas no se podrán subir hasta reconectar.')) return
    try {
      await api.post('/google/drive/desconectar')
      setEstado({ conectado: false, email: null, carpetaUrl: null, error: null })
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Error')
    }
  }

  async function probar() {
    setTesting(true); setTestResult(null)
    try {
      await api.post('/google/drive/probar')
      setTestResult('Prueba exitosa: subida y eliminación OK')
    } catch (e) {
      setTestResult(e instanceof ApiError ? e.message : 'Error en la prueba')
    } finally { setTesting(false) }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      <h2 className="admin-section-title">Google Drive</h2>

      {message && <div className="alert alert-info" style={{ marginBottom: 16 }}>{message}</div>}

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 12, height: 12, borderRadius: '50%',
            background: estado?.conectado ? 'var(--success)' : 'var(--error)',
          }} />
          <span style={{ fontWeight: 600 }}>
            {estado?.conectado ? 'Conectado' : 'Desconectado'}
          </span>
        </div>

        {estado?.email && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
            Cuenta: {estado.email}
          </p>
        )}

        {estado?.carpetaUrl && (
          <p style={{ fontSize: '0.85rem', marginBottom: 8 }}>
            <a href={estado.carpetaUrl} target="_blank" rel="noreferrer">Abrir carpeta de fotos en Drive</a>
          </p>
        )}

        {estado?.error && (
          <div className="alert alert-error" style={{ marginBottom: 12 }}>{estado.error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!estado?.conectado ? (
            <button className="btn btn-primary" onClick={conectar}>
              Conectar Google Drive
            </button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={probar} disabled={testing}>
                {testing ? 'Probando...' : 'Probar conexión'}
              </button>
              <button className="btn btn-outline" onClick={conectar}>
                Reconectar
              </button>
              <button className="btn btn-danger" onClick={desconectar}>
                Desconectar
              </button>
            </>
          )}
        </div>

        {testResult && (
          <div className={`alert ${testResult.includes('exitosa') ? 'alert-success' : 'alert-error'}`} style={{ marginTop: 12 }}>
            {testResult}
          </div>
        )}
      </div>
    </div>
  )
}
