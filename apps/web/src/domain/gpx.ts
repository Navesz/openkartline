import { signedArea } from './geometry'
import type { Direction, Point } from './types'
import { LocalisedError } from './localisedError'

export interface GpsTrack {
  centerline: Point[]
  direction: Direction
  pointCountRaw: number
  lengthM: number
}

export const GPS_LIMITS = {
  /**
   * Read no further than this.
   *
   * `maxPointsRaw` bounds the parsed result, not the work done to reach it: the
   * whole file was decoded into a string and scanned before any point was
   * counted. A 50,000-point GPX with elevation and timestamps is around 7 MB,
   * so this admits any trace the point limit would accept and refuses the rest
   * before reading it -- the guard the project and image uploads already have.
   */
  uploadBytes: 16 * 1024 * 1024,
  maxPointsRaw: 50_000,
  /** RDP tolerance: sub-GPS-noise, so shape survives while jitter collapses. */
  simplifyToleranceM: 1.5,
  minTrackLengthM: 150,
  maxTrackLengthM: 5_000,
} as const

interface LatLon {
  lat: number
  lon: number
}

/**
 * Track points from a GPX document: every `trkpt`, in document order.
 *
 * Attribute scan only — no DOMParser. GPX uploads are untrusted, and we only
 * need `lat`/`lon` on `<trkpt>`; feeding the whole file into a parser would
 * reinterpret user text as markup for no benefit.
 */
export function parseGpx(text: string): LatLon[] {
  if (!/<gpx\b/i.test(text) || !/<trkpt\b/i.test(text))
    throw new LocalisedError({ key: 'imports.gpxNoPoints' })
  const points: LatLon[] = []
  const tagPattern = /<trkpt\b([^>]*)>/gi
  const latPattern = /\blat\s*=\s*["']([^"']+)["']/i
  const lonPattern = /\blon\s*=\s*["']([^"']+)["']/i
  for (const match of text.matchAll(tagPattern)) {
    const attrs = match[1] ?? ''
    const lat = Number(attrs.match(latPattern)?.[1])
    const lon = Number(attrs.match(lonPattern)?.[1])
    points.push({ lat, lon })
  }
  return validatedLatLon(points, 'GPX')
}

/** Track points from CSV rows of `lat,lon` (an optional header is skipped). */
export function parseCsvLatLon(text: string): LatLon[] {
  const points: LatLon[] = []
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const columns = trimmed.split(/[;,\t]/).map((column) => column.trim())
    const lat = Number(columns[0])
    const lon = Number(columns[1])
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      if (index === 0 && /[a-z]/i.test(trimmed)) return // header row
      throw new LocalisedError({ key: 'imports.csvInvalidRow', params: { line: index + 1 } })
    }
    points.push({ lat, lon })
  })
  return validatedLatLon(points, 'CSV')
}

function validatedLatLon(points: LatLon[], source: string): LatLon[] {
  if (points.length > GPS_LIMITS.maxPointsRaw)
    throw new LocalisedError({
      key: 'imports.tooManyPoints',
      params: { source, limit: GPS_LIMITS.maxPointsRaw },
    })
  const usable = points.filter(
    (point) =>
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lon) &&
      Math.abs(point.lat) <= 90 &&
      Math.abs(point.lon) <= 180,
  )
  if (usable.length < 8) throw new LocalisedError({ key: 'imports.notEnoughPoints', params: { source } })
  return usable
}

/**
 * Equirectangular projection around the track centroid. The angular distortion
 * over a ~1 km kart track is far below GPS noise (~1–3 m), and the local
 * Cartesian frame is exactly what the engine consumes.
 */
export function latLonToMetric(points: LatLon[]): Point[] {
  const meanLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length
  const meanLon = points.reduce((sum, point) => sum + point.lon, 0) / points.length
  const metersPerDegree = 111_320
  const cosLat = Math.cos((meanLat * Math.PI) / 180)
  return points.map((point) => ({
    x: (point.lon - meanLon) * metersPerDegree * cosLat,
    y: (point.lat - meanLat) * metersPerDegree,
  }))
}

/** Perpendicular distance from `point` to the line through `start`–`end`. */
function lineDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length < 1e-12) return Math.hypot(point.x - start.x, point.y - start.y)
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / length
}

/** Ramer–Douglas–Peucker over an open chain. */
export function simplifyRdp(points: Point[], toleranceM: number): Point[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }))
  let farthestIndex = -1
  let farthestDistance = 0
  const first = points[0]
  const last = points[points.length - 1]
  for (let index = 1; index < points.length - 1; index += 1) {
    const candidate = lineDistance(points[index], first, last)
    if (candidate > farthestDistance) {
      farthestDistance = candidate
      farthestIndex = index
    }
  }
  if (farthestDistance <= toleranceM || farthestIndex < 0) return [first, last]
  const left = simplifyRdp(points.slice(0, farthestIndex + 1), toleranceM)
  const right = simplifyRdp(points.slice(farthestIndex), toleranceM)
  return [...left.slice(0, -1), ...right]
}

/**
 * Simplify a closed GPS trace. The ring is cut at its northernmost point (a
 * stable, noise-resistant anchor), simplified open, and re-closed without the
 * duplicate endpoint.
 */
export function simplifyClosedTrack(points: Point[], toleranceM: number): Point[] {
  let anchor = 0
  points.forEach((point, index) => {
    if (point.y > points[anchor].y) anchor = index
  })
  const opened = [...points.slice(anchor), ...points.slice(0, anchor), points[anchor]]
  return simplifyRdp(opened, toleranceM).slice(0, -1)
}

/**
 * GPS trace to a track centerline: project, close the loop, drop duplicates,
 * simplify, and detect travel direction from the signed area (GPS loggers
 * record the direction actually driven).
 */
export function gpsToTrack(points: LatLon[]): GpsTrack {
  const metric = latLonToMetric(points)
  // Walk against the last KEPT point, not the immediate predecessor. Comparing
  // with the predecessor drops every point of a uniformly dense trace, because
  // each one is individually within the threshold of the one before it, and the
  // whole lap collapses to a single point.
  const deduped: Point[] = []
  for (const point of metric) {
    const last = deduped[deduped.length - 1]
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 0.25) deduped.push(point)
  }
  if (
    deduped.length > 1 &&
    Math.hypot(deduped[0].x - deduped[deduped.length - 1].x, deduped[0].y - deduped[deduped.length - 1].y) < 5
  ) {
    deduped.pop() // logger recorded the loop closing; the ring closes implicitly
  }
  const lengthM = deduped.reduce(
    (sum, point, index) =>
      sum +
      Math.hypot(
        point.x - deduped[(index + 1) % deduped.length].x,
        point.y - deduped[(index + 1) % deduped.length].y,
      ),
    0,
  )
  if (lengthM < GPS_LIMITS.minTrackLengthM)
    throw new LocalisedError({ key: 'imports.trackTooShort', params: { length: lengthM.toFixed(0) } })
  if (lengthM > GPS_LIMITS.maxTrackLengthM)
    throw new LocalisedError({ key: 'imports.trackTooLong', params: { length: (lengthM / 1000).toFixed(1) } })
  const centerline = simplifyClosedTrack(deduped, GPS_LIMITS.simplifyToleranceM)
  if (centerline.length < 4) throw new LocalisedError({ key: 'imports.simplifiedTooFewPoints' })
  return {
    centerline,
    direction: signedArea(centerline) > 0 ? 'counterclockwise' : 'clockwise',
    pointCountRaw: points.length,
    lengthM,
  }
}

/** Pick the parser from the file extension, defaulting to GPX. */
export function parseGpsFile(name: string, text: string): GpsTrack {
  // Checked here as well as before the read, so the bound holds for any caller
  // rather than only for the one that happens to look at `File.size` first.
  if (new TextEncoder().encode(text).byteLength > GPS_LIMITS.uploadBytes)
    throw new LocalisedError({
      key: 'imports.gpsTooLarge',
      params: { limit: GPS_LIMITS.uploadBytes / 1024 / 1024 },
    })
  const lower = name.toLowerCase()
  const points = lower.endsWith('.csv') ? parseCsvLatLon(text) : parseGpx(text)
  return gpsToTrack(points)
}
