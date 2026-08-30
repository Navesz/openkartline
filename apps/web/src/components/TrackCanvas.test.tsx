import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { DEFAULT_KART, PRESETS } from '../domain/presets'
import { simulateInBrowser } from '../domain/simulator'
import type { Point } from '../domain/types'
import { INPUT_LIMITS } from '../domain/validation'
import { I18nProvider } from '../i18n/I18nProvider'
import { TrackCanvas, type EditorTool } from './TrackCanvas'

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

// Typed by signature, not just as "some mock". `ReturnType<typeof vi.fn>` was
// `Mock<Procedure>` under vitest 3, which accepted anything; under vitest 4 it
// widened to `Mock<Procedure | Constructable>` and stopped being assignable to
// the prop at all. Naming the signature fixes the error and is stricter than
// what it replaces -- passing a wrong argument here is now a type error.
function renderEditor(onPointsChange: Mock<(points: Point[], checkpoint?: boolean) => void>) {
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

type CanvasProps = React.ComponentProps<typeof TrackCanvas>

/**
 * Every prop the canvas needs, so a test can name only the one it is about.
 * The mocks are made per call on purpose: a shared one would reach the next
 * test still holding the previous test's calls.
 */
function canvasProps(overrides: Partial<CanvasProps> = {}): CanvasProps {
  return {
    track: PRESETS.oval,
    result: null,
    selectedSample: null,
    tool: 'edit',
    fitRequest: 0,
    playbackEnabled: false,
    playbackFrame: null,
    onPlaybackToggle: vi.fn(),
    onToolChange: vi.fn(),
    onPointsChange: vi.fn(),
    onSelectedSample: vi.fn(),
    onCalibrate: vi.fn(),
    ...overrides,
  }
}

/**
 * jsdom lays nothing out, so the surface really measures 0x0 and every client
 * coordinate collapses onto the same world point. This is the window all the
 * hand-computed expectations below are derived from: 800x500 CSS pixels, at
 * the viewport origin unless a test moves it.
 */
function stubRect(svg: Element, { left = 0, top = 0 } = {}) {
  const rect = {
    left,
    top,
    width: 800,
    height: 500,
    right: left + 800,
    bottom: top + 500,
    x: left,
    y: top,
    toJSON: () => ({}),
  }
  Object.defineProperty(svg, 'getBoundingClientRect', { value: () => rect, configurable: true })
}

/**
 * The attribute is written flipped -- its y is `-(y + height)`, undoing the
 * scene group's `scale(1, -1)` -- so read it back into the world rectangle the
 * user is actually looking at.
 */
function readViewBox(svg: Element) {
  const [x, flippedY, width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number)
  return { x, y: -flippedY - height, width, height }
}

/**
 * What `fitPoints` makes of the oval on mount: xs 10..96 and ys 12..87, each
 * padded by 28 and centred. Most of the numbers below are derived from this
 * box and the 800x500 window above.
 */
const OVAL_VIEW = { x: -4, y: -2, width: 114, height: 103 }

/**
 * Renders with a measurable surface and keeps the wrapper, so a test can push
 * new props at the *same* mounted canvas. That is how the App drives it, and
 * the only way to see what a prop change does to a viewport the user has
 * already moved.
 */
function mountCanvas(initial: CanvasProps) {
  let props = initial
  const view = renderCanvas(<TrackCanvas {...props} />)
  const svg = screen.getByRole('img')
  stubRect(svg)
  return {
    ...view,
    svg,
    update(next: Partial<CanvasProps>) {
      props = { ...props, ...next }
      view.rerender(
        <I18nProvider>
          <TrackCanvas {...props} />
        </I18nProvider>,
      )
    },
  }
}

// jsdom does ship `PointerEvent` in the version this suite runs on -- the
// helper above predates that -- so `fireEvent.pointerDown` carries clientX,
// clientY and pointerId through intact. Every coordinate asserted below rests
// on that: if it ever stops being true they arrive as NaN, which
// `expect.any(Number)` would have accepted but `toBeCloseTo` will not.
describe('TrackCanvas tools', () => {
  // jsdom implements neither, and both the drag and the pan handler call the
  // first thing they do.
  beforeEach(() => {
    Element.prototype.setPointerCapture = vi.fn()
    Element.prototype.releasePointerCapture = vi.fn()
  })

  it('adds the point where the pointer is, in the segment it was dropped on', () => {
    // Client (400, 400) of an 800x500 window over the fitted oval is world
    // (53, 18.6): 6.6 m off the straight between points 2 and 3, and much
    // further from every other segment. Both halves matter. A wrong transform
    // puts the point somewhere the user did not click, and appending it to the
    // end instead of splitting the nearest segment threads the lap straight
    // across the middle of the circuit.
    const onPointsChange: Mock<(points: Point[], checkpoint?: boolean) => void> = vi.fn()
    const { svg, container } = mountCanvas(canvasProps({ tool: 'add', onPointsChange }))

    fireEvent.pointerDown(container.querySelector('.canvas-bg')!, {
      clientX: 400,
      clientY: 400,
      button: 0,
    })

    expect(svg.getAttribute('viewBox')).toBe('-4 -101 114 103')
    expect(onPointsChange).toHaveBeenCalledTimes(1)
    const next = onPointsChange.mock.calls[0][0]
    expect(next).toHaveLength(PRESETS.oval.centerline.length + 1)
    expect(next[3].x).toBeCloseTo(53, 6)
    expect(next[3].y).toBeCloseTo(18.6, 6)
    expect(next.filter((_, index) => index !== 3)).toEqual(PRESETS.oval.centerline)
  })

  it('leaves the track alone when the same click lands under another tool', () => {
    for (const tool of ['edit', 'pan', 'calibrate'] as EditorTool[]) {
      const onPointsChange: Mock<(points: Point[], checkpoint?: boolean) => void> = vi.fn()
      const view = mountCanvas(canvasProps({ tool, onPointsChange }))

      fireEvent.pointerDown(view.container.querySelector('.canvas-bg')!, {
        clientX: 400,
        clientY: 400,
        button: 0,
      })

      expect(onPointsChange).not.toHaveBeenCalled()
      view.unmount()
    }
  })

  it('stops adding at the control-point ceiling', () => {
    // The ceiling is a validation limit, so clicking past it builds a track
    // the next run refuses, with nothing but Ctrl+Z to get back under it.
    const onPointsChange: Mock<(points: Point[], checkpoint?: boolean) => void> = vi.fn()
    const full = {
      ...PRESETS.oval,
      centerline: Array.from({ length: INPUT_LIMITS.controlPointsMax }, (_, index) => {
        const angle = (index / INPUT_LIMITS.controlPointsMax) * Math.PI * 2
        return { x: 50 + 40 * Math.cos(angle), y: 50 + 25 * Math.sin(angle) }
      }),
    }
    const { container } = mountCanvas(canvasProps({ tool: 'add', track: full, onPointsChange }))

    fireEvent.pointerDown(container.querySelector('.canvas-bg')!, {
      clientX: 400,
      clientY: 400,
      button: 0,
    })

    expect(onPointsChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /point/i })).toBeDisabled()
  })

  it('selects the event marker under an add-tool click instead of adding there', () => {
    // The markers sit on top of the surface, and clicking one is how a driver
    // jumps to that corner. Without the `.event-marker` guard the add tool
    // would drop a control point onto the lap every time they did.
    const result = simulateInBrowser({
      track: PRESETS.technical,
      kart: DEFAULT_KART,
      settings: { safetyMarginM: 0.55, sampleCount: 200 },
    })
    expect(result.events.length).toBeGreaterThan(0)
    const onPointsChange: Mock<(points: Point[], checkpoint?: boolean) => void> = vi.fn()
    const onSelectedSample: Mock<(index: number | null) => void> = vi.fn()
    const { container } = mountCanvas(
      canvasProps({
        tool: 'add',
        track: PRESETS.technical,
        result,
        onPointsChange,
        onSelectedSample,
      }),
    )

    const marker = container.querySelector('.event-marker')!
    // On the circle, not on the group: the guard has to walk up the ancestors,
    // which is why it is `closest` and not `matches`.
    fireEvent.pointerDown(marker.querySelector('circle')!, { clientX: 400, clientY: 400, button: 0 })
    fireEvent.click(marker)

    expect(onPointsChange).not.toHaveBeenCalled()
    expect(onSelectedSample).toHaveBeenCalledWith(result.events[0].sampleIndex)
  })

  it('drags the grabbed point to the pointer, and moves nothing else', () => {
    // Client (600, 100) is world (81.5, 80.4) in the fitted oval -- the far
    // side of the circuit from point 0 at (10, 50), so a drag that moved the
    // wrong point, or one reading a stale transform, cannot land here by
    // accident.
    const onPointsChange: Mock<(points: Point[], checkpoint?: boolean) => void> = vi.fn()
    const { svg, container } = mountCanvas(canvasProps({ tool: 'edit', onPointsChange }))
    const handles = container.querySelectorAll('.control-hit')

    fireEvent.pointerDown(handles[0], { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 600, clientY: 100 })

    const next = onPointsChange.mock.calls.at(-1)![0]
    expect(next).toHaveLength(PRESETS.oval.centerline.length)
    expect(next[0].x).toBeCloseTo(81.5, 6)
    expect(next[0].y).toBeCloseTo(80.4, 6)
    expect(next.slice(1)).toEqual(PRESETS.oval.centerline.slice(1))
  })

  it('offers the drag handles only under the edit tool', () => {
    // The handles are the only way to grab a point, so their absence is what
    // makes a drag a no-op under every other tool.
    const edit = renderCanvas(<TrackCanvas {...canvasProps({ tool: 'edit' })} />)
    expect(edit.container.querySelectorAll('.control-hit')).toHaveLength(PRESETS.oval.centerline.length)
    edit.unmount()

    for (const tool of ['add', 'pan', 'calibrate'] as EditorTool[]) {
      const view = renderCanvas(<TrackCanvas {...canvasProps({ tool })} />)
      expect(view.container.querySelectorAll('.control-hit')).toHaveLength(0)
      view.unmount()
    }
  })

  it('removes the last point and only the last point', () => {
    const onPointsChange: Mock<(points: Point[], checkpoint?: boolean) => void> = vi.fn()
    mountCanvas(canvasProps({ tool: 'edit', onPointsChange }))

    fireEvent.click(screen.getByRole('button', { name: /remove last/i }))

    expect(onPointsChange).toHaveBeenCalledTimes(1)
    expect(onPointsChange.mock.calls[0][0]).toEqual(PRESETS.oval.centerline.slice(0, -1))
  })

  it('refuses to remove below the four points a track needs', () => {
    // Four is the validation floor: below it there is no closed lap left to
    // build a corridor around, so the button has to stop there rather than let
    // the editor click its way into a track that cannot be run.
    const onPointsChange: Mock<(points: Point[], checkpoint?: boolean) => void> = vi.fn()
    const square = {
      ...PRESETS.oval,
      centerline: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
        { x: 0, y: 40 },
      ],
    }
    const { unmount } = mountCanvas(canvasProps({ tool: 'edit', track: square, onPointsChange }))

    const button = screen.getByRole('button', { name: /remove last/i })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onPointsChange).not.toHaveBeenCalled()
    unmount()

    // One above the floor it has to work, or "disabled" would be indis-
    // tinguishable from "always disabled".
    const five = { ...square, centerline: [...square.centerline, { x: 20, y: 60 }] }
    mountCanvas(canvasProps({ tool: 'edit', track: five, onPointsChange }))
    expect(screen.getByRole('button', { name: /remove last/i })).toBeEnabled()
  })

  it('hides the remove button outside the edit tool', () => {
    for (const tool of ['add', 'pan', 'calibrate'] as EditorTool[]) {
      const view = mountCanvas(canvasProps({ tool }))
      expect(screen.queryByRole('button', { name: /remove last/i })).toBeNull()
      view.unmount()
    }
  })
})

describe('TrackCanvas viewport', () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = vi.fn()
    Element.prototype.releasePointerCapture = vi.fn()
  })

  /**
   * The mapping the component documents, restated so the zoom tests can talk
   * about "the world point under the cursor". It is deliberately a restatement
   * and not a check of the mapping itself -- the add-tool tests above pin that
   * against numbers worked out by hand.
   */
  const worldAt = (view: ReturnType<typeof readViewBox>, clientX: number, clientY: number) => ({
    x: view.x + (clientX / 800) * view.width,
    y: view.y + view.height - (clientY / 500) * view.height,
  })

  it('zooms about the cursor rather than the centre of the view', () => {
    // Anchoring is the whole point of wheel zoom: whatever the pointer is over
    // has to stay under it, or zooming into a corner walks that corner off
    // screen. The cursor here is deliberately off centre -- three quarters
    // across, one fifth down -- so a centre-anchored zoom cannot pass.
    const { svg } = mountCanvas(canvasProps({ tool: 'edit' }))
    const before = readViewBox(svg)
    expect(before).toEqual(OVAL_VIEW)
    const anchor = worldAt(before, 600, 100)

    fireEvent.wheel(svg, { deltaY: -100, clientX: 600, clientY: 100 })

    const zoomedIn = readViewBox(svg)
    expect(zoomedIn.width).toBeLessThan(before.width)
    expect(zoomedIn.height / zoomedIn.width).toBeCloseTo(before.height / before.width, 9)
    expect(worldAt(zoomedIn, 600, 100).x).toBeCloseTo(anchor.x, 6)
    expect(worldAt(zoomedIn, 600, 100).y).toBeCloseTo(anchor.y, 6)

    fireEvent.wheel(svg, { deltaY: 100, clientX: 600, clientY: 100 })

    const zoomedOut = readViewBox(svg)
    expect(zoomedOut.width).toBeGreaterThan(zoomedIn.width)
    expect(worldAt(zoomedOut, 600, 100).x).toBeCloseTo(anchor.x, 6)
    expect(worldAt(zoomedOut, 600, 100).y).toBeCloseTo(anchor.y, 6)
  })

  it('stops at the zoom limits instead of running away', () => {
    // Without the clamp a few flicks of a trackpad leave the user looking at
    // empty grid, with the track a sub-pixel dot they cannot find again except
    // through Fit.
    const { svg } = mountCanvas(canvasProps({ tool: 'edit' }))

    for (let notch = 0; notch < 25; notch += 1) {
      fireEvent.wheel(svg, { deltaY: 120, clientX: 400, clientY: 250 })
    }
    expect(readViewBox(svg).width).toBe(600)

    for (let notch = 0; notch < 40; notch += 1) {
      fireEvent.wheel(svg, { deltaY: -120, clientX: 400, clientY: 250 })
    }
    expect(readViewBox(svg).width).toBe(25)
  })

  it('pans with the pointer, in world terms, without touching the geometry', () => {
    // Dragging 100 px right across an 800 px window moves the world window
    // 114 * 100/800 = 14.25 m left, so the track follows the hand. Dragging
    // 50 px down moves it 103 * 50/500 = 10.3 m *up* in world terms, because
    // screen y is flipped: with that sign wrong the track runs away from the
    // pointer vertically while following it horizontally.
    const onPointsChange: Mock<(points: Point[], checkpoint?: boolean) => void> = vi.fn()
    const { svg } = mountCanvas(canvasProps({ tool: 'pan', onPointsChange }))
    expect(svg.style.cursor).toBe('grab')

    fireEvent.pointerDown(svg, { pointerId: 4, clientX: 100, clientY: 100, button: 0 })
    expect(svg.style.cursor).toBe('grabbing')
    fireEvent.pointerMove(svg, { pointerId: 4, clientX: 200, clientY: 150 })

    const after = readViewBox(svg)
    expect(after.x).toBeCloseTo(OVAL_VIEW.x - 14.25, 6)
    expect(after.y).toBeCloseTo(OVAL_VIEW.y + 10.3, 6)
    expect(after.width).toBe(OVAL_VIEW.width)
    expect(after.height).toBe(OVAL_VIEW.height)
    expect(onPointsChange).not.toHaveBeenCalled()
  })

  it('re-frames the whole track when fit is pressed', () => {
    const { svg } = mountCanvas(canvasProps({ tool: 'pan' }))

    fireEvent.wheel(svg, { deltaY: -100, clientX: 600, clientY: 100 })
    fireEvent.pointerDown(svg, { pointerId: 5, clientX: 100, clientY: 100, button: 0 })
    fireEvent.pointerMove(svg, { pointerId: 5, clientX: 300, clientY: 400 })
    fireEvent.pointerUp(svg, { pointerId: 5, clientX: 300, clientY: 400 })
    expect(readViewBox(svg)).not.toEqual(OVAL_VIEW)

    fireEvent.click(screen.getByRole('button', { name: /fit/i }))

    expect(readViewBox(svg)).toEqual(OVAL_VIEW)
  })

  it('keeps the viewport when the centreline changes, and re-fits only when asked', () => {
    // A drag calls `onPointsChange` on every pointermove, so the centreline
    // comes back with a fresh identity on the first pixel of movement.
    // Re-framing on that would throw away the zoom and pan the user set up
    // before reaching for the point, mid-gesture. `fitRequest` is the explicit
    // "the geometry was replaced" bump, and it is the only thing that re-fits.
    const view = mountCanvas(canvasProps({ tool: 'edit' }))
    fireEvent.wheel(view.svg, { deltaY: -100, clientX: 600, clientY: 100 })
    const zoomed = readViewBox(view.svg)
    expect(zoomed).not.toEqual(OVAL_VIEW)

    const moved = {
      ...PRESETS.oval,
      centerline: [{ x: 400, y: 300 }, ...PRESETS.oval.centerline.slice(1)],
    }
    view.update({ track: moved })
    expect(readViewBox(view.svg)).toEqual(zoomed)

    view.update({ fitRequest: 1 })

    // xs 16..400 and ys 12..300 of the moved lap, padded by 28 and centred:
    // far enough from the zoomed box that "did not re-fit" and "re-fitted" can
    // never both read true.
    expect(readViewBox(view.svg)).toEqual({ x: 2, y: -2, width: 412, height: 316 })
  })
})

describe('TrackCanvas world transform', () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = vi.fn()
    Element.prototype.releasePointerCapture = vi.fn()
  })

  it('reads a click through the viewport the user is on, not the framing it started at', () => {
    // Panning 200 px right slides the world window 28.5 m left, so the same
    // client point is now world 24.5 and not 53. A transform still reading the
    // mount-time framing -- the easy mistake, since that is what the state was
    // initialised with -- would put every added point at the offset the user
    // had before they last moved the view.
    const onPointsChange: Mock<(points: Point[], checkpoint?: boolean) => void> = vi.fn()
    const view = mountCanvas(canvasProps({ tool: 'pan', onPointsChange }))

    fireEvent.pointerDown(view.svg, { pointerId: 6, clientX: 500, clientY: 300, button: 0 })
    fireEvent.pointerMove(view.svg, { pointerId: 6, clientX: 700, clientY: 300 })
    fireEvent.pointerUp(view.svg, { pointerId: 6, clientX: 700, clientY: 300 })
    expect(readViewBox(view.svg).x).toBeCloseTo(-32.5, 6)

    view.update({ tool: 'add' })
    fireEvent.pointerDown(view.container.querySelector('.canvas-bg')!, {
      clientX: 400,
      clientY: 400,
      button: 0,
    })

    const next = onPointsChange.mock.calls[0][0]
    expect(next[2].x).toBeCloseTo(24.5, 6)
    expect(next[2].y).toBeCloseTo(18.6, 6)
  })

  it('subtracts where the canvas sits on the page', () => {
    // The surface is not the page: it has a toolbar above it and a panel
    // beside it. Client (520, 440) on a canvas whose top left is (120, 40) is
    // the same (400, 400) into the surface as the add test above, and so the
    // same world (53, 18.6). Drop the offset and it reads as world
    // (70.1, 10.4) -- 17 m away, on a different segment of the lap.
    const onPointsChange: Mock<(points: Point[], checkpoint?: boolean) => void> = vi.fn()
    const { svg, container } = mountCanvas(canvasProps({ tool: 'add', onPointsChange }))
    stubRect(svg, { left: 120, top: 40 })

    fireEvent.pointerDown(container.querySelector('.canvas-bg')!, {
      clientX: 520,
      clientY: 440,
      button: 0,
    })

    const next = onPointsChange.mock.calls[0][0]
    expect(next[3].x).toBeCloseTo(53, 6)
    expect(next[3].y).toBeCloseTo(18.6, 6)
  })
})

/**
 * A photo behind the track: 200x100 px and uncalibrated, so the editor treats
 * one pixel as one metre. The viewport then has to frame the picture as well
 * as the lap, which puts it at x -14, y -14, 228 by 128.
 */
const tracedTrack = {
  ...PRESETS.oval,
  background: {
    imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    imageWidthPx: 200,
    imageHeightPx: 100,
  },
}

describe('TrackCanvas toolbar', () => {
  it('reports the tool the user picked, and marks the current one', () => {
    // Four buttons wired to one callback is exactly where a copy-paste sends
    // the wrong tool, and the App owns the tool, so the canvas cannot notice
    // it got back something other than what was pressed.
    const onToolChange: Mock<(tool: EditorTool) => void> = vi.fn()
    mountCanvas(canvasProps({ tool: 'pan', track: tracedTrack, onToolChange }))

    expect(screen.getByRole('button', { name: /^move$/i })).toHaveClass('active')
    expect(screen.getByRole('button', { name: /^edit$/i })).not.toHaveClass('active')

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^point$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^move$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^calibrate$/i }))

    expect(onToolChange.mock.calls.map((call) => call[0])).toEqual(['edit', 'add', 'pan', 'calibrate'])
  })

  it('offers calibration only when there is a photo to calibrate against', () => {
    const bare = mountCanvas(canvasProps({ tool: 'edit' }))
    expect(screen.queryByRole('button', { name: /^calibrate$/i })).toBeNull()
    bare.unmount()

    mountCanvas(canvasProps({ tool: 'edit', track: tracedTrack }))
    expect(screen.getByRole('button', { name: /^calibrate$/i })).toBeInTheDocument()
  })

  it('animates only once there is a lap to animate', () => {
    const onPlaybackToggle: Mock<() => void> = vi.fn()
    const without = mountCanvas(canvasProps({ onPlaybackToggle }))
    const idle = screen.getByRole('button', { name: /^animate$/i })
    expect(idle).toBeDisabled()
    expect(idle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(idle)
    expect(onPlaybackToggle).not.toHaveBeenCalled()
    without.unmount()

    const result = simulateInBrowser({
      track: PRESETS.oval,
      kart: DEFAULT_KART,
      settings: { safetyMarginM: 0.55, sampleCount: 200 },
    })
    mountCanvas(canvasProps({ result, playbackEnabled: true, onPlaybackToggle }))
    const running = screen.getByRole('button', { name: /^animate$/i })
    expect(running).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(running)
    expect(onPlaybackToggle).toHaveBeenCalledTimes(1)
  })
})

describe('TrackCanvas calibration', () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = vi.fn()
    Element.prototype.releasePointerCapture = vi.fn()
  })

  it('hands the App the marked span and the distance typed for it', () => {
    // Clients (400, 250) and (400, 100) are world (100, 50) and (100, 88.4)
    // over the traced view, so the user marked 38.4 image pixels and called
    // them 50 m. The scale is the App's to apply; what the canvas owes it is
    // the measurement, and nothing until both ends are down.
    const onCalibrate: Mock<(pixelDistance: number, realMeters: number) => void> = vi.fn()
    const { container } = mountCanvas(canvasProps({ tool: 'calibrate', track: tracedTrack, onCalibrate }))
    const surface = container.querySelector('.canvas-bg')!

    fireEvent.pointerDown(surface, { clientX: 400, clientY: 250, button: 0 })
    expect(container.querySelectorAll('.calibration-segment circle')).toHaveLength(1)
    expect(screen.queryByRole('spinbutton')).toBeNull()

    fireEvent.pointerDown(surface, { clientX: 400, clientY: 100, button: 0 })
    expect(container.querySelectorAll('.calibration-segment circle')).toHaveLength(2)

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: /apply scale/i }))

    expect(onCalibrate).toHaveBeenCalledTimes(1)
    expect(onCalibrate.mock.calls[0][0]).toBeCloseTo(38.4, 6)
    expect(onCalibrate.mock.calls[0][1]).toBe(50)
    // The measurement is spent: leaving the marks up invites a second Apply
    // that would re-scale an already-scaled photo.
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(container.querySelector('.calibration-segment')).toBeNull()
  })

  it('measures a re-calibration in image pixels, not in world metres', () => {
    // The marks are world units; the scale is defined per image pixel. On a
    // photo already at 0.4 m/px those differ by 1/scale, and passing the world
    // span straight through returned 1 m/px for a feature that was really at
    // 0.4 -- wrong by that factor and compounding on every further correction.
    //
    // At 0.4 m/px the picture is 80 by 40 m, so the view fits at 124 by 115,
    // and the same two clicks span 34.5 m -- which is 86.25 image pixels.
    const onCalibrate: Mock<(pixelDistance: number, realMeters: number) => void> = vi.fn()
    const scaled = {
      ...tracedTrack,
      background: { ...tracedTrack.background, scaleMPerPx: 0.4 },
    }
    const { container } = mountCanvas(canvasProps({ tool: 'calibrate', track: scaled, onCalibrate }))
    const surface = container.querySelector('.canvas-bg')!

    fireEvent.pointerDown(surface, { clientX: 400, clientY: 250, button: 0 })
    fireEvent.pointerDown(surface, { clientX: 400, clientY: 100, button: 0 })
    fireEvent.click(screen.getByRole('button', { name: /apply scale/i }))

    expect(onCalibrate.mock.calls[0][0]).toBeCloseTo(86.25, 6)
    expect(onCalibrate.mock.calls[0][1]).toBe(100)
  })

  it('starts a fresh measurement on the click after a finished one', () => {
    // Otherwise the third click would land as a new end point and quietly
    // re-measure from a start the user had already moved on from.
    const onCalibrate: Mock<(pixelDistance: number, realMeters: number) => void> = vi.fn()
    const { container } = mountCanvas(canvasProps({ tool: 'calibrate', track: tracedTrack, onCalibrate }))
    const surface = container.querySelector('.canvas-bg')!

    fireEvent.pointerDown(surface, { clientX: 400, clientY: 250, button: 0 })
    fireEvent.pointerDown(surface, { clientX: 400, clientY: 100, button: 0 })
    fireEvent.pointerDown(surface, { clientX: 200, clientY: 400, button: 0 })

    expect(container.querySelectorAll('.calibration-segment circle')).toHaveLength(1)
    expect(container.querySelector('.calibration-segment line')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(onCalibrate).not.toHaveBeenCalled()
  })

  it('says why a rejected calibration was rejected, and keeps the marks', () => {
    // The reason travels as a note and is translated at render, so what shows
    // is the specific failure rather than the generic fallback -- and the
    // marks stay put, because the fix is to drag one end further out, not to
    // start the measurement again.
    const onCalibrate: Mock<(pixelDistance: number, realMeters: number) => void> = vi.fn()
    const { container } = mountCanvas(canvasProps({ tool: 'calibrate', track: tracedTrack, onCalibrate }))
    const surface = container.querySelector('.canvas-bg')!

    // Five pixels apart on screen is under 2 m of the picture: too close to
    // measure anything from.
    fireEvent.pointerDown(surface, { clientX: 400, clientY: 250, button: 0 })
    fireEvent.pointerDown(surface, { clientX: 405, clientY: 255, button: 0 })
    fireEvent.click(screen.getByRole('button', { name: /apply scale/i }))

    expect(onCalibrate).not.toHaveBeenCalled()
    expect(container.querySelector('.calibration-error')).toHaveTextContent(
      'Mark two points farther apart on the image.',
    )
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
  })

  it('abandons the measurement on Escape', () => {
    const onCalibrate: Mock<(pixelDistance: number, realMeters: number) => void> = vi.fn()
    const { container } = mountCanvas(canvasProps({ tool: 'calibrate', track: tracedTrack, onCalibrate }))
    const surface = container.querySelector('.canvas-bg')!

    fireEvent.pointerDown(surface, { clientX: 400, clientY: 250, button: 0 })
    fireEvent.pointerDown(surface, { clientX: 400, clientY: 100, button: 0 })
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'Escape' })

    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(container.querySelector('.calibration-segment')).toBeNull()
    expect(onCalibrate).not.toHaveBeenCalled()
  })

  it('applies the measurement on Enter, without reaching for the button', () => {
    // The distance is typed, so the hands are already on the keyboard and the
    // Enter that ends the number is the one that means "that is the distance".
    const onCalibrate: Mock<(pixelDistance: number, realMeters: number) => void> = vi.fn()
    const { container } = mountCanvas(canvasProps({ tool: 'calibrate', track: tracedTrack, onCalibrate }))
    const surface = container.querySelector('.canvas-bg')!

    fireEvent.pointerDown(surface, { clientX: 400, clientY: 250, button: 0 })
    fireEvent.pointerDown(surface, { clientX: 400, clientY: 100, button: 0 })
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '50' } })
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'Enter' })

    expect(onCalibrate).toHaveBeenCalledTimes(1)
    expect(onCalibrate.mock.calls[0][0]).toBeCloseTo(38.4, 6)
    expect(onCalibrate.mock.calls[0][1]).toBe(50)
  })
})
