import type { Locale } from './locales'

/**
 * Format a number for display in the reader's locale.
 *
 * Every figure in the interface came from `toFixed`, which always writes a full
 * stop, so a Portuguese reader saw `1.05` for a grip coefficient beside a
 * Portuguese label — and `1200` where the language groups as `1.200`. Within a
 * single panel the two conventions collided.
 *
 * Not for machine-readable output. SVG path and polyline data must keep a full
 * stop: `pt-BR` would write `1,5` for a coordinate, and SVG reads a comma as a
 * separator between coordinates, so a localised path is not a wrong-looking
 * path — it is a different path. Those call sites keep `toFixed` and say why.
 */
export function formatNumber(locale: Locale, value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

/**
 * `m:ss.cc`, deliberately not localised.
 *
 * Lap times are written this way in every timing screen and results sheet in
 * motorsport, and a reader comparing against one would be misled by a comma.
 * Rounded once before splitting, so a value just under a minute cannot render
 * as `0:60.00`.
 */
export function formatLapTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  const centiseconds = Math.round(seconds * 100)
  const minutes = Math.floor(centiseconds / 6000)
  const remainder = (centiseconds - minutes * 6000) / 100
  return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`
}
