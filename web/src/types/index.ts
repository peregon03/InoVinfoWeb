export interface Usuario {
  id: number
  nombre: string
  email: string
  rol: 'coordinadora' | 'tecnico'
  permisos: string[]
  activo?: boolean
}

export interface LoginResponse {
  token: string
  usuario: Usuario
}

export interface Sede {
  id: number
  nombre: string
  activa: boolean
  created_at?: string
}

export interface Base {
  id: number
  nombre: string
  activa: boolean
  created_at?: string
}

export interface Unidad {
  id: number
  numero: string
  placa: string | null
  sede_id: number | null
  sede_nombre: string | null
  activa: boolean
}

export interface EstadoVisita {
  id: number
  nombre: string
  color_hex: string
  activo: boolean
}

export interface Suministro {
  id: number
  nombre: string
  categoria: string | null
  precio_ref: number | null
  activo: boolean
}

export interface TipoNovedad {
  id: number
  nombre: string
  requiere_descripcion: boolean
  activo: boolean
}

export interface FotoDetalle {
  id: number
  url: string
  tipo: 'antes' | 'despues'
  drive_file_id: string | null
}

export interface VisitaSuministro {
  suministro_id?: number
  nombre: string
  cantidad: number
}

export interface Checklist {
  camaras: Record<string, 'bien' | 'falla' | 'no_tiene'>
  equipos: Record<string, 'bien' | 'falla' | 'no_tiene'>
}

export interface Visita {
  id: number
  unidad_id: number
  unidad_numero: string
  tecnico_id?: number
  tecnico_nombre: string
  estado: string
  estado_id?: number
  color_hex: string
  sede_nombre: string | null
  sede_id: number | null
  base_id: number | null
  base_nombre: string | null
  novedad_texto: string | null
  observacion_estructurada: string | null
  atraso_hora_min: number | null
  dias_grabacion: number | null
  h264_plus: boolean | null
  checklist: Checklist | null
  es_extraordinaria: boolean
  es_otra_sede: boolean
  requiere_seguimiento: boolean
  fecha_seguimiento: string | null
  nota_seguimiento: string | null
  suministros: VisitaSuministro[]
  fotos: string[]
  fotos_detalle?: FotoDetalle[]
  created_at: string
}

export interface VisitaHoy {
  id: number
  unidad_id: number
  unidad_numero: string
  sede_nombre: string | null
  sede_id: number | null
  estado: string
  color_hex: string
  tecnico_nombre: string
  observacion_estructurada: string | null
  fotos_count: number
}

export interface Pendiente {
  id: number
  unidad_id: number
  unidad_numero: string
  sede_nombre: string | null
  fecha_seguimiento: string
  nota_seguimiento: string | null
  tecnico_nombre: string
  urgencia: 'vencido' | 'hoy' | 'futuro'
}

export interface Progreso {
  visitadas: number
  total: number
  dias: number
}

export interface DriveEstado {
  conectado: boolean
  email: string | null
  carpetaUrl: string | null
  error: string | null
}
