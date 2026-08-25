import { AlertTriangle, ArrowRight, CircleGauge, Clock3, Gauge, Route } from 'lucide-react'
import type { SimulationResult } from '../domain/types'
import { useI18n } from '../i18n/context'
import { formatLapTime } from '../i18n/formatNumber'
import type { SimulationEvent } from '../domain/types'
import type { Translate } from '../i18n/context'

interface ResultsPanelProps {
  result: SimulationResult | null
  dirty: boolean
  selectedSample: number | null
  onSelect: (sampleIndex: number) => void
}

const eventLabelKey = {
  brake: 'results.eventBrake',
  apex: 'results.eventApex',
  throttle: 'results.eventThrottle',
} as const

/**
 * The value line for an event, built at render.
 *
 * Producers store the raw station and speed rather than a rendered string, so
 * this follows the language toggle instead of freezing in whichever locale was
 * active when the lap was solved.
 */
function eventDetail(event: SimulationEvent, t: Translate): string {
  if (event.kind === 'apex') {
    return t('project.eventApex', { speed: (event.speedMps * 3.6).toFixed(0) })
  }
  return t(event.kind === 'brake' ? 'project.eventBrake' : 'project.eventThrottle', {
    distance: event.sM.toFixed(0),
  })
}

export function ResultsPanel({ result, dirty, selectedSample, onSelect }: ResultsPanelProps) {
  const { t, n } = useI18n()

  if (!result)
    return (
      <aside className="results-panel empty-results" aria-label={t('results.ariaEmpty')}>
        <div className="empty-orbit">
          <CircleGauge size={28} />
        </div>
        <h2>{t('results.emptyTitle')}</h2>
        <p>{t('results.emptyBody')}</p>
      </aside>
    )

  const selected = selectedSample === null ? null : result.samples[selectedSample]
  const visibleEvents = result.events.slice(0, 10)
  return (
    <aside className="results-panel" aria-label={t('results.ariaLabel')}>
      <div className="result-title">
        <div>
          <span className="eyebrow">{t('results.stepLabel')}</span>
          <h2>{dirty ? t('results.titleStale') : t('results.titleCurrent')}</h2>
        </div>
        <span className={`source-badge ${result.source}`}>
          {result.source === 'api'
            ? t('results.sourceApi')
            : result.solver === 'browser-point-mass-v1'
              ? t('results.sourceFallbackHeuristic')
              : t('results.sourceFallback')}
        </span>
      </div>
      {dirty && <div className="stale-note">{t('results.staleNote')}</div>}
      <div className="hero-time">
        <span>{t('results.estimatedLap')}</span>
        <strong>{formatLapTime(result.lapTimeS)}</strong>
        <small>{t('results.solverLabel', { solver: result.solver })}</small>
      </div>
      <div className="metric-grid">
        <div>
          <Route size={16} />
          <span>{t('results.trackLength')}</span>
          <strong>{n(result.trackLengthM)} m</strong>
        </div>
        <div>
          <Gauge size={16} />
          <span>{t('results.maxSpeed')}</span>
          <strong>{n(result.maxSpeedMps * 3.6)} km/h</strong>
        </div>
        <div>
          <Clock3 size={16} />
          <span>{t('results.minSpeed')}</span>
          <strong>{n(result.minSpeedMps * 3.6)} km/h</strong>
        </div>
      </div>
      {selected && (
        <div className="selected-readout">
          <span>{t('results.pointLabel', { index: selected.index + 1 })}</span>
          <strong>{n(selected.speedMps * 3.6)} km/h</strong>
          <small>{t('results.distanceAfterStart', { distance: n(selected.distanceM) })}</small>
        </div>
      )}
      <div className="events-heading">
        <h3>{t('results.keyReferences')}</h3>
        <span
          aria-label={t('results.eventsShownAria', {
            shown: visibleEvents.length,
            total: result.events.length,
          })}
        >
          {visibleEvents.length === result.events.length
            ? visibleEvents.length
            : t('results.eventsShown', { shown: visibleEvents.length, total: result.events.length })}
        </span>
      </div>
      <ol className="event-list">
        {visibleEvents.map((event, index) => {
          const sample = result.samples[event.sampleIndex]
          return (
            <li key={`${event.kind}-${event.sampleIndex}`}>
              <button
                onClick={() => onSelect(event.sampleIndex)}
                className={selectedSample === event.sampleIndex ? 'selected' : ''}
              >
                <span className={`event-index ${event.kind}`}>{index + 1}</span>
                <span>
                  <small>{t(eventLabelKey[event.kind])}</small>
                  <strong>{eventDetail(event, t)}</strong>
                  <em>{t('results.distanceFromStart', { distance: sample ? n(sample.distanceM) : '' })}</em>
                </span>
                <ArrowRight size={15} />
              </button>
            </li>
          )
        })}
      </ol>
      {!!result.warnings.length && (
        <details className="warnings">
          <summary>
            <AlertTriangle size={15} />{' '}
            {result.warnings.length > 1
              ? t('results.assumptionsPlural', { n: result.warnings.length })
              : t('results.assumptionsSingular', { n: result.warnings.length })}
          </summary>
          {result.warnings.map((warning, index) => (
            <p key={index}>{'key' in warning ? t(warning.key, warning.params) : warning.text}</p>
          ))}
        </details>
      )}
    </aside>
  )
}
