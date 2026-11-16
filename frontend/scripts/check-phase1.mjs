/**
 * Phase 1 "Done when" check: picking any of the 20 objects flies the camera there,
 * switches scene mode if needed, and shows the correct card.
 *
 * Starts its own Vite dev server, opens the page in the installed Microsoft Edge
 * (through playwright-core, so no browser download), and for every object in objects.json:
 * picks it (selectObject, as the dropdown did until Phase 4), waits for the flight to end, then checks the card text, the
 * scene mode, the camera position and that the object is on screen. Saves a screenshot each.
 * Objects are visited alternating Solar System / deep space, so every flight is a mode switch.
 *
 * Writes ml/results/phase1_scene_check.json and ml/results/phase1_screens/<id>.jpg
 * Usage (from frontend/):  node scripts/check-phase1.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'

const FRONTEND = fileURLToPath(new URL('..', import.meta.url))
const RESULTS = path.resolve(FRONTEND, '..', 'ml', 'results')
const SHOTS = path.join(RESULTS, 'phase1_screens')
const PORT = 5199
const VIEWPORT = { width: 1440, height: 900 }
const TOLERANCE = 0.01 // scene units; the camera must end exactly at the planned viewpoint

const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d

async function main() {
  await fs.mkdir(SHOTS, { recursive: true })
  const server = await createServer({ root: FRONTEND, server: { port: PORT, strictPort: true }, logLevel: 'warn' })
  await server.listen()
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
  })

  try {
    const page = await browser.newPage({ viewport: VIEWPORT })
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    // A frame counter, to measure frames per second during idle time and during flights.
    await page.addInitScript(() => {
      window.__frames = 0
      const tick = () => {
        window.__frames++
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })

    // ---- Load ----
    const t0 = Date.now()
    await page.goto(`http://localhost:${PORT}/`)
    await page.waitForSelector('[data-testid=loading-screen][data-done=true]', { state: 'attached', timeout: 60000 })
    const loadMs = Date.now() - t0
    await page.waitForTimeout(1000)

    const env = await page.evaluate(() => {
      const gl = document.querySelector('canvas').getContext('webgl2')
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      return {
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        starCount: window.astrolens.starCount,
        objects: window.astrolens.objects.map((o) => ({ id: o.id, name: o.name, summary: o.summary, scene_mode: o.scene_mode })),
      }
    })
    const frames = () => page.evaluate(() => ({ n: window.__frames, t: performance.now() }))
    const fps = (a, b) => round(((b.n - a.n) * 1000) / (b.t - a.t), 1)

    const idleA = await frames()
    await page.waitForTimeout(3000)
    const fpsIdle = fps(idleA, await frames())
    await page.screenshot({ path: path.join(SHOTS, '_home_solar.jpg'), type: 'jpeg', quality: 70 })

    const waitForFlight = async () => {
      await page.waitForFunction(() => window.astrolens.store.getState().isFlying, null, { polling: 'raf', timeout: 5000 })
      await page.waitForFunction(() => !window.astrolens.store.getState().isFlying, null, { polling: 'raf', timeout: 20000 })
    }

    // Camera, target, mode, fade and on-screen position after a flight to `id`.
    const inspect = (id) =>
      page.evaluate((id) => {
        const a = window.astrolens
        const s = a.store.getState()
        const v = a.objectView(id)
        const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
        const ndc = a.camera.position.clone().set(...a.positions[id]).project(a.camera)
        return {
          mode: s.mode,
          currentObjectId: s.currentObjectId,
          panelOpen: s.panelOpen,
          controlsEnabled: a.controls.enabled,
          cameraError: d(a.camera.position.toArray(), v.position),
          targetError: d(a.controls.target.toArray(), a.positions[id]),
          onScreen: Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z < 1,
          fade: { ...a.fade },
        }
      }, id)

    // ---- Fly to all 20, alternating solar system / deep space ----
    const solar = env.objects.filter((o) => o.scene_mode === 'solar_system')
    const deep = env.objects.filter((o) => o.scene_mode === 'deep_space')
    const order = solar.flatMap((o, i) => [o, deep[i]]).filter(Boolean)

    const flights = []
    let fadeSamples = null
    for (const obj of order) {
      const modeBefore = await page.evaluate(() => window.astrolens.store.getState().mode)
      const switching = modeBefore !== obj.scene_mode
      if (switching && !fadeSamples) {
        // Sample the planets' visibility every 100 ms during the first switch, to show a gradual fade.
        await page.evaluate(() => {
          window.__fade = []
          const id = setInterval(() => window.__fade.push(Math.round(window.astrolens.fade.solar * 100) / 100), 100)
          setTimeout(() => clearInterval(id), 3000)
        })
      }
      const fA = await frames()
      const start = Date.now()
      // Phase 4 replaced the dropdown with the command bar; this calls the same store action it used.
      await page.evaluate((id) => window.astrolens.store.getState().selectObject(id), obj.id)
      let fadeSeconds = null
      if (switching) {
        const key = obj.scene_mode === 'deep_space' ? 'deep' : 'solar'
        await page.waitForFunction((k) => window.astrolens.fade[k] === 1, key, { polling: 'raf', timeout: 10000 })
        fadeSeconds = round((Date.now() - start) / 1000)
      }
      await waitForFlight()
      const flightSeconds = round((Date.now() - start) / 1000)
      const fpsFlight = fps(fA, await frames())
      if (switching && !fadeSamples) fadeSamples = await page.evaluate(() => window.__fade)

      await page.waitForTimeout(700) // let the panel slide in before the screenshot
      const r = await inspect(obj.id)
      const cardName = (await page.textContent('[data-testid=card-name]')).trim()
      const cardSummary = (await page.textContent('[data-testid=card-summary]')).trim()
      await page.screenshot({ path: path.join(SHOTS, `${obj.id}.jpg`), type: 'jpeg', quality: 70 })

      const fadeOk = obj.scene_mode === 'deep_space' ? r.fade.deep === 1 && r.fade.solar === 0 : r.fade.solar === 1 && r.fade.deep === 0
      const checks = {
        card_name: cardName === obj.name,
        card_summary: cardSummary === obj.summary,
        mode: r.mode === obj.scene_mode,
        camera_at_viewpoint: r.cameraError < TOLERANCE,
        looking_at_object: r.targetError < TOLERANCE,
        object_on_screen: r.onScreen,
        panel_open: r.panelOpen,
        controls_unlocked_after: r.controlsEnabled,
        fade_finished: fadeOk,
      }
      flights.push({
        id: obj.id,
        scene_mode: obj.scene_mode,
        mode_switch: switching,
        flight_seconds: flightSeconds,
        fade_seconds: fadeSeconds,
        fps_during_flight: fpsFlight,
        camera_error: round(r.cameraError, 4),
        checks,
        pass: Object.values(checks).every(Boolean),
      })
      console.log(`${flights.at(-1).pass ? 'PASS' : 'FAIL'} ${obj.id.padEnd(18)} ${flightSeconds}s ${fpsFlight} fps`)
    }

    // ---- Panel: width, collapse, chat view ----
    const box = await page.locator('[data-testid=glass-panel]').boundingBox()
    await page.click('button[aria-label="Collapse panel"]')
    await page.waitForTimeout(600)
    const collapsed = (await page.getAttribute('[data-testid=glass-panel]', 'data-open')) === 'false'
    await page.click('text=Show card')
    await page.waitForTimeout(600)
    const reopened = (await page.getAttribute('[data-testid=glass-panel]', 'data-open')) === 'true'
    await page.click('text=Chat more')
    const chatView = await page.locator('[data-testid=chat-placeholder]').isVisible()
    await page.click('text=Back to card')
    const backToCard = await page.locator('[data-testid=brief-card]').isVisible()
    const panel = {
      width_fraction: round(box.width / VIEWPORT.width, 3),
      collapse: collapsed,
      reopen: reopened,
      chat_view: chatView,
      back_to_card: backToCard,
    }

    // ---- Home button (from deep space, so it is also a mode switch) ----
    if ((await page.evaluate(() => window.astrolens.store.getState().mode)) !== 'deep_space') {
      await page.evaluate((id) => window.astrolens.store.getState().selectObject(id), deep[0].id)
      await waitForFlight()
    }
    await page.click('[data-testid=home-button]')
    await waitForFlight()
    const home = await page.evaluate(() => {
      const a = window.astrolens
      const s = a.store.getState()
      const h = a.homeViews.solar_system.position
      const c = a.camera.position.toArray()
      return {
        mode: s.mode,
        camera_error: Math.hypot(c[0] - h[0], c[1] - h[1], c[2] - h[2]),
        panel_hidden: !document.querySelector('[data-testid=glass-panel]'),
      }
    })
    home.pass = home.mode === 'solar_system' && home.camera_error < TOLERANCE && home.panel_hidden
    home.camera_error = round(home.camera_error, 4)

    // ---- Clicking in the scene: every Solar-system name label, and the Sun's sphere itself ----
    const labelClicks = {}
    for (const obj of solar) {
      await page.locator('main button', { hasText: new RegExp(`^${obj.name}$`) }).first().click()
      await waitForFlight()
      labelClicks[obj.id] = (await page.evaluate(() => window.astrolens.store.getState().currentObjectId)) === obj.id
      await page.click('[data-testid=home-button]')
      await waitForFlight()
    }
    const sunXY = await page.evaluate(() => {
      const a = window.astrolens
      const p = a.camera.position.clone().set(0, 0, 0).project(a.camera)
      return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight }
    })
    await page.mouse.click(sunXY.x, sunXY.y)
    await waitForFlight()
    const sunMeshClick = (await page.evaluate(() => window.astrolens.store.getState().currentObjectId)) === solar[0].id

    // ---- Sky alignment: deep-space objects against the HYG stars, as seen from the Sun ----
    const sky = await page.evaluate(async () => {
      const a = window.astrolens
      const { stars } = await (await fetch('/data/hyg_stars.json')).json()
      const unit = (v) => {
        const l = Math.hypot(...v)
        return v.map((x) => x / l)
      }
      const angle = (u, v) => (Math.acos(Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])) * 180) / Math.PI
      const starDirs = stars.map(([x, y, z, mag]) => ({ dir: unit(a.equatorialToScene(x, y, z)), mag }))
      const nearest = {}
      for (const o of a.objects.filter((o) => o.scene_mode === 'deep_space')) {
        const d = unit(a.positions[o.id])
        const best = starDirs.filter((s) => s.mag < 4).reduce((b, s) => {
          const ang = angle(d, s.dir)
          return ang < b.deg ? { deg: ang, mag: s.mag } : b
        }, { deg: 180, mag: null })
        nearest[o.id] = { nearest_bright_star_deg: Math.round(best.deg * 100) / 100, star_mag: best.mag }
      }
      return {
        pleiades_to_crab_deg: Math.round(angle(unit(a.positions.pleiades), unit(a.positions.crab_nebula)) * 10) / 10,
        nearest_star_brighter_than_mag4: nearest,
      }
    })

    const result = {
      generated_at: new Date().toISOString(),
      script: 'frontend/scripts/check-phase1.mjs',
      browser: `Microsoft Edge ${browser.version()} (headless)`,
      webgl_renderer: env.renderer,
      viewport: VIEWPORT,
      stars_rendered: env.starCount,
      load_ms: loadMs,
      fps_idle_solar_overview: fpsIdle,
      objects_checked: flights.length,
      objects_passed: flights.filter((f) => f.pass).length,
      mode_switches: flights.filter((f) => f.mode_switch).length,
      flights,
      first_mode_switch_planet_visibility_every_100ms: fadeSamples,
      panel,
      home_button: home,
      scene_clicks: { labels: labelClicks, sun_sphere: sunMeshClick },
      sky_alignment: sky,
      console_errors: errors,
    }
    result.all_passed =
      result.objects_passed === 20 &&
      Object.values(panel).every((v) => v === true || typeof v === 'number') &&
      home.pass &&
      Object.values(labelClicks).every(Boolean) &&
      sunMeshClick &&
      errors.length === 0
    await fs.writeFile(path.join(RESULTS, 'phase1_scene_check.json'), JSON.stringify(result, null, 2) + '\n')
    console.log(`\n${result.objects_passed}/20 objects passed, all checks passed: ${result.all_passed}`)
    console.log(`renderer: ${env.renderer}; idle ${fpsIdle} fps; load ${loadMs} ms; ${env.starCount} stars`)
    if (!result.all_passed) process.exitCode = 1
  } finally {
    await browser.close()
    await server.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
