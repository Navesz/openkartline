import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { frameAtElapsed } from '../domain/playback'
import { DEFAULT_KART, PRESETS } from '../domain/presets'
import { simulateInBrowser } from '../domain/simulator'
import { PlaybackBar } from './PlaybackBar'

const result = simulateInBrowser({
  track: PRESETS.technical,
  kart: DEFAULT_KART,
  settings: { safetyMarginM: 0.15, sampleCount: 200 },
})

function renderBar(overrides: Partial<Parameters<typeof PlaybackBar>[0]> = {}) {
  const props = {
    frame: frameAtElapsed(result, result.lapTimeS * 0.4)!,
    lapTimeS: result.lapTimeS,
    playing: true,
    rate: 1 as const,
    onPlayingChange: vi.fn(),
    onRateChange: vi.fn(),
    onSeek: vi.fn(),
    ...overrides,
  }
  render(<PlaybackBar {...props} />)
  return props
}

describe('PlaybackBar', () => {
  it('shows the simulated lap clock next to how long the replay takes', () => {
    // The rate must never look like it changed the lap itself, so both clocks
    // are on screen at once.
    renderBar({ rate: 3 })
    const lapTime = result.lapTimeS.toFixed(2)
    expect(screen.getByText(new RegExp(`/ ${lapTime} s`))).toBeInTheDocument()
    expect(
      screen.getByText(`volta simulada · reprodução 3x leva ${(result.lapTimeS / 3).toFixed(2)} s`),
    ).toBeInTheDocument()
  })

  it('reports the kart state at the current instant', () => {
    const props = renderBar()
    expect(screen.getByText(`${(props.frame.speedMps * 3.6).toFixed(0)}`)).toBeInTheDocument()
    expect(screen.getByText(`${props.frame.distanceM.toFixed(0)} m`)).toBeInTheDocument()
  })

  it('pauses and resumes without touching the clock', async () => {
    const props = renderBar({ playing: true })
    await userEvent.click(screen.getByRole('button', { name: 'Pausar reprodução' }))
    expect(props.onPlayingChange).toHaveBeenCalledWith(false)
    expect(props.onSeek).not.toHaveBeenCalled()
  })

  it('offers every playback rate and marks the active one', async () => {
    const props = renderBar({ rate: 2 })
    expect(screen.getByRole('button', { name: '2x' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '1x' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: '3x' }))
    expect(props.onRateChange).toHaveBeenCalledWith(3)
  })

  it('seeks back to the start line', async () => {
    const props = renderBar()
    await userEvent.click(screen.getByRole('button', { name: 'Voltar para a largada' }))
    expect(props.onSeek).toHaveBeenCalledWith(0)
  })

  it('scrubs to an arbitrary point in the lap', () => {
    const props = renderBar({ playing: false })
    const scrub = screen.getByRole('slider')
    expect(scrub).toHaveAttribute('max', String(result.lapTimeS))
    const target = result.lapTimeS * 0.75
    fireEvent.change(scrub, { target: { value: String(target) } })
    expect(props.onSeek).toHaveBeenCalledWith(target)
  })

  it('switches the play control when paused', () => {
    renderBar({ playing: false })
    expect(screen.getByRole('button', { name: 'Reproduzir volta' })).toBeInTheDocument()
  })
})
