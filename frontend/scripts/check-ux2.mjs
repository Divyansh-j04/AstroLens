/**
 * Browser check for the second batch of interface features: custom cursor, Journey, photo
 * scanning effect, opening sequence and typed chat answers, each with "reduce motion" on as well.
 *
 * Starts a Vite dev server and drives the installed Microsoft Edge through playwright-core. The
 * server's /classify and /chat answers are FAKED inside the browser (page.route), because this check
 * is about the page's animations; the real classifier and chat are checked by check-phase3.mjs and
 * check-phase4.mjs. The fake photo and heatmap are ml/results/gradcam/gradcam_examples.png.
 *
 *   1. Opening: the loading counter climbs to 100% while the title appears letter by letter; behind
 *      the landing page the camera waits 2.6x farther out; "Explore the sky" dives back in with warp.
 *   2. Cursor: the system pointer is hidden; the ring grows over buttons, says "Fly to Jupiter" over
 *      Jupiter, and the Home button pulls towards the pointer and springs back.
 *   3. Journey (scroll-driven, replaced the Grand Tour): 7 chapters in order; kicker, title and caption
 *      from objects.json; one scroll = one chapter (even two quick ones); scrolling up goes back, the
 *      arrow key goes on; app controls hidden, panel closed, wheel does not zoom; constellation drawn;
 *      scrolling past the last chapter opens its card; Exit and Escape end it.
 *   4. Scanning: a scan line sweeps the photo while classifying; then the heatmap fades in and out
 *      once (the "Show heatmap" toggle stays off) and the top 3 guesses slide up.
 *   5. Typed chat: the answer appears word by word, citation numbers pop in, sources show at the end.
 *   6. Reduce motion: no custom cursor, no camera pull-back or warp, the answer appears at once,
 *      the scan line stands still.
 *
 * Writes ml/results/ux_check_2.json and screenshots in ml/results/ux2_screens/.
 * Usage (from frontend/):  node scripts/check-ux2.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const FRONTEND = fileURLToPath(new URL('..', import.meta.url))
const ROOT = path.resolve(FRONTEND, '..')
const RESULTS = path.join(ROOT, 'ml', 'results')
const SHOTS = path.join(RESULTS, 'ux2_screens')
const PAGE_PORT = 5201
const PHOTO = path.join(RESULTS, 'gradcam', 'gradcam_examples.png')
const OBJECTS = JSON.parse(await fs.readFile(path.join(ROOT, 'backend', 'app', 'data', 'objects.json'), 'utf8'))
const BY_ID = Object.fromEntries(OBJECTS.map((o) => [o.id, o]))
const JOURNEY = ['earth', 'moon', 'mars', 'jupiter', 'saturn', 'orion_nebula', 'pleiades'] // as in src/journey.js
// The line under a title, written out again here from objects.json (independent of the page's code).
const num = (x) => x.toLocaleString('en', { maximumFractionDigits: 2 })
function expectedSubtitle(o) {
  if (o.scene_mode === 'deep_space') return `${o.type} · ${num(o.distance_ly)} light-years away`
  if (o.parent) return `${o.type} · ${num(o.orbit_km)} km from ${BY_ID[o.parent].name}`
  if (o.orbit_au) return `${o.type} · ${num(o.orbit_au)} AU from the Sun`
  return o.type
}
const firstSentence = (text) => text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const HEATMAP_B64 = (await fs.readFile(PHOTO)).toString('base64')
const FAKE_CLASSIFY = {
  top3: [
    { id: 'saturn', name: 'Saturn', prob: 0.78 },
    { id: 'jupiter', name: 'Jupiter', prob: 0.12 },
    { id: 'uranus', name: 'Uranus', prob: 0.05 },
  ],
  is_unknown: false,
  threshold: 0.46,
  known_classes: 14,
  gradcam_png_base64: HEATMAP_B64,
  latency_ms: 300,
}
const FAKE_ANSWER =
  "Saturn's rings are made mostly of water ice, with some rock and dust [1]. They are very wide but usually only about ten metres thick [2]."
const SHOWN_ANSWER = FAKE_ANSWER.replace(/\[(\d+)\]/g, '$1') // on the page "[1]" is a small link reading "1"
const FAKE_CHAT = {
  answer: FAKE_ANSWER,
  refused: false,
  citations: [
    { n: 1, title: 'Rings of Saturn', url: 'https://en.wikipedia.org/wiki/Rings_of_Saturn', section: 'Composition', object_id: 'saturn', snippet: '…', score: 0.8, cited: true },
    { n: 2, title: 'Saturn', url: 'https://science.nasa.gov/saturn', section: 'Rings', object_id: 'saturn', snippet: '…', score: 0.7, cited: true },
  ],
  retrieval_ms: 20,
  llm_ms: 400,
  latency_ms: 420,
}

/** Fake server answers: /classify after `delay` ms, /chat after 400 ms. */
async function fakeServer(page, delay = 1800) {
  await page.route('**/classify', async (route) => {
    await sleep(delay)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_CLASSIFY) })
  })
  await page.route('**/chat', async (route) => {
    await sleep(400)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_CHAT) })
  })
}

async function openPage(browser, { url = '/?app', reducedMotion = 'no-preference', watchLoading = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await fakeServer(page)
  await page.goto(`http://localhost:${PAGE_PORT}${url}`)
  let loading = null
  if (watchLoading) {
    // Record the percentage on screen and the visible title letters until the loading screen is done.
    loading = await page.evaluate(async () => {
      const seen = []
      const start = performance.now()
      while (performance.now() - start < 60000) {
        const el = document.querySelector('[data-testid=loading-screen]')
        const pct = document.querySelector('[data-testid=loading-percent]')
        const letters = [...document.querySelectorAll('[data-testid=loading-title] span')]
        const visible = letters.filter((s) => Number(getComputedStyle(s).opacity) > 0.5).length
        if (pct) seen.push({ t: Math.round(performance.now() - start), pct: parseInt(pct.textContent, 10), letters: visible })
        if (el?.dataset.done === 'true') break
        await new Promise((r) => setTimeout(r, 50))
      }
      return seen
    })
  }
  await page.waitForSelector('[data-testid=loading-screen][data-done=true]', { state: 'attached', timeout: 60000 })
  await page.waitForTimeout(900)
  return { page, errors, loading }
}

const state = (page) =>
  page.evaluate(() => {
    const s = window.astrolens.store.getState()
    return { currentObjectId: s.currentObjectId, isFlying: s.isFlying, panelOpen: s.panelOpen, journey: s.journey, entered: s.entered }
  })
const cameraDistance = (page) =>
  page.evaluate(() => {
    const { camera, controls } = window.astrolens
    return +camera.position.distanceTo(controls.target).toFixed(2)
  })
const waitLanded = (page) => page.waitForFunction(() => !window.astrolens.store.getState().isFlying, null, { timeout: 20000 })

async function main() {
  await fs.mkdir(SHOTS, { recursive: true })
  const { createServer } = await import('vite')
  const server = await createServer({ root: FRONTEND, server: { port: PAGE_PORT, strictPort: true }, logLevel: 'warn' })
  await server.listen()
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] })
  const result = { script: 'frontend/scripts/check-ux2.mjs', date: new Date().toISOString().slice(0, 10), note: '/classify and /chat answers are faked in the browser' }
  const checks = {}
  const allErrors = []

  try {
    // ---------- 1. Opening sequence ----------
    {
      const { page, errors, loading } = await openPage(browser, { url: '/', watchLoading: true })
      const pcts = loading.map((x) => x.pct)
      result.opening = {
        samples: loading.length,
        percent_first_last: [pcts[0], pcts.at(-1)],
        percent_never_goes_down: pcts.every((v, i) => i === 0 || v >= pcts[i - 1]),
        distinct_percent_values: new Set(pcts).size,
        letters_visible_over_time: [...new Set(loading.map((x) => x.letters))],
        loading_ms: loading.at(-1)?.t,
      }
      checks.opening_counter_reaches_100 = pcts.at(-1) === 100 && result.opening.percent_never_goes_down && result.opening.distinct_percent_values >= 5
      checks.opening_title_letter_by_letter = result.opening.letters_visible_over_time.length >= 4 && result.opening.letters_visible_over_time.includes(9)

      const home = await page.evaluate(() => {
        const v = window.astrolens.homeViews.solar_system
        return Math.hypot(...v.position.map((p, i) => p - v.target[i]))
      })
      const onLanding = await cameraDistance(page)
      await page.screenshot({ path: path.join(SHOTS, '1_landing.png') })
      const dive = await page.evaluate(async () => {
        const a = window.astrolens
        let peak = 0
        document.querySelector('[data-testid=landing-explore]').click()
        const start = performance.now()
        await new Promise((resolve) => {
          const tick = () => {
            peak = Math.max(peak, a.warp.value)
            if (performance.now() - start > 3200) resolve()
            else requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        })
        return { peak_warp: +peak.toFixed(3), flying_after: a.store.getState().isFlying }
      })
      const afterDive = await cameraDistance(page)
      result.opening.camera = { home_distance: +home.toFixed(2), on_landing: onLanding, after_dive: afterDive, ...dive }
      checks.opening_camera_pulled_back_on_landing = Math.abs(onLanding / home - 2.6) < 0.05
      checks.opening_dive_returns_with_warp = Math.abs(afterDive - home) < 0.05 * home && dive.peak_warp > 0.9 && !dive.flying_after
      allErrors.push(...errors)
      await page.close()

      // The landing's title, kicker, fonts and "Begin the journey" button.
      const { page: lp, errors: lpErrors } = await openPage(browser, { url: '/' })
      await lp.waitForTimeout(1600)
      const landing = await lp.evaluate(async () => {
        await document.fonts.ready
        return {
          title_letters: document.querySelectorAll('[data-testid=landing-title] [data-ch]').length,
          kicker: document.querySelector('[data-testid=landing-kicker]').textContent,
          display_font_loaded: document.fonts.check('300 40px "Space Grotesk"'), // the weight the landing title uses (weights load when first used)
          mono_font_loaded: document.fonts.check('400 12px "JetBrains Mono"'),
          title_font: getComputedStyle(document.querySelector('[data-testid=landing-title]')).fontFamily,
        }
      })
      await lp.screenshot({ path: path.join(SHOTS, '1b_landing_journey_button.png') })
      await lp.click('[data-testid=landing-journey]')
      await lp.waitForSelector('[data-testid=journey][data-step="0"][data-arrived=true]', { timeout: 25000 })
      landing.button_starts_journey_at = await lp.evaluate(() => window.astrolens.store.getState().currentObjectId)
      result.landing = landing
      checks.landing_title_kicker_fonts = landing.title_letters === 9 && landing.kicker === 'COMPUTER VISION · NATURAL LANGUAGE' && landing.display_font_loaded && landing.mono_font_loaded && landing.title_font.includes('Space Grotesk')
      checks.landing_button_starts_journey = landing.button_starts_journey_at === JOURNEY[0]
      allErrors.push(...lpErrors)
      await lp.close()
    }

    // ---------- 2-5 on one page ----------
    const { page, errors } = await openPage(browser)

    // 2. Cursor
    {
      const hidden = await page.evaluate(() => getComputedStyle(document.body).cursor)
      await page.mouse.move(400, 500)
      await page.waitForTimeout(400)
      const idle = await page.getAttribute('[data-testid=custom-cursor]', 'data-state')
      const box = await page.locator('[data-testid=home-button]').boundingBox()
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      await page.mouse.move(cx + box.width * 0.4, cy + box.height * 0.3, { steps: 8 })
      await page.waitForTimeout(500)
      const overButton = await page.getAttribute('[data-testid=custom-cursor]', 'data-state')
      const pulled = await page.evaluate(() => {
        const m = getComputedStyle(document.querySelector('[data-testid=home-button]')).transform
        return m === 'none' ? [0, 0] : m.match(/matrix\(([^)]+)\)/)[1].split(',').slice(4).map((v) => +(+v).toFixed(1))
      })
      await page.screenshot({ path: path.join(SHOTS, '2_cursor_magnetic.png') })
      await page.mouse.move(400, 500, { steps: 6 })
      await page.waitForTimeout(1000)
      const released = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=home-button]')).transform)

      // Over Jupiter: fly there, it is then in the centre of the screen.
      await page.evaluate(() => window.astrolens.store.getState().selectObject('jupiter'))
      await waitLanded(page)
      await page.waitForTimeout(3500) // arrival title gone
      await page.mouse.move(700, 440, { steps: 4 })
      await page.mouse.move(720, 450, { steps: 4 })
      await page.waitForTimeout(500)
      const overPlanet = await page.getAttribute('[data-testid=custom-cursor]', 'data-state')
      const label = await page.locator('[data-testid=cursor-label]').textContent().catch(() => null)
      await page.screenshot({ path: path.join(SHOTS, '3_cursor_fly_to.png') })
      result.cursor = { system_pointer: hidden, idle, over_home_button: overButton, home_button_pull_px: pulled, home_button_after_leaving: released, over_jupiter: overPlanet, label }
      checks.cursor_hides_system_pointer = hidden === 'none'
      checks.cursor_grows_over_buttons = idle === 'idle' && overButton === 'link'
      checks.cursor_magnetic_pull_and_release = pulled[0] > 3 && pulled[1] > 1 && (released === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(released))
      checks.cursor_fly_to_label = overPlanet === 'object' && label === `Fly to ${BY_ID.jupiter.name}`
      await page.mouse.move(300, 700)
    }

    // 3. Journey (scroll-driven; replaced the Grand Tour)
    {
      await page.click('[data-testid=journey-button]')
      const chapters = []
      const arrive = (i) => page.waitForSelector(`[data-testid=journey][data-step="${i}"][data-arrived=true]`, { timeout: 25000 })
      const wheel = async (dy) => {
        await page.mouse.move(700, 450)
        await page.mouse.wheel(0, dy)
      }
      for (let i = 0; i < JOURNEY.length; i++) {
        await arrive(i)
        await page.waitForTimeout(1300) // the kicker has decoded, the title has come into focus
        const read = await page.evaluate(() => {
          const s = window.astrolens.store.getState()
          return {
            at: s.currentObjectId,
            panel_open: s.panelOpen,
            kicker: document.querySelector('[data-testid=journey-kicker]')?.textContent,
            title: document.querySelector('[data-testid=journey-title]')?.getAttribute('aria-label'),
            caption: document.querySelector('[data-testid=journey-caption]')?.textContent.replace(/^\+\s*/, ''),
            hud_lines: document.querySelectorAll('[data-testid=journey-hud] [data-draw]').length,
            app_controls_hidden: !document.querySelector('main > header') && !document.querySelector('[data-testid=upload-pill]') && !document.querySelector('[data-testid=zoom-controls]'),
            wheel_zoom_off: window.astrolens.controls.enableZoom === false && window.astrolens.controls.enableRotate === false,
          }
        })
        const obj = BY_ID[JOURNEY[i]]
        read.kicker_ok = read.kicker === `${String(i + 1).padStart(2, '0')} / ${String(JOURNEY.length).padStart(2, '0')} · ${expectedSubtitle(obj)}`.toUpperCase()
        read.title_ok = read.title === obj.name
        read.caption_ok = read.caption === firstSentence(obj.summary)
        chapters.push(read)
        if ([0, 1, 5].includes(i)) await page.screenshot({ path: path.join(SHOTS, `4_journey_${i + 1}_${JOURNEY[i]}.png`) })
        if (i === 2) {
          // Scroll up goes back one chapter; then forward again with the arrow key.
          await wheel(-120)
          await arrive(1)
          chapters[i].back_to = await page.evaluate(() => window.astrolens.store.getState().currentObjectId)
          await page.waitForTimeout(800)
          await page.keyboard.press('ArrowDown')
          await arrive(2)
          await page.waitForTimeout(800)
        }
        if (i < JOURNEY.length - 1) {
          // Two quick scrolls: still only one chapter.
          await wheel(120)
          await page.waitForTimeout(80)
          await wheel(120)
          await page.waitForTimeout(400)
          chapters[i].after_double_scroll = await page.evaluate(() => window.astrolens.store.getState().journey.step)
        }
      }
      // Scrolling on from the last chapter ends the Journey and opens the card.
      await wheel(120)
      await page.waitForTimeout(900)
      const end = await state(page)
      const cardName = await page.textContent('[data-testid=card-name]').catch(() => null)
      result.journey = { chapters, after_last_scroll: { journey_active: end.journey.active, panel_open: end.panelOpen, card: cardName } }
      checks.journey_visits_chapters_in_order = chapters.map((x) => x.at).join() === JOURNEY.join()
      checks.journey_text_from_objects_json = chapters.every((x) => x.kicker_ok && x.title_ok && x.caption_ok)
      checks.journey_one_scroll_one_chapter = chapters.slice(0, -1).every((x, i) => x.after_double_scroll === i + 1)
      checks.journey_scroll_up_goes_back = chapters[2].back_to === JOURNEY[1]
      checks.journey_hides_app_controls_and_panel = chapters.every((x) => x.app_controls_hidden && !x.panel_open)
      checks.journey_wheel_does_not_zoom = chapters.every((x) => x.wheel_zoom_off)
      checks.journey_draws_constellation = chapters.every((x) => x.hud_lines === 13)
      checks.journey_finish_opens_last_card = !end.journey.active && end.panelOpen && cardName === BY_ID.pleiades.name

      // Exit and Escape end it at once.
      await page.click('[data-testid=journey-button]')
      await arrive(0)
      await page.click('[data-testid=journey-exit]')
      await page.waitForTimeout(300)
      const afterExit = (await state(page)).journey.active
      await page.click('[data-testid=journey-button]')
      await arrive(0)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      const afterEsc = await state(page)
      result.journey.exit_ends = !afterExit
      result.journey.escape_ends = !afterEsc.journey.active
      result.journey.zoom_back_on_after = await page.evaluate(() => window.astrolens.controls.enableZoom && window.astrolens.controls.enableRotate)
      checks.journey_exit_and_escape_end_it = result.journey.exit_ends && result.journey.escape_ends && result.journey.zoom_back_on_after
      await page.evaluate(() => window.astrolens.store.getState().selectObject('mars'))
      await waitLanded(page)
      await page.waitForFunction(() => window.astrolens.store.getState().panelOpen, null, { timeout: 12000 })
    }

    // 4. Photo scanning
    {
      await page.setInputFiles('[data-testid=upload-input]', PHOTO)
      await page.waitForSelector('[data-testid=upload-scan]', { timeout: 5000 })
      const scanTops = []
      for (let i = 0; i < 6; i++) {
        scanTops.push(await page.$eval('[data-testid=upload-scan]', (e) => Math.round(e.getBoundingClientRect().top)))
        await page.waitForTimeout(120)
      }
      const scanAnimation = await page.$eval('[data-testid=upload-scan]', (e) => getComputedStyle(e).animationName)
      await page.screenshot({ path: path.join(SHOTS, '5_scanning.png') })
      const reveal = await page.evaluate(async () => {
        const start = performance.now()
        while (!document.querySelector('[data-testid=gradcam-reveal]') && performance.now() - start < 8000) await new Promise((r) => setTimeout(r, 20))
        const img = document.querySelector('[data-testid=gradcam-reveal]')
        const samples = []
        const t0 = performance.now()
        while (performance.now() - t0 < 2600) {
          const items = [...document.querySelectorAll('[data-testid=upload-guesses] li')]
          samples.push({ t: Math.round(performance.now() - t0), reveal: +Number(getComputedStyle(img).opacity).toFixed(2), guesses: items.map((li) => +Number(getComputedStyle(li).opacity).toFixed(2)) })
          await new Promise((r) => setTimeout(r, 60))
        }
        return samples
      })
      const peak = Math.max(...reveal.map((x) => x.reveal))
      const shot = reveal.findIndex((x) => x.reveal === peak)
      const finalReveal = reveal.at(-1).reveal
      const toggleHeatmap = await page.$eval('[data-testid=gradcam-image]', (e) => getComputedStyle(e).opacity)
      const firstGuessVisibleAt = reveal.find((x) => x.guesses[0] > 0.9)?.t
      const lastGuessVisibleAt = reveal.find((x) => x.guesses[2] > 0.9)?.t
      await page.screenshot({ path: path.join(SHOTS, '6_scan_result.png') })
      result.scanning = {
        scan_line_tops_px: scanTops,
        scan_animation: scanAnimation,
        heatmap_reveal_peak_opacity: peak,
        heatmap_reveal_peak_at_ms: reveal[shot].t,
        heatmap_reveal_final_opacity: finalReveal,
        show_heatmap_toggle_opacity: Number(toggleHeatmap),
        guesses: await page.$$eval('[data-testid=upload-guesses] li', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())),
        first_guess_visible_at_ms: firstGuessVisibleAt,
        third_guess_visible_at_ms: lastGuessVisibleAt,
      }
      checks.scan_line_sweeps = scanAnimation === 'scan' && new Set(scanTops).size >= 4
      checks.scan_heatmap_fades_in_and_out = peak >= 0.85 && finalReveal === 0 && Number(toggleHeatmap) === 0
      checks.scan_guesses_slide_up_in_turn = result.scanning.guesses.length === 3 && firstGuessVisibleAt < lastGuessVisibleAt
      await waitLanded(page)
    }

    // 5. Typed chat answer
    {
      await page.evaluate(() => window.astrolens.store.getState().setUploadPanelOpen(false))
      await page.evaluate(() => window.astrolens.store.getState().openChat())
      await page.fill('[data-testid=chat-input]', 'What are the rings made of?')
      await page.click('[data-testid=chat-send]')
      const typing = await page.evaluate(async () => {
        const start = performance.now()
        while (!document.querySelector('[data-testid=chat-answer]') && performance.now() - start < 5000) await new Promise((r) => setTimeout(r, 10))
        const li = document.querySelector('[data-testid=chat-answer]')
        const samples = []
        const t0 = performance.now()
        while (performance.now() - t0 < 4000) {
          samples.push({
            t: Math.round(performance.now() - t0),
            typing: li.dataset.typing,
            chars: li.querySelector('p').textContent.length,
            citations: li.querySelectorAll('p a').length,
            sources_shown: Boolean(li.querySelector('[data-testid=chat-sources]')),
          })
          if (li.dataset.typing === 'false' && samples.length > 3) break
          await new Promise((r) => setTimeout(r, 40))
        }
        return { samples, final_text: li.querySelector('p').textContent, screen_reader_text_while_typing: null }
      })
      await page.screenshot({ path: path.join(SHOTS, '7_chat_typed.png') })
      const s = typing.samples
      const mid = s[Math.floor(s.length / 3)]
      const done = s.at(-1)
      result.typed_chat = {
        samples: s.length,
        chars_over_time: s.filter((_, i) => i % 4 === 0).map((x) => x.chars),
        early: s[1],
        middle: mid,
        end: done,
        final_text_matches: typing.final_text === SHOWN_ANSWER,
      }
      checks.chat_answer_types_out = s[1].typing === 'true' && s[1].chars < SHOWN_ANSWER.length / 3 && mid.chars < done.chars && done.typing === 'false' && typing.final_text === SHOWN_ANSWER
      checks.chat_citations_appear_during_typing = s.some((x) => x.citations === 1 && x.typing === 'true') && done.citations === 2
      checks.chat_sources_after_typing = s.every((x) => x.typing === 'false' || !x.sources_shown) && done.sources_shown
    }
    allErrors.push(...errors)
    await page.close()

    // ---------- 6. Reduce motion ----------
    {
      const { page: rm, errors: rmErrors } = await openPage(browser, { url: '/', reducedMotion: 'reduce' })
      const home = await rm.evaluate(() => {
        const v = window.astrolens.homeViews.solar_system
        return Math.hypot(...v.position.map((p, i) => p - v.target[i]))
      })
      const onLanding = await cameraDistance(rm)
      const cursor = await rm.$('[data-testid=custom-cursor]')
      const pointer = await rm.evaluate(() => getComputedStyle(document.body).cursor)
      const peak = await rm.evaluate(async () => {
        const a = window.astrolens
        let p = 0
        document.querySelector('[data-testid=landing-explore]').click()
        const start = performance.now()
        while (performance.now() - start < 1500) {
          p = Math.max(p, a.warp.value)
          await new Promise((r) => requestAnimationFrame(r))
        }
        return p
      })
      await rm.evaluate(() => {
        const s = window.astrolens.store.getState()
        s.setBrowserOpen(false) // the "Explore the sky" door opened the Objects drawer
        s.selectObject('saturn')
        s.openChat()
      })
      await waitLanded(rm)
      await rm.fill('[data-testid=chat-input]', 'What are the rings made of?')
      await rm.click('[data-testid=chat-send]')
      await rm.waitForSelector('[data-testid=chat-answer]', { timeout: 5000 })
      const answer = await rm.$eval('[data-testid=chat-answer]', (li) => ({ typing: li.dataset.typing, text: li.querySelector('p').textContent }))
      await rm.setInputFiles('[data-testid=upload-input]', PHOTO)
      await rm.waitForSelector('[data-testid=upload-scan]', { timeout: 5000 })
      const scanAnimation = await rm.$eval('[data-testid=upload-scan]', (e) => getComputedStyle(e).animationName)
      result.reduced_motion = {
        camera_on_landing_vs_home: [onLanding, +home.toFixed(2)],
        custom_cursor: Boolean(cursor),
        system_pointer: pointer,
        dive_peak_warp: peak,
        answer_right_away: answer,
        scan_animation: scanAnimation,
      }
      checks.reduced_motion_no_pull_back_or_warp = Math.abs(onLanding - home) < 0.05 * home && peak === 0
      checks.reduced_motion_system_pointer = !cursor && pointer !== 'none'
      checks.reduced_motion_answer_at_once = answer.typing === 'false' && answer.text === SHOWN_ANSWER
      checks.reduced_motion_scan_line_still = scanAnimation === 'none'
      allErrors.push(...rmErrors)
      await rm.close()
    }

    result.console_errors = allErrors
    checks.no_console_errors = allErrors.length === 0
  } finally {
    await browser.close()
    await server.close()
  }

  result.checks = checks
  result.passed = Object.values(checks).every(Boolean)
  await fs.writeFile(path.join(RESULTS, 'ux_check_2.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(checks, null, 2))
  console.log(result.passed ? 'PASSED' : 'FAILED')
  process.exit(result.passed ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
