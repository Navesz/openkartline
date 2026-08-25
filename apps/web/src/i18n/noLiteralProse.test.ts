import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * `AGENTS.md` forbids literal user-facing text in a component, and the rule
 * that enforces it lives in `eslint.config.js`, where nothing else can check
 * it. A selector is easy to write too narrowly — the first version only saw
 * text between tags, so `aria-label`, `alt`, `title`, `{'…'}` and templates all
 * passed — and just as easy to write too broadly, where it flags class names
 * and SVG transforms until somebody weakens it back.
 *
 * So both halves are pinned here: what it must catch, and what it must not.
 */
async function proseErrorsIn(source: string): Promise<number> {
  const eslint = new ESLint({ cwd: WEB_ROOT })
  const [result] = await eslint.lintText(source, {
    filePath: join(WEB_ROOT, 'src', 'components', 'RuleFixture.tsx'),
  })
  return result.messages.filter((message) => message.ruleId === 'no-restricted-syntax').length
}

describe('the no-literal-prose rule catches', () => {
  it.each([
    ['text between tags', '<p>Ready to simulate</p>'],
    ['a title attribute', '<button title="Start the simulation" />'],
    ['an aria-label', '<div aria-label="Racing line editor" />'],
    ['image alt text', '<img src="x.png" alt="Diagram of the racing line" />'],
    ['a string in child position', "<p>{'Ready to simulate'}</p>"],
    ['a template in child position', '<p>{`Lap ${n} is ready`}</p>'],
    ['a title written as an expression', "<button title={'Start the simulation'} />"],
    ['an aria-label written as an expression', "<div aria-label={'Racing line editor'} />"],
    ['alt text built from a template', '<img src="x.png" alt={`Lap ${n} diagram`} />'],
  ])('%s', async (_name, jsx) => {
    expect(await proseErrorsIn(`export const C = (n: number) => ${jsx}\nvoid 0`)).toBeGreaterThan(0)
  })
})

describe('the no-literal-prose rule leaves alone', () => {
  it.each([
    ['a class name', '<p className="results-panel" />'],
    ['a computed class name', '<p className={`badge ${n}`} />'],
    ['SVG path data', '<path d="M 0 0 L 10 10" />'],
    ['an SVG transform', '<g transform={`translate(0 ${n}) scale(1 -1)`} />'],
    ['a translated string', "<p>{t('app.title')}</p>"],
    ['SI unit symbols', '<span>{n} km/h · {n} m</span>'],
    ['a role', '<div role="status" />'],
  ])('%s', async (_name, jsx) => {
    const source = `declare function t(k: string): string\nexport const C = (n: number) => ${jsx}\nvoid 0`
    expect(await proseErrorsIn(source)).toBe(0)
  })
})
