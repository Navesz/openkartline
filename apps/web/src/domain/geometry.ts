import type { Point, ValidationIssue } from './types'

const EPSILON = 1e-8

export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

export function signedArea(points: Point[]): number {
  return (
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length]
      return sum + point.x * next.y - next.x * point.y
    }, 0) / 2
  )
}

function ccw(a: Point, b: Point, c: Point): boolean {
  return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x)
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d)
}

export function validateTrack(points: Point[], widthM: number): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (points.length < 4)
    issues.push({ level: 'error', message: 'Adicione pelo menos 4 pontos para fechar a pista.' })
  if (!Number.isFinite(widthM) || widthM <= 0)
    issues.push({ level: 'error', message: 'A largura deve ser maior que zero.' })
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    issues.push({ level: 'error', message: 'A pista contém coordenadas inválidas.' })
  }
  if (points.length >= 4 && Math.abs(signedArea(points)) < 10) {
    issues.push({ level: 'error', message: 'O traçado não forma uma área útil.' })
  }
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (distance(a, b) < 1) {
      issues.push({
        level: 'warning',
        message: `Os pontos ${i + 1} e ${((i + 1) % points.length) + 1} estão muito próximos.`,
      })
      break
    }
    for (let j = i + 2; j < points.length; j += 1) {
      if (i === 0 && j === points.length - 1) continue
      const c = points[j]
      const d = points[(j + 1) % points.length]
      if (segmentsIntersect(a, b, c, d)) {
        issues.push({ level: 'error', message: 'A linha central cruza a si mesma.' })
        return issues
      }
    }
  }
  return issues
}

export function catmullRomClosed(points: Point[], samplesPerSegment = 12): Point[] {
  if (points.length < 4) return points.map((point) => ({ ...point }))
  const result: Point[] = []
  for (let i = 0; i < points.length; i += 1) {
    const p0 = points[(i - 1 + points.length) % points.length]
    const p1 = points[i]
    const p2 = points[(i + 1) % points.length]
    const p3 = points[(i + 2) % points.length]
    for (let step = 0; step < samplesPerSegment; step += 1) {
      const t = step / samplesPerSegment
      const t2 = t * t
      const t3 = t2 * t
      result.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  return result
}

export function resampleClosed(points: Point[], count: number): Point[] {
  if (points.length < 2) return points
  const distances = [0]
  for (let i = 0; i < points.length; i += 1) {
    distances.push(distances[i] + distance(points[i], points[(i + 1) % points.length]))
  }
  const total = distances[distances.length - 1]
  const result: Point[] = []
  let segment = 0
  for (let i = 0; i < count; i += 1) {
    const target = (total * i) / count
    while (segment < points.length - 1 && distances[segment + 1] < target) segment += 1
    const start = points[segment]
    const end = points[(segment + 1) % points.length]
    const segmentLength = Math.max(EPSILON, distances[segment + 1] - distances[segment])
    const ratio = (target - distances[segment]) / segmentLength
    result.push({ x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio })
  }
  return result
}

export function normalAt(points: Point[], index: number): Point {
  const previous = points[(index - 1 + points.length) % points.length]
  const next = points[(index + 1) % points.length]
  const length = Math.max(EPSILON, distance(previous, next))
  return { x: -(next.y - previous.y) / length, y: (next.x - previous.x) / length }
}

export function curvatureAt(points: Point[], index: number): number {
  const a = points[(index - 1 + points.length) % points.length]
  const b = points[index]
  const c = points[(index + 1) % points.length]
  const ab = distance(a, b)
  const bc = distance(b, c)
  const ca = distance(c, a)
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  return (2 * cross) / Math.max(EPSILON, ab * bc * ca)
}

export function pathLength(points: Point[]): number {
  return points.reduce((sum, point, index) => sum + distance(point, points[(index + 1) % points.length]), 0)
}
