import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOCALES } from './locales'
import { MESSAGES, type MessageKey } from './messages'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Every `.ts`/`.tsx` under src that is not a test and not the dictionary itself. */
function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      if (entry !== 'messages' && entry !== '__fixtures__') sourceFiles(path, found)
      continue
    }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue
    found.push(path)
  }
  return found
}

const sourceText = sourceFiles(SRC)
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')

const keys = Object.keys(MESSAGES) as MessageKey[]

describe('the message dictionary', () => {
  it('has messages to check', () => {
    // A scan that silently matched nothing would make every case below vacuous.
    expect(keys.length).toBeGreaterThan(200)
    expect(sourceText.length).toBeGreaterThan(10_000)
  })

  it.each(keys)('%s is referenced somewhere outside the dictionary', (key) => {
    // `MessageKey` is derived from this object, so tsc already catches a key
    // that does not exist. Nothing catches the opposite: a translated string
    // nobody renders. Seven preset notes -- fourteen strings across two locales
    // -- sat wired into the type system and rendered nowhere until they were
    // removed by hand.
    //
    // Matching the literal anywhere, rather than inside `t(...)`, is deliberate:
    // several keys are reached indirectly through a lookup table such as
    // `eventLabelKey`, and those are referenced just as legitimately.
    expect(sourceText).toContain(`'${key}'`)
  })
})

describe('the locales agree with each other', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

  it.each(keys)('%s uses the same placeholders in every locale', (key) => {
    // A locale that names a slot differently renders the literal `{speed}` at
    // the user, because `translate` fills by name. Nothing else compares the
    // two sides of an entry.
    const expected = placeholders(MESSAGES[key][LOCALES[0]])
    for (const locale of LOCALES) {
      expect(placeholders(MESSAGES[key][locale]), `${key} in ${locale}`).toEqual(expected)
    }
  })

  it.each(keys)('%s is non-empty in every locale', (key) => {
    for (const locale of LOCALES) {
      expect(MESSAGES[key][locale].trim(), `${key} in ${locale}`).not.toBe('')
    }
  })
})
