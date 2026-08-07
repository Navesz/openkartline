import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  CloudOff,
  Download,
  Github,
  LoaderCircle,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
  Upload,
} from 'lucide-react'
import { ControlPanel } from './components/ControlPanel'
import { LapCharts } from './components/LapCharts'
import { ResultsPanel } from './components/ResultsPanel'
import { TrackCanvas, type EditorTool } from './components/TrackCanvas'
import { clonePoints, DEFAULT_KART, PRESETS } from './domain/presets'
import { clampSelectedSample } from './domain/selection'
import { simulateInBrowser } from './domain/simulator'
import type { KartInput, SimulationResult, SimulationSettings, TrackInput } from './domain/types'
import { INPUT_LIMITS, validateSimulationInput } from './domain/validation'
import { useHistory } from './hooks/useHistory'
import { checkApiHealth, runSimulation } from './services/api'
import { downloadProject, parseProject, toProject } from './services/projectFile'

const DEFAULT_SETTINGS: SimulationSettings = { safetyMarginM: 0.55, sampleCount: 200 }

function freshPreset(key: string): TrackInput {
  const preset = PRESETS[key] ?? PRESETS.technical
  return { ...preset, centerline: clonePoints(preset.centerline) }
}

export default function App() {
  const trackHistory = useHistory<TrackInput>(freshPreset('technical'))
  const [kart, setKart] = useState<KartInput>(DEFAULT_KART)
  const [settings, setSettings] = useState<SimulationSettings>(DEFAULT_SETTINGS)
  const [result, setResult] = useState<SimulationResult>(() =>
    simulateInBrowser({ track: freshPreset('technical'), kart: DEFAULT_KART, settings: DEFAULT_SETTINGS }),
  )
  const [selectedSample, setSelectedSample] = useState<number | null>(null)
  const [tool, setTool] = useState<EditorTool>('edit')
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null)
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('success')
  const [message, setMessage] = useState('Exemplo pronto para explorar.')
  const [dirty, setDirty] = useState(false)
  const [fitRequest, setFitRequest] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const issues = useMemo(
    () => validateSimulationInput(trackHistory.value, kart, settings),
    [trackHistory.value, kart, settings],
  )
  const hasErrors = issues.some((issue) => issue.level === 'error')
  const safeSelectedSample = clampSelectedSample(selectedSample, result)

  useEffect(() => {
    checkApiHealth().then(setApiAvailable)
  }, [])

  useEffect(() => {
    if (selectedSample !== safeSelectedSample) setSelectedSample(safeSelectedSample)
  }, [safeSelectedSample, selectedSample])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.matches('input, select, textarea')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) trackHistory.redo()
        else trackHistory.undo()
        setDirty(true)
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        trackHistory.redo()
        setDirty(true)
      } else if (event.key.toLowerCase() === 'v') setTool('edit')
      else if (event.key.toLowerCase() === 'a') setTool('add')
      else if (event.key.toLowerCase() === 'h') setTool('pan')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [trackHistory])

  const updateTrack = useCallback(
    (patch: Partial<TrackInput>) => {
      trackHistory.set((current) => ({ ...current, ...patch }))
      setDirty(true)
    },
    [trackHistory],
  )

  const updateKart = (patch: Partial<KartInput>) => {
    setKart((current) => ({ ...current, ...patch }))
    setDirty(true)
  }
  const updateSettings = (patch: Partial<SimulationSettings>) => {
    setSettings((current) => ({ ...current, ...patch }))
    setDirty(true)
  }

  const selectPreset = (key: string) => {
    const next = freshPreset(key)
    trackHistory.set(next)
    setFitRequest((value) => value + 1)
    setSelectedSample(null)
    setDirty(true)
    setMessage(`${next.name} carregado. Ajuste os pontos ou simule.`)
  }

  const simulate = async () => {
    if (hasErrors) {
      setStatus('error')
      setMessage('Corrija os campos destacados antes de simular.')
      return
    }
    setStatus('running')
    setMessage('Calculando trajetória e perfil de velocidade…')
    setSelectedSample(null)
    await new Promise((resolve) => window.setTimeout(resolve, 160))
    try {
      const next = await runSimulation({ track: trackHistory.value, kart, settings }, apiAvailable === true)
      setResult(next)
      setStatus('success')
      setDirty(false)
      setMessage(
        next.source === 'api'
          ? 'Referência calculada pelo motor físico MVP.'
          : 'Referência calculada localmente no navegador.',
      )
      if (apiAvailable && next.source === 'browser') setApiAvailable(false)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Não foi possível executar a simulação.')
    }
  }

  const exportFile = () => {
    if (hasErrors) {
      setStatus('error')
      setMessage('Corrija os campos destacados antes de salvar o projeto.')
      return
    }
    downloadProject(toProject(trackHistory.value, kart, settings))
    setMessage('Projeto .okl.json salvo no seu dispositivo.')
    setStatus('success')
  }

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > INPUT_LIMITS.projectBytes) {
      setStatus('error')
      setMessage('O projeto excede o limite de 1 MiB.')
      return
    }
    try {
      const imported = parseProject(await file.text())
      trackHistory.reset(imported.track)
      setKart(imported.kart)
      setSettings(imported.settings)
      setFitRequest((value) => value + 1)
      setSelectedSample(null)
      setDirty(true)
      setStatus('success')
      setMessage(`${file.name} importado com sucesso.`)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Arquivo inválido.')
    }
  }

  const reset = () => {
    const track = freshPreset('technical')
    trackHistory.reset(track)
    setKart(DEFAULT_KART)
    setSettings(DEFAULT_SETTINGS)
    setResult(simulateInBrowser({ track, kart: DEFAULT_KART, settings: DEFAULT_SETTINGS }))
    setDirty(false)
    setSelectedSample(null)
    setFitRequest((value) => value + 1)
    setMessage('Exemplo restaurado.')
    setStatus('success')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="./" aria-label="OpenKartLine — início">
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>OpenKartLine</strong>
            <small>RACING LINE LAB</small>
          </span>
        </a>
        <div className="header-status" title={apiAvailable ? 'API conectada' : 'Simulador local ativo'}>
          <span className={apiAvailable ? 'online' : 'local'} />
          {apiAvailable === null ? 'Verificando motor…' : apiAvailable ? 'Motor MVP conectado' : 'Modo local'}
        </div>
        <nav className="header-actions" aria-label="Ações do projeto">
          <button onClick={() => fileInput.current?.click()}>
            <Upload size={16} />
            <span>Importar</span>
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
            <span>Salvar</span>
          </button>
          <a
            href="https://github.com/Navesz/openkartline"
            target="_blank"
            rel="noreferrer"
            aria-label="Abrir OpenKartLine no GitHub"
          >
            <Github size={18} />
            <span className="desktop-only">GitHub</span>
          </a>
        </nav>
      </header>

      <main>
        <div className="intro-bar">
          <div>
            <span className="eyebrow">PLANEJAMENTO DE TRAJETÓRIA</span>
            <h1>Planeje uma volta melhor.</h1>
            <p>Desenhe a pista, descreva seu kart e transforme física em referências práticas.</p>
          </div>
          <div className="project-actions">
            <button onClick={trackHistory.undo} disabled={!trackHistory.canUndo} title="Desfazer (Ctrl+Z)">
              <Undo2 size={16} />
            </button>
            <button onClick={trackHistory.redo} disabled={!trackHistory.canRedo} title="Refazer (Ctrl+Y)">
              <Redo2 size={16} />
            </button>
            <button onClick={reset} title="Restaurar exemplo">
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
              setDirty(true)
            }}
            onPointRemove={(index) => {
              trackHistory.set((current) => ({
                ...current,
                centerline: current.centerline.filter((_, candidateIndex) => candidateIndex !== index),
              }))
              setDirty(true)
            }}
          />
          <div className="visual-workspace">
            <TrackCanvas
              track={trackHistory.value}
              result={result}
              selectedSample={safeSelectedSample}
              tool={tool}
              fitRequest={fitRequest}
              onToolChange={setTool}
              onPointsChange={(centerline, checkpoint = true) => {
                trackHistory.set((current) => ({ ...current, centerline }), checkpoint)
                setDirty(true)
              }}
              onSelectedSample={(index) => setSelectedSample(clampSelectedSample(index, result))}
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
                {status === 'running' ? 'Calculando…' : dirty ? 'Recalcular volta' : 'Simular novamente'}
              </button>
            </div>
            {result && (
              <LapCharts
                result={result}
                selectedSample={safeSelectedSample}
                onSelectedSample={(index) => setSelectedSample(clampSelectedSample(index, result))}
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
        <span>OpenKartLine · aberto, reproduzível e feito para aprender</span>
        <span>A simulação é uma estimativa. Pilote dentro dos seus limites e das regras da pista.</span>
        <a href="https://github.com/Navesz/openkartline" target="_blank" rel="noreferrer">
          <Download size={14} /> Código aberto
        </a>
      </footer>
    </div>
  )
}
