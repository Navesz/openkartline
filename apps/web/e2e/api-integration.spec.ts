import { expect, test } from '@playwright/test'

test('uses the Python engine when the integrated API is requested', async ({ page }) => {
  test.skip(process.env.OPENKARTLINE_E2E_EXPECT_API !== '1', 'requires a FastAPI service on port 8000')
  await page.goto('./')
  await expect(page.getByText('MVP engine connected')).toBeVisible()
  await page.getByRole('button', { name: 'Simulate again' }).click()
  await expect(page.getByText('Reference computed by the MVP physics engine.')).toBeVisible()
  await expect(page.getByText('MVP physics engine', { exact: true })).toBeVisible()
})
