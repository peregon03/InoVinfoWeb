interface ObservacionParams {
  estado: string
  hallazgo?: string
  esExtraordinaria?: boolean
  esOtraSede?: boolean
  sedeNombre?: string
}

const TEXTO_ESTANDAR = 'Se ejecutó el servicio de revisión, diagnóstico técnico, ajuste, reparación, mantenimiento general y limpieza del sistema de cámaras'

const TEXTOS_POR_ESTADO: Record<string, string> = {
  'OK': TEXTO_ESTANDAR,
  'Inoperativa': 'Al momento de la visita esta unidad se encuentra inoperativa',
  'Sin llaves': 'Al momento de la inspección no se encontraron llaves',
  'No está en la base': 'Al momento de la visita la unidad no se encontraba en la base',
  'Bat. desconectada': 'Al momento de la visita la batería de la unidad se encontraba desconectada',
}

const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function normalizarHallazgo(h: string): string {
  const t = h.trim().replace(/\s+/g, ' ').replace(/[.\s]+$/, '')
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : ''
}

export function construirObservacion(params: ObservacionParams): string {
  const { estado, hallazgo, esExtraordinaria, esOtraSede, sedeNombre } = params

  if (estado === 'Pendiente') return ''

  let texto: string

  if (esExtraordinaria) {
    // Formato del informe Veolia: "A solicitud del area de mantenimiento se realiza visita el {dia} de {Mes}..."
    const ahora = new Date()
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(ahora)
    const dia = Number(partes.find((p) => p.type === 'day')!.value)
    const mes = Number(partes.find((p) => p.type === 'month')!.value)
    const prefijo = `A solicitud del area de mantenimiento se realiza visita el ${dia} de ${MESES_LARGOS[mes - 1]}`
    const h = normalizarHallazgo(hallazgo || '')
    texto = h ? `${prefijo} ${h}` : `${prefijo}, ${normalizarHallazgo(TEXTO_ESTANDAR)}`
  } else if (estado === 'Con novedad') {
    const h = normalizarHallazgo(hallazgo || '')
    if (h) {
      texto = `${TEXTO_ESTANDAR}, durante la inspección ${h}`
    } else {
      texto = TEXTO_ESTANDAR
    }
  } else {
    texto = TEXTOS_POR_ESTADO[estado] || TEXTO_ESTANDAR
  }

  if (esOtraSede && sedeNombre) {
    texto += ` (Unidad revisada en base operativa ${sedeNombre})`
  }

  return texto
}

export function generarHallazgoAutomatico(checklist: { camaras: Record<string, string>; equipos: Record<string, string> } | null): string {
  if (!checklist) return ''

  const fallas: string[] = []

  const labels: Record<string, string> = {
    delantera: 'cámara delantera',
    trasera: 'cámara trasera',
    cabina: 'cámara de cabina',
    lateral: 'cámara lateral',
    directa: 'cámara directa',
    monitor_vision_directa: 'monitor de visión directa',
    visor_principal: 'visor principal',
    telo: 'telo',
    wifi: 'WiFi/credenciales',
  }

  for (const [grupo, items] of Object.entries(checklist)) {
    for (const [key, val] of Object.entries(items)) {
      if (val === 'falla') {
        fallas.push(labels[key] || key)
      }
    }
  }

  if (fallas.length === 0) return ''
  return `se evidenció falla en ${fallas.join(', ')}`
}
