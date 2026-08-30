import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_KART, KART_PRESETS, PRESETS, REAL_TRACK_KEYS, toKartInput } from '../domain/presets'
import type { KartInput, Point, SimulationSettings, TrackInput, ValidationIssue } from '../domain/types'
import { I18nProvider } from '../i18n/I18nProvider'
import { useI18n } from '../i18n/context'
import { LocalisedError } from '../domain/localisedError'
import { ControlPanel } from './ControlPanel'

/*
 * `I18nProvider` persists the locale, so a test that switches language leaves
 * every test declared after it running in that language, and one below does.
 *
 * Load-bearing, not hygiene: delete this line and 33 of the 49 tests in this
 * file fail. It is one line guarding a third of the file, which is exactly the
 * shape somebody tidies away as noise, so the number is written down.
 */
beforeEach(() => localStorage.clear())

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
    settings?: SimulationSettings
    trackPresetKey?: string
  } = {},
) {
  const spies = {
    onTrack: vi.fn(),
    onKart: vi.fn(),
    onSettings: vi.fn(),
    onPreset: vi.fn(),
    onPointChange: vi.fn(),
    onPointRemove: vi.fn(),
    onImageFile: vi.fn(),
    onRemoveImage: vi.fn(),
    onGpsFile: vi.fn(),
    onCalibrate: vi.fn(),
  }
  const { container } = render(
    <I18nProvider>
      <ControlPanel
        track={overrides.track ?? PRESETS.oval}
        kart={overrides.kart ?? DEFAULT_KART}
        settings={overrides.settings ?? { safetyMarginM: 0.5, sampleCount: 200 }}
        issues={overrides.issues ?? []}
        trackPresetKey={overrides.trackPresetKey ?? 'technical'}
        {...spies}
      />
    </I18nProvider>,
  )
  return { ...spies, container }
}

/** Opening the editor is the first step of every test that uses it. */
async function openPointEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(/edit point by coordinates/i))
}

/** The grip, braking, margin and sample fields live behind this. */
async function openAdvancedSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(/advanced settings/i))
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
      issues: [{ level: 'error', note: { text: 'Corridor is too narrow' } }],
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

  it('translates that reason when the language changes afterwards', async () => {
    // The reason was rendered into state at the moment the calibration was
    // rejected, so it stayed English while the button beside it turned into
    // "Definir escala" -- the staleness removed from the canvas overlay,
    // surviving in the keyboard path beside it.
    const user = userEvent.setup()

    function Harness() {
      const { setLocale } = useI18n()
      return (
        <>
          <button onClick={() => setLocale('pt-BR')}>switch</button>
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
        </>
      )
    }

    render(
      <I18nProvider>
        <Harness />
      </I18nProvider>,
    )

    await user.click(screen.getByRole('button', { name: /set scale/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/farther apart/i)

    await user.click(screen.getByRole('button', { name: 'switch' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/mais afastados/i)
    expect(screen.getByRole('alert')).not.toHaveTextContent(/farther apart/i)
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

const OVAL_POINTS = PRESETS.oval.centerline

describe('the keyboard point editor', () => {
  it('walks the centreline with the arrows, and the fields follow', async () => {
    // The arrows are the only way to reach a point without a pointer, so they
    // have to move the selection *and* repoint the coordinate fields at it.
    const user = userEvent.setup()
    const { container } = renderPanel()
    await openPointEditor(user)
    const picker = container.querySelector('#control-point') as HTMLSelectElement
    expect(picker.value).toBe('0')

    await user.click(screen.getByRole('button', { name: /next point/i }))

    expect(picker.value).toBe('1')
    expect(screen.getByLabelText(/point 2 · x/i)).toHaveValue(OVAL_POINTS[1].x)
    expect(screen.getByLabelText(/point 2 · y/i)).toHaveValue(OVAL_POINTS[1].y)

    await user.click(screen.getByRole('button', { name: /previous point/i }))

    expect(picker.value).toBe('0')
    expect(screen.getByLabelText(/point 1 · x/i)).toHaveValue(OVAL_POINTS[0].x)
  })

  it('stops at each end of the centreline instead of wrapping', async () => {
    // An index that runs past the last point leaves `selectedPoint` undefined,
    // and the guard above the editor then unmounts the whole block -- so the
    // step off the end is not a cosmetic overshoot, it closes the editor.
    const user = userEvent.setup()
    const { container } = renderPanel()
    await openPointEditor(user)
    const previous = screen.getByRole('button', { name: /previous point/i })
    const next = screen.getByRole('button', { name: /next point/i })
    const picker = container.querySelector('#control-point') as HTMLSelectElement
    expect(previous).toBeDisabled()
    expect(next).toBeEnabled()

    // Clicking a disabled control does nothing, so the index has to stay put.
    await user.click(previous)
    expect(picker.value).toBe('0')

    await user.selectOptions(picker, String(OVAL_POINTS.length - 1))

    expect(next).toBeDisabled()
    expect(previous).toBeEnabled()
    await user.click(next)
    expect(picker.value).toBe(String(OVAL_POINTS.length - 1))
  })

  it('edits X on the selected point and leaves Y where it was', async () => {
    // Edited after stepping, so the index has to travel with the selection
    // rather than staying at the point the editor opened on. Y is asserted
    // because the patch is a whole `Point`: dropping the spread would silently
    // move the point to y = 0 as well.
    const user = userEvent.setup()
    const { onPointChange } = renderPanel()
    await openPointEditor(user)
    await user.click(screen.getByRole('button', { name: /next point/i }))

    const x = screen.getByLabelText(/point 2 · x/i)
    await user.clear(x)
    await user.type(x, '42.5')

    expect(onPointChange).toHaveBeenLastCalledWith(1, { x: 42.5, y: OVAL_POINTS[1].y })
  })

  it('edits Y on the selected point and leaves X where it was', async () => {
    const user = userEvent.setup()
    const { onPointChange } = renderPanel()
    await openPointEditor(user)
    await user.click(screen.getByRole('button', { name: /next point/i }))

    const y = screen.getByLabelText(/point 2 · y/i)
    await user.clear(y)
    await user.type(y, '-8')

    expect(onPointChange).toHaveBeenLastCalledWith(1, { x: OVAL_POINTS[1].x, y: -8 })
  })

  it('removes the point that is selected, and says which one that is', async () => {
    const user = userEvent.setup()
    const { onPointRemove } = renderPanel()
    await openPointEditor(user)
    await user.click(screen.getByRole('button', { name: /next point/i }))
    await user.click(screen.getByRole('button', { name: /next point/i }))

    // The button names the point it will delete; that name is the only warning
    // the user gets before it goes.
    await user.click(screen.getByRole('button', { name: /remove point 3/i }))

    expect(onPointRemove).toHaveBeenCalledWith(2)
  })
})

/**
 * The panel is controlled, so a removal only shortens the centreline if
 * something above it owns the track. That render -- the one where the
 * centreline is shorter but the index is not yet -- is the whole problem.
 */
function TrackOwner({
  centerline,
  onPointRemove,
}: {
  centerline: Point[]
  onPointRemove: (index: number) => void
}) {
  const [track, setTrack] = useState<TrackInput>({ ...PRESETS.oval, centerline })
  return (
    <I18nProvider>
      <ControlPanel
        track={track}
        kart={DEFAULT_KART}
        settings={{ safetyMarginM: 0.5, sampleCount: 200 }}
        issues={[]}
        trackPresetKey=""
        onTrack={vi.fn()}
        onKart={vi.fn()}
        onSettings={vi.fn()}
        onPreset={vi.fn()}
        onPointChange={vi.fn()}
        onImageFile={vi.fn()}
        onRemoveImage={vi.fn()}
        onGpsFile={vi.fn()}
        onCalibrate={vi.fn()}
        onPointRemove={(index) => {
          onPointRemove(index)
          setTrack((current) => ({
            ...current,
            centerline: current.centerline.filter((_, position) => position !== index),
          }))
        }}
      />
    </I18nProvider>
  )
}

describe('removing a point from the panel that owns the index', () => {
  it('clamps the selection onto the point that took its place', async () => {
    // Removing the last point leaves the index pointing past the end. Clamping
    // in an effect is a frame late: for that frame `selectedPoint` is
    // undefined, the guard unmounts the editor, and the open <details> and the
    // focus inside it go with it.
    const user = userEvent.setup()
    const { container } = render(<TrackOwner centerline={OVAL_POINTS.slice(0, 6)} onPointRemove={vi.fn()} />)
    await openPointEditor(user)
    const editor = container.querySelector('details.point-editor') as HTMLDetailsElement
    const picker = container.querySelector('#control-point') as HTMLSelectElement
    await user.selectOptions(picker, '5')

    await user.click(screen.getByRole('button', { name: /remove point 6/i }))

    expect(container.querySelector('details.point-editor')).toBe(editor)
    expect(editor.open).toBe(true)
    expect((container.querySelector('#control-point') as HTMLSelectElement).value).toBe('4')
    expect(screen.getByLabelText(/point 5 · x/i)).toHaveValue(OVAL_POINTS[4].x)
  })

  it('hands focus to the picker before the button can disable itself', async () => {
    // Removing the fifth point disables this very button, and a disabled
    // control drops focus to <body>, which restarts Tab at the skip link.
    const user = userEvent.setup()
    const { container } = render(<TrackOwner centerline={OVAL_POINTS.slice(0, 5)} onPointRemove={vi.fn()} />)
    await openPointEditor(user)

    await user.click(screen.getByRole('button', { name: /remove point 1/i }))

    // Only the positive assertion. `not.toBe(document.body)` reads like a second
    // guard and is not one: delete the focus hand-off and jsdom leaves the focus
    // on the now-disabled button, so that line passes under the exact failure
    // this test exists to catch. jsdom does not blur a control when it becomes
    // disabled; a browser does. Asserting the destination is the claim that
    // holds in both.
    expect(document.activeElement).toBe(container.querySelector('#control-point'))
  })

  it('refuses to go below four points', async () => {
    // Four is the floor the geometry needs; below it there is no corridor left
    // to simulate.
    const user = userEvent.setup()
    const onPointRemove = vi.fn()
    render(<TrackOwner centerline={OVAL_POINTS.slice(0, 5)} onPointRemove={onPointRemove} />)
    await openPointEditor(user)

    await user.click(screen.getByRole('button', { name: /remove point 1/i }))
    expect(onPointRemove).toHaveBeenCalledTimes(1)

    const remove = screen.getByRole('button', { name: /remove point 1/i })
    expect(remove).toBeDisabled()
    await user.click(remove)
    expect(onPointRemove).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/4 points/i)).toBeInTheDocument()
  })
})

describe('the kart fields', () => {
  it.each([
    ['power', /power/i, '18', { powerHp: 18 }],
    ['top speed', /top speed/i, '95', { topSpeedKph: 95 }],
    ['kart mass', /kart/i, '140', { kartMassKg: 140 }],
    ['driver mass', /driver/i, '68', { driverMassKg: 68 }],
  ] as [string, RegExp, string, Partial<KartInput>][])(
    'sends the %s field out as a number, not as typed text',
    async (_name, label, typed, patch) => {
      const user = userEvent.setup()
      const { onKart } = renderPanel()
      const field = screen.getByLabelText(label)
      await user.clear(field)
      await user.type(field, typed)
      expect(onKart).toHaveBeenLastCalledWith(patch)
    },
  )

  it.each([
    ['grip', /grip/i, '1.2', { gripCoefficient: 1.2 }],
    ['braking', /braking/i, '9.5', { brakeDecelMps2: 9.5 }],
  ] as [string, RegExp, string, Partial<KartInput>][])(
    'sends the advanced %s field out as a number too',
    async (_name, label, typed, patch) => {
      const user = userEvent.setup()
      const { onKart } = renderPanel()
      await openAdvancedSettings(user)
      const field = screen.getByLabelText(label)
      await user.clear(field)
      await user.type(field, typed)
      expect(onKart).toHaveBeenLastCalledWith(patch)
    },
  )

  it('keeps an emptied field empty instead of committing the zero it parses to', async () => {
    // Clearing a field is the first half of retyping it. Without the draft the
    // field snapped straight back to the value it already had, so the number
    // could only be edited by overtyping it digit by digit -- and `Number('')`
    // is 0, which is not a power the user ever asked for.
    const user = userEvent.setup()
    const { onKart } = renderPanel()
    const power = screen.getByLabelText(/power/i)

    await user.clear(power)

    expect(power).toHaveValue(null)
    expect(onKart).not.toHaveBeenCalled()

    await user.type(power, '9')
    expect(onKart).toHaveBeenCalledTimes(1)
    expect(onKart).toHaveBeenCalledWith({ powerHp: 9 })
  })

  it('drops a half-typed draft when the field loses focus', async () => {
    // The draft is only there to survive the keystrokes in between. Once the
    // field is left, what it shows has to be the value the app actually holds,
    // or an abandoned edit reads as though it had been applied.
    const user = userEvent.setup()
    renderPanel()
    const power = screen.getByLabelText(/power/i)
    await user.clear(power)
    expect(power).toHaveValue(null)

    await user.tab()

    expect(power).toHaveValue(DEFAULT_KART.powerHp)
  })

  it('adds the driver to the kart in the mass summary', () => {
    renderPanel({ kart: { ...DEFAULT_KART, kartMassKg: 118, driverMassKg: 72 } })
    expect(screen.getByText('190 kg')).toBeInTheDocument()
  })
})

describe('the simulation settings', () => {
  it.each([
    ['sample count', /samples/i, '320', { sampleCount: 320 }],
    ['safety margin', /margin/i, '1.5', { safetyMarginM: 1.5 }],
  ] as [string, RegExp, string, Partial<SimulationSettings>][])(
    'routes the %s to onSettings rather than to the kart',
    async (_name, label, typed, patch) => {
      // Margin and samples sit in the same grid as grip and braking but belong
      // to a different object; wiring one of them to `onKart` would drop it.
      const user = userEvent.setup()
      const { onSettings, onKart } = renderPanel()
      await openAdvancedSettings(user)
      const field = screen.getByLabelText(label)
      await user.clear(field)
      await user.type(field, typed)
      expect(onSettings).toHaveBeenLastCalledWith(patch)
      expect(onKart).not.toHaveBeenCalled()
    },
  )
})

describe('the file imports', () => {
  it.each([
    ['track image', /track image/i, /import track image/i],
    ['GPS trace', /gps/i, /import gps track/i],
  ] as [string, RegExp, RegExp][])(
    'opens the hidden %s picker from the visible button',
    async (_name, button, input) => {
      // The real input is visually hidden, so the button beside it is the only
      // thing a user can press to reach the file dialog.
      const user = userEvent.setup()
      renderPanel()
      const opened = vi.spyOn(screen.getByLabelText(input), 'click')

      await user.click(screen.getByRole('button', { name: button }))

      expect(opened).toHaveBeenCalled()
    },
  )

  it('hands the chosen image over and clears the input behind it', async () => {
    // A file input that keeps its value fires no change event the second time
    // the same file is chosen, so re-importing a picture the user had just
    // removed did nothing at all until the value was reset.
    const user = userEvent.setup()
    const { onImageFile, onGpsFile } = renderPanel()
    const input = screen.getByLabelText(/import track image/i) as HTMLInputElement
    const file = new File(['not really a png'], 'track.png', { type: 'image/png' })

    await user.upload(input, file)

    expect(onImageFile).toHaveBeenCalledWith(file)
    expect(onGpsFile).not.toHaveBeenCalled()
    expect(input.value).toBe('')
  })

  it('hands the chosen GPS trace over and clears that input too', async () => {
    const user = userEvent.setup()
    const { onGpsFile, onImageFile } = renderPanel()
    const input = screen.getByLabelText(/import gps track/i) as HTMLInputElement
    const file = new File(['<gpx></gpx>'], 'lap.gpx', { type: 'application/gpx+xml' })

    await user.upload(input, file)

    expect(onGpsFile).toHaveBeenCalledWith(file)
    expect(onImageFile).not.toHaveBeenCalled()
    expect(input.value).toBe('')
  })
})

describe('the background image status', () => {
  it('reports the size of the image and that it has no scale yet', () => {
    renderPanel({ track: { ...PRESETS.oval, background: BACKGROUND } })
    expect(screen.getByText(/image 1200×800 px/i)).toBeInTheDocument()
    expect(screen.getByText(/no scale/i)).toBeInTheDocument()
  })

  it('reports the scale once one has been set, in place of the warning', () => {
    renderPanel({
      track: { ...PRESETS.oval, background: { ...BACKGROUND, scaleMPerPx: 0.125 } },
    })
    expect(screen.getByText(/scale 0\.125 m\/px/i)).toBeInTheDocument()
    expect(screen.queryByText(/calibrate before simulating/i)).not.toBeInTheDocument()
  })

  it('removes the image on request', async () => {
    const user = userEvent.setup()
    const { onRemoveImage } = renderPanel({ track: { ...PRESETS.oval, background: BACKGROUND } })

    await user.click(screen.getByRole('button', { name: /^remove$/i }))

    expect(onRemoveImage).toHaveBeenCalledTimes(1)
  })
})

describe('the pickers apply what they name', () => {
  it('loads the track a preset names', async () => {
    const user = userEvent.setup()
    const { onPreset } = renderPanel()

    await user.selectOptions(screen.getByLabelText(/start from an example/i), 'hairpin')

    expect(onPreset).toHaveBeenCalledWith('hairpin')
  })

  it('applies every figure of a kart category, not just its label', async () => {
    // The picker is what a beginner reaches for first; naming a category
    // without loading its power, mass and grip would leave the default kart
    // running under someone else's name.
    const user = userEvent.setup()
    const { onKart } = renderPanel()

    await user.selectOptions(screen.getByLabelText(/category/i), 'shifter')

    expect(onKart).toHaveBeenCalledWith(toKartInput(KART_PRESETS.shifter))
  })

  it('leaves the kart alone when Custom is picked, because it names no preset', async () => {
    // "Custom" is what the picker falls back to once a figure is edited by
    // hand; choosing it is not a request to load anything.
    const user = userEvent.setup()
    const { onKart } = renderPanel({ kart: toKartInput(KART_PRESETS.senior) })

    await user.selectOptions(screen.getByLabelText(/category/i), '')

    expect(onKart).not.toHaveBeenCalled()
  })
})

describe('the track fields', () => {
  it('patches the track name as it is typed', async () => {
    const user = userEvent.setup()
    const { onTrack } = renderPanel()

    await user.type(screen.getByLabelText(/track name/i), '!')

    expect(onTrack).toHaveBeenCalledWith({ name: `${PRESETS.oval.name}!` })
  })

  it('patches the width as a number', async () => {
    const user = userEvent.setup()
    const { onTrack } = renderPanel()
    const width = screen.getByLabelText(/width/i)

    await user.clear(width)
    await user.type(width, '6.5')

    expect(onTrack).toHaveBeenLastCalledWith({ widthM: 6.5 })
  })

  it('patches the direction the lap is driven in', async () => {
    // Direction decides which side of the centreline the racing line is
    // allowed to use, so it has to reach the track and not stop at the select.
    const user = userEvent.setup()
    const { onTrack } = renderPanel()

    await user.selectOptions(screen.getByLabelText(/direction/i), 'counterclockwise')

    expect(onTrack).toHaveBeenCalledWith({ direction: 'counterclockwise' })
  })

  it('credits the source of a track that came with an attribution', () => {
    renderPanel({ track: PRESETS[REAL_TRACK_KEYS[0]] })
    expect(screen.getByText(/openstreetmap contributors/i)).toBeInTheDocument()
  })
})

describe('notes that were written elsewhere', () => {
  it('translates an issue that names a message key, and keeps translating it', async () => {
    // Issues arrive as notes rather than as sentences for the same reason the
    // calibration error does: wording chosen when the issue was raised stays in
    // whichever language was on screen then, and the key itself is not English.
    const user = userEvent.setup()

    function Harness() {
      const { setLocale } = useI18n()
      return (
        <>
          <button onClick={() => setLocale('pt-BR')}>switch</button>
          <ControlPanel
            track={PRESETS.oval}
            kart={DEFAULT_KART}
            settings={{ safetyMarginM: 0.5, sampleCount: 200 }}
            issues={[{ level: 'error', note: { key: 'validation.backgroundUncalibrated' } }]}
            trackPresetKey="oval"
            onTrack={vi.fn()}
            onKart={vi.fn()}
            onSettings={vi.fn()}
            onPreset={vi.fn()}
            onPointChange={vi.fn()}
            onPointRemove={vi.fn()}
            onImageFile={vi.fn()}
            onRemoveImage={vi.fn()}
            onGpsFile={vi.fn()}
            onCalibrate={vi.fn()}
          />
        </>
      )
    }

    render(
      <I18nProvider>
        <Harness />
      </I18nProvider>,
    )

    expect(screen.getByText(/doesn't have a scale yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/validation\./)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'switch' }))

    expect(screen.getByText(/ainda não tem escala/i)).toBeInTheDocument()
    expect(screen.queryByText(/doesn't have a scale yet/i)).not.toBeInTheDocument()
  })

  it('shows a calibration failure that named no key in its own words', async () => {
    // `noteForError` answers anything that is not a `LocalisedError` with
    // `{ text }`, so a failure from outside this app still reaches the user
    // rather than being swallowed by the generic fallback.
    const user = userEvent.setup()
    render(
      <I18nProvider>
        <ControlPanel
          track={{ ...PRESETS.oval, background: BACKGROUND }}
          kart={DEFAULT_KART}
          settings={{ safetyMarginM: 0.5, sampleCount: 200 }}
          issues={[]}
          trackPresetKey="technical"
          onTrack={vi.fn()}
          onKart={vi.fn()}
          onSettings={vi.fn()}
          onPreset={vi.fn()}
          onPointChange={vi.fn()}
          onPointRemove={vi.fn()}
          onImageFile={vi.fn()}
          onRemoveImage={vi.fn()}
          onGpsFile={vi.fn()}
          onCalibrate={() => {
            throw new Error('scale factor is not finite')
          }}
        />
      </I18nProvider>,
    )

    await user.click(screen.getByRole('button', { name: /set scale/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('scale factor is not finite')
  })
})
