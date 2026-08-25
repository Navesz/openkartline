import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { I18nProvider } from './i18n/I18nProvider'

/**
 * A solved lap outlives a language switch.
 *
 * Event labels and result notes used to be rendered to strings when the lap was
 * computed, so switching to Portuguese left the panel half translated: the
 * headings followed the toggle while the values under them stayed English.
 *
 * `I18nProvider` persists the locale, so this lives in its own file with an
 * explicit reset rather than sharing App.test.tsx's module state.
 */
describe('a solved lap follows the language toggle', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  })

  const renderApp = () =>
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    )

  it('translates event labels that were computed in the other locale', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: /recalculate lap|simulate again/i }))
    expect(document.body.textContent).toMatch(/Brake at|Throttle at|Apex ·/)

    await user.click(screen.getByRole('button', { name: /^PT$/ }))

    const body = document.body.textContent ?? ''
    expect(body).toMatch(/Frear em|Acelerar em|Ápice ·/)
    expect(body).not.toMatch(/Brake at|Throttle at/)
  })

  it('translates the result notes too', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: /recalculate lap|simulate again/i }))
    await user.click(screen.getByRole('button', { name: /^PT$/ }))

    const body = document.body.textContent ?? ''
    expect(body).toMatch(/Estimativa do motor físico MVP/)
    expect(body).not.toMatch(/MVP physics-engine estimate/)
  })

  it('translates the run-bar status written before the switch', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: /recalculate lap|simulate again/i }))
    expect(document.body.textContent).toMatch(/Solved locally|computed locally/i)

    await user.click(screen.getByRole('button', { name: /^PT$/ }))

    const runBar = document.querySelector('.run-message')?.textContent ?? ''
    expect(runBar).toMatch(/localmente|navegador/i)
    expect(runBar).not.toMatch(/Solved|locally/i)
  })

  it('translates an import failure written before the switch', async () => {
    // Domain code used to throw `new Error(t('imports.gpxNoPoints'))`, which
    // renders the wording when the failure happens. Switching afterwards left
    // the English sentence in the run bar -- the same staleness, reaching the
    // interface through a thrown error rather than through a result.
    const user = userEvent.setup()
    renderApp()

    const gpsInput = document.querySelector('input[type="file"][accept*="gpx"]') as HTMLInputElement
    const file = new File(['not a gpx document at all'], 'lap.gpx', { type: 'application/gpx+xml' })
    await user.upload(gpsInput, file)

    await screen.findByText(/has no track points/i)

    await user.click(screen.getByRole('button', { name: /^PT$/ }))

    const runBar = document.querySelector('.run-message')?.textContent ?? ''
    expect(runBar).toMatch(/não contém pontos de trajeto/i)
    expect(runBar).not.toMatch(/has no track points/i)
  })
})
