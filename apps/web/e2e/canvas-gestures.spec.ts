import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * The canvas gestures, driven with real input on every engine the project runs.
 *
 * These are the three behaviours `playwright.config.ts` gives as the reason for
 * running three engines: pointer capture during a control-point drag, reading
 * `getBoundingClientRect` back through an SVG view box, and a wheel listener
 * that has to be allowed to cancel the scroll. Events sent with `dispatchEvent`
 * go exactly where they are sent: on Chromium they took no pointer capture and
 * scrolled nothing, which is the behaviour under test, so everything here goes
 * through `page.mouse`.
 *
 * Nothing asserts against the editor's own coordinate arithmetic. "Under the
 * pointer" means the engine drew the point where the pointer is: the control
 * point's rendered box is centred on the cursor, to within a pixel.
 */

const openEditor = async (page: Page) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('./')
  const surface = page.getByRole('img', { name: /Aurora Circuit layout/ })
  await expect(surface).toBeVisible()
  return surface
}

/** The drawn dot, not its hit area, so a stale or unrendered position shows. */
const controlPoint = (page: Page, index: number) => page.locator('.control-point').nth(index)

const centreOf = async (locator: Locator) => {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
}

const expectUnder = async (locator: Locator, pointer: { x: number; y: number }) => {
  const drawn = await centreOf(locator)
  expect(Math.abs(drawn.x - pointer.x)).toBeLessThan(1)
  expect(Math.abs(drawn.y - pointer.y)).toBeLessThan(1)
}

const viewBoxOf = (surface: Locator) => surface.evaluate((svg) => svg.getAttribute('viewBox')!)
const viewWidthOf = async (surface: Locator) => Number((await viewBoxOf(surface)).split(' ')[2])

test('a dragged control point lands under the pointer, without re-framing the view', async ({ page }) => {
  const surface = await openEditor(page)
  // Point 10 is the northernmost on Aurora Circuit. The fitted view is wider
  // than the surface's shape, so the browser draws it with bands above and
  // below, and a mapping that stretches y across those bands misses by more
  // the further the pointer is from the middle. It is also an extreme of the
  // fit, so re-framing on the drag would visibly change the view box.
  const point = controlPoint(page, 10)
  const start = await centreOf(point)
  const fitted = await viewBoxOf(surface)
  const target = { x: start.x + 50, y: start.y + 30 }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 10 })

  // Still held: this is mid-gesture, where a re-fit would throw away the view
  // the user set up before reaching for the point.
  await expectUnder(point, target)
  expect(await viewBoxOf(surface)).toBe(fitted)

  await page.mouse.up()
  await expectUnder(point, target)
  expect(await viewBoxOf(surface)).toBe(fitted)
})

test('a drag keeps its point across an overlay, and ends where it is released', async ({ page }) => {
  await openEditor(page)
  // The toolbar floats over the surface. Without pointer capture the moves
  // over it go to the toolbar and never reach the drawing, so the point stops
  // at the toolbar's edge -- and the release lands there too, leaving a drag
  // that follows the next hover.
  const toolbar = page.getByRole('toolbar', { name: 'Editor tools' })
  const target = await centreOf(toolbar.locator('.toolbar-separator'))
  const covered = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="toolbar"]') !== null,
    target,
  )
  // Otherwise this would be a drag across open canvas and prove nothing.
  expect(covered).toBe(true)

  const point = controlPoint(page, 11)
  const start = await centreOf(point)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await expectUnder(point, target)
  await page.mouse.up()

  // Released: hovering back over the drawing must leave the point alone.
  await page.mouse.move(start.x, start.y, { steps: 6 })
  await expectUnder(point, target)
})

test('the wheel zooms about the pointer, and does not scroll the page', async ({ page }) => {
  const surface = await openEditor(page)
  // Scrolled to the top, so it is the zoom-out notch that the page could
  // follow. Point 4 is well off centre on both axes: a zoom about the middle
  // of the view would carry it away from the cursor.
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  const point = controlPoint(page, 4)
  const anchor = await centreOf(point)
  const fittedWidth = await viewWidthOf(surface)
  await page.mouse.move(anchor.x, anchor.y)

  await page.mouse.wheel(0, 120)
  // A passive listener leaves the scroll to the browser, which need not wait
  // for the page to handle the event; give it two frames to land before saying
  // it did not. Checked first because it is the cause: in Chromium the scrolled
  // page then hit-tests the wheel onto the button that slid under the pointer,
  // and the canvas never zooms at all.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect.poll(() => viewWidthOf(surface)).toBeGreaterThan(fittedWidth)
  await expectUnder(point, anchor)

  const zoomedOutWidth = await viewWidthOf(surface)
  await page.mouse.wheel(0, -120)
  await expect.poll(() => viewWidthOf(surface)).toBeLessThan(zoomedOutWidth)
  await expectUnder(point, anchor)
})
