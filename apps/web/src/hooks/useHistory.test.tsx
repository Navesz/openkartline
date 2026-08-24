import type { ReactNode } from 'react'
import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useHistory } from './useHistory'

function Harness() {
  const history = useHistory('a')
  return (
    <div>
      <output data-testid="value">{history.value}</output>
      <output data-testid="canUndo">{String(history.canUndo)}</output>
      <output data-testid="canRedo">{String(history.canRedo)}</output>
      <button onClick={() => history.set((current) => `${current}!`)}>push</button>
      <button onClick={() => history.set((current) => `${current}?`, false)}>drag</button>
      <button onClick={() => history.undo()}>undo</button>
      <button onClick={() => history.redo()}>redo</button>
      <button onClick={() => history.reset('z')}>reset</button>
    </div>
  )
}

/**
 * Every sequence runs bare and inside StrictMode. StrictMode double-invokes
 * updaters in development — which is how `main.tsx` mounts the app — so a hook
 * that checkpoints from inside an updater passes the bare run and still costs
 * the user two presses of undo per edit in `pnpm dev`.
 */
const MOUNTS: [string, (children: ReactNode) => ReactNode][] = [
  ['bare', (children) => children],
  ['StrictMode', (children) => <StrictMode>{children}</StrictMode>],
]

describe.each(MOUNTS)('useHistory (%s)', (_name, wrap) => {
  const setup = () => {
    const user = userEvent.setup()
    render(wrap(<Harness />) as React.ReactElement)
    return {
      user,
      value: () => screen.getByTestId('value').textContent,
      canUndo: () => screen.getByTestId('canUndo').textContent,
      canRedo: () => screen.getByTestId('canRedo').textContent,
      press: (label: string) => user.click(screen.getByText(label)),
    }
  }

  it('takes exactly one undo press per checkpoint', async () => {
    const { value, press } = setup()
    await press('push')
    await press('push')
    await press('push')
    expect(value()).toBe('a!!!')

    await press('undo')
    expect(value()).toBe('a!!')
    await press('undo')
    expect(value()).toBe('a!')
    await press('undo')
    expect(value()).toBe('a')
  })

  it('redoes one checkpoint per press and drops the future on a new edit', async () => {
    const { value, canRedo, press } = setup()
    await press('push')
    await press('push')
    await press('undo')
    expect(value()).toBe('a!')

    await press('redo')
    expect(value()).toBe('a!!')

    await press('undo')
    await press('push')
    expect(value()).toBe('a!!')
    expect(canRedo()).toBe('false')
  })

  it('leaves the stacks alone for an uncheckpointed change', async () => {
    const { value, canUndo, press } = setup()
    await press('push')
    await press('drag')
    await press('drag')
    expect(value()).toBe('a!??')
    expect(canUndo()).toBe('true')

    await press('undo')
    expect(value()).toBe('a')
  })

  it('no-ops at both ends of the stack', async () => {
    const { value, canUndo, canRedo, press } = setup()
    expect(canUndo()).toBe('false')
    await press('undo')
    expect(value()).toBe('a')

    await press('push')
    await press('redo')
    expect(value()).toBe('a!')
    expect(canRedo()).toBe('false')
  })

  it('clears both stacks on reset', async () => {
    const { value, canUndo, canRedo, press } = setup()
    await press('push')
    await press('push')
    await press('undo')
    await press('reset')

    expect(value()).toBe('z')
    expect(canUndo()).toBe('false')
    expect(canRedo()).toBe('false')
  })
})
