#!/usr/bin/env node
/**
 * Editor benchmark: load time, typing latency and memory for large documents.
 *
 *   pnpm bench                     # 1k, 5k, 10k, 20k blocks
 *   pnpm bench -- --sizes=2000,50000 --no-build
 *
 * Builds the playground (production), serves it, and drives /bench with Playwright.
 * Uses the installed Google Chrome; otherwise run `pnpm exec playwright install chromium`.
 */
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')))
const sizes = (args.sizes ?? '1000,5000,10000,20000').split(',').map(Number)
const port = Number(args.port ?? 3150)
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
      if ((await fetch(`http://localhost:${port}/bench`)).ok) return
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

await waitForServer()
const browser = await launch()
const rows = []
for (const n of sizes) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`http://localhost:${port}/bench?n=${n}&ids=1`)
  await page.waitForFunction(() => window.__bench?.paintedAt, null, { timeout: 300_000 })
  await page.waitForTimeout(500)
  const r = await page.evaluate(async () => {
    const b = window.__bench
    const ed = b.editor
    ed.commands.focus(Math.floor(ed.state.doc.content.size / 2))
    const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)))
    const keys = []
    for (let i = 0; i < 30; i++) {
      const t = performance.now()
      ed.view.dispatch(ed.state.tr.insertText('a'))
      await frame()
      keys.push(performance.now() - t)
    }
    keys.sort((x, y) => x - y)
    return {
      paintMs: Math.round(b.paintedAt - b.mountStart),
      keyP50: +keys[15].toFixed(1),
      keyP95: +keys[28].toFixed(1),
      domNodes: document.querySelectorAll('.me-content *').length,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    }
  })
  rows.push({ blocks: n, 'open (ms)': r.paintMs, 'key p50 (ms)': r.keyP50, 'key p95 (ms)': r.keyP95, 'DOM nodes': r.domNodes, 'heap (MB)': r.heapMB })
  await page.close()
}
await browser.close()
stop()

console.log('\nKey latency includes 2 animation frames (~33ms) — that is the floor.')
console.table(rows)
