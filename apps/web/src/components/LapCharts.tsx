import type { SimulationResult } from '../domain/types'
import { useI18n } from '../i18n/context'

interface LapChartsProps {
  result: SimulationResult
  selectedSample: number | null
  onSelectedSample: (index: number | null) => void
}

const W = 720
const H = 176
const PAD = { top: 18, right: 14, bottom: 28, left: 44 }

function linePath(values: number[], max: number, min = 0): string {
  const width = W - PAD.left - PAD.right
  const height = H - PAD.top - PAD.bottom
  return values
    .map((value, index) => {
      const x = PAD.left + (index / Math.max(1, values.length - 1)) * width
      const y = PAD.top + ((max - value) / Math.max(0.001, max - min)) * height
      return `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

function cursorIndex(event: React.PointerEvent<SVGSVGElement>, count: number): number {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * W
  return Math.max(
    0,
    Math.min(count - 1, Math.round(((x - PAD.left) / (W - PAD.left - PAD.right)) * (count - 1))),
  )
}

export function LapCharts({ result, selectedSample, onSelectedSample }: LapChartsProps) {
  const { t } = useI18n()
  const speeds = result.samples.map((sample) => sample.speedMps * 3.6)
  const maxSpeed = Math.ceil(Math.max(...speeds) / 10) * 10
  const speedPath = linePath(speeds, maxSpeed)
  const throttlePath = linePath(
    result.samples.map((sample) => sample.throttle * 100),
    100,
  )
  const brakePath = linePath(
    result.samples.map((sample) => sample.brake * 100),
    100,
  )
  const selected = selectedSample === null ? null : result.samples[selectedSample]
  const cursorX =
    selectedSample === null
      ? null
      : PAD.left + (selectedSample / (result.samples.length - 1)) * (W - PAD.left - PAD.right)
  const distanceLabels = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    label: `${Math.round(result.trackLengthM * ratio)} m`,
  }))

  return (
    <section className="chart-card" aria-label={t('results.telemetryAria')}>
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">{t('results.simulatedLapEyebrow')}</span>
          <h2>{t('results.speedAndInputs')}</h2>
        </div>
        {selected && (
          <div className="hover-readout">
            <strong>{(selected.speedMps * 3.6).toFixed(0)}</strong>
            <span>km/h · {selected.distanceM.toFixed(0)} m</span>
          </div>
        )}
      </div>
      <svg
        className="lap-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t('results.chartAria')}
        onPointerMove={(event) => onSelectedSample(cursorIndex(event, result.samples.length))}
        onPointerLeave={() => onSelectedSample(null)}
      >
        {[0, 0.5, 1].map((ratio) => (
          <line
            key={ratio}
            x1={PAD.left}
            y1={PAD.top + ratio * (H - PAD.top - PAD.bottom)}
            x2={W - PAD.right}
            y2={PAD.top + ratio * (H - PAD.top - PAD.bottom)}
            className="chart-grid"
          />
        ))}
        {distanceLabels.map(({ ratio, label }) => (
          <text
            key={ratio}
            x={PAD.left + ratio * (W - PAD.left - PAD.right)}
            y={H - 7}
            textAnchor="middle"
            className="axis-label"
          >
            {label}
          </text>
        ))}
        <text x="5" y={PAD.top + 4} className="axis-label">
          {maxSpeed}
        </text>
        <text x="18" y={H - PAD.bottom + 4} className="axis-label">
          0
        </text>
        <path
          d={`${speedPath} L ${W - PAD.right} ${H - PAD.bottom} L ${PAD.left} ${H - PAD.bottom} Z`}
          className="speed-area"
        />
        <path d={speedPath} className="speed-line" />
        <path d={throttlePath} className="throttle-line" />
        <path d={brakePath} className="brake-line" />
        {cursorX !== null && (
          <>
            <line x1={cursorX} y1={PAD.top} x2={cursorX} y2={H - PAD.bottom} className="chart-cursor" />
            <circle
              cx={cursorX}
              cy={PAD.top + ((maxSpeed - speeds[selectedSample!]) / maxSpeed) * (H - PAD.top - PAD.bottom)}
              r="4"
              className="cursor-dot"
            />
          </>
        )}
      </svg>
      <div className="chart-legend">
        <span className="speed-key">{t('results.legendSpeed')}</span>
        <span className="throttle-key">{t('results.legendThrottle')}</span>
        <span className="brake-key">{t('results.legendBrake')}</span>
        <span className="chart-help">{t('results.legendHelp')}</span>
      </div>
    </section>
  )
}
