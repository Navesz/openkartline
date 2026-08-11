import type { TrackBackground } from './types'

export const TRACK_IMAGE_LIMITS = {
  /** Raw upload ceiling; the stored copy is always re-encoded below. */
  uploadBytes: 8 * 1024 * 1024,
  maxDimensionPx: 1920,
  /** Keeps the base64 data URL near 500 KB so a project stays under 1 MiB. */
  targetBytes: 500 * 1024,
  minDimensionPx: 640,
  scaleMPerPxMin: 0.001,
  scaleMPerPxMax: 10,
} as const

const BASE64_OVERHEAD = 4 / 3

/** Byte size of the image a data URL decodes to, without decoding it. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.ceil((base64.length / BASE64_OVERHEAD) * 1)
}

export function isImageDataUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=\s]+$/.test(value) &&
    dataUrlBytes(value) <= TRACK_IMAGE_LIMITS.targetBytes * 2
  )
}

/**
 * True when attaching this image would keep the project inside its size
 * budget; `projectFile` uses it to decide between persisting the picture and
 * persisting only its calibration.
 */
export function fitsProjectBudget(dataUrl: string): boolean {
  return dataUrlBytes(dataUrl) <= TRACK_IMAGE_LIMITS.targetBytes
}

export function readImageFile(file: File): Promise<HTMLImageElement> {
  if (file.size > TRACK_IMAGE_LIMITS.uploadBytes) {
    return Promise.reject(
      new Error(`A imagem excede o limite de ${TRACK_IMAGE_LIMITS.uploadBytes / 1024 / 1024} MB.`),
    )
  }
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
    return Promise.reject(new Error('Use uma imagem PNG ou JPEG da pista.'))
  }
  return new Promise((resolvePromise, rejectPromise) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolvePromise(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      rejectPromise(new Error('Não foi possível ler a imagem selecionada.'))
    }
    image.src = url
  })
}

/**
 * Re-encode the upload as a bounded JPEG. Tracing needs the asphalt and kerbs
 * legible, not print quality, so quality steps down until the payload fits the
 * project budget (or the floor where a trace is still readable).
 */
export function downscaleTrackImage(image: HTMLImageElement): TrackBackground {
  const scale = Math.min(
    1,
    TRACK_IMAGE_LIMITS.maxDimensionPx / Math.max(image.naturalWidth, image.naturalHeight),
  )
  let width = Math.max(1, Math.round(image.naturalWidth * scale))
  let height = Math.max(1, Math.round(image.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Este navegador não consegue processar imagens.')

  let dataUrl = ''
  for (const quality of [0.82, 0.72, 0.62, 0.52]) {
    canvas.width = width
    canvas.height = height
    context.drawImage(image, 0, 0, width, height)
    dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrlBytes(dataUrl) <= TRACK_IMAGE_LIMITS.targetBytes) break
    if (quality <= 0.52 && Math.max(width, height) > TRACK_IMAGE_LIMITS.minDimensionPx) {
      width = Math.round(width * 0.75)
      height = Math.round(height * 0.75)
    }
  }
  return { imageDataUrl: dataUrl, imageWidthPx: width, imageHeightPx: height }
}

/**
 * Pixel distance of the calibration segment to metres per pixel. The editor
 * runs in pixel units until the user calibrates, so world distance IS pixel
 * distance at that moment.
 */
export function scaleFromCalibration(pixelDistance: number, realMeters: number): number {
  if (!Number.isFinite(realMeters) || realMeters <= 0)
    throw new Error('Informe uma distância real maior que zero.')
  if (!Number.isFinite(pixelDistance) || pixelDistance < 3)
    throw new Error('Marque dois pontos mais afastados na imagem.')
  const scale = realMeters / pixelDistance
  if (scale < TRACK_IMAGE_LIMITS.scaleMPerPxMin || scale > TRACK_IMAGE_LIMITS.scaleMPerPxMax) {
    throw new Error(
      `A escala resultante (${scale.toFixed(4)} m/px) está fora do esperado para uma pista de kart.`,
    )
  }
  return scale
}
