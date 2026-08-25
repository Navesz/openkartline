import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { I18nProvider } from './i18n/I18nProvider'

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
