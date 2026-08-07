import { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Flag,
  Gauge,
  Ruler,
  Sparkles,
  Trash2,
  UserRound,
  Weight,
  Zap,
} from 'lucide-react'
import type { Point } from '../domain/types'
import type { KartInput, SimulationSettings, TrackInput, ValidationIssue } from '../domain/types'

interface NumberFieldProps {
  id: string
  label: string
  value: number
  unit: string
  min: number
  max: number
  step?: number
  hint?: string
  icon?: React.ReactNode
  onChange: (value: number) => void
}

function NumberField({ id, label, value, unit, min, max, step = 1, hint, icon, onChange }: NumberFieldProps) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">
        {icon}
        {label}
      </span>
      <span className="input-with-unit">
        <input
          id={id}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span>{unit}</span>
      </span>
      {hint && <small>{hint}</small>}
    </label>
  )
}

interface ControlPanelProps {
  track: TrackInput
  kart: KartInput
  settings: SimulationSettings
  issues: ValidationIssue[]
  onTrack: (patch: Partial<TrackInput>) => void
  onKart: (patch: Partial<KartInput>) => void
  onSettings: (patch: Partial<SimulationSettings>) => void
  onPreset: (key: string) => void
  onPointChange: (index: number, point: Point) => void
  onPointRemove: (index: number) => void
}

export function ControlPanel({
  track,
  kart,
  settings,
  issues,
  onTrack,
  onKart,
  onSettings,
  onPreset,
  onPointChange,
  onPointRemove,
}: ControlPanelProps) {
  const [pointIndex, setPointIndex] = useState(0)
  useEffect(() => {
    setPointIndex((current) => Math.max(0, Math.min(track.centerline.length - 1, current)))
  }, [track.centerline.length])
  const selectedPoint = track.centerline[pointIndex]

  return (
    <aside className="control-panel" aria-label="Configuração da simulação">
      <section className="panel-section">
        <div className="section-heading">
          <div>
            <span className="step-number">01</span>
            <span className="eyebrow">PISTA</span>
            <h2>Defina o traçado</h2>
          </div>
        </div>
        <label className="field" htmlFor="preset">
          <span className="field-label">
            <Flag size={15} /> Começar com um exemplo
          </span>
          <span className="select-wrap">
            <select id="preset" defaultValue="technical" onChange={(event) => onPreset(event.target.value)}>
              <option value="technical">Circuito Aurora</option>
              <option value="oval">Oval de validação</option>
              <option value="hairpin">Complexo Hairpin</option>
            </select>
            <ChevronDown size={15} />
          </span>
        </label>
        <label className="field" htmlFor="track-name">
          <span className="field-label">Nome da pista</span>
          <input
            id="track-name"
            value={track.name}
            maxLength={120}
            onChange={(event) => onTrack({ name: event.target.value })}
          />
        </label>
        <div className="two-columns">
          <NumberField
            id="track-width"
            label="Largura"
            value={track.widthM}
            unit="m"
            min={0.1}
            max={20}
            step={0.5}
            icon={<Ruler size={15} />}
            onChange={(widthM) => onTrack({ widthM })}
          />
          <label className="field" htmlFor="direction">
            <span className="field-label">Sentido</span>
            <span className="select-wrap">
              <select
                id="direction"
                value={track.direction}
                onChange={(event) => onTrack({ direction: event.target.value as TrackInput['direction'] })}
              >
                <option value="clockwise">Horário</option>
                <option value="counterclockwise">Anti-horário</option>
              </select>
              <ChevronDown size={15} />
            </span>
          </label>
        </div>
        <div className="track-meta">
          <span>{track.centerline.length} pontos</span>
          <span>coordenadas em metros</span>
        </div>
        {selectedPoint && (
          <details className="point-editor">
            <summary>
              <Ruler size={15} /> Editar ponto por coordenadas <ChevronDown size={14} />
            </summary>
            <div className="point-picker">
              <button
                type="button"
                aria-label="Ponto anterior"
                disabled={pointIndex === 0}
                onClick={() => setPointIndex((index) => Math.max(0, index - 1))}
              >
                <ChevronLeft size={15} />
              </button>
              <label htmlFor="control-point">Ponto</label>
              <select
                id="control-point"
                value={pointIndex}
                onChange={(event) => setPointIndex(Number(event.target.value))}
              >
                {track.centerline.map((_, index) => (
                  <option key={index} value={index}>
                    {index + 1} de {track.centerline.length}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Próximo ponto"
                disabled={pointIndex === track.centerline.length - 1}
                onClick={() => setPointIndex((index) => Math.min(track.centerline.length - 1, index + 1))}
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <div className="point-coordinates">
              <NumberField
                id="point-x"
                label={`Ponto ${pointIndex + 1} · X`}
                value={selectedPoint.x}
                unit="m"
                min={-100_000}
                max={100_000}
                step={0.1}
                onChange={(x) => onPointChange(pointIndex, { ...selectedPoint, x })}
              />
              <NumberField
                id="point-y"
                label={`Ponto ${pointIndex + 1} · Y`}
                value={selectedPoint.y}
                unit="m"
                min={-100_000}
                max={100_000}
                step={0.1}
                onChange={(y) => onPointChange(pointIndex, { ...selectedPoint, y })}
              />
            </div>
            <button
              type="button"
              className="remove-point-button"
              disabled={track.centerline.length <= 4}
              onClick={() => onPointRemove(pointIndex)}
            >
              <Trash2 size={14} /> Remover ponto {pointIndex + 1}
            </button>
          </details>
        )}
        {!!issues.length && (
          <div className="issue-list" role="status">
            {issues.map((issue, index) => (
              <p className={issue.level} key={`${issue.message}-${index}`}>
                {issue.message}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="panel-section kart-section">
        <div className="section-heading">
          <div>
            <span className="step-number">02</span>
            <span className="eyebrow">KART + PILOTO</span>
            <h2>Modele seu conjunto</h2>
          </div>
        </div>
        <div className="two-columns">
          <NumberField
            id="power"
            label="Potência"
            value={kart.powerHp}
            unit="hp"
            min={1}
            max={80}
            step={0.5}
            icon={<Zap size={15} />}
            onChange={(powerHp) => onKart({ powerHp })}
          />
          <NumberField
            id="top-speed"
            label="Vel. máxima"
            value={kart.topSpeedKph}
            unit="km/h"
            min={10}
            max={180}
            icon={<Gauge size={15} />}
            onChange={(topSpeedKph) => onKart({ topSpeedKph })}
          />
          <NumberField
            id="kart-mass"
            label="Kart"
            value={kart.kartMassKg}
            unit="kg"
            min={20}
            max={250}
            icon={<Weight size={15} />}
            onChange={(kartMassKg) => onKart({ kartMassKg })}
          />
          <NumberField
            id="driver-mass"
            label="Piloto"
            value={kart.driverMassKg}
            unit="kg"
            min={20}
            max={180}
            icon={<UserRound size={15} />}
            onChange={(driverMassKg) => onKart({ driverMassKg })}
          />
        </div>
        <details className="advanced-settings">
          <summary>
            <Sparkles size={15} /> Ajustes avançados <ChevronDown size={14} />
          </summary>
          <div className="two-columns">
            <NumberField
              id="grip"
              label="Aderência μ"
              value={kart.gripCoefficient}
              unit="μ"
              min={0.2}
              max={2}
              step={0.05}
              hint="1,0 ≈ pneu rental seco"
              onChange={(gripCoefficient) => onKart({ gripCoefficient })}
            />
            <NumberField
              id="braking"
              label="Frenagem"
              value={kart.brakeDecelMps2}
              unit="m/s²"
              min={0.5}
              max={15}
              step={0.5}
              onChange={(brakeDecelMps2) => onKart({ brakeDecelMps2 })}
            />
            <NumberField
              id="margin"
              label="Margem"
              value={settings.safetyMarginM}
              unit="m"
              min={0}
              max={3}
              step={0.1}
              hint="Distância mínima da borda"
              onChange={(safetyMarginM) => onSettings({ safetyMarginM })}
            />
            <NumberField
              id="samples"
              label="Amostras"
              value={settings.sampleCount}
              unit="pts"
              min={64}
              max={500}
              step={1}
              onChange={(sampleCount) => onSettings({ sampleCount })}
            />
          </div>
        </details>
        <div className="mass-summary">
          <CircleGauge size={16} />
          <span>Massa total</span>
          <strong>{kart.kartMassKg + kart.driverMassKg} kg</strong>
        </div>
      </section>
    </aside>
  )
}
