import React, { useState, useEffect, useCallback, useRef } from 'react'
import { getPending, removePending, countPending } from '../lib/offlineQueue'
import { procesarFoto } from '../lib/fotos'

type SyncState = 'idle' | 'offline' | 'syncing' | 'error'

// Verifica conexión real haciendo un HEAD al health endpoint
// navigator.onLine no es confiable en iOS Safari
async function checkRealConnection(): Promise<boolean> {
  try {
    const res = await fetch('/health', { method: 'HEAD', cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

export default function OfflineSync() {
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [pendingCount, setPendingCount] = useState(0)
  const [syncMsg, setSyncMsg] = useState('')
  const syncingRef = useRef(false)

  const refreshCount = useCallback(async () => {
    try {
      const n = await countPending()
      setPendingCount(n)
      return n
    } catch {
      return 0
    }
  }, [])

  const sincronizar = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true

    const pendientes = await getPending()
    if (pendientes.length === 0) { syncingRef.current = false; return }

    setSyncState('syncing')
    setSyncMsg(`Sincronizando ${pendientes.length} visita(s)...`)

    const token = localStorage.getItem('token')
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    let errores = 0

    for (const visita of pendientes) {
      try {
        const res = await fetch('/api/visitas', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(visita.body),
        })

        if (!res.ok) {
          errores++
          continue
        }

        const data = await res.json() as { id: number }

        // Subir fotos
        for (let i = 0; i < visita.fotos.length; i++) {
          try {
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
            // Foto falla: no bloquear
          }
        }

        await removePending(visita.id)
      } catch {
        errores++
      }
    }

    const restantes = await refreshCount()
    if (errores > 0 && restantes > 0) {
      setSyncState('error')
      setSyncMsg(`${errores} visita(s) no se pudieron sincronizar`)
    } else {
      setSyncState('idle')
      setSyncMsg('')
    }
    syncingRef.current = false
  }, [refreshCount])

  // Verificar conexión y sincronizar periódicamente
  useEffect(() => {
    refreshCount()

    async function checkAndSync() {
      const n = await refreshCount()
      if (n > 0) {
        const online = await checkRealConnection()
        if (online) {
          setSyncState('idle')
          sincronizar()
        } else {
          setSyncState('offline')
        }
      } else {
        // Sin pendientes: solo verificar estado para el banner
        const online = await checkRealConnection()
        setSyncState(online ? 'idle' : 'offline')
      }
    }

    // Verificar al montar
    checkAndSync()

    // Escuchar eventos (como complemento, no como fuente principal)
    function handleOnline() { checkAndSync() }
    function handleOffline() { setSyncState('offline') }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Polling cada 30 segundos — más confiable que eventos en iOS
    const interval = setInterval(checkAndSync, 30000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [refreshCount, sincronizar])

  if (syncState === 'offline') {
    return <div style={styles.bannerOffline}>Sin conexión{pendingCount > 0 ? ` · ${pendingCount} visita(s) pendiente(s)` : ''}</div>
  }

  if (syncState === 'syncing') {
    return <div style={styles.bannerSyncing}>{syncMsg}</div>
  }

  if (syncState === 'error') {
    return <div style={styles.bannerError}>{syncMsg}</div>
  }

  if (pendingCount > 0) {
    return <div style={styles.bannerSyncing}>{pendingCount} visita(s) pendiente(s) de sincronizar</div>
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
