import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  CloudOff,
  Download,
  LoaderCircle,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
  Upload,
} from 'lucide-react'
import { BrandMark } from './components/BrandMark'
import { ControlPanel } from './components/ControlPanel'
import { GithubIcon } from './components/GithubIcon'
import { LapCharts } from './components/LapCharts'
import { PlaybackBar } from './components/PlaybackBar'
import { ResultsPanel } from './components/ResultsPanel'
import { TrackCanvas, type EditorTool } from './components/TrackCanvas'
import { parseGpsFile } from './domain/gpx'
import { frameAtElapsed, wrapElapsed, type PlaybackRate } from './domain/playback'
import { clonePoints, DEFAULT_KART, PRESETS } from './domain/presets'
import { clampSelectedSample } from './domain/selection'
import { simulateInBrowser } from './domain/simulator'
import {
  calibratedTrack,
  downscaleTrackImage,
  readImageFile,
  scaleFromCalibration,
} from './domain/trackImage'
import type { KartInput, SimulationResult, SimulationSettings, TrackInput } from './domain/types'
import { INPUT_LIMITS, validateSimulationInput } from './domain/validation'
import { useHistory } from './hooks/useHistory'
import { useI18n } from './i18n/context'
import { LOCALES, LOCALE_LABEL } from './i18n/locales'
import { checkApiHealth, runSimulation } from './services/api'
import { downloadProject, parseProject, toProject } from './services/projectFile'

const DEFAULT_SETTINGS: SimulationSettings = { safetyMarginM: 0.15, sampleCount: 200 }

function freshPreset(key: string): TrackInput {
  const preset = PRESETS[key] ?? PRESETS.technical
  return { ...preset, centerline: clonePoints(preset.centerline) }
}

export default function App() {
  const { t, locale, setLocale } = useI18n()
  const trackHistory = useHistory<TrackInput>(freshPreset('technical'))
  const [kart, setKart] = useState<KartInput>(DEFAULT_KART)
  const [settings, setSettings] = useState<SimulationSettings>(DEFAULT_SETTINGS)
  const [result, setResult] = useState<SimulationResult>(() =>
    simulateInBrowser({ track: freshPreset('technical'), kart: DEFAULT_KART, settings: DEFAULT_SETTINGS }, t),
  )
  const [selectedSample, setSelectedSample] = useState<number | null>(null)
  const [tool, setTool] = useState<EditorTool>('edit')
  const [playbackEnabled, setPlaybackEnabled] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState<PlaybackRate>(1)
  const [elapsedS, setElapsedS] = useState(0)
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null)
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('success')
  const [message, setMessage] = useState(() => t('app.statusReady'))
  const [dirty, setDirty] = useState(false)
  const unmounted = useRef(false)
  const [fitRequest, setFitRequest] = useState(0)
  /**
   * Bumped by every edit to the track, kart, or settings. A ref, not state:
   * the closures that read it are snapshots taken at render, so a state copy
   * would always compare equal to itself and never detect the edit.
   */
  const inputVersion = useRef(0)
  const markDirty = useCallback(() => {
    inputVersion.current += 1
    setDirty(true)
  }, [])
  const fileInput = useRef<HTMLInputElement>(null)
  const issues = useMemo(
    () => validateSimulationInput(trackHistory.value, kart, settings, t),
    [trackHistory.value, kart, settings, t],
  )
  const hasErrors = issues.some((issue) => issue.level === 'error')
  const playbackFrame = useMemo(
    () => (playbackEnabled ? frameAtElapsed(result, elapsedS) : null),
    [playbackEnabled, result, elapsedS],
  )
  // While the lap is playing back, the charts and the results panel follow the
  // kart instead of the pointer, so every panel reads the same instant.
  const safeSelectedSample = playbackFrame ? playbackFrame.index : clampSelectedSample(selectedSample, result)

  // One clock drives the whole replay. `rate` scales wall-clock advance only:
  // the simulated lap time and every channel stay exactly as solved, so 3x
  // simply finishes the same lap in a third of the real time.
  useEffect(() => {
    if (!playbackEnabled || !playing || !result || !(result.lapTimeS > 0)) return
    let frame = 0
    let previous = performance.now()
    const tick = (now: number) => {
      const deltaS = Math.min(0.25, (now - previous) / 1000)
      previous = now
      setElapsedS((current) => wrapElapsed(current + deltaS * rate, result.lapTimeS))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playbackEnabled, playing, rate, result])

  useEffect(() => {
    setElapsedS(0)
  }, [result])

  useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const probe = () => {
      checkApiHealth().then((available) => {
        if (!cancelled) setApiAvailable(available)
      })
    }
    probe()
    // The engine is a separate local process, so it can appear or disappear
    // after load. Re-probing on focus lets a user start it in a terminal and
    // come back without reloading the page.
    window.addEventListener('focus', probe)
    return () => {
      cancelled = true
      window.removeEventListener('focus', probe)
    }
  }, [])

  useEffect(() => {
    if (!playbackFrame && selectedSample !== safeSelectedSample) setSelectedSample(safeSelectedSample)
  }, [playbackFrame, safeSelectedSample, selectedSample])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.matches('input, select, textarea') || target.isContentEditable)
      ) {
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) trackHistory.redo()
        else trackHistory.undo()
        markDirty()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        trackHistory.redo()
        markDirty()
        return
      }
      // The single-letter tool shortcuts are unmodified keys only. Without this
      // Ctrl+A to select the page armed the add tool, and the next canvas click
      // inserted a control point into the track.
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key.toLowerCase() === 'v') setTool('edit')
      else if (event.key.toLowerCase() === 'a') setTool('add')
      else if (event.key.toLowerCase() === 'h') setTool('pan')
      else if (event.key.toLowerCase() === 'c' && trackHistory.value.background) setTool('calibrate')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [markDirty, trackHistory])

  const updateTrack = useCallback(
    (patch: Partial<TrackInput>) => {
      trackHistory.set((current) => ({ ...current, ...patch }))
      markDirty()
    },
    [markDirty, trackHistory],
  )

  const updateKart = (patch: Partial<KartInput>) => {
    setKart((current) => ({ ...current, ...patch }))
    markDirty()
  }
  const updateSettings = (patch: Partial<SimulationSettings>) => {
    setSettings((current) => ({ ...current, ...patch }))
    markDirty()
  }

  const selectPreset = (key: string) => {
    const next = freshPreset(key)
    trackHistory.set(next)
    setFitRequest((value) => value + 1)
    setSelectedSample(null)
    markDirty()
    setMessage(t('app.statusPresetLoaded', { name: next.name }))
  }

  const simulate = async () => {
    if (hasErrors) {
      setStatus('error')
      setMessage(t('app.statusFixBeforeSimulating'))
      return
    }
    setStatus('running')
    setMessage(t('app.statusSolving'))
    setSelectedSample(null)
    const solvedVersion = inputVersion.current
    try {
      const next = await runSimulation(
        { track: trackHistory.value, kart, settings },
        apiAvailable === true,
        t,
      )
      setResult(next)
      setStatus('success')
      // The track can be edited while the request is in flight. Clearing the
      // stale flag then hid the "Recalculate" affordance while the lap time on
      // screen belonged to the track as it was before the edit.
      const stillCurrent = inputVersion.current === solvedVersion
      if (stillCurrent) setDirty(false)
      setMessage(
        stillCurrent
          ? t(next.source === 'api' ? 'app.statusSolvedApi' : 'app.statusSolvedLocal')
          : t('app.statusSolvedStale'),
      )
      // A browser result does not mean the engine is gone. `api.ts:74` falls
      // back on 429, and MAX_CONCURRENT_COMPUTATIONS is 2, so a second tab can
      // momentarily take both slots -- latching false here stranded this tab on
      // the browser solver until the window lost and regained focus. `/health`
      // sits outside the compute semaphore, so it answers while both are busy.
      if (apiAvailable && next.source === 'browser') {
        void checkApiHealth().then((available) => {
          if (!unmounted.current) setApiAvailable(available)
        })
      }
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : t('app.statusSolveFailed'))
    }
  }

  const exportFile = () => {
    if (hasErrors) {
      setStatus('error')
      setMessage(t('app.statusFixBeforeSaving'))
      return
    }
    const built = toProject(trackHistory.value, kart, settings, t)
    downloadProject(built.project)
    setMessage([t('app.statusProjectSaved'), ...built.warnings].join(' '))
    setStatus('success')
  }

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > INPUT_LIMITS.projectBytes) {
      setStatus('error')
      setMessage(t('app.statusProjectTooLarge'))
      return
    }
    try {
      const imported = parseProject(await file.text(), t)
      trackHistory.reset({
        ...imported.track,
        // An uncalibrated background means the stored trace is still in pixels
        // and its first calibration has to convert it. Anything else is metres.
        tracedOverBackground:
          imported.track.background !== undefined && imported.track.background.scaleMPerPx === undefined,
      })
      setKart(imported.kart)
      setSettings(imported.settings)
      setFitRequest((value) => value + 1)
      setSelectedSample(null)
      markDirty()
      setStatus('success')
      setMessage(
        t(
          imported.track.background && imported.track.background.scaleMPerPx === undefined
            ? 'app.statusImportedNeedsScale'
            : 'app.statusImported',
          { name: file.name },
        ),
      )
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : t('app.statusInvalidFile'))
    }
  }

  const importBackgroundImage = async (file: File) => {
    try {
      const image = await readImageFile(file, t)
      const background = downscaleTrackImage(image, t)
      trackHistory.set((current) => ({ ...current, background }))
      setFitRequest((value) => value + 1)
      markDirty()
      setStatus('success')
      setMessage(t('app.statusImageAdded'))
      setTool('calibrate')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : t('app.statusImageFailed'))
    }
  }

  const removeBackgroundImage = () => {
    trackHistory.set((current) => {
      const next = { ...current }
      delete next.background
      return next
    })
    markDirty()
    if (tool === 'calibrate') setTool('edit')
    setMessage(t('app.statusImageRemoved'))
  }

  const applyCalibration = (pixelDistance: number, realMeters: number) => {
    const newScale = scaleFromCalibration(pixelDistance, realMeters, t)
    trackHistory.set((current) => calibratedTrack(current, newScale))
    markDirty()
    setFitRequest((value) => value + 1)
    setTool('edit')
    setStatus('success')
    setMessage(t('app.statusScaleApplied', { scale: newScale.toFixed(3) }))
  }

  const importGpsFile = async (file: File) => {
    try {
      const imported = parseGpsFile(file.name, await file.text(), t)
      trackHistory.set((current) => ({
        ...current,
        centerline: imported.centerline,
        direction: imported.direction,
        // Projected from GPS, so already metres regardless of any image behind.
        tracedOverBackground: false,
      }))
      setFitRequest((value) => value + 1)
      setSelectedSample(null)
      markDirty()
      setStatus('success')
      setMessage(
        t('app.statusGpsImported', {
          raw: imported.pointCountRaw,
          kept: imported.centerline.length,
          km: (imported.lengthM / 1000).toFixed(2),
        }),
      )
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : t('app.statusGpsFailed'))
    }
  }

  const reset = () => {
    const track = freshPreset('technical')
    trackHistory.reset(track)
    setKart(DEFAULT_KART)
    setSettings(DEFAULT_SETTINGS)
    setResult(simulateInBrowser({ track, kart: DEFAULT_KART, settings: DEFAULT_SETTINGS }, t))
    setDirty(false)
    setSelectedSample(null)
    setFitRequest((value) => value + 1)
    setMessage(t('app.statusExampleRestored'))
    setStatus('success')
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        {t('app.skipToTrack')}
      </a>
      <header className="app-header">
        <a className="brand" href="./" aria-label={t('app.brandHome')}>
          <span className="brand-mark">
            <BrandMark size={34} />
          </span>
          <span>
            <strong>OpenKartLine</strong>
            <small>{t('app.brandTagline')}</small>
          </span>
        </a>
        <div
          className="header-status"
          title={apiAvailable ? t('app.engineTitleConnected') : t('app.engineTitleLocal')}
        >
          <span className={apiAvailable ? 'online' : 'local'} />
          {apiAvailable === null
            ? t('app.engineChecking')
            : apiAvailable
              ? t('app.engineConnected')
              : t('app.engineLocal')}
        </div>
        <nav className="header-actions" aria-label={t('app.projectActions')}>
          <div className="language-switch" role="group" aria-label={t('app.language')}>
            {LOCALES.map((option) => (
              <button
                key={option}
                className={option === locale ? 'active' : ''}
                onClick={() => setLocale(option)}
                aria-pressed={option === locale}
                lang={option}
              >
                {LOCALE_LABEL[option]}
              </button>
            ))}
          </div>
          <button onClick={() => fileInput.current?.click()}>
            <Upload size={16} />
            <span>{t('app.import')}</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.okl.json,application/json"
            className="visually-hidden"
            onChange={importFile}
          />
          <button onClick={exportFile}>
            <Save size={16} />
            <span>{t('app.save')}</span>
          </button>
          <a
            href="https://github.com/Navesz/openkartline"
            target="_blank"
            rel="noreferrer"
            aria-label={t('app.githubAria')}
          >
            <GithubIcon size={18} />
            <span className="desktop-only">{t('app.github')}</span>
          </a>
        </nav>
      </header>

      <main>
        <div className="intro-bar">
          <div>
            <span className="eyebrow">{t('app.introEyebrow')}</span>
            <h1>{t('app.introTitle')}</h1>
            <p>{t('app.introSubtitle')}</p>
          </div>
          <div className="project-actions">
            <button onClick={trackHistory.undo} disabled={!trackHistory.canUndo} title={t('app.undo')}>
              <Undo2 size={16} />
            </button>
            <button onClick={trackHistory.redo} disabled={!trackHistory.canRedo} title={t('app.redo')}>
              <Redo2 size={16} />
            </button>
            <button onClick={reset} title={t('app.restoreExample')}>
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
        <div className="workspace-grid">
          <ControlPanel
            track={trackHistory.value}
            kart={kart}
            settings={settings}
            issues={issues}
            onTrack={updateTrack}
            onKart={updateKart}
            onSettings={updateSettings}
            onPreset={selectPreset}
            onPointChange={(index, point) => {
              trackHistory.set((current) => ({
                ...current,
                centerline: current.centerline.map((candidate, candidateIndex) =>
                  candidateIndex === index ? point : candidate,
                ),
              }))
              markDirty()
            }}
            onPointRemove={(index) => {
              trackHistory.set((current) => ({
                ...current,
                centerline: current.centerline.filter((_, candidateIndex) => candidateIndex !== index),
              }))
              markDirty()
            }}
            onImageFile={importBackgroundImage}
            onRemoveImage={removeBackgroundImage}
            onGpsFile={(file) => void importGpsFile(file)}
          />
          <div className="visual-workspace">
            <TrackCanvas
              track={trackHistory.value}
              result={result}
              selectedSample={safeSelectedSample}
              tool={tool}
              fitRequest={fitRequest}
              playbackEnabled={playbackEnabled}
              playbackFrame={playbackFrame}
              onPlaybackToggle={() => {
                // State updaters must stay pure: StrictMode runs them twice, so
                // driving the other three pieces of playback state from inside
                // one would fire their side effects twice as well.
                const next = !playbackEnabled
                setPlaybackEnabled(next)
                setPlaying(next)
                if (!next) setElapsedS(0)
              }}
              onToolChange={setTool}
              onPointsChange={(centerline, checkpoint = true) => {
                trackHistory.set(
                  (current) => ({
                    ...current,
                    centerline,
                    // Points moved while the image has no scale yet are being
                    // drawn in its pixels, so calibration must convert them.
                    tracedOverBackground:
                      current.tracedOverBackground ??
                      (current.background !== undefined && current.background.scaleMPerPx === undefined),
                  }),
                  checkpoint,
                )
                markDirty()
              }}
              onSelectedSample={(index) => setSelectedSample(clampSelectedSample(index, result))}
              onCalibrate={applyCalibration}
            />
            <div className={`run-bar ${status}`} role="status" aria-live="polite">
              <span className="run-message">
                {status === 'running' ? (
                  <LoaderCircle className="spin" size={17} />
                ) : status === 'error' ? (
                  <CloudOff size={17} />
                ) : (
                  <Check size={17} />
                )}
                {message}
              </span>
              <button
                className="simulate-button"
                onClick={simulate}
                disabled={status === 'running' || hasErrors}
              >
                <Play size={17} fill="currentColor" />
                {status === 'running'
                  ? t('app.runCalculating')
                  : dirty
                    ? t('app.runRecalculate')
                    : t('app.runAgain')}
              </button>
            </div>
            {playbackFrame && (
              <PlaybackBar
                frame={playbackFrame}
                lapTimeS={result.lapTimeS}
                playing={playing}
                rate={rate}
                onPlayingChange={setPlaying}
                onRateChange={setRate}
                onSeek={(next) => setElapsedS(wrapElapsed(next, result.lapTimeS))}
              />
            )}
            {result && (
              <LapCharts
                result={result}
                selectedSample={safeSelectedSample}
                onSelectedSample={(index) =>
                  playbackEnabled ? undefined : setSelectedSample(clampSelectedSample(index, result))
                }
              />
            )}
          </div>
          <ResultsPanel
            result={result}
            dirty={dirty}
            selectedSample={safeSelectedSample}
            onSelect={(index) => setSelectedSample(clampSelectedSample(index, result))}
          />
        </div>
      </main>
      <footer>
        <span>{t('app.footerTagline')}</span>
        <span>{t('app.footerDisclaimer')}</span>
        <a href="https://github.com/Navesz/openkartline" target="_blank" rel="noreferrer">
          <Download size={14} /> {t('app.footerSource')}
        </a>
      </footer>
    </div>
  )
}
