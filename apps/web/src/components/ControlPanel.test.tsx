import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_KART, KART_PRESETS, PRESETS, REAL_TRACK_KEYS, toKartInput } from '../domain/presets'
import type { KartInput, TrackInput, ValidationIssue } from '../domain/types'
import { I18nProvider } from '../i18n/I18nProvider'
import { LocalisedError } from '../domain/localisedError'
import { ControlPanel } from './ControlPanel'

const BACKGROUND = {
  imageDataUrl: 'data:image/jpeg;base64,/9j/',
  imageWidthPx: 1200,
  imageHeightPx: 800,
}

function renderPanel(
  overrides: {
    track?: TrackInput
    issues?: ValidationIssue[]
    kart?: KartInput
    trackPresetKey?: string
  } = {},
) {
  const onCalibrate = vi.fn()
  const onPointRemove = vi.fn()
  const { container } = render(
    <I18nProvider>
      <ControlPanel
        track={overrides.track ?? PRESETS.oval}
        kart={overrides.kart ?? DEFAULT_KART}
        settings={{ safetyMarginM: 0.5, sampleCount: 200 }}
        issues={overrides.issues ?? []}
        onTrack={vi.fn()}
        onKart={vi.fn()}
        onSettings={vi.fn()}
        onPreset={vi.fn()}
        onPointChange={vi.fn()}
        onPointRemove={onPointRemove}
        onImageFile={vi.fn()}
        onRemoveImage={vi.fn()}
        onGpsFile={vi.fn()}
        onCalibrate={onCalibrate}
        trackPresetKey={overrides.trackPresetKey ?? 'technical'}
      />
    </I18nProvider>,
  )
  return { onCalibrate, onPointRemove, container }
}

describe('ControlPanel accessibility', () => {
  it('announces validation issues from a region that is already mounted', () => {
    // A live region that appears at the same moment as its content has nothing
    // to compare against, so the first error was never announced.
    const { container } = renderPanel()
    const region = container.querySelector('.issue-list')
    expect(region).toBeInTheDocument()
    expect(region).toHaveAttribute('role', 'status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toBeEmptyDOMElement()
  })

  it('renders the issues into that same region', () => {
    renderPanel({
      issues: [{ level: 'error', message: 'Corridor is too narrow' }],
    })
    expect(screen.getByText('Corridor is too narrow')).toBeInTheDocument()
  })

  it('offers calibration without a pointer once an image is attached', async () => {
    // The canvas tool needs two clicks, so a keyboard user who imports an image
    // is otherwise stuck: simulation stays blocked on an uncalibrated
    // background and the only way out is deleting the picture.
    const user = userEvent.setup()
    const { onCalibrate } = renderPanel({
      track: { ...PRESETS.oval, background: BACKGROUND },
    })

    const pixels = screen.getByLabelText(/known distance on the image/i)
    const metres = screen.getByLabelText(/that distance in real metres/i)
    await user.clear(pixels)
    await user.type(pixels, '250')
    await user.clear(metres)
    await user.type(metres, '100')
    await user.click(screen.getByRole('button', { name: /set scale/i }))

    expect(onCalibrate).toHaveBeenCalledWith(250, 100)
  })

  it('does not offer it when there is no image to calibrate against', () => {
    renderPanel()
    expect(screen.queryByLabelText(/known distance on the image/i)).not.toBeInTheDocument()
  })

  it('surfaces the reason a calibration was rejected', async () => {
    const user = userEvent.setup()
    render(
      <I18nProvider>
        <ControlPanel
          track={{ ...PRESETS.oval, background: BACKGROUND }}
          kart={DEFAULT_KART}
          settings={{ safetyMarginM: 0.5, sampleCount: 200 }}
          issues={[]}
          onTrack={vi.fn()}
          onKart={vi.fn()}
          onSettings={vi.fn()}
          onPreset={vi.fn()}
          onPointChange={vi.fn()}
          onPointRemove={vi.fn()}
          onImageFile={vi.fn()}
          onRemoveImage={vi.fn()}
          onGpsFile={vi.fn()}
          trackPresetKey="technical"
          onCalibrate={() => {
            throw new LocalisedError({ key: 'imports.calibrationPointsTooClose' })
          }}
        />
      </I18nProvider>,
    )

    await user.click(screen.getByRole('button', { name: /set scale/i }))

    // `LocalisedError.message` is the key, so reading it put
    // `imports.calibrationPointsTooClose` in front of the user.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/farther apart/i)
    expect(alert).not.toHaveTextContent(/imports\./)
  })
})

describe('the track picker names the tracks it selects', () => {
  it.each(REAL_TRACK_KEYS)('offers %s under the name the preset carries', (key) => {
    // The option labels used to be retyped in the component, and one had
    // already drifted: the picker read "Kartódromo Int. de Volta Redonda"
    // while the track it selected was named "Kartódromo Internacional de
    // Volta Redonda". Rendering from the data makes that impossible.
    renderPanel()
    const option = screen.getByRole('option', { name: PRESETS[key].name })
    expect(option).toHaveValue(key)
  })

  it('offers every real track exactly once', () => {
    const { container } = renderPanel()
    const values = [...container.querySelectorAll('optgroup')]
      .flatMap((group) => [...group.querySelectorAll('option')])
      .map((option) => option.value)
    for (const key of REAL_TRACK_KEYS) {
      expect(values.filter((value) => value === key)).toHaveLength(1)
    }
  })
})

describe('the pickers say what is actually loaded', () => {
  it('names the kart preset only while the values still match it', () => {
    // Both pickers were uncontrolled, so they went on naming a choice after the
    // thing under it had been edited away or replaced outright.
    const { container } = renderPanel({ kart: toKartInput(KART_PRESETS.senior) })
    const picker = container.querySelector('#kart-preset') as HTMLSelectElement
    expect(picker.value).toBe('senior')
  })

  it('falls back to Custom once a value is edited away from the preset', () => {
    const edited = { ...toKartInput(KART_PRESETS.senior), powerHp: 42 }
    const { container } = renderPanel({ kart: edited })
    const picker = container.querySelector('#kart-preset') as HTMLSelectElement
    expect(picker.value).toBe('')
  })

  it('does not name a circuit for a track that is not a preset', () => {
    // The label covers every way a track stops being a preset -- imported,
    // traced from GPS, or edited -- now that the key is derived from the track
    // rather than set by whichever loader ran last.
    const { container } = renderPanel({ trackPresetKey: '' })
    const picker = container.querySelector('#preset') as HTMLSelectElement
    expect(picker.value).toBe('')
    expect(picker.selectedOptions[0].textContent).toMatch(/custom track/i)
  })
})
