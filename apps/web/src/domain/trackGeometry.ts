import { catmullRomClosed, normalAt, resampleClosed, signedArea } from './geometry'
import type { Direction, Point, TrackInput } from './types'

export interface CanonicalTrackGeometry {
  center: Point[]
  left: Point[]
  right: Point[]
}

export function orientClosedPoints(points: Point[], direction: Direction): Point[] {
  const wantsPositiveArea = direction === 'counterclockwise'
  if (signedArea(points) > 0 === wantsPositiveArea) return points.map((point) => ({ ...point }))
  return points.length
    ? [
        { ...points[0] },
        ...points
          .slice(1)
          .reverse()
          .map((point) => ({ ...point })),
      ]
    : []
}

/**
 * Pair engine samples with the canonical station nearest to each of them.
 *
 * The Python engine resamples both edges and rotates the right one to minimise
 * pairing distance, so its sample `i` is not guaranteed to be the client's
 * station `i`. Assuming index parity silently draws the wrong corridor around
 * the returned line. Both sequences advance monotonically around the lap, so
 * one full scan for the first sample plus a small window afterwards is enough.
 */
export function matchCenterlineIndices(center: Point[], positions: Point[], window = 8): number[] {
  if (!center.length) return positions.map(() => 0)
  const squaredDistance = (point: Point, other: Point) => (point.x - other.x) ** 2 + (point.y - other.y) ** 2
  let cursor = 0
  let closest = Number.POSITIVE_INFINITY
  center.forEach((point, index) => {
    const candidate = squaredDistance(point, positions[0] ?? point)
    if (candidate < closest) {
      closest = candidate
      cursor = index
    }
  })
  const reach = Math.min(window, Math.floor(center.length / 2))
  return positions.map((position) => {
    let best = cursor
    let bestDistance = Number.POSITIVE_INFINITY
    for (let offset = -reach; offset <= reach; offset += 1) {
      const index = (((cursor + offset) % center.length) + center.length) % center.length
      const candidate = squaredDistance(center[index], position)
      if (candidate < bestDistance) {
        bestDistance = candidate
        best = index
      }
    }
    cursor = best
    return best
  })
}

export function buildCanonicalTrackGeometry(track: TrackInput, sampleCount: number): CanonicalTrackGeometry {
  const oriented = orientClosedPoints(track.centerline, track.direction)
  const center = resampleClosed(catmullRomClosed(oriented), Math.max(4, Math.round(sampleCount)))
  const halfWidth = track.widthM / 2
  const normals = center.map((_, index) => normalAt(center, index))
  return {
    center,
    left: center.map((point, index) => ({
      x: point.x + normals[index].x * halfWidth,
      y: point.y + normals[index].y * halfWidth,
    })),
    right: center.map((point, index) => ({
      x: point.x - normals[index].x * halfWidth,
      y: point.y - normals[index].y * halfWidth,
    })),
  }
}
