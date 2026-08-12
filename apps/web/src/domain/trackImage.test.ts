import { describe, expect, it } from 'vitest'
import type { Translate } from '../i18n/context'
import { translate } from '../i18n/translate'
import {
  dataUrlBytes,
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
