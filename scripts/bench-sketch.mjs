#!/usr/bin/env node
/**
 * Sketch board benchmark: time to first frame, pan and zoom frame rate for large boards.
 * Pans at the fitted zoom (LOD path at 5000 shapes) and at zoom 1 and 0.35 (bitmap path), and
 * records the post-settle rebuild after zooming ("settle max").
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

/** How long to keep recording frames after the last zoom (the board re-renders 150 ms after zooming stops). */
const SETTLE_MS = 300

/**
 * Runs in the page: dispatches one wheel event per animation frame on the board and records
 * the frame timestamps. Returns average fps and the 95th percentile frame time, plus the
 * longest single frame in the SETTLE_MS after the run's last zoom ("settle max": the
 * post-settle rebuild of the static layer at the new zoom), or null if the run didn't zoom.
 *
 * kind: 'pan' (at the current zoom), 'pan@<zoom>' (first set the zoom at the board center,
 * then pan) or 'zoom' (sweep 0.1 → 4).
 */
async function measure(page, kind) {
  return page.evaluate(async ({ kind, SETTLE_MS }) => {
    const el = window.__sketchBench.el
    const rect = el.getBoundingClientRect()
    const at = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }
    const wheel = init => el.dispatchEvent(new WheelEvent('wheel', { ...at, bubbles: true, cancelable: true, ...init }))
    const frame = () => new Promise(r => requestAnimationFrame(r))
    // The board zooms by exp(-deltaY * 0.01) per ctrl+wheel event, clamped to [0.1, 30].
    const zoomBy = factor => wheel({ deltaY: -Math.log(factor) / 0.01, ctrlKey: true })
    const toMinZoom = () => wheel({ deltaY: 2000, ctrlKey: true })
    /** Longest frame from now until SETTLE_MS after `since` (a frame timestamp). */
    async function settleMax(since) {
      let prev = since
      let max = 0
      while (prev - since < SETTLE_MS) {
        const t = await frame()
        max = Math.max(max, t - prev)
        prev = t
      }
      return +max.toFixed(1)
    }

    const STEPS = 60
    let step
    let settle = null
    let zoomLabel = null
    if (kind === 'zoom') {
      // Zoom 0.1 → 4: first clamp to the minimum, then 60 equal ctrl+wheel steps.
      toMinZoom()
      await frame()
      await new Promise(r => setTimeout(r, SETTLE_MS))
      step = () => zoomBy((4 / 0.1) ** (1 / STEPS))
    }
    else {
      const zoom = kind.startsWith('pan@') ? Number(kind.slice(4)) : null
      if (zoom !== null) {
        // the board starts fitted around the content center, which stays at the board center
        toMinZoom()
        zoomBy(zoom / 0.1)
        settle = await settleMax(await frame())
      }
      zoomLabel = el.querySelector('.me-sketch-zoom-pct')?.textContent?.trim() ?? '?'
      step = i => wheel({ deltaX: i % 2 ? 40 : -40, deltaY: 25 })
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
    // the zoom sweep ends on a zoom: include the rebuild that follows it
    if (kind === 'zoom') settle = await settleMax(stamps[stamps.length - 2])
    return {
      fps: +((deltas.length / total) * 1000).toFixed(1),
      p95: +deltas[Math.floor(deltas.length * 0.95)].toFixed(1),
      settle,
      zoom: zoomLabel ?? el.querySelector('.me-sketch-zoom-pct')?.textContent?.trim() ?? '?',
    }
  }, { kind, SETTLE_MS })
}

await waitForServer()
const browser = await launch()
const rows = []
const loads = []
for (const n of sizes) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`http://localhost:${port}/sketch-bench?n=${n}`)
  await page.waitForFunction(() => window.__sketchBench?.firstFrameAt, null, { timeout: 300_000 })
  const { fillMs, firstFrameMs } = await page.evaluate(() => ({
    fillMs: Math.round(window.__sketchBench.fillMs),
    firstFrameMs: Math.round(window.__sketchBench.firstFrameAt - window.__sketchBench.mountStart),
  }))
  loads.push({ shapes: n, 'fill (ms)': fillMs, 'first frame (ms)': firstFrameMs })
  // pan at the fitted zoom (0.1 at 5000 shapes: the LOD path), then on the bitmap path
  // (zoom 1 and 0.35, both above LOD_ZOOM = 0.3), then the zoom sweep
  for (const [run, kind] of [['pan (fit)', 'pan'], ['pan @ zoom 1', 'pan@1'], ['pan @ zoom 0.35', 'pan@0.35'], ['zoom 0.1 → 4', 'zoom']]) {
    await page.waitForTimeout(500)
    const r = await measure(page, kind)
    rows.push({ shapes: n, run, 'zoom (shown)': r.zoom, fps: r.fps, 'p95 (ms)': r.p95, 'settle max (ms)': r.settle ?? '–' })
  }
  await page.close()
}
await browser.close()
stop()

console.log('\nLoad')
console.table(loads)
console.log(`\nfps from requestAnimationFrame timestamps, one wheel event per frame (60 frames). Target: pan ≥ 55 fps at 5000.
settle max: longest single frame in the ${SETTLE_MS} ms after the run's last zoom (the static layer rebuild 150 ms after zooming stops).`)
console.table(rows)
