// Cola offline para visitas pendientes de sincronización.
// Usa IndexedDB directamente (sin librerías externas).

const DB_NAME = 'inovinfo-offline'
const DB_VERSION = 1
const STORE_NAME = 'visitas-pendientes'

export interface FotoPendiente {
  blob: Blob
  tipo: 'antes' | 'despues'
}

export interface VisitaPendiente {
  id: string
  body: Record<string, unknown>
  fotos: FotoPendiente[]
  createdAt: string
}

function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveOffline(
  body: Record<string, unknown>,
  fotos: FotoPendiente[]
): Promise<string> {
  const db = await abrirDB()
  const id = `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const entrada: VisitaPendiente = {
    id,
    body,
    fotos,
    createdAt: new Date().toISOString(),
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.add(entrada)
    req.onsuccess = () => resolve(id)
    req.onerror = () => reject(req.error)
  })
}

export async function getPending(): Promise<VisitaPendiente[]> {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result as VisitaPendiente[])
    req.onerror = () => reject(req.error)
  })
}

export async function removePending(id: string): Promise<void> {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function countPending(): Promise<number> {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
