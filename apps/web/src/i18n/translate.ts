import type { MessageParams } from './context'
import { LOCALES, type Locale } from './locales'
import { MESSAGES, type MessageKey } from './messages'

const STORAGE_KEY = 'okl.locale'

// English is the default for every visitor. The browser language is
// deliberately not sniffed: the project is presented in English first, and a
// reader who switches keeps that choice on the next visit.
export const DEFAULT_LOCALE: Locale = 'en'

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

export function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isLocale(stored) ? stored : DEFAULT_LOCALE
  } catch {
    // Private modes and embedded webviews can throw on access.
    return DEFAULT_LOCALE
  }
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Losing the preference is acceptable; blocking the switch is not.
  }
}

export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const entry = MESSAGES[key]
  const template = entry?.[locale] ?? entry?.en ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (!(name in params)) return match
    const value = params[name]
    // A slot may name another message, so a field label inside an error
    // sentence follows the toggle like the sentence does. One level only: a
    // label is a noun, not a template with slots of its own.
    if (value && typeof value === 'object' && 'key' in value) {
      // Only a key this dictionary holds. `translate` otherwise falls back to
      // echoing the key itself, which would print an unrecognised string --
      // file content, in the case that motivated this -- as the app's own
      // prose. Defence in depth: the callers coerce untrusted values too.
      return value.key in MESSAGES ? translate(locale, value.key, value.params) : match
    }
    return String(value)
  })
}
