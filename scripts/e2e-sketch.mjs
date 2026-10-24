#!/usr/bin/env node
/**
 * End-to-end check of the sketch block in the playground:
 * 1. insert via the slash menu → draw a rectangle and an ellipse → preview image → reload →
 *    preview still there and the board still holds both shapes;
 * 2. on a new block: a pen stroke, an arrow and the text "Xin chào" → the SVG preview holds the
 *    stroke path and the text → reload → 3 elements → copy + paste (mod+C / mod+V) → 6 elements.
 *
 *   pnpm e2e:sketch
 *   pnpm e2e:sketch -- --port=3161 --headed
 *
 * Runs against `nuxt dev` (the board exposes window.__sketchDebug only in dev).
 * Uses the installed Google Chrome; otherwise run `pnpm exec playwright install chromium`.
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')))
const port = Number(args.port ?? 3160)
const headless = !('headed' in args)
const url = `http://localhost:${port}/`
const INTERACT = 'Chỉnh sửa' // messages.vi.interact

const server = spawn('pnpm', ['--filter', 'playground', 'dev', '--port', String(port)], { stdio: 'ignore', detached: true })
let stopped = false
function stop() {
  if (stopped) return
  stopped = true
  try {
    process.kill(-server.pid, 'SIGTERM') // pnpm → nuxt → vite: kill the whole group
  }
  catch {}
}
process.on('exit', stop)
process.on('SIGINT', () => process.exit(130))

async function waitForServer() {
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(url)).ok) return
    }
    catch {}
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`Dev server on :${port} didn't start (port in use?)`)
}

async function launch() {
  try {
    return await chromium.launch({ channel: 'chrome', headless })
  }
  catch {
    return chromium.launch({ headless })
  }
}

let step = ''
function check(cond, message) {
  if (!cond) throw new Error(message)
}

/** Opens the playground and inserts a sketch block into the trailing empty paragraph. */
async function insertSketch(page) {
  await page.goto(url)
  await page.locator('.me-content').waitFor()
  const last = page.locator('.me-content > p:last-child')
  await last.click()
  await page.keyboard.type('/sketch')
  const item = page.locator('.me-menu-item', { hasText: 'Bảng vẽ' })
  await item.first().waitFor()
  await item.first().click()
  await page.locator('.me-sketch').waitFor()
}

/**
 * Drags on the board canvas from (x, y) by (dx, dy), relative to its top-left corner.
 * Keep x ≥ 200 and y ≥ 60: the style panel and the toolbar float over the canvas's left and top.
 */
async function drag(page, x, y, dx, dy) {
  const box = await page.locator('.me-sketch .me-sketch-canvas--interactive').boundingBox()
  check(box, 'board canvas not found')
  await page.mouse.move(box.x + x, box.y + y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + x + (dx * i) / 8, box.y + y + (dy * i) / 8)
  await page.mouse.up()
}

/** Presses Escape until the board is gone (commit text, clear the selection, leave). */
async function leaveBoard(page) {
  for (let i = 0; i < 4 && await page.locator('.me-sketch .me-sketch-board').count(); i++) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
  }
  check(await page.locator('.me-sketch .me-sketch-board').count() === 0, 'Escape did not leave the board')
}

/** Decodes the block's preview data URL (base64 SVG, UTF-8). */
async function previewSvg(page) {
  const src = await page.locator('.me-sketch img[src^="data:image/svg+xml"]').getAttribute('src')
  const b64 = src.slice(src.indexOf(',') + 1)
  return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))
}

const elementCount = page => page.evaluate(() => window.__sketchDebug?.getElements().length ?? -1)

await waitForServer()
const browser = await launch()
let failed = false
try {
  // Warm-up: the first visit makes Vite optimize the editor's and the engine's deps, which
  // reloads the page; do it in a throwaway context so the real run starts on a stable server.
  step = 'warm-up'
  for (let attempt = 1; ; attempt++) {
    const ctx = await browser.newContext()
    try {
      const page = await ctx.newPage()
      await insertSketch(page)
      await page.locator('.me-sketch').getByRole('button', { name: INTERACT }).click()
      await page.locator('.me-sketch .me-sketch-board').waitFor({ timeout: 60_000 })
      await page.waitForTimeout(2000)
      break
    }
    catch (err) {
      if (attempt === 3) throw err
    }
    finally {
      await ctx.close()
    }
  }

  // Fresh context: empty localStorage and IndexedDB.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))

  step = 'insert the block from the slash menu'
  await insertSketch(page)
  const sketch = page.locator('.me-sketch')
  check(await sketch.count() === 1, `expected 1 sketch block, found ${await sketch.count()}`)

  step = 'Backspace right after double-click to interact keeps the block'
  await sketch.locator('.me-sketch-cover').dblclick()
  await sketch.locator('.me-sketch-board').waitFor()
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(300)
  check(await page.locator('.me-sketch').count() === 1, 'Backspace while interacting removed the sketch block')
  await page.keyboard.press('Escape') // empty selection: leaves interact
  await sketch.getByRole('button', { name: INTERACT }).waitFor()

  step = 'draw a rectangle and an ellipse'
  await sketch.getByRole('button', { name: INTERACT }).click()
  await sketch.locator('.me-sketch-board').waitFor()
  await page.keyboard.press('r')
  await drag(page, 230, 120, 100, 80)
  await page.keyboard.press('o')
  await drag(page, 400, 200, 120, 90)
  check(await elementCount(page) === 2, `expected 2 elements on the board, found ${await elementCount(page)}`)

  step = 'leave with Escape and show the preview'
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  const preview = page.locator('.me-sketch img[src^="data:image/svg+xml"]')
  await preview.waitFor({ state: 'visible', timeout: 10_000 })

  step = 'reload keeps the preview'
  await page.waitForTimeout(1500) // playground saves the page to localStorage after 400 ms
  await page.reload()
  await preview.waitFor({ state: 'visible', timeout: 30_000 })

  step = 'reload keeps the board'
  await page.locator('.me-sketch').getByRole('button', { name: INTERACT }).click()
  await page.waitForFunction(() => window.__sketchDebug?.getElements().length === 2, null, { timeout: 15_000 })
    .catch(async () => {
      throw new Error(`expected 2 elements after reload, found ${await elementCount(page)}`)
    })

  check(errors.length === 0, `page errors: ${errors.join(' | ')}`)
  await ctx.close()

  // --- M1 tools: pen, arrow, text; preview; clipboard -----------------------------------
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const page2 = await ctx2.newPage()
  page2.on('pageerror', e => errors.push(e.message))

  step = 'M1: draw a pen stroke, an arrow and text'
  await insertSketch(page2)
  const block = page2.locator('.me-sketch')
  await block.getByRole('button', { name: INTERACT }).click()
  await block.locator('.me-sketch-board').waitFor()
  await page2.keyboard.press('p')
  await drag(page2, 220, 100, 160, 60)
  await page2.keyboard.press('a')
  await drag(page2, 420, 130, 150, 0)
  await page2.keyboard.press('t')
  const canvasBox = await page2.locator('.me-sketch .me-sketch-canvas--interactive').boundingBox()
  await page2.mouse.click(canvasBox.x + 300, canvasBox.y + 330)
  const textarea = page2.locator('.me-sketch-text-editor')
  await textarea.waitFor()
  await page2.keyboard.type('Xin chào')
  await page2.keyboard.press('Escape') // commits the text
  await textarea.waitFor({ state: 'detached' })
  const types = await page2.evaluate(() => window.__sketchDebug.getElements().map(e => e.type).sort().join(','))
  check(types === 'arrow,freedraw,text', `expected arrow, freedraw and text, found [${types}]`)
  const text = await page2.evaluate(() => window.__sketchDebug.getElements().find(e => e.type === 'text')?.text)
  check(text === 'Xin chào', `text element holds ${JSON.stringify(text)}`)

  step = 'M1: leave; the preview holds the stroke and the text'
  await leaveBoard(page2)
  await page2.locator('.me-sketch img[src^="data:image/svg+xml"]').waitFor({ state: 'visible', timeout: 10_000 })
  const svg = await previewSvg(page2)
  check(svg.includes('<path'), 'preview has no <path')
  check(svg.includes('Xin chào'), 'preview has no "Xin chào"')

  step = 'M1: reload keeps 3 elements'
  await page2.waitForTimeout(1500)
  await page2.reload()
  await page2.locator('.me-sketch img[src^="data:image/svg+xml"]').waitFor({ state: 'visible', timeout: 30_000 })
  await page2.locator('.me-sketch').getByRole('button', { name: INTERACT }).click()
  await page2.waitForFunction(() => window.__sketchDebug?.getElements().length === 3, null, { timeout: 15_000 })
    .catch(async () => {
      throw new Error(`expected 3 elements after reload, found ${await elementCount(page2)}`)
    })

  step = 'M1: select all, copy and paste → 6 elements'
  await page2.locator('.me-sketch .me-sketch-board').waitFor()
  await page2.keyboard.press('ControlOrMeta+a')
  await page2.keyboard.press('ControlOrMeta+c')
  await page2.keyboard.press('ControlOrMeta+v')
  await page2.waitForFunction(() => window.__sketchDebug?.getElements().length === 6, null, { timeout: 5_000 })
    .catch(async () => {
      throw new Error(`expected 6 elements after copy/paste, found ${await elementCount(page2)}`)
    })

  check(errors.length === 0, `page errors: ${errors.join(' | ')}`)
  await ctx2.close()
  console.log('e2e:sketch PASS')
}
catch (err) {
  failed = true
  console.error(`e2e:sketch FAIL at "${step}": ${err.message}`)
}
finally {
  await browser.close()
  stop()
}
process.exit(failed ? 1 : 0)
