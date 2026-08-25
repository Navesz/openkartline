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
  readonly note: ResultNote

  constructor(note: ResultNote) {
    // `message` is for a developer reading a stack trace, never for the
    // interface — the interface reads `note`.
    super('key' in note ? note.key : note.text)
    this.name = 'LocalisedError'
    this.note = note
  }
}

/** The note to show for a caught value, whatever it turns out to be. */
export function noteForError(error: unknown, fallback: ResultNote): ResultNote {
  if (error instanceof LocalisedError) return error.note
  if (error instanceof Error && error.message) return { text: error.message }
  return fallback
}
