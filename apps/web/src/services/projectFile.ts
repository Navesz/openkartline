import type { KartInput, OklProject, SimulationSettings, TrackInput } from '../domain/types'
import { INPUT_LIMITS, validateSimulationInput, validationErrorMessage } from '../domain/validation'

export function toProject(track: TrackInput, kart: KartInput, settings: SimulationSettings): OklProject {
  const now = new Date().toISOString()
  return {
    schema_version: '0.1.0',
    project: { name: track.name, created_at: now, updated_at: now },
    track: {
      coordinate_system: 'local_cartesian_m',
      direction: track.direction,
      width_m: track.widthM,
      raw_centerline: track.centerline.map((point) => [point.x, point.y]),
    },
    kart: {
      model: 'point_mass_v1',
      total_mass_kg: kart.kartMassKg + kart.driverMassKg,
      parameters: {
        power_hp: kart.powerHp,
        kart_mass_kg: kart.kartMassKg,
        driver_mass_kg: kart.driverMassKg,
        top_speed_kph: kart.topSpeedKph,
        grip_coefficient: kart.gripCoefficient,
        brake_decel_mps2: kart.brakeDecelMps2,
      },
    },
    simulation: {
      solver: 'speed_profile_v1',
      settings: { sample_count: settings.sampleCount },
      safety_margin_m: settings.safetyMarginM,
    },
  }
}

export function downloadProject(project: OklProject): void {
  const blob = new Blob([`${JSON.stringify(project, null, 2)}\n`], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${
    project.project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'track'
  }.okl.json`
  link.click()
  URL.revokeObjectURL(url)
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${label} precisa ser um número válido.`)
  return value
}

export function parseProject(text: string): {
  track: TrackInput
  kart: KartInput
  settings: SimulationSettings
} {
  if (new TextEncoder().encode(text).byteLength > INPUT_LIMITS.projectBytes) {
    throw new Error('O projeto excede o limite de 1 MiB.')
  }
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    throw new Error('O arquivo não contém JSON válido.')
  }
  const project = input as Partial<OklProject>
  if (project.schema_version !== '0.1.0')
    throw new Error(`Versão de projeto não suportada: ${project.schema_version ?? 'ausente'}.`)
  if (
    !project.project ||
    typeof project.project.name !== 'string' ||
    typeof project.project.created_at !== 'string' ||
    typeof project.project.updated_at !== 'string' ||
    Number.isNaN(Date.parse(project.project.created_at)) ||
    Number.isNaN(Date.parse(project.project.updated_at))
  ) {
    throw new Error('Os metadados do projeto estão ausentes ou inválidos.')
  }
  if (
    !project.track ||
    !Array.isArray(project.track.raw_centerline) ||
    project.track.raw_centerline.length < 4
  ) {
    throw new Error('O arquivo precisa conter uma linha central com pelo menos 4 pontos.')
  }
  if (!project.kart?.parameters || !project.simulation)
    throw new Error('O arquivo não contém kart e configuração de simulação.')
  if (project.track.coordinate_system !== 'local_cartesian_m')
    throw new Error('O sistema de coordenadas do projeto não é suportado.')
  if (project.track.direction !== 'clockwise' && project.track.direction !== 'counterclockwise')
    throw new Error('O sentido da pista precisa ser horário ou anti-horário.')
  if (project.kart.model !== 'point_mass_v1' || project.simulation.solver !== 'speed_profile_v1')
    throw new Error('O modelo de kart ou solver do projeto não é suportado.')
  const p = project.kart.parameters
  const parsed: { track: TrackInput; kart: KartInput; settings: SimulationSettings } = {
    track: {
      name: project.project.name,
      direction: project.track.direction,
      widthM: finite(project.track.width_m, 'Largura'),
      centerline: project.track.raw_centerline.map((pair, index) => {
        if (!Array.isArray(pair) || pair.length !== 2) throw new Error(`Ponto ${index + 1} inválido.`)
        return { x: finite(pair[0], `Ponto ${index + 1} x`), y: finite(pair[1], `Ponto ${index + 1} y`) }
      }),
    },
    kart: {
      powerHp: finite(p.power_hp, 'Potência'),
      kartMassKg: finite(p.kart_mass_kg, 'Massa do kart'),
      driverMassKg: finite(p.driver_mass_kg, 'Massa do piloto'),
      topSpeedKph: finite(p.top_speed_kph, 'Velocidade máxima'),
      gripCoefficient: finite(p.grip_coefficient, 'Aderência'),
      brakeDecelMps2: finite(p.brake_decel_mps2, 'Frenagem'),
    },
    settings: {
      safetyMarginM: finite(project.simulation.safety_margin_m, 'Margem de segurança'),
      sampleCount: finite(project.simulation.settings?.sample_count, 'Amostras'),
    },
  }
  const issues = validateSimulationInput(parsed.track, parsed.kart, parsed.settings)
  const validationMessage = validationErrorMessage(issues)
  if (validationMessage) throw new Error(validationMessage)
  const declaredTotalMass = finite(project.kart.total_mass_kg, 'Massa total')
  const calculatedTotalMass = parsed.kart.kartMassKg + parsed.kart.driverMassKg
  if (Math.abs(declaredTotalMass - calculatedTotalMass) > 1e-6)
    throw new Error('A massa total não corresponde à soma do kart e do piloto.')
  return parsed
}
