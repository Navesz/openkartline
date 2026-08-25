import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { DEFAULT_KART, PRESETS } from './domain/presets'
import { toProject } from './services/projectFile'
import type { TrackInput } from './domain/types'
import { I18nProvider } from './i18n/I18nProvider'

// The chosen locale is persisted, so a test that switches language leaves every
// test after it running in that language. One of them does.
beforeEach(() => window.localStorage.clear())

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
  beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline'))))

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
    // Portuguese -- the staleness #81 removed everywhere else, surviving in
    // the one path that went through `validationErrorMessage`.
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
