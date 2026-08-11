import { describe, expect, it } from 'vitest'
import {
  GPS_LIMITS,
  gpsToTrack,
  latLonToMetric,
  parseCsvLatLon,
  parseGpx,
  simplifyClosedTrack,
  simplifyRdp,
} from './gpx'

const GPX_SAMPLE = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <trk><name>lap</name><trkseg>
    <trkpt lat="-22.5200" lon="-47.3900"></trkpt>
    <trkpt lat="-22.5195" lon="-47.3900"></trkpt>
    <trkpt lat="-22.5190" lon="-47.3905"></trkpt>
    <trkpt lat="-22.5190" lon="-47.3910"></trkpt>
    <trkpt lat="-22.5195" lon="-47.3915"></trkpt>
    <trkpt lat="-22.5200" lon="-47.3915"></trkpt>
    <trkpt lat="-22.5205" lon="-47.3910"></trkpt>
    <trkpt lat="-22.5205" lon="-47.3905"></trkpt>
    <trkpt lat="-22.5200" lon="-47.3900"></trkpt>
  </trkseg></trk>
</gpx>`

describe('parseGpx', () => {
  it('extracts every trkpt in order', () => {
    const points = parseGpx(GPX_SAMPLE)
    expect(points).toHaveLength(9)
    expect(points[0]).toEqual({ lat: -22.52, lon: -47.39 })
  })

  it('rejects content without GPX track points', () => {
    expect(() => parseGpx('not xml at all <<<')).toThrow(/trkpt/)
  })

  it('rejects files with too few usable points', () => {
    const sparse = `<gpx><trk><trkseg>
      <trkpt lat="1" lon="1"></trkpt><trkpt lat="2" lon="2"></trkpt>
    </trkseg></trk></gpx>`
    expect(() => parseGpx(sparse)).toThrow(/8 pontos/)
  })
})

describe('parseCsvLatLon', () => {
  it('accepts comma rows with a header', () => {
    const csv = ['lat,lon', ...Array.from({ length: 9 }, (_, i) => `-22.52${i},-47.39${i}`)].join('\n')
    expect(parseCsvLatLon(csv)).toHaveLength(9)
  })

  it('rejects rows without numeric coordinates', () => {
    const csv = ['-22.52,-47.39', 'garbage,row'].join('\n')
    expect(() => parseCsvLatLon(csv)).toThrow(/Linha 2/)
  })
})

describe('latLonToMetric', () => {
  // The frame is anchored at the centroid, so assertions compare the distance
  // between the two projected points, not their absolute coordinates.
  it('projects a known latitude offset to metres', () => {
    const [origin, north] = latLonToMetric([
      { lat: -22.52, lon: -47.39 },
      { lat: -22.52 + 0.001, lon: -47.39 },
    ])
    expect(north.x - origin.x).toBeCloseTo(0, 6)
    expect(north.y - origin.y).toBeCloseTo(111.32, 0)
  })

  it('shrinks longitude degrees by cos(latitude)', () => {
    const [origin, east] = latLonToMetric([
      { lat: -22.52, lon: -47.39 },
      { lat: -22.52, lon: -47.39 + 0.001 },
    ])
    expect(east.y - origin.y).toBeCloseTo(0, 6)
    expect(east.x - origin.x).toBeCloseTo(111.32 * Math.cos((-22.52 * Math.PI) / 180), 0)
  })
})

describe('simplifyRdp', () => {
  it('drops points within tolerance of a straight line', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 50, y: 0.4 },
      { x: 100, y: 0 },
    ]
    expect(simplifyRdp(line, 1.5)).toHaveLength(2)
  })

  it('keeps points that bend beyond tolerance', () => {
    const corner = [
      { x: 0, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 0 },
    ]
    expect(simplifyRdp(corner, 1.5)).toHaveLength(3)
  })
})

describe('simplifyClosedTrack', () => {
  it('returns a closed ring without a duplicate endpoint', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]
    const simplified = simplifyClosedTrack(square, 1.5)
    expect(simplified).toHaveLength(4)
    const first = simplified[0]
    const last = simplified[simplified.length - 1]
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeGreaterThan(1)
  })
})

describe('gpsToTrack', () => {
  it('converts a GPX lap into a metric closed centerline with direction', () => {
    const track = gpsToTrack(parseGpx(GPX_SAMPLE))
    expect(track.centerline.length).toBeGreaterThanOrEqual(4)
    expect(track.lengthM).toBeGreaterThan(GPS_LIMITS.minTrackLengthM)
    expect(['clockwise', 'counterclockwise']).toContain(track.direction)
  })

  it('survives a trace denser than the deduplication threshold', () => {
    // A 1 km lap logged at 0.1 m spacing. Comparing each point with its
    // immediate predecessor instead of the last kept one dropped all of them,
    // and the import failed with "0 m - too short for a track".
    const dense = Array.from({ length: 10_000 }, (_, index) => {
      const angle = (2 * Math.PI * index) / 10_000
      return {
        lat: -22.5 + 0.001432 * Math.sin(angle),
        lon: -44.08 + (0.001432 * Math.cos(angle)) / Math.cos((-22.5 * Math.PI) / 180),
      }
    })
    const track = gpsToTrack(dense)
    expect(track.lengthM).toBeGreaterThan(900)
    expect(track.lengthM).toBeLessThan(1100)
    expect(track.centerline.length).toBeGreaterThanOrEqual(4)
  })

  it('rejects traces that are too short for a kart track', () => {
    const tiny = Array.from({ length: 10 }, (_, i) => ({
      lat: -22.52 + i * 1e-6,
      lon: -47.39 + i * 1e-6,
    }))
    expect(() => gpsToTrack(tiny)).toThrow(/curto demais/)
  })
})
