import { createContext, useContext } from 'react'
import type { Locale } from './locales'
import type { MessageKey } from './messages'

/**
 * A slot value.
 *
 * `{ key }` lets a message name another message for one of its slots, so a
 * sentence like "The engine rejected {field}" can carry a field label that is
 * itself translated at render. Without it the label would be rendered when the
 * failure happened and would sit in the run bar in the previous language after
 * a switch — the sentence around it following the toggle while the noun inside
 * did not.
 *
 * The nested form takes scalar params only, so `Point {index} x` works and
 * the nesting cannot recurse.
 */
export type MessageParam = string | number | { key: MessageKey; params?: Record<string, string | number> }

export type MessageParams = Record<string, MessageParam>

/** Looks a key up in the active locale and fills `{placeholder}` slots. */
export type Translate = (key: MessageKey, params?: MessageParams) => string

/** Formats a figure for display in the active locale. Never for SVG data. */
export type FormatNumber = (value: number, digits?: number) => string

export interface I18nValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translate
  n: FormatNumber
}

export const I18nContext = createContext<I18nValue | null>(null)

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>')
  return value
}
