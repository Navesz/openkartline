import type { KartInput, Point, TrackInput } from './types'

export const DEFAULT_KART: KartInput = {
  powerHp: 13,
  kartMassKg: 115,
  driverMassKg: 75,
  topSpeedKph: 82,
  gripCoefficient: 1.05,
  brakeDecelMps2: 7.5,
}

export const PRESETS: Record<string, TrackInput> = {
  technical: {
    name: 'Circuito Aurora',
    direction: 'clockwise',
    widthM: 8,
    centerline: [
      { x: 5, y: 50 },
      { x: 12, y: 23 },
      { x: 35, y: 8 },
      { x: 68, y: 7 },
      { x: 92, y: 21 },
      { x: 99, y: 43 },
      { x: 86, y: 59 },
      { x: 66, y: 52 },
      { x: 53, y: 65 },
      { x: 66, y: 83 },
      { x: 47, y: 96 },
      { x: 22, y: 89 },
      { x: 26, y: 69 },
    ],
  },
  oval: {
    name: 'Oval de validação',
    direction: 'clockwise',
    widthM: 9,
    centerline: [
      { x: 10, y: 50 },
      { x: 17, y: 25 },
      { x: 35, y: 12 },
      { x: 70, y: 12 },
      { x: 91, y: 27 },
      { x: 96, y: 50 },
      { x: 90, y: 73 },
      { x: 69, y: 87 },
      { x: 34, y: 87 },
      { x: 16, y: 74 },
    ],
  },
  hairpin: {
    name: 'Complexo Hairpin',
    direction: 'counterclockwise',
    widthM: 7,
    centerline: [
      { x: 8, y: 76 },
      { x: 9, y: 25 },
      { x: 27, y: 10 },
      { x: 70, y: 10 },
      { x: 91, y: 23 },
      { x: 91, y: 43 },
      { x: 77, y: 50 },
      { x: 56, y: 43 },
      { x: 42, y: 50 },
      { x: 45, y: 69 },
      { x: 72, y: 78 },
      { x: 73, y: 92 },
      { x: 39, y: 94 },
      { x: 22, y: 83 },
    ],
  },
}

export const clonePoints = (points: Point[]): Point[] => points.map((point) => ({ ...point }))
