import type { SimulationResult } from './types'

export function clampSelectedSample(selected: number | null, result: SimulationResult | null): number | null {
  if (selected === null || !result?.samples.length || !Number.isFinite(selected)) return null
  return Math.max(0, Math.min(result.samples.length - 1, Math.round(selected)))
}
