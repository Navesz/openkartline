import { expect, test, type Page } from '@playwright/test'

/**
 * Braking, coasting and throttle are red, amber and green -- the axis red-green
 * colour blindness runs along -- so the legend and the lap chart tell them apart
 * by pattern as well. Both patterns live in the stylesheet, which only
 * `main.tsx` imports and so no unit test loads; they are read here from the
 * engines that draw them.
 *
 * Patterns are compared with the colours taken out. Swatches in two different
 * colours differ as strings whatever their patterns, so comparing them whole
 * would pass with both drawn to the same pattern.
 */

/** The lengths in a computed `background-image`, which is its pattern without its colours. */
const lengthsOf = (backgroundImage: string) => backgroundImage.match(/-?[\d.]+(?:px|%)/g) ?? []

const computed = (page: Page, selector: string, property: 'backgroundImage' | 'strokeDasharray') =>
  page
    .locator(selector)
    .first()
    .evaluate((element, name) => getComputedStyle(element)[name], property)

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Plan a faster lap.' })).toBeVisible()
})

test('the legend draws each drive mode with its own pattern', async ({ page }) => {
  const brake = await computed(page, '.canvas-legend .dot.brake', 'backgroundImage')
  const coast = await computed(page, '.canvas-legend .dot.coast', 'backgroundImage')
  const throttle = await computed(page, '.canvas-legend .dot.throttle', 'backgroundImage')

  // Throttle is solid, as it is on the track.
  expect(throttle).toBe('none')
  expect(brake).toContain('repeating-linear-gradient')
  expect(coast).toContain('repeating-linear-gradient')
  expect(lengthsOf(brake).length).toBeGreaterThan(0)
  expect(lengthsOf(brake)).not.toEqual(lengthsOf(coast))
})

test('the lap chart tells the pedals apart without their colours', async ({ page }) => {
  await expect(page.getByRole('img', { name: /synchronized chart/i })).toBeVisible()

  const speed = await computed(page, '.speed-line', 'strokeDasharray')
  const throttle = await computed(page, '.throttle-line', 'strokeDasharray')
  const brake = await computed(page, '.brake-line', 'strokeDasharray')

  // Speed is the solid reference the two pedal traces are read against.
  expect(speed).toBe('none')
  expect(throttle).not.toBe('none')
  expect(brake).not.toBe('none')
  expect(throttle).not.toBe(brake)
})
