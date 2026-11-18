/**
 * Browser check for the first batch of interface features: warp-speed flights, the arrival title,
 * counting numbers on the card and the distance scale (true distances).
 *
 * Starts a Vite dev server (no API server needed: flights are started through the store) and drives
 * the installed Microsoft Edge through playwright-core:
 *   1. Warp: a flight that switches scene mode (Sun -> Orion Nebula) raises warp to 1, widens the
 *      view and darkens the edges; a short flight (Mars -> Jupiter) does not warp.
 *   2. Arrival title: on landing, the name and the line built from objects.json appear, then go.
 *   3. Counting: shortly after the card opens (as the arrival title fades) the first fact is still counting; once settled,
 *      every fact on the card reads exactly as in objects.json.
 *   4. Distance bar (bottom-left corner): hidden in the normal view; in "True distances" its knob
 *      matches the zoom, moves right when zooming out, and the Pleiades chip flies there (with warp).
 *   5. Reduce motion on: no warp, numbers appear final at once, the title still appears.
 *
 * Writes ml/results/ux_check.json and screenshots in ml/results/ux_screens/.
 * Usage (from frontend/):  node scripts/check-ux.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const FRONTEND = fileURLToPath(new URL('..', import.meta.url))
const ROOT = path.resolve(FRONTEND, '..')
const RESULTS = path.join(ROOT, 'ml', 'results')
const SHOTS = path.join(RESULTS, 'ux_screens')
const PAGE_PORT = 5199
const OBJECTS = JSON.parse(await fs.readFile(path.join(ROOT, 'backend', 'app', 'data', 'objects.json'), 'utf8'))
const BY_ID = Object.fromEntries(OBJECTS.map((o) => [o.id, o]))

// The expected arrival line, written out again here from objects.json (independent of the page's code).
const num = (x) => x.toLocaleString('en', { maximumFractionDigits: 2 })
function expectedSubtitle(o) {
  if (o.scene_mode === 'deep_space') return `${o.type} · ${num(o.distance_ly)} light-years away`
  if (o.parent) return `${o.type} · ${num(o.orbit_km)} km from ${BY_ID[o.parent].name}`
  if (o.orbit_au) return `${o.type} · ${num(o.orbit_au)} AU from the Sun`
  return o.type
}

async function openPage(browser, options = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...options })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`http://localhost:${PAGE_PORT}/?app`)
  await page.waitForSelector('[data-testid=loading-screen][data-done=true]', { state: 'attached', timeout: 60000 })
  await page.waitForTimeout(800)
  return { page, errors }
}

/** Start a flight to `id` and, while it runs, record the highest warp, view angle and edge darkness. */
async function flyAndMeasure(page, id, clickSelector = null) {
  return page.evaluate(
    async ({ id, clickSelector }) => {
      const a = window.astrolens
      const before = a.store.getState().landed.n
      const peak = { warp: 0, fov: a.camera.fov, vignette: 0 }
      const baseFov = a.camera.fov
      if (clickSelector) document.querySelector(clickSelector).click()
      else a.store.getState().selectObject(id)
      const start = performance.now()
      await new Promise((resolve) => {
        const tick = () => {
          peak.warp = Math.max(peak.warp, a.warp.value)
          peak.fov = Math.max(peak.fov, a.camera.fov)
          peak.vignette = Math.max(peak.vignette, Number(document.querySelector('[data-testid=warp-vignette]').style.opacity || 0))
          const s = a.store.getState()
          if ((s.landed.n > before && !s.isFlying) || performance.now() - start > 15000) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      const s = a.store.getState()
      return {
        target: id,
        landed_on: s.landed.id,
        seconds: +((performance.now() - start) / 1000).toFixed(2),
        peak_warp: +peak.warp.toFixed(3),
        fov_widened_by_deg: +(peak.fov - baseFov).toFixed(2),
        peak_edge_darkness: +peak.vignette.toFixed(3),
        warp_after_landing: +a.warp.value.toFixed(3),
      }
    },
    { id, clickSelector },
  )
}

async function cardFacts(page) {
  return page.$$eval('[data-testid=fact-value]', (els) => els.map((e) => e.textContent))
}

async function main() {
  await fs.mkdir(SHOTS, { recursive: true })
  const { createServer } = await import('vite')
  const server = await createServer({ root: FRONTEND, server: { port: PAGE_PORT, strictPort: true }, logLevel: 'warn' })
  await server.listen()
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] })
  const result = { script: 'frontend/scripts/check-ux.mjs', date: new Date().toISOString().slice(0, 10) }
  const checks = {}

  try {
    const { page, errors } = await openPage(browser)

    // 1 + 2. Long flight with warp, then the arrival title.
    await page.evaluate(() => window.astrolens.store.getState().selectObject('sun'))
    await page.waitForFunction(() => !window.astrolens.store.getState().isFlying, null, { timeout: 15000 })
    await page.waitForTimeout(500)
    const shotDuring = page.waitForTimeout(1300).then(() => page.screenshot({ path: path.join(SHOTS, '1_warp_mid_flight.png') }))
    const longFlight = await flyAndMeasure(page, 'orion_nebula')
    await shotDuring
    result.long_flight = longFlight
    checks.long_flight_warps = longFlight.peak_warp > 0.95 && longFlight.fov_widened_by_deg > 7 && longFlight.peak_edge_darkness > 0.9
    checks.warp_off_after_landing = longFlight.warp_after_landing === 0

    const title = await page.waitForSelector('[data-testid=arrival-title]', { timeout: 3000 }).then(async () => {
      await page.waitForTimeout(1400) // letters and subtitle have played
      await page.screenshot({ path: path.join(SHOTS, '2_arrival_title.png') })
      return {
        name: (await page.textContent('[data-testid=arrival-title] h2')).trim(),
        subtitle: (await page.textContent('[data-testid=arrival-subtitle]')).trim(),
      }
    })
    result.arrival_title = { ...title, expected_subtitle: expectedSubtitle(BY_ID.orion_nebula) }
    checks.arrival_title_right = title.name === BY_ID.orion_nebula.name && title.subtitle === expectedSubtitle(BY_ID.orion_nebula)
    await page.waitForSelector('[data-testid=arrival-title]', { state: 'detached', timeout: 6000 })
    checks.arrival_title_goes_away = true

    // Subtitles for every object, built by the page, against the expected text.
    const pageSubtitles = await page.evaluate(async () => {
      const { subtitleFor, OBJECTS } = await import('/src/objects.js')
      return Object.fromEntries(OBJECTS.map((o) => [o.id, subtitleFor(o)]))
    })
    const wrong = OBJECTS.filter((o) => pageSubtitles[o.id] !== expectedSubtitle(o)).map((o) => o.id)
    result.subtitles = { objects: OBJECTS.length, wrong, examples: ['jupiter', 'phobos', 'sun', 'hercules_cluster'].map((id) => pageSubtitles[id]) }
    checks.all_subtitles_right = wrong.length === 0

    // Short flight: no warp.
    await flyAndMeasure(page, 'mars')
    const shortFlight = await flyAndMeasure(page, 'jupiter')
    result.short_flight = shortFlight
    checks.short_flight_no_warp = shortFlight.peak_warp === 0 && shortFlight.fov_widened_by_deg === 0

    // 3. Counting numbers on the card.
    await page.evaluate(() => window.astrolens.store.getState().selectObject('saturn'))
    // The card opens as the arrival title fades (after the flight); the numbers count from then.
    await page.waitForFunction(() => window.astrolens.store.getState().panelOpen, null, { timeout: 12000 })
    await page.waitForTimeout(250)
    const early = await cardFacts(page)
    await page.screenshot({ path: path.join(SHOTS, '3_card_counting.png') })
    await page.waitForTimeout(1600)
    const settled = await cardFacts(page)
    const expected = Object.values(BY_ID.saturn.facts)
    result.counting = { early, settled, expected }
    checks.numbers_count_up = early[0] !== expected[0]
    checks.facts_end_exactly_as_written = JSON.stringify(settled) === JSON.stringify(expected)
    await page.waitForFunction(() => !window.astrolens.store.getState().isFlying, null, { timeout: 15000 })

    // 4. Distance scale.
    checks.scale_hidden_in_normal_view = (await page.$('[data-testid=distance-scale]')) === null
    await page.click('[data-testid=true-scale-toggle]')
    await page.waitForSelector('[data-testid=distance-scale]', { timeout: 3000 })
    await page.waitForTimeout(400)
    const readScale = () =>
      page.evaluate(() => {
        const a = window.astrolens
        const marker = document.querySelector('[data-testid=distance-scale-marker]')
        const expectedPct = ((a.view.logZoom - -6) / (9.4 - -6)) * 100
        return {
          log_zoom: +a.view.logZoom.toFixed(3),
          marker_left_pct: +parseFloat(marker.style.left).toFixed(2),
          expected_pct: +expectedPct.toFixed(2),
          value_text: document.querySelector('[data-testid=distance-scale-value]').textContent,
        }
      })
    const atSaturn = await readScale()
    // The bar sits in the bottom-left corner, clear of the middle of the scene and of the panel.
    const scaleBox = () =>
      page.$eval('[data-testid=distance-scale]', (e) => {
        const r = e.getBoundingClientRect()
        return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: innerWidth, height: innerHeight }
      })
    const boxWithPanel = await scaleBox()
    // The +/- buttons must be clickable with the glass panel open (Playwright's click fails if anything covers them).
    const zoomRight = () => page.$eval('[data-testid=zoom-controls]', (e) => Math.round(window.innerWidth - e.getBoundingClientRect().right))
    const zoomRightWithPanel = await zoomRight()
    const beforeClick = (await readScale()).log_zoom
    await page.click('[data-testid=zoom-out]', { timeout: 5000 })
    await page.waitForTimeout(700)
    const afterClick = (await readScale()).log_zoom
    // Close the panel: the buttons slide back to the edge.
    await page.evaluate(() => window.astrolens.store.getState().setPanelOpen(false))
    await page.waitForTimeout(700)
    const boxWithoutPanel = await scaleBox()
    const zoomRightWithoutPanel = await zoomRight()
    result.zoom_buttons = { gap_from_right_px: { panel_open: zoomRightWithPanel, panel_closed: zoomRightWithoutPanel }, log_zoom_before_click: beforeClick, log_zoom_after_click: afterClick }
    checks.zoom_buttons_clickable_with_panel_open = zoomRightWithPanel >= 340 && afterClick > beforeClick + 0.4
    checks.zoom_buttons_back_at_edge_when_closed = zoomRightWithoutPanel === 16
    result.scale_box_px = { panel_open: boxWithPanel, panel_closed: boxWithoutPanel }
    const inCorner = (b) => b.left <= 20 && b.right <= 340 && b.top >= b.height * 0.55 // left edge, lower part of the screen
    checks.scale_in_bottom_left_corner = inCorner(boxWithPanel) && inCorner(boxWithoutPanel)
    for (let i = 0; i < 3; i++) {
      await page.click('[data-testid=zoom-out]')
      await page.waitForTimeout(700)
    }
    const zoomedOut = await readScale()
    await page.screenshot({ path: path.join(SHOTS, '4_distance_scale.png') })
    result.distance_scale = { at_saturn: atSaturn, after_4_zoom_outs: zoomedOut }
    checks.scale_marker_matches_zoom = Math.abs(atSaturn.marker_left_pct - atSaturn.expected_pct) < 0.5
    checks.scale_marker_moves_right_on_zoom_out = zoomedOut.marker_left_pct > atSaturn.marker_left_pct + 5

    const markFlight = await flyAndMeasure(page, 'pleiades', '[data-testid=scale-mark-pleiades]')
    await page.waitForTimeout(500)
    result.scale_mark_flight = { ...markFlight, scale_after: await readScale() }
    await page.screenshot({ path: path.join(SHOTS, '5_scale_mark_pleiades.png') })
    checks.scale_mark_flies_there = markFlight.landed_on === 'pleiades'
    checks.scale_mark_flight_warps = markFlight.peak_warp > 0.95
    result.console_errors = errors
    await page.close()

    // 5. Reduce motion.
    const rm = await openPage(browser, { reducedMotion: 'reduce' })
    const rmFlight = await flyAndMeasure(rm.page, 'orion_nebula')
    const rmFactsEarly = await cardFacts(rm.page)
    const rmTitle = await rm.page.$('[data-testid=arrival-title]')
    result.reduced_motion = { flight: rmFlight, facts_right_after_landing: rmFactsEarly, title_shown: Boolean(rmTitle) }
    await rm.page.evaluate(() => window.astrolens.store.getState().selectObject('jupiter'))
    await rm.page.waitForTimeout(100)
    const rmJupiter = await cardFacts(rm.page)
    checks.reduced_motion_no_warp = rmFlight.peak_warp === 0 && rmFlight.fov_widened_by_deg === 0
    checks.reduced_motion_numbers_final_at_once = JSON.stringify(rmJupiter) === JSON.stringify(Object.values(BY_ID.jupiter.facts))
    checks.reduced_motion_title_still_shown = Boolean(rmTitle)
    result.console_errors = [...result.console_errors, ...rm.errors]
    await rm.page.close()

    checks.no_console_errors = result.console_errors.length === 0
  } finally {
    await browser.close()
    await server.close()
  }

  result.checks = checks
  result.passed = Object.values(checks).every(Boolean)
  await fs.writeFile(path.join(RESULTS, 'ux_check.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(checks, null, 2))
  console.log(result.passed ? 'PASSED' : 'FAILED')
  process.exit(result.passed ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
