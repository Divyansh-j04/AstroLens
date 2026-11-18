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
