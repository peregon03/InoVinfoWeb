import React, { useState, useEffect, useCallback } from 'react'
import { getPending, removePending, countPending } from '../lib/offlineQueue'
import { procesarFoto } from '../lib/fotos'

type SyncState = 'idle' | 'syncing' | 'error'

export default function OfflineSync() {
  const [online, setOnline] = useState(navigator.onLine)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [pendingCount, setPendingCount] = useState(0)
  const [syncMsg, setSyncMsg] = useState('')

  // Refresca el contador al montar y cuando cambia el estado online
  const refreshCount = useCallback(async () => {
    try {
      const n = await countPending()
      setPendingCount(n)
    } catch {
      // IndexedDB puede no estar disponible en contextos muy restringidos
    }
  }, [])

  const sincronizar = useCallback(async () => {
    const pendientes = await getPending()
    if (pendientes.length === 0) return

    setSyncState('syncing')
    setSyncMsg(`Sincronizando ${pendientes.length} visita(s)...`)

    const token = localStorage.getItem('token')
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    let errores = 0

    for (const visita of pendientes) {
      try {
        // POST de la visita
        const res = await fetch('/api/visitas', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(visita.body),
        })

        if (!res.ok) {
          // Error de servidor: no es problema de red, mantener en cola
          errores++
          continue
        }

        const data = await res.json() as { id: number }

        // Subir fotos una a una
        for (let i = 0; i < visita.fotos.length; i++) {
          try {
            // procesarFoto espera un File, pero tenemos un Blob almacenado.
            // Convertimos a File para compatibilidad con la función existente.
            const fotoBlob = visita.fotos[i].blob
            const fotoFile = new File([fotoBlob], `foto_${i}.jpg`, { type: fotoBlob.type || 'image/jpeg' })
            const unidadNum = String((visita.body as Record<string, unknown>).unidad_id || '')
            const processed = await procesarFoto(fotoFile, unidadNum)
            const fd = new FormData()
            fd.append('foto', processed, `foto_${i}.jpg`)
            fd.append('tipo', visita.fotos[i].tipo)
            await fetch(`/api/visitas/${data.id}/fotos`, {
              method: 'POST',
              headers,
              body: fd,
            })
          } catch {
            // Foto individual falla: continúa con las demás
          }
        }

        await removePending(visita.id)
      } catch {
        // Error de red durante sync: dejar para el próximo intento
        errores++
      }
    }

    await refreshCount()
    const restantes = await countPending()

    if (errores > 0 && restantes > 0) {
      setSyncState('error')
      setSyncMsg(`${errores} visita(s) no se pudieron sincronizar. Se reintentará cuando haya conexión.`)
    } else {
      setSyncState('idle')
      setSyncMsg('')
    }
  }, [refreshCount])

  useEffect(() => {
    refreshCount()

    function handleOnline() {
      setOnline(true)
      refreshCount().then(async () => {
        const n = await countPending()
        if (n > 0) sincronizar()
      })
    }

    function handleOffline() {
      setOnline(false)
      setSyncState('idle')
      setSyncMsg('')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [refreshCount, sincronizar])

  // Sin conexión: mostrar banner
  if (!online) {
    return (
      <div style={styles.bannerOffline}>
        Sin conexión
      </div>
    )
  }

  // Con conexión y sincronizando
  if (syncState === 'syncing') {
    return (
      <div style={styles.bannerSyncing}>
        {syncMsg}
      </div>
    )
  }

  // Con conexión, error en sync
  if (syncState === 'error') {
    return (
      <div style={styles.bannerError}>
        {syncMsg}
      </div>
    )
  }

  // Con conexión y visitas pendientes (aún no se intentó sincronizar)
  if (pendingCount > 0) {
    return (
      <div style={styles.bannerSyncing}>
        {pendingCount} visita(s) pendiente(s) de sincronizar
      </div>
    )
  }

  return null
}

const styles: Record<string, React.CSSProperties> = {
  bannerOffline: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    background: '#374151',
    color: '#fff',
    textAlign: 'center',
    fontSize: '0.8rem',
    fontWeight: 600,
    padding: '6px 12px',
    letterSpacing: '0.03em',
  },
  bannerSyncing: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    background: '#1d4ed8',
    color: '#fff',
    textAlign: 'center',
    fontSize: '0.8rem',
    fontWeight: 600,
    padding: '6px 12px',
    letterSpacing: '0.03em',
  },
  bannerError: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    background: '#b91c1c',
    color: '#fff',
    textAlign: 'center',
    fontSize: '0.8rem',
    fontWeight: 600,
    padding: '6px 12px',
    letterSpacing: '0.03em',
  },
}
