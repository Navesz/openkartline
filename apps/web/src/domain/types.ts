export type Point = { x: number; y: number }

export type DriveMode = 'brake' | 'coast' | 'throttle'
export type Direction = 'clockwise' | 'counterclockwise'

export interface TrackInput {
  name: string
  direction: Direction
  centerline: Point[]
  widthM: number
}

export interface KartInput {
  powerHp: number
  kartMassKg: number
  driverMassKg: number
  topSpeedKph: number
  gripCoefficient: number
  brakeDecelMps2: number
}

export interface SimulationSettings {
  safetyMarginM: number
  sampleCount: number
}

export interface SimulationRequest {
  track: TrackInput
  kart: KartInput
  settings: SimulationSettings
}

export interface LapSample {
  index: number
  position: Point
  center: Point
  leftBoundary: Point
  rightBoundary: Point
  distanceM: number
  /** Simulated time since the start line, in seconds. Drives lap playback. */
  elapsedS: number
  speedMps: number
  throttle: number
  brake: number
  curvature: number
  mode: DriveMode
}

export interface SimulationEvent {
  kind: 'brake' | 'apex' | 'throttle'
  sampleIndex: number
  label: string
}

export interface SimulationResult {
  source: 'api' | 'browser'
  solver: string
  lapTimeS: number
  trackLengthM: number
  maxSpeedMps: number
  minSpeedMps: number
  samples: LapSample[]
  events: SimulationEvent[]
  warnings: string[]
}

export interface OklProject {
  schema_version: '0.1.0'
  project: {
    name: string
    created_at: string
    updated_at: string
  }
  track: {
    coordinate_system: 'local_cartesian_m'
    direction: Direction
    width_m: number
    raw_centerline: [number, number][]
  }
  kart: {
    model: 'point_mass_v1'
    total_mass_kg: number
    parameters: {
      power_hp: number
      kart_mass_kg: number
      driver_mass_kg: number
      top_speed_kph: number
      grip_coefficient: number
      brake_decel_mps2: number
    }
  }
  simulation: {
    solver: 'speed_profile_v1'
    settings: { sample_count: number }
    safety_margin_m: number
  }
}

export interface ValidationIssue {
  level: 'error' | 'warning'
  message: string
}
