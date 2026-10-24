#!/usr/bin/env node
/**
 * Sketch board benchmark: time to first frame, pan and zoom frame rate for large boards.
 *
 *   pnpm bench:sketch                     # 1000 and 5000 shapes
 *   pnpm bench:sketch -- --sizes=500,10000 --no-build
 *
 * Builds the playground (production), serves it, and drives /sketch-bench with Playwright.
 * Uses the installed Google Chrome; otherwise run `pnpm exec playwright install chromium`.
 * Target: ≥ 55 fps while panning 5000 shapes (reported, not enforced).
 */
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')))
const sizes = (args.sizes ?? '1000,5000').split(',').map(Number)
const port = Number(args.port ?? 3170)
const playground = fileURLToPath(new URL('../apps/playground', import.meta.url))

if (!('no-build' in args)) {
  console.log('Building playground…')
  const build = spawnSync('pnpm', ['--filter', 'playground', 'build'], { stdio: 'inherit' })
  if (build.status) process.exit(build.status)
}

const server = spawn('node', ['.output/server/index.mjs'], { cwd: playground, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' })
const stop = () => server.kill()
process.on('exit', stop)

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/sketch-bench`)).ok) return
    }
    catch {}
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`Server on :${port} didn't start (port in use?)`)
}

async function launch() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true })
  }
  catch {
    return chromium.launch({ headless: true })
  }
}

/**
 * Runs in the page: dispatches one wheel event per animation frame on the board and records
 * the frame timestamps. Returns average fps and the 95th percentile frame time.
 */
async function measure(page, kind) {
  return page.evaluate(async (kind) => {
    const el = window.__sketchBench.el
    const rect = el.getBoundingClientRect()
    const at = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }
    const wheel = init => el.dispatchEvent(new WheelEvent('wheel', { ...at, bubbles: true, cancelable: true, ...init }))
    const frame = () => new Promise(r => requestAnimationFrame(r))
    const STEPS = 60
    let step
    if (kind === 'pan') {
      step = i => wheel({ deltaX: i % 2 ? 40 : -40, deltaY: 25 })
    }
    else {
      // Zoom 0.1 → 4: first clamp to the minimum, then 60 equal ctrl+wheel steps
      // (the board zooms by exp(-deltaY * 0.01) per event).
      wheel({ deltaY: 2000, ctrlKey: true })
      await frame()
      await new Promise(r => setTimeout(r, 300))
      const dy = -Math.log(4 / 0.1) / STEPS / 0.01
      step = () => wheel({ deltaY: dy, ctrlKey: true })
    }
    await frame()
    const stamps = [await frame()]
    for (let i = 0; i < STEPS; i++) {
      step(i)
      stamps.push(await frame())
    }
    // let the last render land
    stamps.push(await frame())
    const deltas = stamps.slice(1).map((t, i) => t - stamps[i]).sort((a, b) => a - b)
    const total = stamps[stamps.length - 1] - stamps[0]
    return {
      fps: +((deltas.length / total) * 1000).toFixed(1),
      p95: +deltas[Math.floor(deltas.length * 0.95)].toFixed(1),
    }
  }, kind)
}

await waitForServer()
const browser = await launch()
const rows = []
for (const n of sizes) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`http://localhost:${port}/sketch-bench?n=${n}`)
  await page.waitForFunction(() => window.__sketchBench?.firstFrameAt, null, { timeout: 300_000 })
  const { fillMs, firstFrameMs } = await page.evaluate(() => ({
    fillMs: Math.round(window.__sketchBench.fillMs),
    firstFrameMs: Math.round(window.__sketchBench.firstFrameAt - window.__sketchBench.mountStart),
  }))
  await page.waitForTimeout(500)
  const pan = await measure(page, 'pan')
  await page.waitForTimeout(500)
  const zoom = await measure(page, 'zoom')
  rows.push({
    shapes: n,
    'fill (ms)': fillMs,
    'first frame (ms)': firstFrameMs,
    'pan fps': pan.fps,
    'pan p95 (ms)': pan.p95,
    'zoom fps': zoom.fps,
    'zoom p95 (ms)': zoom.p95,
  })
  await page.close()
}
await browser.close()
stop()

console.log('\nfps from requestAnimationFrame timestamps, one wheel event per frame (60 frames). Target: pan ≥ 55 fps at 5000.')
console.table(rows)
