#!/usr/bin/env node
/**
 * End-to-end check of live collaboration on a sketch board:
 * starts the playground sync server (y-websocket on :1234) and the playground dev server, opens
 * /sketch-collab?board=e2e-<random> in two browser contexts, draws a rectangle in A → B shows it within 2 s;
 * moves the mouse in A → B's presence has A's cursor (and name).
 *
 *   pnpm e2e:sketch:collab
 *   pnpm e2e:sketch:collab -- --port=3162 --headed
 *
 * The sync port is fixed (the page connects to ws://localhost:1234). Runs against `nuxt dev` with
 * NUXT_IGNORE_LOCK=1, so it works next to another dev server. Uses the installed Google Chrome; otherwise run
 * `pnpm exec playwright install chromium`.
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')))
const port = Number(args.port ?? 3162)
const SYNC_PORT = 1234
const headless = !('headed' in args)
const board = `e2e-${Math.random().toString(36).slice(2, 10)}`
const pageUrl = name => `http://localhost:${port}/sketch-collab?board=${board}&name=${name}`

/** Spawned process groups (pnpm → node children), killed on exit. */
const children = []
function start(cmd, argv, env) {
  const child = spawn(cmd, argv, { stdio: 'ignore', detached: true, env: { ...process.env, ...env } })
  children.push(child)
  return child
}
let stopped = false
function stop() {
  if (stopped) return
  stopped = true
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM') // the whole group
    }
    catch {}
  }
}
process.on('exit', stop)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(130))

async function isUp(url) {
  try {
    return (await fetch(url)).ok
  }
  catch {
    return false
  }
}

async function waitFor(url, what, tries = 240) {
  for (let i = 0; i < tries; i++) {
    if (await isUp(url)) return
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`${what} didn't start (port in use?)`)
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

/** Opens the collab page and waits until the board is mounted and synced. */
async function openBoard(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(pageUrl(name))
  await page.locator('.me-sketch-board').waitFor({ timeout: 60_000 })
  await page.waitForFunction(() => window.__sketchCollab?.status() === 'online', null, { timeout: 15_000 })
  return { ctx, page, errors }
}

const count = page => page.evaluate(() => window.__sketchCollab?.getElements().length ?? -1)

let failed = false
let browser = null
try {
  step = 'start the sync server'
  check(!(await isUp(`http://localhost:${SYNC_PORT}`)), `port ${SYNC_PORT} is already in use (stop \`pnpm sync\` first)`)
  start('pnpm', ['--filter', 'playground', 'exec', 'y-websocket'], { HOST: 'localhost', PORT: String(SYNC_PORT) })
  await waitFor(`http://localhost:${SYNC_PORT}`, `Sync server on :${SYNC_PORT}`, 60)

  step = 'start the dev server'
  start('pnpm', ['--filter', 'playground', 'dev', '--port', String(port)], { NUXT_IGNORE_LOCK: '1' })
  await waitFor(`http://localhost:${port}/`, `Dev server on :${port}`)

  browser = await launch()

  // Warm-up: the first visit makes Vite optimize the engine's deps, which reloads the page.
  step = 'warm-up'
  for (let attempt = 1; ; attempt++) {
    const ctx = await browser.newContext()
    try {
      const page = await ctx.newPage()
      await page.goto(`http://localhost:${port}/sketch-collab?board=${board}-warmup`)
      await page.locator('.me-sketch-board').waitFor({ timeout: 60_000 })
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

  step = 'open the board in two browsers'
  const a = await openBoard(browser, 'Alice')
  const b = await openBoard(browser, 'Bob')
  check(await count(a.page) === 0 && await count(b.page) === 0, 'a new board should be empty')

  step = 'draw a rectangle in A → B sees it within 2 s'
  const canvas = a.page.locator('.me-sketch-canvas--interactive')
  const box = await canvas.boundingBox()
  check(box, 'board canvas not found')
  await a.page.locator('.me-sketch-board').focus()
  await a.page.keyboard.press('r')
  await a.page.mouse.move(box.x + 300, box.y + 200)
  await a.page.mouse.down()
  for (let i = 1; i <= 8; i++) await a.page.mouse.move(box.x + 300 + 20 * i, box.y + 200 + 12 * i)
  await a.page.mouse.up()
  const drawnAt = Date.now()
  check(await count(a.page) === 1, `A: expected 1 element, found ${await count(a.page)}`)
  await b.page.waitForFunction(() => window.__sketchCollab?.getElements().length === 1, null, { timeout: 2000 })
    .catch(async () => {
      throw new Error(`B: expected 1 element within 2 s, found ${await count(b.page)}`)
    })
  const latency = Date.now() - drawnAt
  const [ea] = await a.page.evaluate(() => window.__sketchCollab.getElements().map(e => ({ id: e.id, type: e.type })))
  const [eb] = await b.page.evaluate(() => window.__sketchCollab.getElements().map(e => ({ id: e.id, type: e.type })))
  check(ea.id === eb.id && eb.type === 'rectangle', `B shows ${JSON.stringify(eb)}, A drew ${JSON.stringify(ea)}`)

  step = 'move the mouse in A → B sees A\'s cursor'
  await a.page.mouse.move(box.x + 600, box.y + 400, { steps: 5 })
  // presence is throttled (50 ms, trailing): wait for the cursor where the mouse stopped. It is in scene
  // coordinates, so map it back through A's viewport.
  const target = { x: 600, y: 400 }
  const peerCursor = () => b.page.evaluate(() => window.__sketchCollab?.presence().find(p => p.user?.name === 'Alice')?.cursor ?? null)
  let at = null
  for (let i = 0; i < 40; i++) {
    const cursor = await peerCursor()
    at = cursor ? await a.page.evaluate(p => window.__sketchCollab.toScreen(p), cursor) : null
    if (at && Math.abs(at.x - target.x) < 2 && Math.abs(at.y - target.y) < 2) break
    await b.page.waitForTimeout(50)
  }
  check(at, `B: no cursor from A in presence: ${JSON.stringify(await b.page.evaluate(() => window.__sketchCollab?.presence()))}`)
  check(Math.abs(at.x - target.x) < 2 && Math.abs(at.y - target.y) < 2, `A's cursor in B maps to ${JSON.stringify(at)}, expected ${JSON.stringify(target)}`)

  check(a.errors.length === 0 && b.errors.length === 0, `page errors: ${[...a.errors, ...b.errors].join(' | ')}`)
  await a.ctx.close()
  await b.ctx.close()
  console.log(`e2e:sketch:collab PASS (board ${board}, A → B in ${latency} ms)`)
}
catch (err) {
  failed = true
  console.error(`e2e:sketch:collab FAIL at "${step}": ${err.message}`)
}
finally {
  await browser?.close()
  stop()
}
process.exit(failed ? 1 : 0)
