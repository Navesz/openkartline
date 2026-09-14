import { Profiler } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { GPS_LIMITS } from './domain/gpx'
import { frameAtElapsed } from './domain/playback'
import { DEFAULT_KART, PRESETS } from './domain/presets'
import { simulateInBrowser } from './domain/simulator'
import { toProject } from './services/projectFile'
import type { TrackInput } from './domain/types'
import { I18nProvider } from './i18n/I18nProvider'

/*
 * The chosen locale is persisted, so a test that switches language leaves every
 * test declared after it running in that language, and one of them does.
 *
 * Load-bearing, not hygiene: delete this line and 26 of the 36 tests in this
 * file fail. The number is written down because one line guarding most of a
 * file is exactly the shape somebody tidies away.
 */
beforeEach(() => window.localStorage.clear())

/*
 * Every render probes `/health`, so every test has to say what answers it:
 * offline, unless a test installs the engine itself. And every stub is undone
 * afterwards. A stub installed inside a test used to outlive it: in the full
 * file every test declared after the first one that talks to the engine, up to
 * the first describe that undid its stubs, ran against a connected engine, and
 * run on their own they got the real `fetch`. Which code path a test covered
 * depended on where it was declared.
 */
beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline'))))
afterEach(() => vi.unstubAllGlobals())

const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAAa//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/ISP/2gAMAwEAAgADAAAAEB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ECP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ECP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/ECP/2Q=='

function renderApp() {
  return render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  )
}

describe('OpenKartLine application', () => {
  it('starts with a useful local demo and recalculates edited kart inputs', async () => {
    const user = userEvent.setup()
    renderApp()
    expect(screen.getByRole('heading', { name: /plan a faster lap/i })).toBeInTheDocument()
    expect(await screen.findByText('Local mode')).toBeInTheDocument()
    const power = screen.getByLabelText(/power/i)
    await user.clear(power)
    await user.type(power, '20')
    await user.click(screen.getByRole('button', { name: /recalculate lap/i }))
    expect(await screen.findByText(/computed locally in the browser/i)).toBeInTheDocument()
  })

  it('leaves the canvas tool alone for a modifier chord', async () => {
    // Ctrl+A is select-all. It used to fall through to the single-letter
    // shortcuts and arm the add tool, so the next canvas click injected a
    // control point into the track.
    const user = userEvent.setup()
    renderApp()
    expect(screen.getByText(/drag the points to adjust/i)).toBeInTheDocument()

    await user.keyboard('{Control>}a{/Control}')
    expect(screen.getByText(/drag the points to adjust/i)).toBeInTheDocument()

    await user.keyboard('a')
    expect(screen.getByText(/click the background to add points/i)).toBeInTheDocument()
  })

  it('offers a keyboard-operable numeric control-point editor', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByText(/edit point by coordinates/i))
    const xInput = screen.getByLabelText(/point 1 · x/i)
    await user.clear(xInput)
    await user.type(xInput, '7.5')
    expect(xInput).toHaveValue(7.5)
    expect(screen.getByRole('button', { name: /remove point 1/i })).toBeEnabled()
  })
})

const API_RESULT = {
  schema_version: '1.0',
  engine_version: '0.1.0',
  status: { state: 'success', code: 'SPEED_PROFILE_CONVERGED', message: 'ok' },
  validation: { schema_version: '1.0', valid: true, errors: [], warnings: [] },
  summary: {
    track_length_m: 100,
    lap_time_s: 10,
    min_speed_mps: 10,
    max_speed_mps: 10,
    average_speed_mps: 10,
    sample_count: 1,
  },
  samples: [
    {
      s_m: 0,
      x_m: 20,
      y_m: 0,
      heading_rad: 0,
      curvature_1pm: 0.05,
      speed_mps: 10,
      elapsed_time_s: 0,
      longitudinal_accel_mps2: 0,
      lateral_accel_mps2: 5,
      throttle: 0,
      brake: 0,
      friction_utilization: 0.5,
    },
  ],
  markers: [],
  assumptions: [],
  warnings: [],
}

describe('a result that lands after an edit', () => {
  it('keeps the recalculate affordance instead of presenting a stale lap as current', async () => {
    // The request has to be genuinely in flight for the edit to land inside it,
    // so the engine path is used and its response is held open.
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        if (String(input).includes('/health')) return new Response('{}', { status: 200 })
        await held
        return new Response(JSON.stringify(API_RESULT), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }),
    )

    const user = userEvent.setup()
    renderApp()
    expect(await screen.findByText('MVP engine connected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /recalculate lap|simulate again/i }))

    const power = screen.getByLabelText(/power/i)
    await user.clear(power)
    await user.type(power, '22')

    release!()

    expect(await screen.findByText(/the track changed while it was running/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /recalculate lap/i })).toBeInTheDocument()
  })
})

describe('run-bar announcements', () => {
  it('scopes the live region to the message, not the Simulate button', () => {
    // The button label flips on the first edit. With the whole bar as the live
    // region a screen reader re-announced it mid-typing, and the result the
    // region exists to report was lost in that noise.
    const { container } = renderApp()

    const message = container.querySelector('.run-message')
    expect(message).toHaveAttribute('role', 'status')
    expect(message).toHaveAttribute('aria-live', 'polite')
    expect(message?.querySelector('button')).toBeNull()

    expect(container.querySelector('.run-bar')).not.toHaveAttribute('role')
  })
})

describe('restoring the example while a solve is in flight', () => {
  it('keeps the restored example rather than the answer for the discarded track', async () => {
    // `reset` installs its result synchronously. Without invalidating what is
    // already in flight, the request for the previous track landed afterwards,
    // replaced the restored example's result, and reported itself as current.
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        if (String(input).includes('/health')) return new Response('{}', { status: 200 })
        await held
        return new Response(JSON.stringify(API_RESULT), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }),
    )

    const user = userEvent.setup()
    renderApp()
    expect(await screen.findByText('MVP engine connected')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /recalculate lap|simulate again/i }))

    await user.click(screen.getByRole('button', { name: /restore example/i }))
    const restored = screen.getByText(/estimated lap/i).parentElement?.textContent

    release!()
    await screen.findByText(/example restored|exemplo restaurado/i)

    // The lap on screen is still the one the restore computed. The stale
    // engine result carried lap_time_s 10, which would read 0:10.00.
    expect(screen.getByText(/estimated lap/i).parentElement?.textContent).toBe(restored)
    expect(document.body.textContent).not.toContain('0:10.00')
  })
})

describe('stepping through history', () => {
  it('marks the project stale from the toolbar, as Ctrl+Z does', async () => {
    // The keyboard path called `markDirty`; the toolbar buttons called
    // `trackHistory.undo` straight through. Undoing from the toolbar therefore
    // changed the track while the panel still claimed the lap on screen was
    // current for it. The Simulate button's own label is that claim: it reads
    // "Simulate again" when current and "Recalculate lap" when stale.
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByText(/edit point by coordinates/i))
    const xInput = screen.getByLabelText(/point 1 · x/i)
    await user.clear(xInput)
    await user.type(xInput, '12')

    await user.click(screen.getByRole('button', { name: /recalculate lap/i }))
    expect(await screen.findByRole('button', { name: /simulate again/i })).toBeInTheDocument()

    const undo = screen.getByTitle(/undo/i)
    expect(undo).toBeEnabled()
    await user.click(undo)

    expect(screen.getByRole('button', { name: /recalculate lap/i })).toBeInTheDocument()
  })
})

describe('the track picker after undo', () => {
  it('names the circuit that is actually loaded', async () => {
    // The key was state each loader set, and undo goes through no loader. So
    // loading Technical, loading Oval, then undoing gave back Technical's
    // geometry under a picker still reading "Oval". It is read off the track
    // now, so there is nothing to fall out of step.
    const user = userEvent.setup()
    renderApp()

    const picker = screen.getByLabelText(/start from an example/i)
    await user.selectOptions(picker, 'oval')
    expect(picker).toHaveValue('oval')

    await user.click(screen.getByTitle(/undo/i))

    expect(picker).toHaveValue('technical')

    await user.click(screen.getByTitle(/redo/i))
    expect(picker).toHaveValue('oval')
  })

  it('stops naming a preset once the track is edited away from it', async () => {
    const user = userEvent.setup()
    renderApp()

    const picker = screen.getByLabelText(/start from an example/i)
    expect(picker).toHaveValue('technical')

    await user.click(screen.getByText(/edit point by coordinates/i))
    const xInput = screen.getByLabelText(/point 1 · x/i)
    await user.clear(xInput)
    await user.type(xInput, '12')

    expect(picker).toHaveValue('')
    expect(screen.getByRole('option', { name: /custom track/i })).toBeInTheDocument()
  })
})

describe('a project rejected on import', () => {
  it('follows a later language switch', async () => {
    // `parseProject` used to render the failure with whichever translator it
    // was handed, and the run bar then held that sentence as plain text. A
    // project rejected in English stayed English after switching to
    // Portuguese -- the staleness #81 removed from the import throws,
    // surviving here through `validationErrorMessage`. It was not the last
    // such path: the engine adapter did the same, which "the language switch"
    // covers below.
    const user = userEvent.setup()
    const { container } = renderApp()

    const { project } = toProject(PRESETS.oval, DEFAULT_KART, { safetyMarginM: 0.5, sampleCount: 240 })
    project.simulation.settings.sample_count = 32.5
    const file = new File([JSON.stringify(project)], 'broken.okl.json', { type: 'application/json' })

    const input = container.querySelector('input[type="file"][accept*="okl"]') as HTMLInputElement
    await user.upload(input, file)

    expect(await screen.findByText(/must be an integer between/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'PT' }))

    expect(await screen.findByText(/quantidade de amostras/i)).toBeInTheDocument()
    expect(screen.queryByText(/must be an integer between/i)).not.toBeInTheDocument()
  })

  it('names every reason, not only the first', async () => {
    // Validation collects all of its failures and the run bar renders a list,
    // so the import path passes the whole list on. Cut to the first, a file
    // wrong in two places would name its second fault only after the first had
    // been fixed and the file imported again.
    const user = userEvent.setup()
    const { container } = renderApp()

    const { project } = toProject(PRESETS.oval, DEFAULT_KART, { safetyMarginM: 0.5, sampleCount: 240 })
    project.kart.parameters.power_hp = 500
    project.simulation.settings.sample_count = 32.5
    const file = new File([JSON.stringify(project)], 'twice.okl.json', { type: 'application/json' })

    const input = container.querySelector('input[type="file"][accept*="okl"]') as HTMLInputElement
    await user.upload(input, file)

    expect(await screen.findByText(/power must be between/i)).toBeInTheDocument()
    const message = container.querySelector('.run-message')?.textContent ?? ''
    expect(message).toMatch(/Power must be between \d+ and \d+ hp\./)
    expect(message).toMatch(/Sample count must be an integer between \d+ and \d+\./)
  })
})

describe('a GPS trace over the upload limit', () => {
  it('is refused on its size, before it is read', async () => {
    // `file.text()` decodes the whole file before anything can count it, so the
    // limit is checked on `File.size` first. `parseGpsFile` checks the decoded
    // bytes too, which is why a refusal alone cannot tell the two apart: this
    // file declares more than the limit and holds almost nothing, so only the
    // check before the read can turn it away.
    const user = userEvent.setup()
    const { container } = renderApp()

    const trace = new File(['<gpx></gpx>'], 'huge.gpx', { type: 'application/gpx+xml' })
    Object.defineProperty(trace, 'size', { value: GPS_LIMITS.uploadBytes + 1 })
    const read = vi.fn(() => Promise.resolve('<gpx></gpx>'))
    Object.defineProperty(trace, 'text', { value: read })

    const input = container.querySelector('input[type="file"][accept*="gpx"]') as HTMLInputElement
    await user.upload(input, trace)

    expect(await screen.findByText(/The GPS trace exceeds the 16 MB limit\./)).toBeInTheDocument()
    expect(container.querySelector('.run-bar')).toHaveClass('error')
    expect(read).not.toHaveBeenCalled()
  })
})

describe('an undo with nothing to undo', () => {
  it('leaves the lap on screen current', async () => {
    // The toolbar buttons are disabled when there is nothing to step to, but
    // Ctrl+Z is not, and it called `markDirty` unconditionally. Pressing it on
    // a fresh project bumped the input version and relabelled the button, so
    // the app claimed the lap it was showing had gone stale against a track
    // nothing had touched -- and cancelled any solve still in flight.
    const user = userEvent.setup()
    renderApp()

    expect(await screen.findByRole('button', { name: /simulate again/i })).toBeInTheDocument()

    await user.keyboard('{Control>}z{/Control}')
    await user.keyboard('{Control>}y{/Control}')

    expect(screen.getByRole('button', { name: /simulate again/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /recalculate lap/i })).not.toBeInTheDocument()
  })

  it('still marks it stale when there is something to undo', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByText(/edit point by coordinates/i))
    const xInput = screen.getByLabelText(/point 1 · x/i)
    await user.clear(xInput)
    await user.type(xInput, '12')
    await user.click(screen.getByRole('button', { name: /recalculate lap/i }))
    expect(await screen.findByRole('button', { name: /simulate again/i })).toBeInTheDocument()

    await user.keyboard('{Control>}z{/Control}')

    expect(screen.getByRole('button', { name: /recalculate lap/i })).toBeInTheDocument()
  })
})

describe('loading a circuit while a background photo is attached', () => {
  // Attached by importing a project that already carries a calibrated photo:
  // jsdom decodes no images, so the upload path cannot run here. It is the
  // same track shape either way, and the E2E suite covers the upload itself.
  const importWithPhoto = async (
    user: ReturnType<typeof userEvent.setup>,
    container: HTMLElement,
    track: TrackInput,
  ) => {
    const { project } = toProject(
      {
        ...track,
        background: {
          imageDataUrl: TINY_JPEG,
          imageWidthPx: 1200,
          imageHeightPx: 800,
          scaleMPerPx: 0.35,
        },
      },
      DEFAULT_KART,
      { safetyMarginM: 0.5, sampleCount: 240 },
    )
    const input = container.querySelector('input[type="file"][accept*="okl"]') as HTMLInputElement
    await user.upload(
      input,
      new File([JSON.stringify(project)], 'circuit.okl.json', { type: 'application/json' }),
    )
  }

  it('keeps the photo when the same circuit is loaded again', async () => {
    // The picker reads "Custom track" the moment a photo is attached, which is
    // what invites the click. Before this, that click discarded the photo and
    // the run bar said only that the circuit had loaded.
    const user = userEvent.setup()
    const { container } = renderApp()

    const picker = screen.getByLabelText(/start from an example/i)
    await importWithPhoto(user, container, PRESETS.oval)
    expect(await screen.findByLabelText(/known distance on the image/i)).toBeInTheDocument()
    expect(picker).toHaveValue('')

    await user.selectOptions(picker, 'oval')

    expect(screen.getByLabelText(/known distance on the image/i)).toBeInTheDocument()
    expect(screen.queryByText(/background image was removed/i)).not.toBeInTheDocument()
  })

  it('says so when a different circuit replaces it', async () => {
    const user = userEvent.setup()
    const { container } = renderApp()

    const picker = screen.getByLabelText(/start from an example/i)
    await importWithPhoto(user, container, PRESETS.oval)
    expect(await screen.findByLabelText(/known distance on the image/i)).toBeInTheDocument()

    await user.selectOptions(picker, 'hairpin')

    expect(await screen.findByText(/background image was removed/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/known distance on the image/i)).not.toBeInTheDocument()
  })

  // Which circuit a photo belonged to used to be read off the track name, a
  // free-text field, so both directions went wrong: a renamed circuit lost its
  // own photo with a message saying it belonged elsewhere, and another
  // circuit's photo saved under this one's name stayed over this geometry.
  it('keeps the photo of a circuit that was renamed before it is loaded again', async () => {
    const user = userEvent.setup()
    const { container } = renderApp()

    const picker = screen.getByLabelText(/start from an example/i)
    await importWithPhoto(user, container, PRESETS.oval)
    expect(await screen.findByLabelText(/known distance on the image/i)).toBeInTheDocument()

    const name = screen.getByLabelText(/track name/i)
    await user.clear(name)
    await user.type(name, 'My oval')

    await user.selectOptions(picker, 'oval')

    expect(screen.getByLabelText(/known distance on the image/i)).toBeInTheDocument()
    expect(screen.queryByText(/background image was removed/i)).not.toBeInTheDocument()
  })

  it('recognises a saved circuit by its geometry, not by the name it was saved under', async () => {
    const user = userEvent.setup()
    const { container } = renderApp()

    const picker = screen.getByLabelText(/start from an example/i)
    await importWithPhoto(user, container, { ...PRESETS.oval, name: 'My oval' })
    expect(await screen.findByLabelText(/known distance on the image/i)).toBeInTheDocument()

    await user.selectOptions(picker, 'oval')

    expect(screen.getByLabelText(/known distance on the image/i)).toBeInTheDocument()
    expect(screen.queryByText(/background image was removed/i)).not.toBeInTheDocument()
  })

  it("drops another circuit's photo even when it was saved under this circuit's name", async () => {
    const user = userEvent.setup()
    const { container } = renderApp()

    const picker = screen.getByLabelText(/start from an example/i)
    await importWithPhoto(user, container, { ...PRESETS.hairpin, name: PRESETS.oval.name })
    expect(await screen.findByLabelText(/known distance on the image/i)).toBeInTheDocument()

    await user.selectOptions(picker, 'oval')

    expect(await screen.findByText(/background image was removed/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/known distance on the image/i)).not.toBeInTheDocument()
  })

  it('still knows which circuit the photo belongs to after an undo', async () => {
    // Undo moves the track without going through a loader, so a circuit held
    // beside the history rather than inside it would still name Hairpin here.
    const user = userEvent.setup()
    const { container } = renderApp()

    const picker = screen.getByLabelText(/start from an example/i)
    await importWithPhoto(user, container, PRESETS.oval)
    expect(await screen.findByLabelText(/known distance on the image/i)).toBeInTheDocument()

    await user.selectOptions(picker, 'hairpin')
    expect(await screen.findByText(/background image was removed/i)).toBeInTheDocument()
    await user.click(screen.getByTitle(/undo/i))
    expect(screen.getByLabelText(/known distance on the image/i)).toBeInTheDocument()

    await user.selectOptions(picker, 'oval')

    expect(screen.getByLabelText(/known distance on the image/i)).toBeInTheDocument()
    expect(screen.queryByText(/background image was removed/i)).not.toBeInTheDocument()
  })
})

describe('removing the last control point', () => {
  it('keeps the editor open and the focus it just handed over', async () => {
    // The index was clamped in an effect, which lands a render after the
    // centerline shrinks. For that one render `selectedPoint` was undefined,
    // the `{selectedPoint && …}` guard unmounted the whole editor, and an
    // uncontrolled `<details open>` lost both its open state and the focus the
    // remove button had just moved to the point picker — the exact fall to
    // <body> that the button's own comment exists to prevent.
    const user = userEvent.setup()
    const { container } = renderApp()

    await user.click(screen.getByText(/edit point by coordinates/i))
    const editor = container.querySelector('details.point-editor') as HTMLDetailsElement
    expect(editor.open).toBe(true)

    const picker = container.querySelector('#control-point') as HTMLSelectElement
    const lastIndex = picker.options.length - 1
    await user.selectOptions(picker, picker.options[lastIndex].value)

    await user.click(screen.getByRole('button', { name: new RegExp(`remove point ${lastIndex + 1}`, 'i') }))

    expect(container.querySelector('details.point-editor')).toBe(editor)
    expect(editor.open).toBe(true)
    expect(document.activeElement).toBe(container.querySelector('#control-point'))
  })
})

/**
 * The lap the app opens on, recomputed here so a test can name the sample it
 * expects rather than whichever one happens to be selected. `App` seeds itself
 * from exactly these inputs, and the browser solver is deterministic.
 */
const DEMO = simulateInBrowser({
  track: PRESETS.technical,
  kart: DEFAULT_KART,
  settings: { safetyMarginM: 0.15, sampleCount: 200 },
})

/**
 * `POINT n` in the results panel, which is the selection every panel reads.
 *
 * The label alone, so it can be compared whole. The readout runs the point
 * straight into the speed -- `POINT 7634 km/h` -- and a substring match on that
 * accepted `POINT 7` followed by a speed starting with 6 as `POINT 76`.
 */
const selectedPoint = (container: HTMLElement) =>
  container.querySelector('.selected-readout > span')?.textContent ?? ''

/** The simulated clock, as `elapsed / lap s`. */
const playbackClock = (container: HTMLElement) =>
  container.querySelector('.playback-clock strong')?.textContent ?? ''

const kph = (sampleIndex: number) => (DEMO.samples[sampleIndex].speedMps * 3.6).toFixed(0)

/**
 * Drive the replay by hand.
 *
 * The loop is `requestAnimationFrame`, so waiting on the wall clock would make
 * the distance covered depend on how busy the machine is. Every step here is
 * 400 ms of fake wall clock, comfortably past the 0.25 s ceiling the loop
 * clamps a delta to, so each frame advances the lap by exactly 0.25 s x rate
 * whatever timestamp the effect started from.
 */
function fakeFrames() {
  let clock = 1_000_000
  let nextId = 0
  const pending = new Map<number, FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextId += 1
    pending.set(nextId, callback)
    return nextId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => void pending.delete(id))
  return async (count: number) => {
    for (let step = 0; step < count; step += 1) {
      const due = [...pending.values()]
      pending.clear()
      clock += 400
      await act(async () => {
        due.forEach((callback) => callback(clock))
      })
    }
  }
}
/** Simulated seconds one `fakeFrames` step covers at a given rate. */
const perFrameS = (rate: number) => 0.25 * rate

/**
 * jsdom lays nothing out, so an SVG reports a zero-sized box and a pointer
 * position over it means nothing until it is given one.
 */
function chartWithBox(): Element {
  const svg = screen.getByRole('img', { name: /synchronized chart/i })
  Object.defineProperty(svg, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      width: 720,
      height: 176,
      right: 720,
      bottom: 176,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  })
  return svg
}

/**
 * Stand in for the browser's download.
 *
 * `downloadProject` hands the file to an anchor and clicks it, and jsdom has no
 * navigation to give it, so the object URL and the click are intercepted and
 * the bytes read back out of the blob instead. Nothing reaches the disk.
 */
function captureDownload() {
  const blobs: Blob[] = []
  const names: string[] = []
  vi.spyOn(URL, 'createObjectURL').mockImplementation((source: Blob | MediaSource) => {
    blobs.push(source as Blob)
    return 'blob:openkartline-test'
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
    const link = [...document.body.querySelectorAll<HTMLAnchorElement>('a[download]')].pop()
    if (link) names.push(link.download)
  })
  return {
    count: () => names.length,
    filename: () => names[names.length - 1],
    project: async () => JSON.parse(await blobs[blobs.length - 1].text()),
  }
}

describe('playing the lap back', () => {
  it('opens the replay already running, and rewinds it when the toggle goes off', async () => {
    // Turning playback off is the only thing that clears the clock -- nothing
    // else does until a new lap is solved -- so a replay reopened after a first
    // pass would otherwise resume from wherever it was abandoned rather than
    // from the start line.
    const runFrames = fakeFrames()
    const user = userEvent.setup()
    const { container } = renderApp()

    const toggle = screen.getByRole('button', { name: 'Animate' })
    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'Pause playback' })).toBeInTheDocument()
    expect(playbackClock(container)).toMatch(/^0\.00 \//)

    await runFrames(8)
    expect(playbackClock(container)).toMatch(/^2\.00 \//)

    await user.click(toggle)
    expect(container.querySelector('.playback-bar')).toBeNull()

    await user.click(toggle)
    expect(playbackClock(container)).toMatch(/^0\.00 \//)
  })

  it('starts a newly solved lap at the start line, from the first frame it paints', async () => {
    // A new lap is a new clock. The reset used to be an effect keyed on the
    // result, and an effect lands a commit late: the commit installing the lap
    // painted the old elapsed time against the new lap before snapping back to
    // zero. So every commit is read here, not only the one the test ends on.
    const runFrames = fakeFrames()
    const user = userEvent.setup()
    const painted: string[] = []
    const { container } = render(
      <Profiler id="app" onRender={() => painted.push(playbackClock(document.body))}>
        <I18nProvider>
          <App />
        </I18nProvider>
      </Profiler>,
    )

    await user.click(screen.getByRole('button', { name: 'Animate' }))
    await runFrames(8)
    expect(playbackClock(container)).toBe(`2.00 / ${DEMO.lapTimeS.toFixed(2)} s`)

    // More power is a different lap time, so a commit painting the old clock
    // against the new lap cannot be mistaken for one from before the solve.
    const faster = simulateInBrowser({
      track: PRESETS.technical,
      kart: { ...DEFAULT_KART, powerHp: 20 },
      settings: { safetyMarginM: 0.15, sampleCount: 200 },
    })
    const newLap = ` / ${faster.lapTimeS.toFixed(2)} s`
    expect(faster.lapTimeS.toFixed(2)).not.toBe(DEMO.lapTimeS.toFixed(2))

    const power = screen.getByLabelText(/power/i)
    await user.clear(power)
    await user.type(power, '20')
    painted.length = 0
    await user.click(screen.getByRole('button', { name: /recalculate lap/i }))
    expect(await screen.findByText(/computed locally in the browser/i)).toBeInTheDocument()

    const ofNewLap = painted.filter((clock) => clock.endsWith(newLap))
    expect(ofNewLap.length).toBeGreaterThan(0)
    expect(ofNewLap).toEqual(ofNewLap.map(() => `0.00${newLap}`))
    expect(playbackClock(container)).toBe(`0.00${newLap}`)
  })

  it('stops the clock on pause and picks it up again on play', async () => {
    // Pause has to stop the animation loop, not merely flip the icon: the
    // scrub, the kart and every panel that follows it read one elapsed time,
    // and a paused replay whose clock keeps running moves all of them.
    const runFrames = fakeFrames()
    const user = userEvent.setup()
    const { container } = renderApp()

    await user.click(screen.getByRole('button', { name: 'Animate' }))
    await runFrames(4)
    expect(playbackClock(container)).toMatch(/^1\.00 \//)

    await user.click(screen.getByRole('button', { name: 'Pause playback' }))
    await runFrames(4)
    expect(playbackClock(container)).toMatch(/^1\.00 \//)

    await user.click(screen.getByRole('button', { name: 'Play lap' }))
    await runFrames(4)
    expect(playbackClock(container)).toMatch(/^2\.00 \//)
  })

  it('covers three times as much lap per frame at 3x, without moving the lap time', async () => {
    // The rate scales wall-clock advance only. Applied to the solved lap
    // instead, the same four frames would still cover 1.00 s and the lap time
    // beside the clock would be the thing that shrank.
    const runFrames = fakeFrames()
    const user = userEvent.setup()
    const { container } = renderApp()

    await user.click(screen.getByRole('button', { name: 'Animate' }))
    await runFrames(4)
    expect(playbackClock(container)).toMatch(/^1\.00 \//)

    await user.click(screen.getByRole('button', { name: '3x' }))
    expect(screen.getByRole('button', { name: '3x' })).toHaveAttribute('aria-pressed', 'true')

    await runFrames(4)
    expect(playbackClock(container)).toMatch(/^4\.00 \//)
    expect(playbackClock(container)).toContain(`/ ${DEMO.lapTimeS.toFixed(2)} s`)
  })

  it('moves the whole replay to the instant that was scrubbed to', async () => {
    // The scrub is the only control that can put the kart somewhere the clock
    // has not reached, and it feeds the same elapsed time the animation loop
    // does -- so the readout has to land on the sample for that instant rather
    // than the slider just redrawing itself.
    const runFrames = fakeFrames()
    const user = userEvent.setup()
    const { container } = renderApp()

    await user.click(screen.getByRole('button', { name: 'Animate' }))
    await runFrames(4)

    const scrubbed = 10
    const landing = frameAtElapsed(DEMO, scrubbed)!.index
    fireEvent.change(screen.getByLabelText('Position in the lap'), {
      target: { value: String(scrubbed) },
    })

    expect(playbackClock(container)).toMatch(/^10\.00 \//)
    expect(selectedPoint(container)).toBe(`POINT ${landing + 1}`)

    // Back to start rewinds without pausing.
    await user.click(screen.getByRole('button', { name: 'Back to start' }))
    expect(playbackClock(container)).toMatch(/^0\.00 \//)
    expect(screen.getByRole('button', { name: 'Pause playback' })).toBeInTheDocument()
  })

  it('hands the selection to the moving kart, and gives it back when playback stops', async () => {
    // While the lap plays, every panel reads the kart's instant rather than the
    // pointer, so the charts and the results panel cannot drift away from what
    // the canvas is drawing. The pointer selection is only borrowed, though:
    // stopping has to return the sample the user picked, and the chart must not
    // be able to take it away in the meantime.
    const runFrames = fakeFrames()
    const user = userEvent.setup()
    const { container } = renderApp()

    const picked = DEMO.events[1].sampleIndex
    await user.click(container.querySelectorAll<HTMLButtonElement>('.event-list button')[1])
    expect(selectedPoint(container)).toBe(`POINT ${picked + 1}`)

    await user.click(screen.getByRole('button', { name: 'Animate' }))
    await runFrames(8)

    const driving = frameAtElapsed(DEMO, 8 * perFrameS(1))!.index
    expect(driving).not.toBe(picked)
    expect(selectedPoint(container)).toBe(`POINT ${driving + 1}`)
    expect(container.querySelector('.hover-readout strong')?.textContent).toBe(kph(driving))

    // The chart hands its hover straight to the selection when the lap is
    // still; while it plays that would fight the kart for the same state.
    fireEvent.pointerMove(chartWithBox(), { clientX: 377, clientY: 40 })
    expect(selectedPoint(container)).toBe(`POINT ${driving + 1}`)

    await user.click(screen.getByRole('button', { name: 'Animate' }))
    expect(selectedPoint(container)).toBe(`POINT ${picked + 1}`)
    expect(container.querySelector('.selected-kart circle')?.getAttribute('cx')).toBe(
      String(DEMO.samples[picked].position.x),
    )
  })
})

describe('picking a sample', () => {
  it('moves the canvas, the charts and the results panel onto the same sample', async () => {
    // Three panels, one index. A reference is only useful if the corner drawn
    // on the map, the cursor on the trace and the speed in the panel are the
    // same corner, so both entry points have to land all three together.
    const user = userEvent.setup()
    const { container } = renderApp()

    const fromPanel = DEMO.events[2].sampleIndex
    await user.click(container.querySelectorAll<HTMLButtonElement>('.event-list button')[2])
    expect(selectedPoint(container)).toBe(`POINT ${fromPanel + 1}`)
    expect(container.querySelector('.hover-readout strong')?.textContent).toBe(kph(fromPanel))
    expect(container.querySelector('.selected-kart circle')?.getAttribute('cx')).toBe(
      String(DEMO.samples[fromPanel].position.x),
    )

    // Half a chart-width along the trace is sample 100 of 200; distinct from
    // the panel's choice, so nothing here is satisfied by the previous state.
    fireEvent.pointerMove(chartWithBox(), { clientX: 377, clientY: 40 })
    expect(selectedPoint(container)).toBe('POINT 101')
    expect(container.querySelector('.hover-readout strong')?.textContent).toBe(kph(100))
    expect(container.querySelector('.selected-kart circle')?.getAttribute('cx')).toBe(
      String(DEMO.samples[100].position.x),
    )

    // And the numbered markers on the map itself, the third way in.
    const fromCanvas = DEMO.events[4].sampleIndex
    expect(fromCanvas).not.toBe(fromPanel)
    fireEvent.click(container.querySelectorAll('.event-marker')[4])
    expect(selectedPoint(container)).toBe(`POINT ${fromCanvas + 1}`)
    expect(container.querySelector('.hover-readout strong')?.textContent).toBe(kph(fromCanvas))
    expect(container.querySelector('.selected-kart circle')?.getAttribute('cx')).toBe(
      String(DEMO.samples[fromCanvas].position.x),
    )
  })
})

describe('two solves in flight at once', () => {
  it('keeps the sample a short lap cut the pick to, when a longer lap lands after it', async () => {
    // `simulate` clears the pick as it starts, but Simulate comes back as soon
    // as the status leaves 'running', and a refused upload sets it to 'error'.
    // So a second solve can start before the first lands, and a sample picked
    // after that start is still stored when both arrive. The first lap here is
    // one sample long and can only show POINT 1. Unless `installResult` clamps
    // the stored pick to that lap, the full lap landing next brings back a pick
    // the screen had already stopped showing.
    let releaseFirst: (() => void) | undefined
    let releaseSecond: (() => void) | undefined
    const first = new Promise<void>((resolve) => (releaseFirst = resolve))
    const second = new Promise<void>((resolve) => (releaseSecond = resolve))
    let solves = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        if (String(input).includes('/health')) return new Response('{}', { status: 200 })
        solves += 1
        if (solves === 1) {
          await first
          return new Response(JSON.stringify(API_RESULT), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        // Busy slots hand the solve to the browser, and with the inputs
        // untouched that is the lap the app opened on.
        await second
        return new Response('{}', { status: 429 })
      }),
    )

    const user = userEvent.setup()
    const { container } = renderApp()
    expect(await screen.findByText('MVP engine connected')).toBeInTheDocument()

    const simulateButton = screen.getByRole('button', { name: /simulate again/i })
    await user.click(simulateButton)
    expect(simulateButton).toBeDisabled()

    const trace = new File(['<gpx></gpx>'], 'huge.gpx', { type: 'application/gpx+xml' })
    Object.defineProperty(trace, 'size', { value: GPS_LIMITS.uploadBytes + 1 })
    await user.upload(container.querySelector('input[type="file"][accept*="gpx"]') as HTMLInputElement, trace)
    expect(await screen.findByText(/exceeds the 16 MB limit/)).toBeInTheDocument()
    expect(simulateButton).toBeEnabled()
    await user.click(simulateButton)
    await vi.waitFor(() => expect(solves).toBe(2))

    // The panel lists only the lap's first ten events, so the pick is the last
    // one it lists rather than the lap's last event.
    const events = container.querySelectorAll<HTMLButtonElement>('.event-list button')
    const picked = DEMO.events[events.length - 1].sampleIndex
    expect(picked).toBeGreaterThan(0)
    await user.click(events[events.length - 1])
    expect(selectedPoint(container)).toBe(`POINT ${picked + 1}`)

    // The engine's lap is ten seconds long, which is how it reads on screen.
    releaseFirst!()
    await vi.waitFor(() => expect(document.body.textContent).toContain('0:10.00'))
    expect(selectedPoint(container)).toBe('POINT 1')

    releaseSecond!()
    expect(await screen.findByText(/computed locally in the browser/i)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('0:10.00')
    expect(selectedPoint(container)).toBe('POINT 1')
    expect(container.querySelector('.selected-kart circle')?.getAttribute('cx')).toBe(
      String(DEMO.samples[0].position.x),
    )
  })
})

describe('the import button in the header', () => {
  it('opens the project picker and not one of the other two hidden file inputs', async () => {
    // Three file inputs are hidden in the page -- the project, the background
    // image and the GPS trace -- and the header button reaches its own by ref.
    // Reaching the wrong one would still open a picker, so the button would
    // look like it worked while offering the wrong file types.
    const user = userEvent.setup()
    const { container } = renderApp()

    const opened: string[] = []
    container.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((input) => {
      input.addEventListener('click', () => opened.push(input.accept))
    })
    expect(opened).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Import' }))

    expect(opened).toEqual(['.json,.okl.json,application/json'])
  })
})

describe('saving the project', () => {
  afterEach(() => vi.restoreAllMocks())

  it('writes the track and kart that are on screen, not the ones it started from', async () => {
    // Save builds the file from the live inputs at the moment it is clicked.
    // The file is the only thing the user leaves with, so it has to carry the
    // circuit they loaded and the edit they made, under a name taken from that
    // same track rather than from the example the session opened on.
    const user = userEvent.setup()
    const saved = captureDownload()
    renderApp()

    await user.selectOptions(screen.getByLabelText(/start from an example/i), 'oval')
    const power = screen.getByLabelText(/power/i)
    await user.clear(power)
    await user.type(power, '18')

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/project \.okl\.json saved/i)).toBeInTheDocument()

    expect(saved.count()).toBe(1)
    expect(saved.filename()).toBe('validation-oval.okl.json')
    const project = await saved.project()
    expect(project.project.name).toBe('Validation Oval')
    expect(project.kart.parameters.power_hp).toBe(18)
    expect(project.track.raw_centerline).toHaveLength(PRESETS.oval.centerline.length)
  })

  it('carries the warnings the build produced into the run bar', async () => {
    // A background over the file budget is dropped from the project and kept
    // only as its calibration. The note saying so is the user's only sign that
    // the picture is not in the file they just saved, so it has to travel with
    // the confirmation instead of being discarded alongside the image.
    const user = userEvent.setup()
    const saved = captureDownload()
    const { container } = renderApp()

    const { project } = toProject(
      {
        ...PRESETS.oval,
        background: {
          imageDataUrl: TINY_JPEG,
          imageWidthPx: 1200,
          imageHeightPx: 800,
          scaleMPerPx: 0.35,
        },
      },
      DEFAULT_KART,
      { safetyMarginM: 0.5, sampleCount: 240 },
    )
    // Past the 500 KB image budget, inside the 1 MiB project limit: it imports
    // and then cannot be saved back.
    project.track.background!.image_data_url = `data:image/jpeg;base64,${'A'.repeat(700_000)}`
    const input = container.querySelector('input[type="file"][accept*="okl"]') as HTMLInputElement
    await user.upload(
      input,
      new File([JSON.stringify(project)], 'heavy.okl.json', { type: 'application/json' }),
    )
    expect(await screen.findByLabelText(/known distance on the image/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    const runMessage = container.querySelector('.run-message')?.textContent ?? ''
    expect(runMessage).toContain('Project .okl.json saved to your device.')
    expect(runMessage).toContain('background image was too large for the file')

    const written = await saved.project()
    expect(written.track.background.image_data_url).toBeUndefined()
    expect(written.track.background.scale_m_per_px).toBe(0.35)
  })

  it('refuses to save an out-of-range input, and downloads nothing', async () => {
    // Save has its own guard: the Simulate button is disabled when the inputs
    // are invalid, but Save is not, so without it the user would walk away with
    // a file the app itself would reject on import.
    const user = userEvent.setup()
    const saved = captureDownload()
    const { container } = renderApp()

    const power = screen.getByLabelText(/power/i)
    await user.clear(power)
    await user.type(power, '500')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/fix the highlighted fields before saving/i)).toBeInTheDocument()
    expect(container.querySelector('.run-bar')).toHaveClass('error')
    expect(saved.count()).toBe(0)
  })
})

describe('the language switch', () => {
  it('re-renders a sentence composed before the switch, in both directions', async () => {
    // The run bar holds its message as parts and renders it at paint, so a
    // sentence built when the circuit was loaded follows the toggle instead of
    // freezing in the language that was on screen when the click happened. The
    // return trip is the half a one-way test cannot see: a switch that only
    // ever adds the second locale looks identical to one that works.
    const user = userEvent.setup()
    renderApp()

    await user.selectOptions(screen.getByLabelText(/start from an example/i), 'oval')
    expect(screen.getByText(/Validation Oval loaded\./)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'PT' }))
    expect(await screen.findByText(/Validation Oval carregado\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PT' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(await screen.findByText(/Validation Oval loaded\./)).toBeInTheDocument()
    expect(screen.queryByText(/carregado/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('re-renders an engine failure caught before the switch', async () => {
    // `runSimulation` rendered its own failures with the translator it was
    // handed, so the run bar held the English sentence as plain text and kept
    // it after the toggle while the header beside it turned Portuguese.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) =>
        String(input).includes('/health')
          ? new Response('{}', { status: 200 })
          : new Response('Internal Server Error', { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    renderApp()
    expect(await screen.findByText('MVP engine connected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /recalculate lap|simulate again/i }))
    expect(await screen.findByText(/responded with HTTP 500\./)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'PT' }))
    expect(await screen.findByText(/respondeu com HTTP 500\./)).toBeInTheDocument()
    expect(screen.queryByText(/responded with HTTP 500/)).not.toBeInTheDocument()
  })
})

describe('an engine that rejects several fields', () => {
  it('shows every one of them, not just the first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) =>
        String(input).includes('/health')
          ? new Response('{}', { status: 200 })
          : new Response(
              JSON.stringify({
                detail: [
                  { loc: ['body', 'kart', 'power_hp'], msg: 'too big' },
                  { loc: ['body', 'settings', 'sample_count'], msg: 'too small' },
                ],
              }),
              { status: 422, headers: { 'Content-Type': 'application/json' } },
            ),
      ),
    )
    const user = userEvent.setup()
    const { container } = renderApp()
    expect(await screen.findByText('MVP engine connected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /recalculate lap|simulate again/i }))

    expect(await screen.findByText(/rejected settings\.sample_count/)).toBeInTheDocument()
    expect(container.querySelector('.run-message')).toHaveTextContent(
      'The engine rejected kart.power_hp: too big. The engine rejected settings.sample_count: too small.',
    )
  })
})
