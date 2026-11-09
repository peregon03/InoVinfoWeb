import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import type { Usuario, LoginResponse } from '../types'

interface AuthContextType {
  usuario: Usuario | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isCoordinadora: boolean
  tienePermiso: (permiso: string) => boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const saved = localStorage.getItem('usuario')
    if (token && saved) {
      try {
        setUsuario(JSON.parse(saved))
      } catch {
        localStorage.removeItem('token')
        localStorage.removeItem('usuario')
      }
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<LoginResponse>('/auth/login', { email, password })
    localStorage.setItem('token', data.token)
    localStorage.setItem('usuario', JSON.stringify(data.usuario))
    setUsuario(data.usuario)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    setUsuario(null)
  }, [])

  const isCoordinadora = usuario?.rol === 'coordinadora'

  const tienePermiso = useCallback((permiso: string) => {
    if (!usuario) return false
    if (usuario.rol === 'coordinadora') return true
    return usuario.permisos.includes(permiso)
  }, [usuario])

  return (
    <AuthContext.Provider value={{ usuario, loading, login, logout, isCoordinadora, tienePermiso }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
