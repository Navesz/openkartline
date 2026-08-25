import { describe, expect, it } from 'vitest'
import { LocalisedError, noteForError, notesForError } from './localisedError'

describe('an error that names no message', () => {
  const fallback = { key: 'app.statusInvalidFile' } as const

  it('falls back rather than handing back undefined', () => {
    // `notes` can be empty, and `note` is then `undefined`. `noteForError`
    // matched on the class before checking, so it returned that `undefined`
    // straight through and the first `'key' in note` downstream threw.
    const empty = new LocalisedError([])
    expect(empty.note).toBeUndefined()
    expect(noteForError(empty, fallback)).toEqual(fallback)
    expect(notesForError(empty, fallback)).toEqual([fallback])
  })

  it('still prefers the notes it does have', () => {
    const named = new LocalisedError([{ key: 'project.invalidJson' }, { key: 'project.massMismatch' }])
    expect(noteForError(named, fallback)).toEqual({ key: 'project.invalidJson' })
    expect(notesForError(named, fallback)).toHaveLength(2)
  })
})
