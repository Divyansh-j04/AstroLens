/**
 * Phase 3 "Done when" check: uploading a Saturn photo flies to Saturn with the card, uploading a
 * cat photo shows the unknown message (camera stays put), and bad uploads show clear errors.
 *
 * Starts the real API server (uvicorn, CPU model) and a Vite dev server, then drives the installed
 * Microsoft Edge through playwright-core:
 *   1. Saturn test photo -> flies to Saturn, card + confidence badge; Grad-CAM toggle; Top-3 view,
 *      clicking the second guess flies there.
 *   2. Cat photo -> unknown message, camera and card unchanged.
 *   3. Errors: a text file, a text file named .jpg, a file over 8 MB, a slow server ("waking up"),
 *      and the server switched off.
 *   4. Time per upload: 10 Saturn uploads (server time and full round trip seen by the page).
 * The photos are a test-split Saturn image and a cat from the unknown-object set (ml/data/raw, not committed).
 *
 * Writes ml/results/phase3_upload_check.json and screenshots in ml/results/phase3_screens/.
 * Usage (from frontend/):  node scripts/check-phase3.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const FRONTEND = fileURLToPath(new URL('..', import.meta.url))
const ROOT = path.resolve(FRONTEND, '..')
const RESULTS = path.join(ROOT, 'ml', 'results')
const SHOTS = path.join(RESULTS, 'phase3_screens')
const RAW = path.join(ROOT, 'ml', 'data', 'raw')
const PAGE_PORT = 5198
const API_PORT = 8011
const VIEWPORT = { width: 1440, height: 900 }
const TOLERANCE = 0.01

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

async function pickPhotos() {
  const split = (await fs.readFile(path.join(ROOT, 'ml', 'data', 'split.csv'), 'utf8')).split(/\r?\n/)
  const header = split[0].split(',')
  const rows = split.slice(1).filter(Boolean).map((l) => Object.fromEntries(l.split(',').map((v, i) => [header[i], v])))
  const saturn = rows.find((r) => r.class === 'saturn' && r.split === 'test' && r.view === 'whole')
  const manifest = await fs.readFile(path.join(ROOT, 'ml', 'data', 'manifest.csv'), 'utf8')
  const cat = manifest.match(/^(unknown_[0-9a-f]+\.jpg),Featured pictures of cats,/m)
  return { saturn: path.join(RAW, 'images', 'saturn', saturn.file), cat: path.join(RAW, 'unknown', cat[1]) }
}

async function startApi() {
  const python = path.join(ROOT, '.venv', 'Scripts', 'python.exe')
  const proc = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--port', String(API_PORT)], {
    cwd: path.join(ROOT, 'backend'),
    env: { ...process.env, ALLOWED_ORIGINS: `http://localhost:${PAGE_PORT}` },
    stdio: 'ignore',
  })
  for (let i = 0; i < 120; i++) {
    try {
      const h = await (await fetch(`http://localhost:${API_PORT}/health`)).json()
      if (h.model) return { proc, health: h }
    } catch {
      // not up yet
    }
    await sleep(500)
  }
  proc.kill()
  throw new Error('API server did not start')
}

async function main() {
  await fs.mkdir(SHOTS, { recursive: true })
  const photos = await pickPhotos()
  const { proc: api, health } = await startApi()
  process.env.VITE_API_URL = `http://localhost:${API_PORT}`
  const { createServer } = await import('vite')
  const server = await createServer({ root: FRONTEND, server: { port: PAGE_PORT, strictPort: true }, logLevel: 'warn' })
  await server.listen()
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
  })
  const result = { script: 'frontend/scripts/check-phase3.mjs', model: health.model, photos: { saturn: path.basename(photos.saturn), cat: path.basename(photos.cat) } }

  try {
    const page = await browser.newPage({ viewport: VIEWPORT })
    const consoleErrors = []
    page.on('pageerror', (e) => consoleErrors.push(String(e)))
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
    await page.goto(`http://localhost:${PAGE_PORT}/`)
    await page.waitForSelector('[data-testid=loading-screen][data-done=true]', { state: 'attached', timeout: 60000 })
    await page.waitForTimeout(800)

    const state = () =>
      page.evaluate(() => {
        const a = window.astrolens
        const s = a.store.getState()
        return { currentObjectId: s.currentObjectId, panelView: s.panelView, panelOpen: s.panelOpen, isFlying: s.isFlying, mode: s.mode, camera: a.camera.position.toArray(), prediction: s.prediction && { ...s.prediction, gradcam_png_base64: s.prediction.gradcam_png_base64.length } }
      })
    const upload = async (file) => {
      // Reset the status first, so the wait below cannot see the previous upload's result.
      await page.evaluate(() => window.astrolens.store.getState().setUpload({ status: 'idle' }))
      await page.waitForSelector('[data-testid=upload-zone][data-status=idle]')
      const t = Date.now()
      await page.setInputFiles('[data-testid=upload-input]', file)
      await page.waitForSelector('[data-testid=upload-zone]:is([data-status=done],[data-status=error])', { timeout: 100000 })
      return Date.now() - t
    }
    const waitForFlightEnd = async () => {
      await page.waitForFunction(() => !window.astrolens.store.getState().isFlying, null, { polling: 'raf', timeout: 20000 })
      await page.waitForTimeout(700) // panel slide-in
    }
    const text = (sel) => page.locator(sel).first().innerText()

    // ---- 1. Saturn ----
    const saturnMs = await upload(photos.saturn)
    await page.waitForFunction(() => window.astrolens.store.getState().isFlying, null, { polling: 'raf', timeout: 5000 }).catch(() => {})
    await waitForFlightEnd()
    const s1 = await state()
    const camErr = await page.evaluate(() => {
      const a = window.astrolens
      const v = a.objectView('saturn')
      const c = a.camera.position.toArray()
      return Math.hypot(c[0] - v.position[0], c[1] - v.position[1], c[2] - v.position[2])
    })
    await page.screenshot({ path: path.join(SHOTS, 'saturn.jpg'), type: 'jpeg', quality: 75 })
    result.saturn = {
      top3: s1.prediction.top3,
      is_unknown: s1.prediction.is_unknown,
      flew_to: s1.currentObjectId,
      camera_error: round(camErr, 4),
      card_name: await text('[data-testid=card-name]'),
      badge: await text('[data-testid=confidence-badge]'),
      round_trip_ms: saturnMs,
    }
    result.saturn.pass = s1.prediction.top3[0].id === 'saturn' && !s1.prediction.is_unknown && s1.currentObjectId === 'saturn' && camErr < TOLERANCE && result.saturn.card_name === 'Saturn'

    // Grad-CAM toggle
    await page.click('[data-testid=gradcam-toggle]')
    await page.waitForTimeout(700)
    const heatShown = await page.locator('[data-testid=gradcam-image]').evaluate((el) => getComputedStyle(el).opacity)
    await page.screenshot({ path: path.join(SHOTS, 'saturn_heatmap.jpg'), type: 'jpeg', quality: 75 })
    await page.click('[data-testid=gradcam-toggle]')
    await page.waitForTimeout(700)
    const heatHidden = await page.locator('[data-testid=gradcam-image]').evaluate((el) => getComputedStyle(el).opacity)
    result.gradcam_toggle = { heatmap_opacity_shown: Number(heatShown), heatmap_opacity_hidden: Number(heatHidden), pass: Number(heatShown) === 1 && Number(heatHidden) === 0 }

    // Top-3 view, then click the second guess
    await page.click('[data-testid=top3-button]')
    const rows = await page.locator('[data-testid=guess-list] li').count()
    await page.screenshot({ path: path.join(SHOTS, 'top3.jpg'), type: 'jpeg', quality: 75 })
    const second = s1.prediction.top3[1]
    await page.click(`[data-testid=guess-${second.id}]`)
    await waitForFlightEnd()
    const s2 = await state()
    const secondName = await text('[data-testid=card-name]')
    await page.screenshot({ path: path.join(SHOTS, 'top3_second_guess.jpg'), type: 'jpeg', quality: 75 })
    result.top3_view = { rows, clicked: second.id, flew_to: s2.currentObjectId, card_name: secondName, pass: rows === 3 && s2.currentObjectId === second.id && secondName === second.name }

    // ---- 2. Cat (unknown) ----
    const before = await state()
    const catMs = await upload(photos.cat)
    await page.waitForTimeout(3000) // a flight would have started by now
    const after = await state()
    const moved = Math.hypot(...after.camera.map((c, i) => c - before.camera[i]))
    const unknownVisible = await page.locator('[data-testid=unknown-card]').isVisible()
    await page.screenshot({ path: path.join(SHOTS, 'cat_unknown.jpg'), type: 'jpeg', quality: 75 })
    result.cat = {
      top3: after.prediction.top3,
      threshold: after.prediction.threshold,
      is_unknown: after.prediction.is_unknown,
      message: unknownVisible ? await text('[data-testid=unknown-message]') : null,
      camera_moved: round(moved, 6),
      object_before: before.currentObjectId,
      object_after: after.currentObjectId,
      round_trip_ms: catMs,
    }
    result.cat.pass = after.prediction.is_unknown && unknownVisible && moved < 1e-6 && before.currentObjectId === after.currentObjectId && !after.isFlying

    // ---- 3. Errors ----
    const errorCase = async (name, file) => {
      await upload(file)
      const shown = await page.locator('[data-testid=upload-error]').isVisible()
      return { case: name, message: shown ? await text('[data-testid=upload-error]') : null }
    }
    const errors = []
    errors.push({ ...(await errorCase('text file', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') })), expect: 'not an image' })
    errors.push({ ...(await errorCase('text file named .jpg (checked by the server)', { name: 'fake.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a picture') })), expect: 'not an image' })
    errors.push({ ...(await errorCase('file over 8 MB', { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(9 * 1024 * 1024) })), expect: 'larger than 8 MB' })
    await page.screenshot({ path: path.join(SHOTS, 'error_too_large.jpg'), type: 'jpeg', quality: 75 })

    // Slow server: hold the request for 6.5 s and check the "waking up" message appears meanwhile.
    await page.route('**/classify', async (route) => {
      await sleep(6500)
      await route.continue()
    })
    await page.setInputFiles('[data-testid=upload-input]', photos.saturn)
    await page.waitForTimeout(5800)
    const slowText = await page.locator('[data-testid=upload-zone]').innerText()
    await page.screenshot({ path: path.join(SHOTS, 'slow_server.jpg'), type: 'jpeg', quality: 75 })
    await page.waitForSelector('[data-testid=upload-zone][data-status=done]', { timeout: 30000 })
    await page.unroute('**/classify')
    errors.push({ case: 'slow server (6.5 s)', message: slowText.includes('Waking up') ? 'Waking up the server… this can take up to a minute' : slowText, expect: 'Waking up' })
    await waitForFlightEnd()

    // ---- 4. Time per upload (local server, CPU) ----
    const serverMs = []
    const roundTrip = []
    for (let i = 0; i < 10; i++) {
      roundTrip.push(await upload(photos.saturn))
      serverMs.push((await state()).prediction.latency_ms)
    }
    result.timing = {
      uploads: 10,
      server_classify_ms_median: round(median(serverMs)),
      round_trip_ms_median: median(roundTrip),
      server_classify_ms: serverMs,
      round_trip_ms: roundTrip,
      note: 'local machine, model on the CPU; round trip = file chosen -> answer shown, measured in the page',
    }
    await waitForFlightEnd()

    // Server switched off
    api.kill()
    await sleep(1500)
    errors.push({ ...(await errorCase('server switched off', photos.saturn)), expect: "Can't reach" })
    await page.screenshot({ path: path.join(SHOTS, 'error_server_off.jpg'), type: 'jpeg', quality: 75 })

    for (const e of errors) e.pass = Boolean(e.message && e.message.includes(e.expect))
    result.errors = errors
    // Failed requests are expected in the error cases (the browser logs them); anything else is a real error.
    const expected = /Failed to load resource|ERR_CONNECTION_REFUSED|Failed to fetch/
    result.console_errors_unexpected = consoleErrors.filter((e) => !expected.test(e))
    result.pass = result.saturn.pass && result.cat.pass && result.top3_view.pass && result.gradcam_toggle.pass && errors.every((e) => e.pass) && result.console_errors_unexpected.length === 0
    result.date = new Date().toISOString()
    await fs.writeFile(path.join(RESULTS, 'phase3_upload_check.json'), JSON.stringify(result, null, 2) + '\n')
    console.log(JSON.stringify({ ...result, timing: { ...result.timing, server_classify_ms: undefined, round_trip_ms: undefined } }, null, 2))
  } finally {
    await browser.close()
    await server.close()
    api.kill()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
