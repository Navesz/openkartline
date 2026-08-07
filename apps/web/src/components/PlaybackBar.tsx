import { Pause, Play, RotateCcw } from 'lucide-react'
import { PLAYBACK_RATES, type PlaybackFrame, type PlaybackRate } from '../domain/playback'

interface PlaybackBarProps {
  frame: PlaybackFrame
  lapTimeS: number
  playing: boolean
  rate: PlaybackRate
  onPlayingChange: (playing: boolean) => void
  onRateChange: (rate: PlaybackRate) => void
  onSeek: (elapsedS: number) => void
}

const MODE_LABEL = { brake: 'FREANDO', coast: 'INÉRCIA', throttle: 'ACELERANDO' }

export function PlaybackBar({
  frame,
  lapTimeS,
  playing,
  rate,
  onPlayingChange,
  onRateChange,
  onSeek,
}: PlaybackBarProps) {
  const realDurationS = lapTimeS / rate
  return (
    <section className="playback-bar" aria-label="Reprodução da volta">
      <div className="playback-controls">
        <button
          className="playback-toggle"
          onClick={() => onPlayingChange(!playing)}
          aria-label={playing ? 'Pausar reprodução' : 'Reproduzir volta'}
        >
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
        <button onClick={() => onSeek(0)} aria-label="Voltar para a largada" title="Voltar à largada">
          <RotateCcw size={15} />
        </button>
        <div className="playback-rates" role="group" aria-label="Velocidade de reprodução">
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
        <span className="visually-hidden">Posição na volta</span>
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
        <small>
          volta simulada · reprodução {rate}x leva {realDurationS.toFixed(2)} s
        </small>
      </div>

      <div className={`playback-telemetry ${frame.mode}`}>
        <div className="playback-speed">
          <strong>{(frame.speedMps * 3.6).toFixed(0)}</strong>
          <span>km/h</span>
        </div>
        <div className="playback-pedals">
          <span className="pedal-row">
            <em>ACEL</em>
            <span className="pedal-track">
              <i className="pedal throttle" style={{ width: `${frame.throttle * 100}%` }} />
            </span>
          </span>
          <span className="pedal-row">
            <em>FREIO</em>
            <span className="pedal-track">
              <i className="pedal brake" style={{ width: `${frame.brake * 100}%` }} />
            </span>
          </span>
        </div>
        <span className="playback-mode">{MODE_LABEL[frame.mode]}</span>
        <span className="playback-distance">{frame.distanceM.toFixed(0)} m</span>
      </div>
    </section>
  )
}
