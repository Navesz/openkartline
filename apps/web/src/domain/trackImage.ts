import type { Translate } from '../i18n/context'
import type { TrackBackground, TrackInput } from './types'

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

/** Encoder quality ladder, walked from best to worst before pixels are given up. */
const JPEG_QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52] as const

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

export function readImageFile(file: File, t: Translate): Promise<HTMLImageElement> {
  if (file.size > TRACK_IMAGE_LIMITS.uploadBytes) {
    return Promise.reject(
      new Error(t('imports.imageTooLarge', { limit: TRACK_IMAGE_LIMITS.uploadBytes / 1024 / 1024 })),
    )
  }
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
    return Promise.reject(new Error(t('imports.imageWrongFormat')))
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
      rejectPromise(new Error(t('imports.imageReadFailed')))
    }
    image.src = url
  })
}

/**
 * Re-encode the upload as a bounded JPEG. Tracing needs the asphalt and kerbs
 * legible, not print quality, so quality steps down until the payload fits the
 * project budget (or the floor where a trace is still readable).
 */
export function downscaleTrackImage(image: HTMLImageElement, t: Translate): TrackBackground {
  const scale = Math.min(
    1,
    TRACK_IMAGE_LIMITS.maxDimensionPx / Math.max(image.naturalWidth, image.naturalHeight),
  )
  let width = Math.max(1, Math.round(image.naturalWidth * scale))
  let height = Math.max(1, Math.round(image.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error(t('imports.imageCanvasUnsupported'))

  let dataUrl = ''
  // The dimensions that produced `dataUrl`. They must be reported rather than
  // the loop's running `width`/`height`: the canvas is what the calibration
  // scale is measured against, so metadata that outruns the encode would put a
  // silent scale error into every lap time traced over the picture.
  let encodedWidth = width
  let encodedHeight = height

  for (;;) {
    let fitsBudget = false
    for (const quality of JPEG_QUALITY_STEPS) {
      canvas.width = width
      canvas.height = height
      context.drawImage(image, 0, 0, width, height)
      dataUrl = canvas.toDataURL('image/jpeg', quality)
      encodedWidth = width
      encodedHeight = height
      if (dataUrlBytes(dataUrl) <= TRACK_IMAGE_LIMITS.targetBytes) {
        fitsBudget = true
        break
      }
    }
    // Quality alone could not buy the budget, so give up pixels and run the
    // ladder again, down to the floor where a trace is still readable.
    if (fitsBudget || Math.max(width, height) <= TRACK_IMAGE_LIMITS.minDimensionPx) break
    width = Math.max(1, Math.round(width * 0.75))
    height = Math.max(1, Math.round(height * 0.75))
  }

  return { imageDataUrl: dataUrl, imageWidthPx: encodedWidth, imageHeightPx: encodedHeight }
}

/**
 * Pixel distance of the calibration segment to metres per pixel. The editor
 * runs in pixel units until the user calibrates, so world distance IS pixel
 * distance at that moment.
 */
/**
 * Convert a span measured in world units into image pixels.
 *
 * `scaleFromCalibration` is defined in pixels, but the canvas marks its two
 * calibration points in world units. Those are the same thing only before a
 * scale exists, when the image is drawn at 1 m/px. Once one is set, a pixel
 * covers `scaleMPerPx` world units — so recalibrating a photo already at
 * 0.4 m/px and marking a known 100 m feature yielded 1 m/px instead of 0.4,
 * wrong by 1/scale and compounding on every further correction.
 */
export function imagePixelsFromWorld(worldDistance: number, scaleMPerPx: number | undefined): number {
  return worldDistance / (scaleMPerPx ?? 1)
}

export function scaleFromCalibration(pixelDistance: number, realMeters: number, t: Translate): number {
  if (!Number.isFinite(realMeters) || realMeters <= 0)
    throw new Error(t('imports.calibrationDistanceRequired'))
  if (!Number.isFinite(pixelDistance) || pixelDistance < 3)
    throw new Error(t('imports.calibrationPointsTooClose'))
  const scale = realMeters / pixelDistance
  if (scale < TRACK_IMAGE_LIMITS.scaleMPerPxMin || scale > TRACK_IMAGE_LIMITS.scaleMPerPxMax) {
    throw new Error(t('imports.calibrationScaleImplausible', { scale: scale.toFixed(4) }))
  }
  return scale
}

/**
 * Record a newly measured image scale.
 *
 * Calibration says how many metres one image pixel covers, which is what sizes
 * the picture: `TrackCanvas` draws it `imageWidthPx * scaleMPerPx` metres wide,
 * falling back to 1 m/px while no scale is set. The centreline is not touched,
 * because there is nothing to convert -- every track in this app is already in
 * metres. A preset is authored in metres, a GPS import is projected to metres,
 * and a loaded project stores metres; the app has no way to start a track in
 * any other frame.
 *
 * Scaling it here is what turned a 900 m circuit into 360 m the moment a photo
 * was calibrated behind it, and then -- once that was guarded by a flag saying
 * the trace belonged to the image -- turned a 319 m circuit into 128 m as soon
 * as the user nudged one control point before calibrating, which armed the
 * flag. The flag had no state it could correctly be true in, so it is gone.
 */
export function calibratedTrack(track: TrackInput, scaleMPerPx: number): TrackInput {
  if (!track.background) return track
  return { ...track, background: { ...track.background, scaleMPerPx } }
}
