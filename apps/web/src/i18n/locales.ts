export const LOCALES = ['en', 'pt-BR'] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'EN',
  'pt-BR': 'PT',
}

/** Every user-facing string carries both locales so they cannot drift apart. */
export type Message = Record<Locale, string>

export function defineMessages<T extends Record<string, Message>>(messages: T): T {
  return messages
}
