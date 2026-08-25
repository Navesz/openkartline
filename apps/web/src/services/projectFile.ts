import { fitsProjectBudget, isImageDataUrl } from '../domain/trackImage'
import type { KartInput, OklProject, ResultNote, SimulationSettings, TrackInput } from '../domain/types'
import { INPUT_LIMITS, validateSimulationInput, validationErrorMessage } from '../domain/validation'
import type { Translate } from '../i18n/context'
import { LocalisedError } from '../domain/localisedError'
import type { MessageKey } from '../i18n/messages'

export const PROJECT_SCHEMA_VERSION = '0.2.0' as const

/** Matches `track.attribution.maxLength` in the published 0.2.0 schema. */
export const ATTRIBUTION_MAX_LENGTH = 200

export interface ProjectBuild {
  project: OklProject
  warnings: ResultNote[]
}

export function toProject(track: TrackInput, kart: KartInput, settings: SimulationSettings): ProjectBuild {
  const now = new Date().toISOString()
  const warnings: ResultNote[] = []
  let background: OklProject['track']['background']
  if (track.background) {
    // The picture is editor chrome, not geometry: when it alone would blow the
    // project budget, persist the calibration and let the user re-attach the
    // image after reopening instead of refusing to save the lap.
    const persistImage = fitsProjectBudget(track.background.imageDataUrl)
    if (!persistImage) warnings.push({ key: 'project.backgroundTooLarge' })
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
        ...(track.attribution && track.attribution.length <= ATTRIBUTION_MAX_LENGTH
          ? { attribution: track.attribution }
          : {}),
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

function finite(value: unknown, field: MessageKey, fieldParams?: Record<string, string | number>): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new LocalisedError({
      key: 'project.invalidNumber',
      params: { field: { key: field, params: fieldParams } },
    })
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
    throw new LocalisedError({ key: 'project.malformedBackground' })
  if (!isImageDataUrl(background.image_data_url)) return {}
  const widthPx = finite(background.image_width_px, 'project.field.imageWidth')
  const heightPx = finite(background.image_height_px, 'project.field.imageHeight')
  if (widthPx < 8 || widthPx > 4096 || heightPx < 8 || heightPx > 4096)
    throw new LocalisedError({ key: 'project.invalidBackgroundDimensions' })
  const scale = background.scale_m_per_px
  if (scale !== undefined && (!(scale > 0) || scale > 10))
    throw new LocalisedError({ key: 'project.invalidBackgroundScale' })
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
    throw new LocalisedError({ key: 'project.exceedsSizeLimit' })
  }
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    throw new LocalisedError({ key: 'project.invalidJson' })
  }
  const project = input as Partial<OklProject>
  if (project.schema_version !== '0.1.0' && project.schema_version !== '0.2.0')
    throw new LocalisedError({
      key: 'project.unsupportedVersion',
      // Coerced to a string first. `schema_version` is whatever the file said,
      // and a slot value shaped `{ key: … }` is a message reference — so a file
      // could name one of this app's own messages and have it quoted back as
      // though it were the version it declared.
      params: {
        version:
          typeof project.schema_version === 'string'
            ? project.schema_version
            : { key: 'project.missingVersion' },
      },
    })
  if (
    !project.project ||
    typeof project.project.name !== 'string' ||
    typeof project.project.created_at !== 'string' ||
    typeof project.project.updated_at !== 'string' ||
    Number.isNaN(Date.parse(project.project.created_at)) ||
    Number.isNaN(Date.parse(project.project.updated_at))
  ) {
    throw new LocalisedError({ key: 'project.invalidMetadata' })
  }
  if (
    !project.track ||
    !Array.isArray(project.track.raw_centerline) ||
    project.track.raw_centerline.length < 4
  ) {
    throw new LocalisedError({ key: 'project.missingCenterline' })
  }
  if (!project.kart?.parameters || !project.simulation)
    throw new LocalisedError({ key: 'project.missingKartOrSimulation' })
  if (project.track.coordinate_system !== 'local_cartesian_m')
    throw new LocalisedError({ key: 'project.unsupportedCoordinateSystem' })
  if (project.track.direction !== 'clockwise' && project.track.direction !== 'counterclockwise')
    throw new LocalisedError({ key: 'project.invalidDirection' })
  if (project.kart.model !== 'point_mass_v1' || project.simulation.solver !== 'speed_profile_v1')
    throw new LocalisedError({ key: 'project.unsupportedModel' })
  const p = project.kart.parameters
  const parsed: { track: TrackInput; kart: KartInput; settings: SimulationSettings } = {
    track: {
      name: project.project.name,
      direction: project.track.direction,
      widthM: finite(project.track.width_m, 'project.field.width'),
      centerline: project.track.raw_centerline.map((pair, index) => {
        if (!Array.isArray(pair) || pair.length !== 2)
          throw new LocalisedError({ key: 'project.invalidPoint', params: { index: index + 1 } })
        return {
          x: finite(pair[0], 'project.field.pointX', { index: index + 1 }),
          y: finite(pair[1], 'project.field.pointY', { index: index + 1 }),
        }
      }),
      // Degraded to absent rather than rejected: a malformed credit line is not
      // a reason to refuse a project the user can still work on. The length
      // bound is the published one, so the app never holds a credit it would
      // then re-emit outside its own schema.
      ...(typeof project.track.attribution === 'string' &&
      project.track.attribution.trim() &&
      project.track.attribution.length <= ATTRIBUTION_MAX_LENGTH
        ? { attribution: project.track.attribution }
        : {}),
      ...parseBackground(project.track.background),
    },
    kart: {
      powerHp: finite(p.power_hp, 'project.field.power'),
      kartMassKg: finite(p.kart_mass_kg, 'project.field.kartMass'),
      driverMassKg: finite(p.driver_mass_kg, 'project.field.driverMass'),
      topSpeedKph: finite(p.top_speed_kph, 'project.field.topSpeed'),
      gripCoefficient: finite(p.grip_coefficient, 'project.field.grip'),
      brakeDecelMps2: finite(p.brake_decel_mps2, 'project.field.braking'),
    },
    settings: {
      safetyMarginM: finite(project.simulation.safety_margin_m, 'project.field.safetyMargin'),
      sampleCount: finite(project.simulation.settings?.sample_count, 'project.field.sampleCount'),
    },
  }
  const issues = validateSimulationInput(parsed.track, parsed.kart, parsed.settings, t)
  const validationMessage = validationErrorMessage(issues)
  if (validationMessage) throw new Error(validationMessage)
  const declaredTotalMass = finite(project.kart.total_mass_kg, 'project.field.totalMass')
  const calculatedTotalMass = parsed.kart.kartMassKg + parsed.kart.driverMassKg
  if (Math.abs(declaredTotalMass - calculatedTotalMass) > 1e-6)
    throw new LocalisedError({ key: 'project.massMismatch' })
  return parsed
}
