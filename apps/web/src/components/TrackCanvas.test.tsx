import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

function renderEditor(onPointsChange: ReturnType<typeof vi.fn>) {
  const view = renderCanvas(
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
      onPointsChange={onPointsChange}
      onSelectedSample={vi.fn()}
      onCalibrate={vi.fn()}
    />,
  )
  const handles = view.container.querySelectorAll('.control-hit')
  return { svg: screen.getByRole('img'), handles }
}

/**
 * jsdom ships no `PointerEvent`, and `fireEvent.pointerDown(el, { pointerId })`
 * silently drops the id — every pointer arrives as `undefined`, which compares
 * equal to every other. Tests about *which* pointer owns a gesture therefore
 * have to carry the id on the native event themselves.
 */
function pointerEvent(type: string, init: { pointerId: number; clientX?: number; clientY?: number }): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
  })
  Object.defineProperty(event, 'pointerId', { value: init.pointerId })
  return event
}

describe('TrackCanvas control-point drags', () => {
  // jsdom implements neither of these; without them the pointerdown handler
  // throws before it can record which pointer owns the drag.
  beforeEach(() => {
    Element.prototype.setPointerCapture = vi.fn()
    Element.prototype.releasePointerCapture = vi.fn()
  })

  it('does not touch the track for a click that never moves', () => {
    // Pointerdown used to push a checkpoint holding the unchanged centerline,
    // so a plain click marked the project dirty, showed the stale note, and
    // left an undo entry identical to the present -- the first Ctrl+Z was a
    // no-op.
    const onPointsChange = vi.fn()
    const { svg, handles } = renderEditor(onPointsChange)

    fireEvent(handles[0], pointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }))
    fireEvent(svg, pointerEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 }))

    expect(onPointsChange).not.toHaveBeenCalled()
  })

  it('checkpoints once, on the first movement of the drag', () => {
    const onPointsChange = vi.fn()
    const { svg, handles } = renderEditor(onPointsChange)

    fireEvent(handles[0], pointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }))
    fireEvent(svg, pointerEvent('pointermove', { pointerId: 1, clientX: 20, clientY: 20 }))
    fireEvent(svg, pointerEvent('pointermove', { pointerId: 1, clientX: 30, clientY: 30 }))
    fireEvent(svg, pointerEvent('pointermove', { pointerId: 1, clientX: 40, clientY: 40 }))

    expect(onPointsChange).toHaveBeenCalledTimes(3)
    const checkpoints = onPointsChange.mock.calls.filter((call) => call[1] !== false)
    expect(checkpoints).toHaveLength(1)
    expect(onPointsChange.mock.calls[0][1]).not.toBe(false)
  })

  it('ignores a pointer that did not start the drag', () => {
    // `dragPoint` was a bare index, so a second finger landing on another
    // handle overwrote it and both pointers then steered the newly grabbed
    // point while the first was abandoned mid-gesture.
    const onPointsChange = vi.fn()
    const { svg, handles } = renderEditor(onPointsChange)

    fireEvent(handles[0], pointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }))
    onPointsChange.mockClear()
    fireEvent(svg, pointerEvent('pointermove', { pointerId: 2, clientX: 90, clientY: 90 }))

    expect(onPointsChange).not.toHaveBeenCalled()
  })

  it('keeps dragging when an unrelated pointer is released', () => {
    const onPointsChange = vi.fn()
    const { svg, handles } = renderEditor(onPointsChange)

    fireEvent(handles[0], pointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }))
    fireEvent(svg, pointerEvent('pointerup', { pointerId: 2, clientX: 90, clientY: 90 }))
    onPointsChange.mockClear()
    fireEvent(svg, pointerEvent('pointermove', { pointerId: 1, clientX: 50, clientY: 50 }))

    expect(onPointsChange).toHaveBeenCalledTimes(1)
  })
})
