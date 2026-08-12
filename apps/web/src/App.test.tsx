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
