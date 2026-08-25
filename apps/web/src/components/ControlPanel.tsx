import { useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Flag,
  Gauge,
  Image as ImageIcon,
  MapPin,
  Ruler,
  Sparkles,
  Trash2,
  UserRound,
  Weight,
  Zap,
} from 'lucide-react'
import { KART_PRESETS, PRESETS, REAL_TRACK_KEYS, kartPresetKeyFor, toKartInput } from '../domain/presets'
import type {
  KartInput,
  Point,
  ResultNote,
  SimulationSettings,
  TrackInput,
  ValidationIssue,
} from '../domain/types'
import { INPUT_LIMITS } from '../domain/validation'
import { noteForError } from '../domain/localisedError'
import { useI18n } from '../i18n/context'

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
  // Keep what the user typed while it is still incomplete ("", "-", "1."), so
  // the field can be cleared and retyped instead of snapping to 0 on the first
  // keystroke. Committed values still flow out as numbers.
  const [draft, setDraft] = useState<string | null>(null)
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
          value={draft ?? value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const text = event.target.value
            setDraft(text)
            const parsed = Number(text)
            if (text.trim() !== '' && Number.isFinite(parsed)) onChange(parsed)
          }}
          onBlur={() => setDraft(null)}
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
  onImageFile: (file: File) => void
  onRemoveImage: () => void
  onGpsFile: (file: File) => void
  onCalibrate: (pixelDistance: number, realMeters: number) => void
  /** Which preset the track currently is, or `''` when it came from a file. */
  trackPresetKey: string
}

/**
 * Calibration without a pointer.
 *
 * The canvas tool needs two clicks to set the scale, so a keyboard user who
 * imports an image is stuck: simulation stays blocked on an uncalibrated
 * background and the only way out is deleting the picture. This asks for the
 * same two numbers directly and goes through the identical handler.
 */
function KeyboardCalibration({
  onCalibrate,
}: {
  onCalibrate: (pixelDistance: number, realMeters: number) => void
}) {
  const { t } = useI18n()
  const [pixels, setPixels] = useState(500)
  const [meters, setMeters] = useState(100)
  const [error, setError] = useState<ResultNote | null>(null)

  return (
    <div className="keyboard-calibration">
      <NumberField
        id="calibration-pixels"
        label={t('panel.calibrationPixels')}
        value={pixels}
        unit="px"
        min={3}
        max={100_000}
        onChange={setPixels}
      />
      <NumberField
        id="calibration-meters"
        label={t('panel.calibrationMeters')}
        value={meters}
        unit="m"
        min={1}
        max={2000}
        onChange={setMeters}
      />
      <button
        type="button"
        className="link-button"
        onClick={() => {
          try {
            onCalibrate(pixels, meters)
            setError(null)
          } catch (failure) {
            // `applyCalibration` validates; surface its reason rather than a
            // generic one, and keep the fields so the value can be corrected.
            // Stored as the note, not as text rendered here: `LocalisedError`
            // carries its key on `Error.message`, and rendering at throw time
            // freezes the wording in whichever language was on screen then.
            setError(noteForError(failure, { key: 'canvas.calibrationInvalid' }))
          }
        }}
      >
        {t('panel.calibrationApply')}
      </button>
      {error && (
        <p className="calibration-error" role="alert">
          {'key' in error ? t(error.key, error.params) : error.text}
        </p>
      )}
    </div>
  )
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
  onImageFile,
  onRemoveImage,
  onGpsFile,
  onCalibrate,
  trackPresetKey,
}: ControlPanelProps) {
  const { t, n } = useI18n()
  const [pointIndex, setPointIndex] = useState(0)
  const imageInput = useRef<HTMLInputElement>(null)
  const gpsInput = useRef<HTMLInputElement>(null)
  /**
   * Clamped while rendering, not afterwards.
   *
   * React re-runs this component immediately, before painting, so the shorter
   * centreline and the index that fits it land in the same frame. An effect is
   * a frame late, and this editor cannot survive that frame: removing the last
   * point leaves `selectedPoint` undefined, the `{selectedPoint && …}` guard
   * below unmounts the whole block, and an uncontrolled `<details open>` loses
   * its open state along with the focus the remove button had just handed to
   * `#control-point` precisely so it would not fall to `<body>`.
   *
   * `prevLength` is what makes this an adjustment rather than a loop: the
   * clamp runs on the render where the length actually changed and not again.
   */
  const [prevLength, setPrevLength] = useState(track.centerline.length)
  if (prevLength !== track.centerline.length) {
    setPrevLength(track.centerline.length)
    setPointIndex((current) => Math.max(0, Math.min(track.centerline.length - 1, current)))
  }
  const selectedPoint = track.centerline[pointIndex]

  return (
    <aside className="control-panel" aria-label={t('panel.ariaConfig')}>
      <section className="panel-section">
        <div className="section-heading">
          <div>
            <span className="step-number">01</span>
            <span className="eyebrow">{t('panel.trackEyebrow')}</span>
            <h2>{t('panel.trackHeading')}</h2>
          </div>
        </div>
        <label className="field" htmlFor="preset">
          <span className="field-label">
            <Flag size={15} /> {t('panel.startFromExample')}
          </span>
          <span className="select-wrap">
            <select id="preset" value={trackPresetKey} onChange={(event) => onPreset(event.target.value)}>
              {/* Reachable whenever the track is not a preset: imported,
                  traced from GPS, or edited away from one. Naming a preset in
                  any of those cases would be a lie. */}
              {trackPresetKey === '' && (
                <option value="" disabled>
                  {t('panel.trackCustom')}
                </option>
              )}
              <optgroup label={t('panel.syntheticGroup')}>
                <option value="technical">{t('panel.trackAurora')}</option>
                <option value="oval">{t('panel.trackOval')}</option>
                <option value="hairpin">{t('panel.trackHairpin')}</option>
              </optgroup>
              <optgroup label={t('panel.realGroup')}>
                {/* Rendered from the presets rather than retyped. These are
                    proper nouns, identical in every locale, so a second copy
                    buys nothing and can drift -- the option for Volta Redonda
                    already read "Kartódromo Int." while the track it selects
                    was named "Kartódromo Internacional". */}
                {REAL_TRACK_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {PRESETS[key].name}
                  </option>
                ))}
              </optgroup>
            </select>
            <ChevronDown size={15} />
          </span>
        </label>
        {track.attribution && (
          <p className="track-attribution">
            {t('panel.trackAttribution', { attribution: track.attribution })}
          </p>
        )}
        <label className="field" htmlFor="track-name">
          <span className="field-label">{t('panel.trackName')}</span>
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
            label={t('panel.width')}
            value={track.widthM}
            unit="m"
            min={0.1}
            max={20}
            step={0.5}
            icon={<Ruler size={15} />}
            onChange={(widthM) => onTrack({ widthM })}
          />
          <label className="field" htmlFor="direction">
            <span className="field-label">{t('panel.direction')}</span>
            <span className="select-wrap">
              <select
                id="direction"
                value={track.direction}
                onChange={(event) => onTrack({ direction: event.target.value as TrackInput['direction'] })}
              >
                <option value="clockwise">{t('panel.clockwise')}</option>
                <option value="counterclockwise">{t('panel.counterclockwise')}</option>
              </select>
              <ChevronDown size={15} />
            </span>
          </label>
        </div>
        <div className="track-meta">
          <span>{t('panel.pointsCount', { count: track.centerline.length })}</span>
          <span>
            {track.background && track.background.scaleMPerPx === undefined
              ? t('panel.noScaleWarning')
              : t('panel.metersCoordinates')}
          </span>
        </div>
        <div className="import-tools">
          <span className="field-label">{t('panel.traceFromReal')}</span>
          <div className="import-tools-row">
            <button type="button" onClick={() => imageInput.current?.click()}>
              <ImageIcon size={15} /> {t('panel.trackImageButton')}
            </button>
            <button type="button" onClick={() => gpsInput.current?.click()}>
              <MapPin size={15} /> {t('panel.gpsButton')}
            </button>
          </div>
          <input
            ref={imageInput}
            type="file"
            accept="image/png,image/jpeg"
            className="visually-hidden"
            aria-label={t('panel.importTrackImageAria')}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) onImageFile(file)
            }}
          />
          <input
            ref={gpsInput}
            type="file"
            accept=".gpx,.csv,application/gpx+xml,text/csv"
            className="visually-hidden"
            aria-label={t('panel.importGpsAria')}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) onGpsFile(file)
            }}
          />
          {track.background && (
            <p className="background-status">
              {t('panel.imageDimensions', {
                width: track.background.imageWidthPx,
                height: track.background.imageHeightPx,
              })}
              {track.background.scaleMPerPx
                ? t('panel.imageScale', { scale: n(track.background.scaleMPerPx, 3) })
                : t('panel.imageNoScale')}
              {' · '}
              <button type="button" className="link-button" onClick={onRemoveImage}>
                {t('panel.removeButton')}
              </button>
            </p>
          )}
          {track.background && <KeyboardCalibration onCalibrate={onCalibrate} />}
        </div>
        {selectedPoint && (
          <details className="point-editor">
            <summary>
              <Ruler size={15} /> {t('panel.editPointSummary')} <ChevronDown size={14} />
            </summary>
            <div className="point-picker">
              <button
                type="button"
                aria-label={t('panel.previousPointAria')}
                disabled={pointIndex === 0}
                onClick={() => setPointIndex((index) => Math.max(0, index - 1))}
              >
                <ChevronLeft size={15} />
              </button>
              <label htmlFor="control-point">{t('panel.pointLabel')}</label>
              <select
                id="control-point"
                value={pointIndex}
                onChange={(event) => setPointIndex(Number(event.target.value))}
              >
                {track.centerline.map((_, index) => (
                  <option key={index} value={index}>
                    {t('panel.pointOf', { index: index + 1, total: track.centerline.length })}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={t('panel.nextPointAria')}
                disabled={pointIndex === track.centerline.length - 1}
                onClick={() => setPointIndex((index) => Math.min(track.centerline.length - 1, index + 1))}
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <div className="point-coordinates">
              <NumberField
                id="point-x"
                label={t('panel.pointCoordinate', { index: pointIndex + 1, axis: 'X' })}
                value={selectedPoint.x}
                unit="m"
                min={-100_000}
                max={100_000}
                step={0.1}
                onChange={(x) => onPointChange(pointIndex, { ...selectedPoint, x })}
              />
              <NumberField
                id="point-y"
                label={t('panel.pointCoordinate', { index: pointIndex + 1, axis: 'Y' })}
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
              onClick={() => {
                onPointRemove(pointIndex)
                // Removing can disable this very button at the four-point
                // floor, and a disabled control drops focus to <body>, which
                // restarts Tab at the skip link. The picker is always mounted
                // while this block is open, so hand focus there.
                document.getElementById('control-point')?.focus()
              }}
            >
              <Trash2 size={14} /> {t('panel.removePoint', { index: pointIndex + 1 })}
            </button>
          </details>
        )}
        {/* Mounted unconditionally: a live region that appears at the same
            moment as its content has nothing to compare against, so the first
            validation error was never announced. Geometry-level issues have no
            field to attach to, which is why they need this region at all. */}
        <div className="issue-list" role="status" aria-live="polite">
          {issues.map((issue, index) => (
            <p className={issue.level} key={`${JSON.stringify(issue.note)}-${index}`}>
              {'key' in issue.note ? t(issue.note.key, issue.note.params) : issue.note.text}
            </p>
          ))}
        </div>
      </section>

      <section className="panel-section kart-section">
        <div className="section-heading">
          <div>
            <span className="step-number">02</span>
            <span className="eyebrow">{t('panel.kartEyebrow')}</span>
            <h2>{t('panel.kartHeading')}</h2>
          </div>
        </div>
        <label className="field" htmlFor="kart-preset">
          <span className="field-label">
            <Sparkles size={15} /> {t('panel.category')}
          </span>
          <span className="select-wrap">
            <select
              id="kart-preset"
              value={kartPresetKeyFor(kart)}
              onChange={(event) => {
                const preset = KART_PRESETS[event.target.value]
                if (preset) onKart(toKartInput(preset))
              }}
            >
              <option value="">{t('panel.custom')}</option>
              {Object.entries(KART_PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>
                  {t(preset.labelKey)}
                </option>
              ))}
            </select>
            <ChevronDown size={15} />
          </span>
        </label>
        {/* Outside the label: inside it, this text joins the select's accessible
            name and collides with the "Potência" field below. */}
        <p className="preset-note">{t('panel.presetNote')}</p>
        <div className="two-columns">
          <NumberField
            id="power"
            label={t('panel.power')}
            value={kart.powerHp}
            unit="hp"
            min={1}
            max={INPUT_LIMITS.powerHpMax}
            step={0.5}
            icon={<Zap size={15} />}
            onChange={(powerHp) => onKart({ powerHp })}
          />
          <NumberField
            id="top-speed"
            label={t('panel.topSpeed')}
            value={kart.topSpeedKph}
            unit="km/h"
            min={10}
            max={180}
            icon={<Gauge size={15} />}
            onChange={(topSpeedKph) => onKart({ topSpeedKph })}
          />
          <NumberField
            id="kart-mass"
            label={t('panel.kartMass')}
            value={kart.kartMassKg}
            unit="kg"
            min={20}
            max={250}
            icon={<Weight size={15} />}
            onChange={(kartMassKg) => onKart({ kartMassKg })}
          />
          <NumberField
            id="driver-mass"
            label={t('panel.driverMass')}
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
            <Sparkles size={15} /> {t('panel.advancedSettings')} <ChevronDown size={14} />
          </summary>
          <div className="two-columns">
            <NumberField
              id="grip"
              label={t('panel.grip')}
              value={kart.gripCoefficient}
              unit="μ"
              min={0.2}
              max={2}
              step={0.05}
              hint={t('panel.gripHint')}
              onChange={(gripCoefficient) => onKart({ gripCoefficient })}
            />
            <NumberField
              id="braking"
              label={t('panel.braking')}
              value={kart.brakeDecelMps2}
              unit="m/s²"
              min={INPUT_LIMITS.brakeDecelMinMps2}
              max={INPUT_LIMITS.brakeDecelMaxMps2}
              step={0.5}
              onChange={(brakeDecelMps2) => onKart({ brakeDecelMps2 })}
            />
            <NumberField
              id="margin"
              label={t('panel.margin')}
              value={settings.safetyMarginM}
              unit="m"
              min={0}
              max={3}
              step={0.1}
              hint={t('panel.marginHint')}
              onChange={(safetyMarginM) => onSettings({ safetyMarginM })}
            />
            <NumberField
              id="samples"
              label={t('panel.samples')}
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
          <span>{t('panel.totalMass')}</span>
          <strong>{kart.kartMassKg + kart.driverMassKg} kg</strong>
        </div>
      </section>
    </aside>
  )
}
