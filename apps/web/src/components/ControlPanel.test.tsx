import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_KART, PRESETS } from '../domain/presets'
import type { TrackInput, ValidationIssue } from '../domain/types'
import { I18nProvider } from '../i18n/I18nProvider'
import { ControlPanel } from './ControlPanel'

const BACKGROUND = {
  imageDataUrl: 'data:image/jpeg;base64,/9j/',
  imageWidthPx: 1200,
  imageHeightPx: 800,
}

function renderPanel(overrides: { track?: TrackInput; issues?: ValidationIssue[] } = {}) {
  const onCalibrate = vi.fn()
  const onPointRemove = vi.fn()
  const { container } = render(
    <I18nProvider>
      <ControlPanel
        track={overrides.track ?? PRESETS.oval}
        kart={DEFAULT_KART}
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
          onCalibrate={() => {
            throw new Error('Points are too close together')
          }}
        />
      </I18nProvider>,
    )

    await user.click(screen.getByRole('button', { name: /set scale/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/too close together/i)
  })
})
