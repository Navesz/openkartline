import { Pause, Play, RotateCcw } from 'lucide-react'
import { PLAYBACK_RATES, type PlaybackFrame, type PlaybackRate } from '../domain/playback'
import { useI18n } from '../i18n/context'

interface PlaybackBarProps {
  frame: PlaybackFrame
  lapTimeS: number
  playing: boolean
  rate: PlaybackRate
  onPlayingChange: (playing: boolean) => void
  onRateChange: (rate: PlaybackRate) => void
  onSeek: (elapsedS: number) => void
}

const MODE_LABEL_KEY = {
  brake: 'playback.modeBrake',
  coast: 'playback.modeCoast',
  throttle: 'playback.modeThrottle',
} as const

export function PlaybackBar({
  frame,
  lapTimeS,
  playing,
  rate,
  onPlayingChange,
  onRateChange,
  onSeek,
}: PlaybackBarProps) {
  const { t } = useI18n()
  const realDurationS = lapTimeS / rate
  return (
    <section className="playback-bar" aria-label={t('playback.sectionAria')}>
      <div className="playback-controls">
        <button
          className="playback-toggle"
          onClick={() => onPlayingChange(!playing)}
          aria-label={playing ? t('playback.pause') : t('playback.play')}
        >
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
        <button onClick={() => onSeek(0)} aria-label={t('playback.resetAria')} title={t('playback.resetTitle')}>
          <RotateCcw size={15} />
        </button>
        <div className="playback-rates" role="group" aria-label={t('playback.rateGroupAria')}>
          {PLAYBACK_RATES.map((option) => (
            <button
              key={option}
              className={option === rate ? 'active' : ''}
              onClick={() => onRateChange(option)}
              aria-pressed={option === rate}
            >
              {option}x
            </button>
          ))}
        </div>
      </div>

      <label className="playback-scrub">
        <span className="visually-hidden">{t('playback.scrubLabel')}</span>
        <input
          type="range"
          min={0}
          max={lapTimeS}
          step={lapTimeS / 1000}
          value={frame.elapsedS}
          onChange={(event) => onSeek(Number(event.target.value))}
        />
      </label>

      <div className="playback-clock">
        <strong>
          {frame.elapsedS.toFixed(2)}
          <span> / {lapTimeS.toFixed(2)} s</span>
        </strong>
        {/* The rate changes only how fast the replay runs. Showing both clocks
            makes it explicit that the simulated lap time is untouched. */}
        <small>{t('playback.simulatedNote', { rate, seconds: realDurationS.toFixed(2) })}</small>
      </div>

      <div className={`playback-telemetry ${frame.mode}`}>
        <div className="playback-speed">
          <strong>{(frame.speedMps * 3.6).toFixed(0)}</strong>
          <span>km/h</span>
        </div>
        <div className="playback-pedals">
          <span className="pedal-row">
            <em>{t('playback.pedalThrottle')}</em>
            <span className="pedal-track">
              <i className="pedal throttle" style={{ width: `${frame.throttle * 100}%` }} />
            </span>
          </span>
          <span className="pedal-row">
            <em>{t('playback.pedalBrake')}</em>
            <span className="pedal-track">
              <i className="pedal brake" style={{ width: `${frame.brake * 100}%` }} />
            </span>
          </span>
        </div>
        <span className="playback-mode">{t(MODE_LABEL_KEY[frame.mode])}</span>
        <span className="playback-distance">{frame.distanceM.toFixed(0)} m</span>
      </div>
    </section>
  )
}
