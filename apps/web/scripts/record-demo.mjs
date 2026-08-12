// Records the frames used to build docs/assets/openkartline-demo.gif.
// Usage: start the dev server (`pnpm --filter @openkartline/web dev`), then run
//   node apps/web/scripts/record-demo.mjs
// and assemble the GIF with `uv run --with pillow python scripts/build_demo_gif.py`.
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const FRAMES_DIR = resolve(import.meta.dirname, '../../../docs/assets/demo-frames')
const BASE_URL = process.env.DEMO_URL ?? 'http://localhost:5173'

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

mkdirSync(FRAMES_DIR, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
let frame = 0
const capture = async (holdMs = 0) => {
  if (holdMs > 0) await sleep(holdMs)
  frame += 1
  await page.screenshot({ path: resolve(FRAMES_DIR, `frame-${String(frame).padStart(2, '0')}.png`) })
  console.log(`frame ${frame}`)
}

try {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Plan a faster lap.' }).waitFor()
  // The app computes the racing line on load: hold on the solved default track.
  await capture(900)
  await capture(900)

  // Switch to a real OSM circuit for the "draw the track" beat.
  await page.getByLabel('Start from an example').selectOption('voltaRedonda')
  await capture(700)
  await page.getByRole('button', { name: 'Recalculate lap' }).click()
  await page.getByText('ESTIMATED LAP').waitFor()
  await capture(500)
  await capture(1200)

  // Playback beat: the kart marker circulating with brake/throttle colouring.
  // The button's accessible name is "Animate" (the title attribute is not a name).
  await page.getByRole('button', { name: 'Animate' }).click()
  for (let beat = 0; beat < 8; beat += 1) {
    await capture(650)
  }
  await page.getByRole('button', { name: 'Animate' }).click()
  await capture(400)
} finally {
  await browser.close()
}
console.log(`done: ${frame} frames in ${FRAMES_DIR}`)
