import { expect, test } from '@playwright/test'

test('plans a lap entirely in the browser', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Plan a faster lap.' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Aurora Circuit layout/ })).toBeVisible()
  await page.getByLabel('Start from an example').selectOption('hairpin')
  await expect(page.getByLabel('Track name')).toHaveValue('Hairpin Complex')
  await page.getByRole('button', { name: 'Recalculate lap' }).click()
  await expect(page.getByText('Reference computed locally in the browser.')).toBeVisible()
  await expect(page.getByText('ESTIMATED LAP')).toBeVisible()
})

test('draws each event number on its own marker', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('./')
  await expect(page.getByText('ESTIMATED LAP')).toBeVisible()

  // Measured by the engine rather than read from the transform attribute: the
  // label sits under two y flips, and only the rendered box shows where they
  // leave it.
  const markers = await page.locator('.event-marker').evaluateAll((groups) =>
    groups.map((group) => {
      const circle = group.querySelector('circle')!.getBoundingClientRect()
      const label = group.querySelector('text')!.getBoundingClientRect()
      const x = label.left + label.width / 2
      const y = label.top + label.height / 2
      return {
        label: group.querySelector('text')!.textContent,
        onMarker: x >= circle.left && x <= circle.right && y >= circle.top && y <= circle.bottom,
      }
    }),
  )
  expect(markers.length).toBeGreaterThan(0)
  expect(markers.filter((marker) => !marker.onMarker)).toEqual([])
})
