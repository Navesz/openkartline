import { describe, expect, it } from 'vitest'
import { insertPointNearestSegment } from './editorGeometry'

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

describe('editor geometry', () => {
  it('inserts after the nearest regular segment', () => {
    const point = { x: 5, y: -1 }
    expect(insertPointNearestSegment(square, point)[1]).toEqual(point)
  })

  it('treats the final-to-first segment as part of the closed track', () => {
    const point = { x: -1, y: 5 }
    expect(insertPointNearestSegment(square, point)).toEqual([...square, point])
  })
})
