/**
 * Phase 4 "Done when" check: the chat answers with sources in the browser, and typed commands work.
 *
 * Starts the real API server (MiniLM search + the language model on Groq) and a Vite dev server,
 * then drives the installed Microsoft Edge through playwright-core:
 *   1. Command bar: "take me to the red planet" flies to Mars.
 *   2. "Chat more" opens the chat with 3 suggested questions; the first is asked and answered with
 *      numbered sources; a follow-up ("How long is a day there?") is answered about Mars.
 *   3. A question the texts cannot answer gets "I don't know from my sources."
 *   4. Command bar: "nebula" asks which one (two buttons; the first is clicked and flown to),
 *      "jupitr" (typo) flies to Jupiter, and the question "how hot is Venus?" flies to Venus and
 *      answers in the chat.
 *
 * Writes ml/results/phase4_chat_check.json and screenshots in ml/results/phase4_screens/.
 * Usage (from frontend/; needs GROQ_API_KEY in the project's .env):  node scripts/check-phase4.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const FRONTEND = fileURLToPath(new URL('..', import.meta.url))
const ROOT = path.resolve(FRONTEND, '..')
const RESULTS = path.join(ROOT, 'ml', 'results')
const SHOTS = path.join(RESULTS, 'phase4_screens')
const PAGE_PORT = 5197
const API_PORT = 8012
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function startApi() {
  const python = path.join(ROOT, '.venv', 'Scripts', 'python.exe')
  const proc = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--port', String(API_PORT)], {
    cwd: path.join(ROOT, 'backend'),
    env: { ...process.env, ALLOWED_ORIGINS: `http://localhost:${PAGE_PORT}`, HF_HUB_DISABLE_SYMLINKS_WARNING: '1' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 240; i++) {
    try {
      const h = await (await fetch(`http://localhost:${API_PORT}/health`)).json()
      if (h.status === 'ok') return proc
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
  const api = await startApi()
  process.env.VITE_API_URL = `http://localhost:${API_PORT}`
  const { createServer } = await import('vite')
  const server = await createServer({ root: FRONTEND, server: { port: PAGE_PORT, strictPort: true }, logLevel: 'warn' })
  await server.listen()
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] })
  const result = { script: 'frontend/scripts/check-phase4.mjs' }

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const consoleErrors = []
    page.on('pageerror', (e) => consoleErrors.push(String(e)))
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
    await page.goto(`http://localhost:${PAGE_PORT}/`)
    await page.waitForSelector('[data-testid=loading-screen][data-done=true]', { state: 'attached', timeout: 60000 })
    await page.waitForTimeout(800)

    const store = () => page.evaluate(() => {
      const s = window.astrolens.store.getState()
      return { currentObjectId: s.currentObjectId, panelView: s.panelView, isFlying: s.isFlying }
    })
    const settle = async () => {
      await page.waitForFunction(() => !window.astrolens.store.getState().isFlying, null, { polling: 'raf', timeout: 20000 })
      await page.waitForTimeout(700)
    }
    const command = async (text) => {
      await page.fill('[data-testid=command-input]', text)
      const t = Date.now()
      await page.click('[data-testid=command-go]')
      await page.waitForFunction(() => document.querySelector('[data-testid=command-go]')?.textContent === 'Go', null, { timeout: 30000 })
      return Date.now() - t
    }
    const answers = () => page.locator('[data-testid=chat-answer]')
    // Wait until the store holds `count` answers in this object's conversation and the panel shows them.
    const waitForAnswer = async (objectId, count) => {
      const t = Date.now()
      await page.waitForFunction(
        ([id, n]) => {
          const s = window.astrolens.store.getState()
          const got = (s.chats[id] ?? []).filter((m) => m.role === 'assistant').length
          return !s.chatPending && got >= n && document.querySelectorAll('[data-testid=chat-answer]').length === got
        },
        [objectId, count],
        { timeout: 120000 },
      )
      await page.waitForTimeout(300)
      const last = answers().nth(count - 1)
      return {
        ms: Date.now() - t,
        text: await last.locator('p').first().innerText(),
        refused: (await last.getAttribute('data-refused')) === 'true',
        sources: await last.locator('[data-testid=chat-sources] li').allInnerTexts(),
        source_links: await last.locator('[data-testid=chat-sources] a').evaluateAll((as) => as.map((a) => a.href)),
      }
    }

    // ---- 1. Command: nickname ----
    const navMs = await command('take me to the red planet')
    await settle()
    const s1 = await store()
    result.command_red_planet = { flew_to: s1.currentObjectId, card: await page.locator('[data-testid=card-name]').innerText(), round_trip_ms: navMs }
    result.command_red_planet.pass = s1.currentObjectId === 'mars' && result.command_red_planet.card === 'Mars'

    // ---- 2. Chat: chip question, then a follow-up ----
    await page.click('text=Chat more')
    try {
      await page.waitForSelector('[data-testid=question-chips] button', { timeout: 10000 })
    } catch (e) {
      await page.screenshot({ path: path.join(SHOTS, '_failure.jpg'), type: 'jpeg', quality: 75 })
      console.log(consoleErrors.slice(0, 3).join(' || '))
      throw e
    }
    const chips = await page.locator('[data-testid=question-chips] button').allInnerTexts()
    await page.locator('[data-testid=question-chips] button').first().click()
    const a1 = await waitForAnswer('mars', 1)
    await page.screenshot({ path: path.join(SHOTS, 'mars_chat.jpg'), type: 'jpeg', quality: 75 })
    await page.fill('[data-testid=chat-input]', 'How long is a day there?')
    await page.click('[data-testid=chat-send]')
    const a2 = await waitForAnswer('mars', 2)
    result.chat = {
      chips,
      first: { question: chips[0], ...a1 },
      follow_up: { question: 'How long is a day there?', ...a2 },
    }
    result.chat.pass =
      chips.length === 3 &&
      !a1.refused && a1.sources.length > 0 && a1.source_links.every((u) => u.startsWith('https://')) &&
      !a2.refused && a2.sources.length > 0 && /\b2[45]\b|24\.6|24 hours|37 minutes|sol/i.test(a2.text)

    // ---- 3. A question the texts cannot answer ----
    await page.fill('[data-testid=chat-input]', 'Who won the 2022 football World Cup?')
    await page.click('[data-testid=chat-send]')
    const a3 = await waitForAnswer('mars', 3)
    await page.screenshot({ path: path.join(SHOTS, 'refusal.jpg'), type: 'jpeg', quality: 75 })
    result.unanswerable = { question: 'Who won the 2022 football World Cup?', ...a3, pass: a3.refused && a3.sources.length === 0 }

    // ---- 4. Commands: ambiguous, typo, question ----
    await command('nebula')
    const options = await page.locator('[data-testid=clarify-options] button[data-testid^=clarify-]').allInnerTexts()
    await page.screenshot({ path: path.join(SHOTS, 'clarify.jpg'), type: 'jpeg', quality: 75 })
    await page.locator('[data-testid=clarify-options] button[data-testid^=clarify-]').first().click()
    await settle()
    const s4 = await store()
    result.command_ambiguous = { text: 'nebula', options, flew_to: s4.currentObjectId, pass: options.length === 2 && Boolean(s4.currentObjectId) }

    await command('jupitr')
    await settle()
    const s5 = await store()
    result.command_typo = { text: 'jupitr', flew_to: s5.currentObjectId, pass: s5.currentObjectId === 'jupiter' }

    await command('how hot is Venus?')
    const a4 = await waitForAnswer('venus', 1) // the first answer in Venus's conversation
    await settle()
    const s6 = await store()
    await page.screenshot({ path: path.join(SHOTS, 'venus_question.jpg'), type: 'jpeg', quality: 75 })
    result.command_question = { text: 'how hot is Venus?', flew_to: s6.currentObjectId, panel: s6.panelView, ...a4 }
    result.command_question.pass = s6.currentObjectId === 'venus' && s6.panelView === 'chat' && !a4.refused && a4.sources.length > 0

    result.console_errors = consoleErrors
    result.pass = ['command_red_planet', 'chat', 'unanswerable', 'command_ambiguous', 'command_typo', 'command_question'].every((k) => result[k].pass) && consoleErrors.length === 0
    result.date = new Date().toISOString()
    await fs.writeFile(path.join(RESULTS, 'phase4_chat_check.json'), JSON.stringify(result, null, 2) + '\n')
    console.log(JSON.stringify(result, null, 2))
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
