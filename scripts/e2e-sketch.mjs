#!/usr/bin/env node
/**
 * End-to-end check of the sketch block in the playground:
 * 1. insert via the slash menu → draw a rectangle and an ellipse → preview image → reload →
 *    preview still there and the board still holds both shapes;
 * 2. on a new block: a pen stroke, an arrow and the text "Xin chào" → the SVG preview holds the
 *    stroke path and the text → reload → 3 elements → copy + paste (mod+C / mod+V) → 6 elements;
 * 3. M2: two sticky notes (S, click, type, Tab) → two rects and an arrow bound to both → moving a rect moves the
 *    arrow endpoint → a frame around a rect, moving the frame moves the rect → mod+G groups → preview → reload
 *    keeps the elements, bindings, frame and group.
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

/** Waits until the board canvas stops moving (the page may still be scrolling after an editor closed). */
async function settle(page) {
  const canvas = page.locator('.me-sketch .me-sketch-canvas--interactive')
  let prev = JSON.stringify(await canvas.boundingBox())
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150)
    const next = JSON.stringify(await canvas.boundingBox())
    if (next === prev) return
    prev = next
  }
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

  // --- M2: sticky notes, arrow binding, frames, groups ----------------------------------
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page3 = await ctx3.newPage()
  page3.on('pageerror', e => errors.push(e.message))
  const els = () => page3.evaluate(() => window.__sketchDebug.getElements())
  const byId = async id => (await els()).find(e => e.id === id)
  /** Scene point → px relative to the board canvas' top-left corner (what `drag` takes). */
  const toScreen = p => page3.evaluate(p => window.__sketchDebug.toScreen(p), p)
  /** Scene end point of a linear element (its last point). */
  const endOf = el => ({ x: el.x + el.points.at(-1)[0], y: el.y + el.points.at(-1)[1] })

  step = 'M2: sticky (s, click, type "Ghi chú", Tab → the next sticky)'
  await insertSketch(page3)
  await page3.locator('.me-sketch').getByRole('button', { name: INTERACT }).click()
  await page3.locator('.me-sketch .me-sketch-board').waitFor()
  await page3.keyboard.press('s')
  const box3 = await page3.locator('.me-sketch .me-sketch-canvas--interactive').boundingBox()
  await page3.mouse.click(box3.x + 380, box3.y + 220)
  const editor = page3.locator('.me-sketch-text-editor')
  await editor.waitFor()
  await page3.keyboard.type('Ghi chú')
  await page3.keyboard.press('Tab')
  await page3.waitForFunction(() => window.__sketchDebug.getElements().filter(e => e.type === 'sticky').length === 2, null, { timeout: 5_000 })
    .catch(async () => {
      throw new Error(`expected 2 stickies after Tab, found ${(await els()).filter(e => e.type === 'sticky').length}`)
    })
  await editor.waitFor()
  await page3.keyboard.type('Tiếp')
  await page3.keyboard.press('Escape') // commits the text
  await editor.waitFor({ state: 'detached' })
  const stickyTexts = (await els()).filter(e => e.type === 'sticky').map(e => e.text).sort().join('|')
  check(stickyTexts === 'Ghi chú|Tiếp', `sticky texts: ${stickyTexts}`)

  step = 'M2: clear the board'
  await page3.keyboard.press('ControlOrMeta+a')
  await page3.keyboard.press('Delete')
  check((await els()).length === 0, `expected an empty board, found ${(await els()).length} elements`)

  step = 'M2: two rects and an arrow bound to both'
  await settle(page3)
  await page3.keyboard.press('r')
  await drag(page3, 260, 120, 100, 80)
  await page3.keyboard.press('r')
  await drag(page3, 460, 120, 100, 80)
  const rects = (await els()).filter(e => e.type === 'rectangle').sort((a, b) => a.x - b.x)
  check(rects.length === 2, `expected 2 rectangles, found ${rects.length}`)
  const [rectA, rectB] = rects
  const aRight = await toScreen({ x: rectA.x + rectA.w - 6, y: rectA.y + rectA.h / 2 })
  const bLeft = await toScreen({ x: rectB.x + 6, y: rectB.y + rectB.h / 2 })
  await page3.keyboard.press('a')
  await drag(page3, aRight.x, aRight.y, bLeft.x - aRight.x, bLeft.y - aRight.y)
  const arrow = (await els()).find(e => e.type === 'arrow')
  check(arrow, 'no arrow drawn')
  check(arrow.startBinding?.id === rectA.id && arrow.endBinding?.id === rectB.id,
    `arrow bindings: ${JSON.stringify([arrow.startBinding, arrow.endBinding])}`)

  step = 'M2: moving the end rect moves the arrow endpoint'
  await page3.keyboard.press('v')
  // press on B's top edge (an unfilled shape is hit on its outline)
  const bTop = await toScreen({ x: rectB.x + rectB.w / 2, y: rectB.y })
  await drag(page3, bTop.x, bTop.y, 40, 140)
  const movedB = await byId(rectB.id)
  check(movedB.y - rectB.y > 100, `rect B did not move (dy ${movedB.y - rectB.y})`)
  const arrowAfter = await byId(arrow.id)
  const endBefore = endOf(arrow)
  const endAfter = endOf(arrowAfter)
  check(endAfter.y - endBefore.y > 100, `arrow endpoint did not follow rect B (dy ${endAfter.y - endBefore.y})`)
  check(arrowAfter.endBinding?.id === rectB.id, 'arrow lost its end binding')

  step = 'M2: a frame around rect A takes it in; moving the frame moves the rect'
  const fTopLeft = await toScreen({ x: rectA.x - 30, y: rectA.y - 30 })
  const fBottomRight = await toScreen({ x: rectA.x + rectA.w + 30, y: rectA.y + rectA.h + 30 })
  await page3.keyboard.press('f')
  await drag(page3, fTopLeft.x, fTopLeft.y, fBottomRight.x - fTopLeft.x, fBottomRight.y - fTopLeft.y)
  const frame = (await els()).find(e => e.type === 'frame')
  check(frame, 'no frame drawn')
  check((await byId(rectA.id)).frameId === frame.id, `rect A frameId is ${(await byId(rectA.id)).frameId}`)
  await page3.keyboard.press('v')
  // press on the frame's bottom border (its inside is click-through), away from the resize handles
  const fBorder = await toScreen({ x: frame.x + frame.w / 4, y: frame.y + frame.h })
  const aBefore = await byId(rectA.id)
  await drag(page3, fBorder.x, fBorder.y, 0, 120)
  const frameAfter = await byId(frame.id)
  const aAfter = await byId(rectA.id)
  const fdy = frameAfter.y - frame.y
  check(fdy > 80, `frame did not move (dy ${fdy})`)
  check(Math.abs((aAfter.y - aBefore.y) - fdy) < 0.01 && Math.abs((aAfter.x - aBefore.x) - (frameAfter.x - frame.x)) < 0.01,
    `rect A did not move with the frame (frame dy ${fdy}, rect dy ${aAfter.y - aBefore.y})`)

  step = 'M2: mod+g groups the selection'
  await page3.keyboard.press('ControlOrMeta+a')
  await page3.keyboard.press('ControlOrMeta+g')
  const grouped = await els()
  const gid = grouped[0]?.groupIds?.at(-1)
  check(gid && grouped.every(e => e.groupIds.at(-1) === gid), `not one group: ${JSON.stringify(grouped.map(e => e.groupIds))}`)
  const m2Count = grouped.length // 2 rects, the arrow, the frame

  step = 'M2: leave; the preview is visible'
  await leaveBoard(page3)
  await page3.locator('.me-sketch img[src^="data:image/svg+xml"]').waitFor({ state: 'visible', timeout: 10_000 })

  step = 'M2: reload keeps the elements, the binding, the frame and the group'
  await page3.waitForTimeout(1500)
  await page3.reload()
  await page3.locator('.me-sketch img[src^="data:image/svg+xml"]').waitFor({ state: 'visible', timeout: 30_000 })
  await page3.locator('.me-sketch').getByRole('button', { name: INTERACT }).click()
  await page3.waitForFunction(n => window.__sketchDebug?.getElements().length === n, m2Count, { timeout: 15_000 })
    .catch(async () => {
      throw new Error(`expected ${m2Count} elements after reload, found ${await elementCount(page3)}`)
    })
  const reloaded = await els()
  const ra = reloaded.find(e => e.id === arrow.id)
  check(ra?.startBinding?.id === rectA.id && ra?.endBinding?.id === rectB.id, 'arrow bindings lost on reload')
  check(reloaded.find(e => e.id === rectA.id)?.frameId === frame.id, 'frame membership lost on reload')
  check(reloaded.every(e => e.groupIds.at(-1) === gid), 'group lost on reload')

  check(errors.length === 0, `page errors: ${errors.join(' | ')}`)
  await ctx3.close()
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
