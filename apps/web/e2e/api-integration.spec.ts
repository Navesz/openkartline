import { expect, test } from '@playwright/test'

test('uses the Python engine when the integrated API is requested', async ({ page }) => {
  test.skip(process.env.OPENKARTLINE_E2E_EXPECT_API !== '1', 'requires a FastAPI service on port 8000')
  await page.goto('./')
  await expect(page.getByText('Motor MVP conectado')).toBeVisible()
  await page.getByRole('button', { name: 'Simular novamente' }).click()
  await expect(page.getByText('Referência calculada pelo motor físico MVP.')).toBeVisible()
  await expect(page.getByText('Motor físico MVP', { exact: true })).toBeVisible()
})
