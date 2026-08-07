import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PRESETS } from '../domain/presets'
import { TrackCanvas } from './TrackCanvas'

describe('TrackCanvas', () => {
  it('adds a control point when the add tool clicks the grid background', () => {
    const onPointsChange = vi.fn()
    render(
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
})
