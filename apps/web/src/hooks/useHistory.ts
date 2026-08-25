import { useCallback, useReducer } from 'react'

/** Checkpoints kept before the oldest is dropped. */
const HISTORY_LIMIT = 40

interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
}

type HistoryAction<T> =
  | { type: 'set'; next: T | ((current: T) => T); checkpoint: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; next: T }

/**
 * Pure transition, so StrictMode's double invocation is a no-op rather than a
 * second checkpoint. Queuing `setPast` from inside a `setPresent` updater —
 * the shape this replaced — pushed every checkpoint twice in development and
 * cost the user two presses of undo per edit.
 */
function reduceHistory<T>(state: HistoryState<T>, action: HistoryAction<T>): HistoryState<T> {
  switch (action.type) {
    case 'set': {
      const value =
        typeof action.next === 'function' ? (action.next as (current: T) => T)(state.present) : action.next
      // A drag streams positions through `checkpoint: false`; only the gesture
      // that ends it should be undoable.
      if (!action.checkpoint) return { ...state, present: value }
      return {
        past: [...state.past.slice(-(HISTORY_LIMIT - 1)), state.present],
        present: value,
        future: [],
      }
    }
    case 'undo': {
      if (!state.past.length) return state
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
      }
    }
    case 'redo': {
      if (!state.future.length) return state
      return {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
      }
    }
    case 'reset':
      return { past: [], present: action.next, future: [] }
  }
}

export function useHistory<T>(initial: T) {
  const [state, dispatch] = useReducer(reduceHistory<T>, {
    past: [],
    present: initial,
    future: [],
  })

  const set = useCallback((next: T | ((current: T) => T), checkpoint = true) => {
    dispatch({ type: 'set', next, checkpoint })
  }, [])

  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])
  const reset = useCallback((next: T) => dispatch({ type: 'reset', next }), [])

  return {
    value: state.present,
    set,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
