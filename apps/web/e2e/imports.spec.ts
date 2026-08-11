import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Minimal 64x64 PNG (solid dark grey) — enough for the editor to attach as a
// background without needing a real satellite photo in the repo.
const TRACK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAOUlEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOBvAcQAAX3hH4kAAAAASUVORK5CYII=',
  'base64',
)

const GPX_LAP = `<?xml version="1.0"?>
<gpx version="1.1" creator="openkartline-e2e">
  <trk><name>lap</name><trkseg>
    <trkpt lat="-22.5200" lon="-47.3900"></trkpt>
    <trkpt lat="-22.5180" lon="-47.3900"></trkpt>
    <trkpt lat="-22.5160" lon="-47.3920"></trkpt>
    <trkpt lat="-22.5160" lon="-47.3960"></trkpt>
    <trkpt lat="-22.5180" lon="-47.3980"></trkpt>
    <trkpt lat="-22.5200" lon="-47.3980"></trkpt>
    <trkpt lat="-22.5220" lon="-47.3960"></trkpt>
    <trkpt lat="-22.5220" lon="-47.3920"></trkpt>
    <trkpt lat="-22.5200" lon="-47.3900"></trkpt>
  </trkseg></trk>
</gpx>`

test('imports a background image, calibrates, and simulates', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Planeje uma volta melhor.' })).toBeVisible()

  await page.getByLabel('Importar imagem da pista').setInputFiles({
    name: 'track.png',
    mimeType: 'image/png',
    buffer: TRACK_PNG,
  })
  await expect(page.getByText(/Imagem adicionada/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Calibrar' })).toBeVisible()
  // Simulation is blocked until the image has a scale.
  await expect(page.getByRole('button', { name: /Simular|Recalcular/ })).toBeDisabled()

  const svg = page.getByRole('img', { name: /Traçado/ })
  const box = await svg.boundingBox()
  expect(box).toBeTruthy()
  await page.getByRole('button', { name: 'Calibrar' }).click()
  await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height * 0.5)
  await page.mouse.click(box!.x + box!.width * 0.75, box!.y + box!.height * 0.5)
  await expect(page.getByLabel('Distância real entre os pontos marcados')).toBeVisible()
  await page.getByLabel('Distância real entre os pontos marcados').fill('100')
  await page.getByRole('button', { name: 'Aplicar escala' }).click()
  await expect(page.getByText(/Escala aplicada/i)).toBeVisible()

  await page.getByRole('button', { name: /Recalcular|Simular/ }).click()
  await expect(page.getByText('VOLTA ESTIMADA')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Salvar' }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()
  const saved = JSON.parse(readFileSync(path!, 'utf-8')) as {
    schema_version: string
    track: { background?: { image_data_url?: string; scale_m_per_px?: number } }
  }
  expect(saved.schema_version).toBe('0.2.0')
  expect(saved.track.background?.image_data_url).toMatch(/^data:image\//)
  expect(saved.track.background?.scale_m_per_px).toBeGreaterThan(0)
})

test('imports a GPX lap as a editable centerline', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('./')
  await page.getByLabel('Importar trajeto GPS').setInputFiles({
    name: 'lap.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(GPX_LAP, 'utf-8'),
  })
  await expect(page.getByText(/GPS importado/i)).toBeVisible()
  await page.getByRole('button', { name: /Recalcular|Simular/ }).click()
  await expect(page.getByText('VOLTA ESTIMADA')).toBeVisible()
  await expect(page.getByText(/Referência calculada localmente/i)).toBeVisible()
})
