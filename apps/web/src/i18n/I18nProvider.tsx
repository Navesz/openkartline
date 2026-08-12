import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext, type MessageParams } from './context'
import type { Locale } from './locales'
import type { MessageKey } from './messages'
import { readStoredLocale, storeLocale, translate } from './translate'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale())

  // Keeps the document in sync on first paint too, so a reader who previously
  // chose Portuguese gets the right `lang` and title without touching the switch.
  useEffect(() => {
    document.documentElement.lang = locale
    document.title = translate(locale, 'app.title')
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    storeLocale(next)
  }, [])

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (key: MessageKey, params?: MessageParams) => translate(locale, key, params),
    }),
    [locale, setLocale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
