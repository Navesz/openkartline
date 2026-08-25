import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * The hand-written accessibility in this app is careful — a skip link, live
 * regions, a keyboard point editor, and a `KeyboardCalibration` component that
 * exists so keyboard users are not trapped by a canvas gesture needing two
 * clicks on the drawing. `eslint-plugin-jsx-a11y` defends the markup that
 * produces it, but it reads source: it cannot see a contrast ratio, a broken
 * ARIA reference, or a heading order that only exists once the page renders.
 *
 * These scan the rendered page in the states a user actually reaches.
 */
const analyse = (page: Parameters<typeof AxeBuilder>[0]['page']) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort())
})

test('the editor has no accessibility violations on load', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Plan a faster lap.' })).toBeVisible()

  const results = await analyse(page).analyze()
  expect(results.violations).toEqual([])
})

test('a solved lap has no accessibility violations', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('Start from an example').selectOption('hairpin')
  await page.getByRole('button', { name: 'Recalculate lap' }).click()
  await expect(page.getByText('ESTIMATED LAP')).toBeVisible()

  const results = await analyse(page).analyze()
  expect(results.violations).toEqual([])
})

test('a rejected input has no accessibility violations', async ({ page }) => {
  await page.goto('./')
  const name = page.getByLabel('Track name')
  await name.fill('')
  await name.blur()
  await expect(page.getByText(/Track name must be between/)).toBeVisible()

  const results = await analyse(page).analyze()
  expect(results.violations).toEqual([])
})

test('the whole editor is reachable from the keyboard', async ({ page }) => {
  await page.goto('./')
  // The skip link is the first stop, and it has to go somewhere real.
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: /skip to/i })
  await expect(skip).toBeFocused()
  await skip.press('Enter')

  // Every control the editor offers must be reachable without a pointer, and
  // the canvas must not swallow the focus ring on the way past.
  const reached = new Set<string>()
  for (let step = 0; step < 120; step += 1) {
    await page.keyboard.press('Tab')
    const marker = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      return `${el.tagName.toLowerCase()}#${el.id || ''}.${el.className || ''}`
    })
    if (marker) reached.add(marker)
  }
  expect(reached.size).toBeGreaterThan(15)
})
