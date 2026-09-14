import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { TRACK_PNG } from './fixtures'

/**
 * The hand-written accessibility in this app is careful — a skip link, live
 * regions, a keyboard point editor, and a `KeyboardCalibration` component that
 * exists so keyboard users are not trapped by a canvas gesture needing two
 * clicks on the drawing. `eslint-plugin-jsx-a11y` defends the markup that
 * produces it, but it reads source: it cannot see a contrast ratio, a broken
 * ARIA reference, or a heading order that only exists once the page renders.
 *
 * These scan the rendered page in the states a user actually reaches. A state
 * the suite never enters is a state axe never reads: the dim text failed AA on
 * a selected event row for as long as no test selected one.
 */
const analyse = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort())
})

async function solveHairpin(page: Page) {
  await page.goto('./')
  await page.getByLabel('Start from an example').selectOption('hairpin')
  await page.getByRole('button', { name: 'Recalculate lap' }).click()
  await expect(page.getByText('ESTIMATED LAP')).toBeVisible()
}

test('the editor has no accessibility violations on load', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Plan a faster lap.' })).toBeVisible()

  const results = await analyse(page).analyze()
  expect(results.violations).toEqual([])
})

test('a solved lap has no accessibility violations', async ({ page }) => {
  await solveHairpin(page)

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

test('a selected and a hovered event row have no accessibility violations', async ({ page }) => {
  await solveHairpin(page)
  // The highlight behind these rows is the lightest surface the dim text sits
  // on, so it is where that text's contrast is closest to failing.
  const rows = page.locator('.event-list').getByRole('button')
  await rows.first().click()
  await expect(rows.first()).toHaveClass(/\bselected\b/)
  await rows.nth(1).hover()
  // Checked on both sides of the scan. A hover lost along the way would leave
  // axe reading an ordinary row, and passing.
  const hovered = () => rows.nth(1).evaluate((row) => row.matches(':hover'))
  expect(await hovered()).toBe(true)

  const results = await analyse(page).analyze()
  expect(results.violations).toEqual([])
  expect(await hovered()).toBe(true)
})

test('a lap playing back has no accessibility violations', async ({ page }) => {
  await solveHairpin(page)
  await page.getByRole('button', { name: 'Animate' }).click()
  const pause = page.getByRole('button', { name: 'Pause playback' })
  await expect(pause).toBeVisible()
  // Running, not just mounted: the clock has moved off zero.
  await expect(page.locator('.playback-clock strong')).not.toHaveText(/^0\.00\s/)

  const results = await analyse(page).analyze()
  expect(results.violations).toEqual([])
  // Text axe cannot measure goes under `incomplete`, not `violations`, so a
  // clean result can mean the bar was never read. It was not, while the event
  // labels were drawn off the canvas: axe counted them as covering the bar.
  // These two are the dim text on it, so they have to have been measured.
  const measured = results.passes
    .filter((rule) => rule.id === 'color-contrast')
    .flatMap((rule) => rule.nodes.map((node) => node.target.join(' ')))
  expect(measured).toEqual(expect.arrayContaining(['.playback-clock > small', '.playback-distance']))
  await expect(pause).toBeVisible()
})

test('the image calibration overlay has no accessibility violations', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('Import track image').setInputFiles({
    name: 'track.png',
    mimeType: 'image/png',
    buffer: TRACK_PNG,
  })
  await expect(page.getByText(/Image added/i)).toBeVisible()
  await page.getByRole('button', { name: 'Calibrate' }).click()
  const box = await page.getByRole('img', { name: /layout/ }).boundingBox()
  expect(box).toBeTruthy()
  await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height * 0.5)
  await page.mouse.click(box!.x + box!.width * 0.75, box!.y + box!.height * 0.5)
  await expect(page.getByLabel('Real distance between the marked points')).toBeVisible()

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
