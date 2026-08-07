import { AlertTriangle, ArrowRight, CircleGauge, Clock3, Gauge, Route } from 'lucide-react'
import type { SimulationResult } from '../domain/types'

interface ResultsPanelProps {
  result: SimulationResult | null
  dirty: boolean
  selectedSample: number | null
  onSelect: (sampleIndex: number) => void
}

function formatLapTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${(seconds - minutes * 60).toFixed(2).padStart(5, '0')}`
}

const eventLabel = { brake: 'FRENAGEM', apex: 'ÁPICE', throttle: 'RETOMADA' }

export function ResultsPanel({ result, dirty, selectedSample, onSelect }: ResultsPanelProps) {
  if (!result)
    return (
      <aside className="results-panel empty-results" aria-label="Resultados">
        <div className="empty-orbit">
          <CircleGauge size={28} />
        </div>
        <h2>Sua referência aparecerá aqui</h2>
        <p>Ajuste a pista e o kart, depois execute a simulação.</p>
      </aside>
    )

  const selected = selectedSample === null ? null : result.samples[selectedSample]
  const visibleEvents = result.events.slice(0, 10)
  return (
    <aside className="results-panel" aria-label="Resultados da simulação">
      <div className="result-title">
        <div>
          <span className="eyebrow">03 · PLANO DE VOLTA</span>
          <h2>{dirty ? 'Referência anterior' : 'Linha de referência'}</h2>
        </div>
        <span className={`source-badge ${result.source}`}>
          {result.source === 'api' ? 'Motor físico MVP' : 'Fallback local'}
        </span>
      </div>
      {dirty && <div className="stale-note">Parâmetros alterados. Simule novamente para atualizar.</div>}
      <div className="hero-time">
        <span>VOLTA ESTIMADA</span>
        <strong>{formatLapTime(result.lapTimeS)}</strong>
        <small>modelo {result.solver}</small>
      </div>
      <div className="metric-grid">
        <div>
          <Route size={16} />
          <span>Extensão</span>
          <strong>{result.trackLengthM.toFixed(0)} m</strong>
        </div>
        <div>
          <Gauge size={16} />
          <span>Máxima</span>
          <strong>{(result.maxSpeedMps * 3.6).toFixed(0)} km/h</strong>
        </div>
        <div>
          <Clock3 size={16} />
          <span>Mínima</span>
          <strong>{(result.minSpeedMps * 3.6).toFixed(0)} km/h</strong>
        </div>
      </div>
      {selected && (
        <div className="selected-readout">
          <span>PONTO {selected.index + 1}</span>
          <strong>{(selected.speedMps * 3.6).toFixed(0)} km/h</strong>
          <small>{selected.distanceM.toFixed(0)} m após a largada</small>
        </div>
      )}
      <div className="events-heading">
        <h3>Referências principais</h3>
        <span aria-label={`${visibleEvents.length} de ${result.events.length} referências exibidas`}>
          {visibleEvents.length === result.events.length
            ? visibleEvents.length
            : `${visibleEvents.length} de ${result.events.length}`}
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
                  <small>{eventLabel[event.kind]}</small>
                  <strong>{event.label}</strong>
                  <em>{sample?.distanceM.toFixed(0)} m da largada</em>
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
            <AlertTriangle size={15} /> {result.warnings.length} premissa
            {result.warnings.length > 1 ? 's' : ''} da análise
          </summary>
          {result.warnings.map((warning, index) => (
            <p key={index}>{warning}</p>
          ))}
        </details>
      )}
    </aside>
  )
}
