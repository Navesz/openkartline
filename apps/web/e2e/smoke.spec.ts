import { expect, test } from '@playwright/test'

test('plans a lap entirely in the browser', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Planeje uma volta melhor.' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Traçado Circuito Aurora/ })).toBeVisible()
  await page.getByLabel('Começar com um exemplo').selectOption('hairpin')
  await expect(page.getByLabel('Nome da pista')).toHaveValue('Complexo Hairpin')
  await page.getByRole('button', { name: 'Recalcular volta' }).click()
  await expect(page.getByText('Referência calculada localmente no navegador.')).toBeVisible()
  await expect(page.getByText('VOLTA ESTIMADA')).toBeVisible()
})
