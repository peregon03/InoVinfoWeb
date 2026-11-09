const MAX_SIDE = 1920
const MAX_SIZE_BYTES = 4 * 1024 * 1024 // 4 MB
const MAX_FOTOS_TOTAL = 8

function toColombiaTime(): string {
  return new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })
}

export async function procesarFoto(file: File, unidadNumero: string): Promise<Blob> {
  const img = await createImageBitmap(file)

  let w = img.width
  let h = img.height

  // Resize si excede el lado máximo permitido
  if (Math.max(w, h) > MAX_SIDE) {
    const ratio = MAX_SIDE / Math.max(w, h)
    w = Math.round(w * ratio)
    h = Math.round(h * ratio)
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  ctx.drawImage(img, 0, 0, w, h)

  // Marca de agua con número de unidad y fecha/hora Colombia
  const fontSize = Math.max(16, Math.round(w * 0.04))
  const padding = Math.round(fontSize * 0.5)
  const fechaStr = toColombiaTime()

  const line1 = `#${unidadNumero}`
  const line2 = fechaStr

  ctx.font = `bold ${fontSize}px Arial, sans-serif`
  const textWidth = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width)

  const boxH = fontSize * 2.8 + padding
  const boxW = textWidth + padding * 2
  const boxX = w - boxW - padding
  const boxY = h - boxH - padding

  // Fondo semitransparente
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.beginPath()
  ctx.roundRect(boxX, boxY, boxW, boxH, 8)
  ctx.fill()

  // Texto de la marca de agua
  ctx.fillStyle = '#FFFFFF'
  ctx.textBaseline = 'top'
  ctx.fillText(line1, boxX + padding, boxY + padding)
  ctx.font = `${Math.round(fontSize * 0.75)}px Arial, sans-serif`
  ctx.fillStyle = '#D4A843'
  ctx.fillText(line2, boxX + padding, boxY + padding + fontSize * 1.3)

  // Reducir calidad hasta estar por debajo del tamaño máximo
  let quality = 0.85
  let blob: Blob
  do {
    blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', quality)
    )
    quality -= 0.1
  } while (blob.size > MAX_SIZE_BYTES && quality > 0.3)

  return blob
}

export { MAX_FOTOS_TOTAL }
