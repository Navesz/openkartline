import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Translate } from '../i18n/context'
import { translate } from '../i18n/translate'
import type { TrackInput } from './types'
import {
  calibratedTrack,
  imagePixelsFromWorld,
  dataUrlBytes,
  downscaleTrackImage,
  fitsProjectBudget,
  isImageDataUrl,
  scaleFromCalibration,
  TRACK_IMAGE_LIMITS,
} from './trackImage'

const t: Translate = (key, params) => translate('en', key, params)

// 1x1 red JPEG, small enough to keep in source.
const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAAa//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/ISP/2gAMAwEAAgADAAAAEB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ECP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ECP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/ECP/2Q=='

describe('dataUrlBytes', () => {
  it('estimates the decoded payload from the base64 length', () => {
    const base64Length = TINY_JPEG.length - TINY_JPEG.indexOf(',') - 1
    expect(dataUrlBytes(TINY_JPEG)).toBe(Math.ceil((base64Length * 3) / 4))
  })
})

describe('isImageDataUrl', () => {
  it('accepts jpeg and png data URLs', () => {
    expect(isImageDataUrl(TINY_JPEG)).toBe(true)
    expect(isImageDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
  })

  it('rejects other payloads', () => {
    expect(isImageDataUrl('data:text/html;base64,PGI+')).toBe(false)
    expect(isImageDataUrl('https://example.com/track.jpg')).toBe(false)
    expect(isImageDataUrl(42)).toBe(false)
    expect(isImageDataUrl(undefined)).toBe(false)
  })

  it('rejects payloads beyond twice the storage budget', () => {
    const huge = `data:image/jpeg;base64,${'A'.repeat(TRACK_IMAGE_LIMITS.targetBytes * 2 * 1.4)}`
    expect(isImageDataUrl(huge)).toBe(false)
  })
})

describe('fitsProjectBudget', () => {
  it('accepts images under the target size', () => {
    expect(fitsProjectBudget(TINY_JPEG)).toBe(true)
  })

  it('rejects images over the target size', () => {
    const big = `data:image/jpeg;base64,${'A'.repeat(TRACK_IMAGE_LIMITS.targetBytes * 1.4)}`
    expect(fitsProjectBudget(big)).toBe(false)
  })
})

describe('scaleFromCalibration', () => {
  it('computes metres per pixel from a known segment', () => {
    expect(scaleFromCalibration(250, 100, t)).toBeCloseTo(0.4)
  })

  it('rejects zero or negative real distances', () => {
    expect(() => scaleFromCalibration(250, 0, t)).toThrow(/greater than zero/)
    expect(() => scaleFromCalibration(250, -10, t)).toThrow(/greater than zero/)
  })

  it('rejects clicks that are too close together to be meaningful', () => {
    expect(() => scaleFromCalibration(2, 100, t)).toThrow(/farther apart/)
  })

  it('rejects implausible scales for a kart track', () => {
    expect(() => scaleFromCalibration(5, 100, t)).toThrow(/outside what is expected/)
    expect(() => scaleFromCalibration(100_000, 10, t)).toThrow(/outside what is expected/)
  })
})

/**
 * jsdom has no real JPEG encoder, so the canvas is stubbed with one whose
 * payload size is a function of the pixels and quality it is handed. That is
 * enough to drive the budget ladder and to record what was really encoded.
 */
function stubCanvas(bytesFor: (width: number, height: number, quality: number) => number) {
  const encodes: { width: number; height: number; quality: number }[] = []
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => {} }),
    toDataURL: (_type: string, quality: number) => {
      encodes.push({ width: canvas.width, height: canvas.height, quality })
      const base64Length = Math.ceil((bytesFor(canvas.width, canvas.height, quality) * 4) / 3)
      return `data:image/jpeg;base64,${'A'.repeat(base64Length)}`
    },
  }
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLElement)
  return encodes
}

const imageOf = (width: number, height: number) =>
  ({ naturalWidth: width, naturalHeight: height }) as HTMLImageElement

describe('downscaleTrackImage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the first quality step when the payload already fits', () => {
    const encodes = stubCanvas(() => 1_000)

    const result = downscaleTrackImage(imageOf(1000, 800), t)

    expect(encodes).toHaveLength(1)
    expect(encodes[0].quality).toBe(0.82)
    expect(result.imageWidthPx).toBe(1000)
    expect(result.imageHeightPx).toBe(800)
  })

  it('caps the longest edge at the maximum dimension', () => {
    stubCanvas(() => 1_000)

    const result = downscaleTrackImage(imageOf(4000, 2000), t)

    expect(result.imageWidthPx).toBe(TRACK_IMAGE_LIMITS.maxDimensionPx)
    expect(result.imageHeightPx).toBe(TRACK_IMAGE_LIMITS.maxDimensionPx / 2)
  })

  it('gives up pixels when the quality ladder alone cannot buy the budget', () => {
    // Size depends only on the pixel count, so no quality step can ever fit.
    const encodes = stubCanvas((width, height) => width * height * 0.5)

    const result = downscaleTrackImage(imageOf(1920, 1920), t)

    expect(encodes.at(-1)!.width).toBeLessThan(TRACK_IMAGE_LIMITS.maxDimensionPx)
    expect(dataUrlBytes(result.imageDataUrl)).toBeLessThanOrEqual(TRACK_IMAGE_LIMITS.targetBytes)
  })

  it('reports the dimensions of the payload it actually returns', () => {
    // A truthful size is what the calibration scale is measured against:
    // metadata describing a smaller canvas than the one that was encoded puts a
    // silent scale error into every lap time traced over the picture.
    const encodes = stubCanvas((width, height) => width * height * 0.5)

    const result = downscaleTrackImage(imageOf(1920, 1920), t)

    expect(result.imageWidthPx).toBe(encodes.at(-1)!.width)
    expect(result.imageHeightPx).toBe(encodes.at(-1)!.height)
  })

  it('stops shrinking at the readable floor instead of looping forever', () => {
    // Nothing ever fits, so only the floor can end the loop.
    const encodes = stubCanvas(() => TRACK_IMAGE_LIMITS.targetBytes * 10)

    const result = downscaleTrackImage(imageOf(1920, 1920), t)

    expect(Math.max(result.imageWidthPx, result.imageHeightPx)).toBeLessThanOrEqual(
      TRACK_IMAGE_LIMITS.minDimensionPx,
    )
    expect(encodes.length).toBeLessThan(50)
  })
})

const BACKGROUND = { imageDataUrl: TINY_JPEG, imageWidthPx: 1200, imageHeightPx: 800 }

const metricTrack: TrackInput = {
  name: 'Preset in metres',
  direction: 'clockwise',
  widthM: 8,
  centerline: [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 150 },
    { x: 0, y: 150 },
  ],
  background: BACKGROUND,
}

describe('calibratedTrack', () => {
  it('records the scale without touching the geometry', () => {
    // Calibration says how many metres a pixel covers, which is what sizes the
    // picture. The track is already in metres and has nothing to convert.
    const calibrated = calibratedTrack(metricTrack, 0.4)

    expect(calibrated.centerline).toEqual(metricTrack.centerline)
    expect(calibrated.widthM).toBe(8)
    expect(calibrated.background?.scaleMPerPx).toBe(0.4)
  })

  it('leaves the geometry alone on recalibration too', () => {
    const calibrated = calibratedTrack(
      { ...metricTrack, background: { ...BACKGROUND, scaleMPerPx: 0.4 } },
      0.5,
    )

    expect(calibrated.centerline).toEqual(metricTrack.centerline)
    expect(calibrated.background?.scaleMPerPx).toBe(0.5)
  })

  it('survives an edit made before the scale was set', () => {
    // This is the case that reopened the bug. A metre preset with an
    // uncalibrated photo behind it used to be marked as "traced over the
    // background" by a single point edit, and calibrating then shrank a 319 m
    // circuit to 128 m -- the same corruption, through the editing path.
    const edited: TrackInput = {
      ...metricTrack,
      centerline: metricTrack.centerline.map((point, index) =>
        index === 1 ? { x: point.x + 5, y: point.y } : point,
      ),
    }

    const calibrated = calibratedTrack(edited, 0.4)

    expect(calibrated.centerline).toEqual(edited.centerline)
  })

  it('is a no-op without a background', () => {
    const noImage: TrackInput = { ...metricTrack, background: undefined }
    expect(calibratedTrack(noImage, 0.4)).toBe(noImage)
  })
})

describe('imagePixelsFromWorld', () => {
  it('is the identity before a scale is set', () => {
    // The image is drawn at 1 m/px until calibrated, so a world unit is a pixel.
    expect(imagePixelsFromWorld(250, undefined)).toBe(250)
  })

  it('converts a world span back to pixels once a scale exists', () => {
    // A photo at 0.4 m/px is drawn 0.4 world units per pixel, so a feature
    // spanning 100 world metres covers 250 pixels. Passing the world span
    // straight through gave 100, making the next scale 1 m/px instead of 0.4.
    expect(imagePixelsFromWorld(100, 0.4)).toBe(250)
  })

  it('keeps a correct recalibration idempotent', () => {
    // Re-marking the same feature at the same scale must reproduce that scale,
    // rather than multiplying the error on every correction.
    const scale = 0.4
    const worldSpan = 100
    const pixels = imagePixelsFromWorld(worldSpan, scale)
    expect(scaleFromCalibration(pixels, worldSpan, t)).toBeCloseTo(scale, 12)
  })
})
