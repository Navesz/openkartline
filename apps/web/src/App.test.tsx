import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('OpenKartLine application', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline'))))

  it('starts with a useful local demo and recalculates edited kart inputs', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('heading', { name: /planeje uma volta melhor/i })).toBeInTheDocument()
    expect(screen.getByText('Fallback local')).toBeInTheDocument()
    const power = screen.getByLabelText(/potência/i)
    await user.clear(power)
    await user.type(power, '20')
    await user.click(screen.getByRole('button', { name: /recalcular volta/i }))
    expect(await screen.findByText(/referência calculada localmente/i)).toBeInTheDocument()
  })

  it('offers a keyboard-operable numeric control-point editor', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByText(/editar ponto por coordenadas/i))
    const xInput = screen.getByLabelText(/ponto 1 · x/i)
    await user.clear(xInput)
    await user.type(xInput, '7.5')
    expect(xInput).toHaveValue(7.5)
    expect(screen.getByRole('button', { name: /remover ponto 1/i })).toBeEnabled()
  })
})
