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

export function construirObservacion(params: ObservacionParams): string {
  const { estado, hallazgo, esExtraordinaria, esOtraSede, sedeNombre } = params

  if (estado === 'Pendiente') return ''

  let texto: string

  if (estado === 'Con novedad') {
    const h = hallazgo?.trim() || ''
    if (h) {
      // Minúscula inicial y sin punto final
      const hallazgoNorm = h.charAt(0).toLowerCase() + h.slice(1).replace(/\.+$/, '')
      texto = `${TEXTO_ESTANDAR}, durante la inspección ${hallazgoNorm}`
    } else {
      texto = TEXTO_ESTANDAR
    }
  } else {
    texto = TEXTOS_POR_ESTADO[estado] || TEXTO_ESTANDAR
  }

  if (esExtraordinaria) {
    texto += '. Visita extraordinaria a solicitud del área de mantenimiento'
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
