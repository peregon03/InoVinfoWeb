const BASE = '/api'

interface ApiOptions extends RequestInit {
  params?: Record<string, string>
  timeout?: number
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

// Error específico de red — diferenciado de errores de servidor
export class NetworkError extends Error {
  constructor() {
    super('Sin conexión a internet')
    this.name = 'NetworkError'
  }
}

function getToken(): string | null {
  return localStorage.getItem('token')
}

async function request<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { params, timeout = 15000, ...fetchOpts } = opts
  let url = `${BASE}${path}`
  if (params) {
    const qs = new URLSearchParams(params).toString()
    url += `?${qs}`
  }

  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  if (fetchOpts.body && !(fetchOpts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  // Timeout con AbortController — iOS Safari puede dejar fetch colgado sin red
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  let res: Response
  try {
    res = await fetch(url, {
      ...fetchOpts,
      headers: { ...headers, ...fetchOpts.headers as Record<string, string> },
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    // TypeError = falla de red, AbortError = timeout
    throw new NetworkError()
  }
  clearTimeout(timer)

  if (res.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    window.location.href = '/login'
    throw new ApiError(401, 'Sesión expirada')
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(res.status, data.error || data.mensaje || `Error ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  get: <T>(path: string, params?: Record<string, string>) => request<T>(path, { params }),
  post: <T>(path: string, body?: unknown) => request<T>(path, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
  }),
  put: <T>(path: string, body?: unknown) => request<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, {
    method: 'POST',
    body: formData,
    timeout: 60000, // 60s para fotos
  }),
}

export { ApiError }
