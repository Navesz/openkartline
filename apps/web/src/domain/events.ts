import type { SimulationEvent } from './types'

const priority: Record<SimulationEvent['kind'], number> = { brake: 0, throttle: 1, apex: 2 }

export function coalesceSimulationEvents(
  input: SimulationEvent[],
  sampleCount: number,
  limit = 12,
): SimulationEvent[] {
  const valid = input
    .filter(
      (event) =>
        Number.isInteger(event.sampleIndex) && event.sampleIndex >= 0 && event.sampleIndex < sampleCount,
    )
    .sort((a, b) => a.sampleIndex - b.sampleIndex || priority[a.kind] - priority[b.kind])
  const minimumGap = Math.max(3, Math.round(sampleCount / 50))
  const lastByKind = new Map<SimulationEvent['kind'], number>()
  const distinct = valid.filter((event) => {
    const previousIndex = lastByKind.get(event.kind)
    if (previousIndex !== undefined && event.sampleIndex - previousIndex < minimumGap) return false
    lastByKind.set(event.kind, event.sampleIndex)
    return true
  })
  if (distinct.length <= limit) return distinct

  const selected = new Set<number>()
  for (const kind of ['brake', 'throttle', 'apex'] as const) {
    const first = distinct.findIndex((event) => event.kind === kind)
    if (first >= 0) selected.add(first)
  }
  for (let slot = 0; selected.size < limit && slot < limit * 2; slot += 1) {
    selected.add(Math.min(distinct.length - 1, Math.floor((slot * distinct.length) / limit)))
  }
  return [...selected]
    .sort((a, b) => a - b)
    .slice(0, limit)
    .map((index) => distinct[index])
    .sort((a, b) => a.sampleIndex - b.sampleIndex)
}
