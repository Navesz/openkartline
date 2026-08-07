import type { Point } from './types'

function pointToSegmentDistanceSquared(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return (point.x - start.x) ** 2 + (point.y - start.y) ** 2
  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  )
  const projectedX = start.x + ratio * dx
  const projectedY = start.y + ratio * dy
  return (point.x - projectedX) ** 2 + (point.y - projectedY) ** 2
}

export function insertPointNearestSegment(points: Point[], point: Point): Point[] {
  if (points.length < 2) return [...points, point]
  let nearestSegment = 0
  let nearestDistance = Number.POSITIVE_INFINITY
  points.forEach((start, index) => {
    const candidate = pointToSegmentDistanceSquared(point, start, points[(index + 1) % points.length])
    if (candidate < nearestDistance) {
      nearestDistance = candidate
      nearestSegment = index
    }
  })
  const next = [...points]
  next.splice(nearestSegment + 1, 0, point)
  return next
}
