import { describe, expect, it } from 'vitest'
import { translate } from './translate'

describe('a nested message reference', () => {
  it('resolves a key the dictionary actually holds', () => {
    expect(
      translate('en', 'project.unsupportedVersion', { version: { key: 'project.missingVersion' } }),
    ).toContain('missing')
  })

  it('will not reach an inherited property', () => {
    // `in` walks the prototype chain, so `constructor`, `toString` and
    // `__proto__` passed the allowlist and were echoed as this app's prose.
    for (const key of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
      const output = translate('en', 'project.unsupportedVersion', {
        version: { key: key as never },
      })
      expect(output).not.toContain(key)
    }
  })

  it('leaves nothing behind for a key it does not hold', () => {
    const output = translate('en', 'project.unsupportedVersion', {
      version: { key: 'not-a-real-key' as never },
    })
    expect(output).not.toContain('not-a-real-key')
    // Not the raw `{version}` either: a placeholder in a sentence is a
    // developer artefact, not something a reader can act on.
    expect(output).not.toContain('{version}')
  })
})
