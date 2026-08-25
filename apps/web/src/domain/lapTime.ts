/**
 * Lap-time formatting.
 *
 * Lives in `domain/` rather than beside the panel that renders it so it can be
 * tested without mounting a component, and so the next place that needs a lap
 * time formats it the same way.
 */

/**
 * `m:ss.cc`, rounded once before it is split.
 *
 * Splitting first and rounding the remainder lets the seconds field round up
 * past the minute it was measured against: 59.999 s rendered as `0:60.00` and
 * 119.997 s as `1:60.00`, times that do not exist.
 */
export function formatLapTime(seconds: number): string {
  const centiseconds = Math.round(seconds * 100)
  const minutes = Math.floor(centiseconds / 6000)
  const remainder = (centiseconds - minutes * 6000) / 100
  return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`
}
