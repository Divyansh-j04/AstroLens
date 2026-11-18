/**
 * Browser check: the Objects drawer and the glass panel (card / chat) never cover each other.
 * They share the right edge, so only one shows at a time.
 *
 *   1. Saturn's chat is open and a question is half typed.
 *   2. Opening the Objects drawer tucks the panel away (no overlap).
 *   3. Picking Jupiter in the drawer closes the drawer and shows Jupiter's card on top.
 *   4. Back in the chat with the drawer open, Escape closes the drawer and brings the panel back.
 *   5. Opening the chat (or anything that opens the panel) closes the drawer.
 *   6. The half-typed question on Saturn's chat is still there after visiting Jupiter and coming back.
 * At every step the visible rectangles of the drawer and the open panel must not intersect.
 *
 * Also (fixes from the hands-on review of Nov 19, 2026):
 *   7. Photo result (the server's /classify answer is faked in the browser: Saturn 78%, Jupiter 12%,
 *      Uranus 5%): Saturn's card shows "78% match" and its facts appear at once (no counting or
 *      sliding while the scan animates); flying to Jupiter yourself shows no badge; picking Jupiter
 *      from the photo's guesses shows "12% match".
 *   8. The + / - buttons step left of the open Objects drawer.
 *   9. True distances, zoomed far out: no two planet or moon names overlap.
 *  11. Flying to an object: the panel stays closed during the flight and the arrival title, and
 *      the card slides in as the title fades; the title does not move sideways when it does.
 *  10. Phone (390 x 844, touch): the top bar, upload pill and Objects tab do not overlap; the Grand
 *      Tour button can be tapped; the card is a bottom sheet and the object stays visible above it.
 *
 * Writes ml/results/layout_check.json and screenshots in ml/results/layout_screens/.
 * Usage (from frontend/):  node scripts/check-layout.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const FRONTEND = fileURLToPath(new URL('..', import.meta.url))
const ROOT = path.resolve(FRONTEND, '..')
const RESULTS = path.join(ROOT, 'ml', 'results')
const SHOTS = path.join(RESULTS, 'layout_screens')
const PAGE_PORT = 5203
const DRAFT = 'How thick are the rin'
const PHOTO = path.join(RESULTS, 'gradcam', 'gradcam_examples.png')
const FAKE_CLASSIFY = {
  top3: [
    { id: 'saturn', name: 'Saturn', prob: 0.78 },
    { id: 'jupiter', name: 'Jupiter', prob: 0.12 },
    { id: 'uranus', name: 'Uranus', prob: 0.05 },
  ],
  is_unknown: false,
  threshold: 0.46,
  known_classes: 14,
  gradcam_png_base64: '', // filled in main()
  latency_ms: 300,
}
const OBJECTS = JSON.parse(await fs.readFile(path.join(ROOT, 'backend', 'app', 'data', 'objects.json'), 'utf8'))
const BY_ID = Object.fromEntries(OBJECTS.map((o) => [o.id, o]))
const badge = (page) => page.locator('[data-testid=confidence-badge]').textContent({ timeout: 500 }).catch(() => null)
const landed = (page) => page.waitForFunction(() => !window.astrolens.store.getState().isFlying, null, { timeout: 20000 })

/** Pairs of on-screen pieces that overlap (by more than 4 px each way). */
const overlapping = (page, pieces) =>
  page.evaluate((pieces) => {
    const boxes = []
    for (const [name, sel] of Object.entries(pieces)) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect()
        if (r.width > 2 && r.height > 2 && getComputedStyle(el).opacity !== '0' && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight)
          boxes.push({ name: name === 'labels' ? el.textContent : name, r })
      }
    }
    const out = []
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r, b = boxes[j].r
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (w > 4 && h > 4) out.push(`${boxes[i].name} x ${boxes[j].name}`)
      }
    return out
  }, pieces)

/** What is on the right edge now, and whether the drawer and the open panel overlap on screen. */
const look = (page) =>
  page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      const onScreen = { left: Math.max(0, r.left), right: Math.min(innerWidth, r.right) }
      return onScreen.right - onScreen.left > 1 ? { ...onScreen, top: r.top, bottom: r.bottom } : null
    }
    const panelEl = document.querySelector('[data-testid=glass-panel]')
    const panel = panelEl?.dataset.open === 'true' ? box('[data-testid=glass-panel]') : null
    const drawer = box('[data-testid=object-browser]')
    const overlapPx = panel && drawer ? Math.max(0, Math.min(panel.right, drawer.right) - Math.max(panel.left, drawer.left)) : 0
    const s = window.astrolens.store.getState()
    return {
      drawer_open: Boolean(drawer),
      panel_open: s.panelOpen,
      panel_view: s.panelView,
      object: s.currentObjectId,
      overlap_px: Math.round(overlapPx),
      chat_draft: document.querySelector('[data-testid=chat-input]')?.value ?? null,
      card: document.querySelector('[data-testid=card-name]')?.textContent ?? null,
    }
  })

async function main() {
  await fs.mkdir(SHOTS, { recursive: true })
  const { createServer } = await import('vite')
  const server = await createServer({ root: FRONTEND, server: { port: PAGE_PORT, strictPort: true }, logLevel: 'warn' })
  await server.listen()
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] })
  const result = { script: 'frontend/scripts/check-layout.mjs', date: new Date().toISOString().slice(0, 10), steps: {} }
  const checks = {}

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    await page.goto(`http://localhost:${PAGE_PORT}/?app`)
    await page.waitForSelector('[data-testid=loading-screen][data-done=true]', { state: 'attached', timeout: 60000 })
    await page.waitForTimeout(800)
    const settle = () => page.waitForTimeout(700) // panel slide (500 ms)

    // 1. Saturn's chat, a question half typed.
    await page.evaluate(() => window.astrolens.store.getState().selectObject('saturn'))
    await page.waitForFunction(() => !window.astrolens.store.getState().isFlying, null, { timeout: 15000 })
    await page.evaluate(() => window.astrolens.store.getState().openChat())
    await page.fill('[data-testid=chat-input]', DRAFT)
    result.steps.typing = await look(page)

    // 2. Open the Objects drawer.
    await page.click('[data-testid=browser-tab]')
    await settle()
    result.steps.drawer_opened = await look(page)
    await page.screenshot({ path: path.join(SHOTS, '1_drawer_open.png') })
    checks.drawer_tucks_panel_away = result.steps.drawer_opened.drawer_open && !result.steps.drawer_opened.panel_open && result.steps.drawer_opened.overlap_px === 0

    // 3. Pick Jupiter in the drawer.
    await page.locator('[data-testid=object-browser] button', { hasText: /^Jupiter/ }).first().click()
    await settle()
    result.steps.flying_to_jupiter = await look(page) // the card waits for the flight and the arrival title
    checks.drawer_pick_card_waits_for_flight = !result.steps.flying_to_jupiter.drawer_open && !result.steps.flying_to_jupiter.panel_open
    await page.waitForFunction(() => window.astrolens.store.getState().panelOpen, null, { timeout: 12000 })
    await settle()
    result.steps.picked_jupiter = await look(page)
    await page.screenshot({ path: path.join(SHOTS, '2_picked_jupiter.png') })
    const p = result.steps.picked_jupiter
    checks.picking_shows_card_on_top = !p.drawer_open && p.panel_open && p.panel_view === 'card' && p.card === 'Jupiter' && p.overlap_px === 0
    await page.waitForFunction(() => !window.astrolens.store.getState().isFlying, null, { timeout: 15000 })

    // 4. Chat open, drawer opened, Escape.
    await page.evaluate(() => window.astrolens.store.getState().openChat())
    await settle()
    await page.click('[data-testid=browser-tab]')
    await settle()
    await page.keyboard.press('Escape')
    await settle()
    result.steps.escape = await look(page)
    checks.escape_closes_drawer_and_brings_panel_back = !result.steps.escape.drawer_open && result.steps.escape.panel_open && result.steps.escape.panel_view === 'chat'

    // 5. Drawer open, then the chat is opened (e.g. from the command bar): the drawer closes.
    await page.click('[data-testid=browser-tab]')
    await settle()
    await page.evaluate(() => window.astrolens.store.getState().openChat())
    await settle()
    result.steps.chat_opened_over_drawer = await look(page)
    checks.opening_panel_closes_drawer = !result.steps.chat_opened_over_drawer.drawer_open && result.steps.chat_opened_over_drawer.panel_open && result.steps.chat_opened_over_drawer.overlap_px === 0
    await page.screenshot({ path: path.join(SHOTS, '3_chat_back.png') })

    // 6. The half-typed question on Saturn's chat survives (back to Saturn).
    await page.click('[data-testid=browser-tab]')
    await settle()
    await page.locator('[data-testid=object-browser] button', { hasText: /^Saturn/ }).first().click()
    await settle()
    await page.evaluate(() => window.astrolens.store.getState().openChat())
    await settle()
    result.steps.back_to_saturn_chat = await look(page)
    checks.typed_question_kept = [result.steps.typing, result.steps.drawer_opened, result.steps.back_to_saturn_chat].every((x) => x.chat_draft === DRAFT)

    checks.never_overlapping = Object.values(result.steps).every((x) => x.overlap_px === 0)

    // 7. Photo result and the match badge.
    FAKE_CLASSIFY.gradcam_png_base64 = (await fs.readFile(PHOTO)).toString('base64')
    await page.route('**/classify', async (route) => {
      await new Promise((r) => setTimeout(r, 800))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_CLASSIFY) })
    })
    await page.setInputFiles('[data-testid=upload-input]', PHOTO)
    await page.waitForSelector('[data-testid=upload-zone][data-status=done]', { state: 'attached', timeout: 10000 })
    await page.waitForTimeout(200)
    const factsRightAway = await page.$$eval('[data-testid=fact-value]', (els) => els.map((e) => e.textContent))
    await landed(page)
    const onSaturn = await badge(page)
    await page.evaluate(() => window.astrolens.store.getState().setUploadPanelOpen(false))
    await page.evaluate(() => window.astrolens.store.getState().selectObject('jupiter'))
    await landed(page)
    const jupiterByHand = await badge(page)
    await page.evaluate(() => window.astrolens.store.getState().setUploadPanelOpen(true))
    await page.waitForTimeout(300)
    await page.locator('[data-testid=upload-guesses] button', { hasText: 'Jupiter' }).click()
    await landed(page)
    const jupiterPicked = await badge(page)
    result.photo = { saturn_facts_200ms_after_result: factsRightAway, badge_on_saturn: onSaturn, badge_on_jupiter_flown_by_hand: jupiterByHand, badge_on_jupiter_picked_from_guesses: jupiterPicked }
    checks.photo_card_appears_without_counting = JSON.stringify(factsRightAway) === JSON.stringify(Object.values(BY_ID.saturn.facts))
    checks.badge_only_on_photos_object = onSaturn === '78% match' && jupiterByHand === null && jupiterPicked === '12% match'
    await page.evaluate(() => window.astrolens.store.getState().setUploadPanelOpen(false))

    // 8. Zoom buttons beside the open drawer.
    await page.click('[data-testid=browser-tab]')
    await page.waitForTimeout(700)
    const zoomVsDrawer = await overlapping(page, { zoom: '[data-testid=zoom-controls]', drawer: '[data-testid=object-browser]' })
    await page.click('[data-testid=zoom-out]', { timeout: 5000 }) // fails if the drawer covers it
    result.zoom_vs_drawer_overlaps = zoomVsDrawer
    checks.zoom_buttons_beside_drawer = zoomVsDrawer.length === 0
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // 9. Names in the true view, zoomed far out.
    await page.evaluate(() => window.astrolens.store.getState().selectObject('earth'))
    await landed(page)
    await page.click('[data-testid=true-scale-toggle]')
    await page.waitForTimeout(600)
    const labelSteps = []
    for (let i = 0; i < 7; i++) {
      await page.evaluate(() => window.astrolens.store.getState().zoomBy(10))
      await page.waitForTimeout(800)
      // the name tags (ObjectLabel.jsx) that are showing
      const pairs = await overlapping(page, { labels: 'button[class*="bg-black/40"][class*="opacity-100"]' })
      const z = await page.evaluate(() => +window.astrolens.view.logZoom.toFixed(2))
      labelSteps.push({ log_zoom: z, overlapping_names: pairs })
      if (i === 5) await page.screenshot({ path: path.join(SHOTS, '4_true_zoomed_out_names.png') })
    }
    result.true_view_names = labelSteps
    checks.names_never_pile_up = labelSteps.every((x) => x.overlapping_names.length === 0)
    await page.click('[data-testid=true-scale-toggle]')
    await page.waitForTimeout(600)
    // 11. The card waits for the flight and the arrival title.
    await page.click('[data-testid=home-button]')
    await landed(page)
    await page.waitForTimeout(500)
    const timeline = await page.evaluate(async () => {
      const a = window.astrolens
      a.store.getState().selectObject('mars')
      const t0 = performance.now()
      const samples = []
      while (performance.now() - t0 < 9000) {
        const s = a.store.getState()
        const title = document.querySelector('[data-testid=arrival-title]')
        const box = title?.getBoundingClientRect()
        samples.push({ t: Math.round(performance.now() - t0), flying: s.isFlying, panel: s.panelOpen, title: title ? +Number(getComputedStyle(title).opacity).toFixed(2) : null, title_x: box ? Math.round(box.left + box.width / 2) : null })
        await new Promise((r) => setTimeout(r, 50))
      }
      return samples
    })
    const landedAt = timeline.find((x, i) => i > 0 && timeline[i - 1].flying && !x.flying)?.t // flying -> landed
    const titleShownAt = timeline.find((x) => x.title !== null && x.title > 0.9)?.t
    const panelOpenedAt = timeline.find((x) => x.panel)?.t
    const titleGoneAt = timeline.find((x, i) => i > 0 && timeline[i - 1].title !== null && x.title === null)?.t
    const panelWhileFlying = timeline.filter((x) => x.flying).some((x) => x.panel)
    const titleWhenPanelOpened = timeline.find((x) => x.panel)?.title
    result.card_timing = { landed_ms: landedAt, title_shown_ms: titleShownAt, panel_opened_ms: panelOpenedAt, title_gone_ms: titleGoneAt, panel_open_while_flying: panelWhileFlying, title_opacity_when_panel_opened: titleWhenPanelOpened }
    checks.card_closed_during_flight_and_title = landedAt !== undefined && !panelWhileFlying && panelOpenedAt > titleShownAt && panelOpenedAt > landedAt
    const xs = timeline.filter((x) => x.title_x !== null).map((x) => x.title_x)
    result.card_timing.title_centre_x_px = { min: Math.min(...xs), max: Math.max(...xs), samples: xs.length }
    checks.title_does_not_move_when_card_opens = xs.length > 10 && Math.max(...xs) - Math.min(...xs) <= 2
    checks.card_opens_as_title_fades = panelOpenedAt !== undefined && titleGoneAt !== undefined && panelOpenedAt <= titleGoneAt && titleGoneAt - panelOpenedAt < 1200
    await page.screenshot({ path: path.join(SHOTS, '8_card_after_title.png') })

    // 10. Phone.
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    const ph = await phone.newPage()
    ph.on('pageerror', (e) => errors.push(String(e)))
    await ph.goto(`http://localhost:${PAGE_PORT}/?app`)
    await ph.waitForSelector('[data-testid=loading-screen][data-done=true]', { state: 'attached', timeout: 60000 })
    await ph.waitForTimeout(900)
    const chrome = { topbar: 'main > header', upload: '[data-testid=upload-pill]', objectsTab: '[data-testid=browser-tab]', scaleNote: '[data-testid=scale-note]', zoom: '[data-testid=zoom-controls]' }
    const startOverlaps = await overlapping(ph, chrome)
    await ph.screenshot({ path: path.join(SHOTS, '5_phone_start.png') })
    await ph.tap('[data-testid=tour-button]', { timeout: 5000 })
    await ph.waitForSelector('[data-testid=tour-caption][data-arrived=true]', { timeout: 20000 })
    const tourOverlaps = await overlapping(ph, { ...chrome, tour: '[data-testid=tour-caption]' })
    await ph.screenshot({ path: path.join(SHOTS, '6_phone_tour.png') })
    await ph.tap('[data-testid=tour-stop]')
    await ph.evaluate(() => window.astrolens.store.getState().selectObject('saturn'))
    await landed(ph)
    await ph.waitForFunction(() => window.astrolens.store.getState().panelOpen, null, { timeout: 12000 }) // the card opens as the title fades
    await ph.waitForTimeout(1200) // the sheet slides up and the picture moves up above it
    const sheet = await ph.evaluate(() => {
      const a = window.astrolens
      const panel = document.querySelector('[data-testid=glass-panel]').getBoundingClientRect()
      const p = a.camera.position.clone().set(...a.currentPosition('saturn')).project(a.camera)
      return { sheet_open: document.querySelector('[data-testid=glass-panel]').dataset.open === 'true', sheet_top_px: Math.round(panel.top), sheet_height_pct: Math.round((panel.height / innerHeight) * 100), saturn_centre_y_px: Math.round(((1 - p.y) / 2) * innerHeight), screen_height: innerHeight }
    })
    const sheetOverlaps = await overlapping(ph, { ...chrome, panel: '[data-testid=glass-panel][data-open=true]' })
    await ph.screenshot({ path: path.join(SHOTS, '7_phone_card_sheet.png') })
    result.phone = { start_overlaps: startOverlaps, tour_overlaps: tourOverlaps, sheet, sheet_overlaps: sheetOverlaps }
    checks.phone_top_area_clear = startOverlaps.length === 0
    checks.phone_tour_tappable_and_clear = tourOverlaps.length === 0
    checks.phone_card_is_bottom_sheet_with_object_above = sheet.sheet_open && sheet.sheet_top_px > sheet.screen_height * 0.35 && sheet.sheet_top_px < sheet.screen_height * 0.5 && sheet.saturn_centre_y_px < sheet.sheet_top_px - 40
    checks.phone_sheet_covers_no_controls = sheetOverlaps.every((x) => !x.includes('objectsTab') && !x.includes('upload') && !x.includes('topbar'))
    await phone.close()

    result.console_errors = errors
    checks.no_console_errors = errors.length === 0
  } finally {
    await browser.close()
    await server.close()
  }

  result.checks = checks
  result.passed = Object.values(checks).every(Boolean)
  await fs.writeFile(path.join(RESULTS, 'layout_check.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result.steps, null, 1))
  console.log(JSON.stringify(checks, null, 2))
  console.log(result.passed ? 'PASSED' : 'FAILED')
  process.exit(result.passed ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
