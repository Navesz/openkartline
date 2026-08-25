import type { ResultNote } from './types'

/**
 * An error that names its message instead of rendering it.
 *
 * Domain code used to throw `new Error(t('imports.trackTooShort', …))`, which
 * freezes the wording in whichever locale was active when the failure
 * happened. Switching to Portuguese afterwards left the English sentence in
 * the run bar — the same staleness that event labels and result notes had,
 * reaching the interface through a different door.
 *
 * Carrying the key lets the run bar translate at render, like everything else
 * it shows. `{ text }` stays available for wording this app did not write, such
 * as a message the engine returned in its own words.
 */
export class LocalisedError extends Error {
  /**
   * Every message this failure names. Validating an imported project can fail
   * for several reasons at once, and the run bar already renders a list, so
   * collapsing them into one string would lose what it can show.
   */
  readonly notes: ResultNote[]

  constructor(note: ResultNote | ResultNote[]) {
    const notes = Array.isArray(note) ? note : [note]
    const first = notes[0]
    // `message` is for a developer reading a stack trace, never for the
    // interface — the interface reads `notes`.
    super(first === undefined ? 'LocalisedError' : 'key' in first ? first.key : first.text)
    this.name = 'LocalisedError'
    this.notes = notes
  }

  /** The first message, for callers that can only show one. */
  get note(): ResultNote {
    return this.notes[0]
  }
}

/** The note to show for a caught value, whatever it turns out to be. */
export function noteForError(error: unknown, fallback: ResultNote): ResultNote {
  if (error instanceof LocalisedError) return error.note
  if (error instanceof Error && error.message) return { text: error.message }
  return fallback
}

/** Every note a caught value names, for a caller that can show a list. */
export function notesForError(error: unknown, fallback: ResultNote): ResultNote[] {
  if (error instanceof LocalisedError && error.notes.length) return error.notes
  return [noteForError(error, fallback)]
}
