import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PRESETS } from '../domain/presets'
import { I18nProvider } from '../i18n/I18nProvider'
import { TrackCanvas } from './TrackCanvas'

function renderCanvas(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

describe('TrackCanvas', () => {
  it('adds a control point when the add tool clicks the grid background', () => {
    const onPointsChange = vi.fn()
    renderCanvas(
      <TrackCanvas
        track={PRESETS.oval}
        result={null}
        selectedSample={null}
        tool="add"
        fitRequest={0}
        playbackEnabled={false}
        playbackFrame={null}
        onPlaybackToggle={vi.fn()}
        onToolChange={vi.fn()}
        onPointsChange={onPointsChange}
        onSelectedSample={vi.fn()}
        onCalibrate={vi.fn()}
      />,
    )
    const svg = screen.getByRole('img')
    Object.defineProperty(svg, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 500,
        right: 800,
        bottom: 500,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })
    fireEvent.pointerDown(svg.querySelector('.canvas-bg')!, { clientX: 400, clientY: 250, button: 0 })
    expect(onPointsChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })]),
    )
    expect(onPointsChange.mock.calls[0][0]).toHaveLength(PRESETS.oval.centerline.length + 1)
  })

  it('draws with +y upwards, so a clockwise lap reads clockwise on screen', () => {
    // Track coordinates are metric with +y north. SVG y grows downward, so
    // drawing them straight in mirrored every circuit vertically and made the
    // direction control read backwards. The flip is the fix; assert it stays.
    renderCanvas(
      <TrackCanvas
        track={PRESETS.oval}
        result={null}
        selectedSample={null}
        tool="edit"
        fitRequest={0}
        playbackEnabled={false}
        playbackFrame={null}
        onPlaybackToggle={vi.fn()}
        onToolChange={vi.fn()}
        onPointsChange={vi.fn()}
        onSelectedSample={vi.fn()}
        onCalibrate={vi.fn()}
      />,
    )
    const svg = screen.getByRole('img')
    const group = svg.querySelector('g[transform="scale(1, -1)"]')
    expect(group).not.toBeNull()

    // Every drawn control point sits inside that group, so the geometry really
    // is flipped rather than a decorative wrapper.
    const points = [...svg.querySelectorAll('.control-point')]
    expect(points.length).toBe(PRESETS.oval.centerline.length)
    expect(points.every((circle) => group!.contains(circle))).toBe(true)

    // Screen y of the northernmost point is -worldTop, which has to land in the
    // upper half of the visible window.
    const [, viewBoxY, , viewBoxHeight] = svg.getAttribute('viewBox')!.split(' ').map(Number)
    const worldTop = Math.max(...PRESETS.oval.centerline.map((point) => point.y))
    expect((-worldTop - viewBoxY) / viewBoxHeight).toBeLessThan(0.5)
  })
})
