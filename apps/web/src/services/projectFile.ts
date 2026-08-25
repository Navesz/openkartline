import { fitsProjectBudget, isImageDataUrl } from '../domain/trackImage'
import type { KartInput, OklProject, SimulationSettings, TrackInput } from '../domain/types'
import { INPUT_LIMITS, validateSimulationInput, validationErrorMessage } from '../domain/validation'
import type { Translate } from '../i18n/context'

export const PROJECT_SCHEMA_VERSION = '0.2.0' as const

export interface ProjectBuild {
  project: OklProject
  warnings: string[]
}

export function toProject(
  track: TrackInput,
  kart: KartInput,
  settings: SimulationSettings,
  t: Translate,
): ProjectBuild {
  const now = new Date().toISOString()
  const warnings: string[] = []
  let background: OklProject['track']['background']
  if (track.background) {
    // The picture is editor chrome, not geometry: when it alone would blow the
    // project budget, persist the calibration and let the user re-attach the
    // image after reopening instead of refusing to save the lap.
    const persistImage = fitsProjectBudget(track.background.imageDataUrl)
    if (!persistImage) warnings.push(t('project.backgroundTooLarge'))
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
        // The licence travels with the geometry: saving an OpenStreetMap-derived
        // circuit and sharing the file redistributes ODbL data.
        ...(track.attribution ? { attribution: track.attribution } : {}),
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

function finite(value: unknown, field: string, t: Translate): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(t('project.invalidNumber', { field }))
  return value
}

/**
 * Read the optional editor background. A background without `image_data_url`
 * (saved over budget) degrades to nothing: dimensions alone cannot render
 * anything, and the calibration is only meaningful alongside the picture it
 * was measured on.
 */
function parseBackground(
  background: OklProject['track']['background'],
  t: Translate,
): Pick<TrackInput, 'background'> {
  if (background === undefined) return {}
  if (typeof background !== 'object' || background === null) throw new Error(t('project.malformedBackground'))
  if (!isImageDataUrl(background.image_data_url)) return {}
  const widthPx = finite(background.image_width_px, t('project.field.imageWidth'), t)
  const heightPx = finite(background.image_height_px, t('project.field.imageHeight'), t)
  if (widthPx < 8 || widthPx > 4096 || heightPx < 8 || heightPx > 4096)
    throw new Error(t('project.invalidBackgroundDimensions'))
  const scale = background.scale_m_per_px
  if (scale !== undefined && (!(scale > 0) || scale > 10))
    throw new Error(t('project.invalidBackgroundScale'))
  return {
    background: {
      imageDataUrl: background.image_data_url,
      imageWidthPx: widthPx,
      imageHeightPx: heightPx,
      ...(typeof scale === 'number' ? { scaleMPerPx: scale } : {}),
    },
  }
}

export function parseProject(
  text: string,
  t: Translate,
): {
  track: TrackInput
  kart: KartInput
  settings: SimulationSettings
} {
  if (new TextEncoder().encode(text).byteLength > INPUT_LIMITS.projectBytes) {
    throw new Error(t('project.exceedsSizeLimit'))
  }
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    throw new Error(t('project.invalidJson'))
  }
  const project = input as Partial<OklProject>
  if (project.schema_version !== '0.1.0' && project.schema_version !== '0.2.0')
    throw new Error(
      t('project.unsupportedVersion', {
        version: project.schema_version ?? t('project.missingVersion'),
      }),
    )
  if (
    !project.project ||
    typeof project.project.name !== 'string' ||
    typeof project.project.created_at !== 'string' ||
    typeof project.project.updated_at !== 'string' ||
    Number.isNaN(Date.parse(project.project.created_at)) ||
    Number.isNaN(Date.parse(project.project.updated_at))
  ) {
    throw new Error(t('project.invalidMetadata'))
  }
  if (
    !project.track ||
    !Array.isArray(project.track.raw_centerline) ||
    project.track.raw_centerline.length < 4
  ) {
    throw new Error(t('project.missingCenterline'))
  }
  if (!project.kart?.parameters || !project.simulation) throw new Error(t('project.missingKartOrSimulation'))
  if (project.track.coordinate_system !== 'local_cartesian_m')
    throw new Error(t('project.unsupportedCoordinateSystem'))
  if (project.track.direction !== 'clockwise' && project.track.direction !== 'counterclockwise')
    throw new Error(t('project.invalidDirection'))
  if (project.kart.model !== 'point_mass_v1' || project.simulation.solver !== 'speed_profile_v1')
    throw new Error(t('project.unsupportedModel'))
  const p = project.kart.parameters
  const parsed: { track: TrackInput; kart: KartInput; settings: SimulationSettings } = {
    track: {
      name: project.project.name,
      direction: project.track.direction,
      widthM: finite(project.track.width_m, t('project.field.width'), t),
      centerline: project.track.raw_centerline.map((pair, index) => {
        if (!Array.isArray(pair) || pair.length !== 2)
          throw new Error(t('project.invalidPoint', { index: index + 1 }))
        return {
          x: finite(pair[0], t('project.field.pointX', { index: index + 1 }), t),
          y: finite(pair[1], t('project.field.pointY', { index: index + 1 }), t),
        }
      }),
      // Degraded to absent rather than rejected: a malformed credit line is not
      // a reason to refuse a project the user can still work on.
      ...(typeof project.track.attribution === 'string' && project.track.attribution.trim()
        ? { attribution: project.track.attribution }
        : {}),
      ...parseBackground(project.track.background, t),
    },
    kart: {
      powerHp: finite(p.power_hp, t('project.field.power'), t),
      kartMassKg: finite(p.kart_mass_kg, t('project.field.kartMass'), t),
      driverMassKg: finite(p.driver_mass_kg, t('project.field.driverMass'), t),
      topSpeedKph: finite(p.top_speed_kph, t('project.field.topSpeed'), t),
      gripCoefficient: finite(p.grip_coefficient, t('project.field.grip'), t),
      brakeDecelMps2: finite(p.brake_decel_mps2, t('project.field.braking'), t),
    },
    settings: {
      safetyMarginM: finite(project.simulation.safety_margin_m, t('project.field.safetyMargin'), t),
      sampleCount: finite(project.simulation.settings?.sample_count, t('project.field.sampleCount'), t),
    },
  }
  const issues = validateSimulationInput(parsed.track, parsed.kart, parsed.settings, t)
  const validationMessage = validationErrorMessage(issues)
  if (validationMessage) throw new Error(validationMessage)
  const declaredTotalMass = finite(project.kart.total_mass_kg, t('project.field.totalMass'), t)
  const calculatedTotalMass = parsed.kart.kartMassKg + parsed.kart.driverMassKg
  if (Math.abs(declaredTotalMass - calculatedTotalMass) > 1e-6) throw new Error(t('project.massMismatch'))
  return parsed
}
