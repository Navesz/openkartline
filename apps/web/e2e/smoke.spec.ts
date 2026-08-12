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
