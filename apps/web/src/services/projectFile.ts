import { fitsProjectBudget, isImageDataUrl } from '../domain/trackImage'
import type { KartInput, OklProject, SimulationSettings, TrackInput } from '../domain/types'
import { INPUT_LIMITS, validateSimulationInput, validationErrorMessage } from '../domain/validation'

export const PROJECT_SCHEMA_VERSION = '0.2.0' as const

export interface ProjectBuild {
  project: OklProject
  warnings: string[]
}

export function toProject(track: TrackInput, kart: KartInput, settings: SimulationSettings): ProjectBuild {
  const now = new Date().toISOString()
  const warnings: string[] = []
  let background: OklProject['track']['background']
  if (track.background) {
    // The picture is editor chrome, not geometry: when it alone would blow the
    // project budget, persist the calibration and let the user re-attach the
    // image after reopening instead of refusing to save the lap.
    const persistImage = fitsProjectBudget(track.background.imageDataUrl)
    if (!persistImage)
      warnings.push(
        'A imagem de fundo era grande demais para o arquivo; a geometria e a calibração foram salvas.',
      )
    background = {
      ...(persistImage ? { image_data_url: track.background.imageDataUrl } : {}),
      image_width_px: track.background.imageWidthPx,
      image_height_px: track.background.imageHeightPx,
      ...(typeof track.background.scaleMPerPx === 'number'
        ? { scale_m_per_px: track.background.scaleMPerPx }
        : {}),
    }
  }
  return {
    warnings,
    project: {
      schema_version: PROJECT_SCHEMA_VERSION,
      project: { name: track.name, created_at: now, updated_at: now },
      track: {
        coordinate_system: 'local_cartesian_m',
        direction: track.direction,
        width_m: track.widthM,
        raw_centerline: track.centerline.map((point) => [point.x, point.y]),
        ...(background ? { background } : {}),
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
  // Firefox ignores a click on a detached anchor, and revoking the object URL
  // in the same tick can cancel a download that has not started reading yet.
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  window.setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(url)
  }, 0)
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${label} precisa ser um número válido.`)
  return value
}

/**
 * Read the optional editor background. A background without `image_data_url`
 * (saved over budget) degrades to nothing: dimensions alone cannot render
 * anything, and the calibration is only meaningful alongside the picture it
 * was measured on.
 */
function parseBackground(background: OklProject['track']['background']): Pick<TrackInput, 'background'> {
  if (background === undefined) return {}
  if (typeof background !== 'object' || background === null)
    throw new Error('O plano de fundo do projeto está mal formado.')
  if (!isImageDataUrl(background.image_data_url)) return {}
  const widthPx = finite(background.image_width_px, 'Largura da imagem')
  const heightPx = finite(background.image_height_px, 'Altura da imagem')
  if (widthPx < 8 || widthPx > 4096 || heightPx < 8 || heightPx > 4096)
    throw new Error('As dimensões da imagem de fundo são inválidas.')
  const scale = background.scale_m_per_px
  if (scale !== undefined && (!(scale > 0) || scale > 10))
    throw new Error('A escala da imagem de fundo é inválida.')
  return {
    background: {
      imageDataUrl: background.image_data_url,
      imageWidthPx: widthPx,
      imageHeightPx: heightPx,
      ...(typeof scale === 'number' ? { scaleMPerPx: scale } : {}),
    },
  }
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
  if (project.schema_version !== '0.1.0' && project.schema_version !== '0.2.0')
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
      ...parseBackground(project.track.background),
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
