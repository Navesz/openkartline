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
