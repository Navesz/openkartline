import { useCallback, useState } from 'react'

export function useHistory<T>(initial: T) {
  const [past, setPast] = useState<T[]>([])
  const [present, setPresent] = useState(initial)
  const [future, setFuture] = useState<T[]>([])

  const set = useCallback((next: T | ((current: T) => T), checkpoint = true) => {
    setPresent((current) => {
      const value = typeof next === 'function' ? (next as (current: T) => T)(current) : next
      if (checkpoint) {
        setPast((items) => [...items.slice(-39), current])
        setFuture([])
      }
      return value
    })
  }, [])

  const undo = useCallback(() => {
    setPast((items) => {
      if (!items.length) return items
      const previous = items[items.length - 1]
      setPresent((current) => {
        setFuture((next) => [current, ...next])
        return previous
      })
      return items.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setFuture((items) => {
      if (!items.length) return items
      const next = items[0]
      setPresent((current) => {
        setPast((previous) => [...previous, current])
        return next
      })
      return items.slice(1)
    })
  }, [])

  const reset = useCallback((next: T) => {
    setPast([])
    setPresent(next)
    setFuture([])
  }, [])

  return { value: present, set, reset, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 }
}
