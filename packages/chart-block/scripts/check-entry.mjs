// ECharts must load lazily: pages without a chart never download it.
// Checks dist/index.js plus every chunk it imports statically (relative imports, followed recursively; dynamic
// `import()` is lazy and not counted): none may import `echarts`.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const entry = new URL('../dist/index.js', import.meta.url)
const heavy = /(?:^|\n|;)\s*(?:import|export)\b[^;]*?from\s*["']echarts|(?:^|\n|;)\s*import\s*["']echarts/

function staticRelativeImports(code) {
  const out = []
  const re = /(?:^|\n|;)\s*(?:import|export)\s*(?:[^'"();]*?\bfrom\s*)?["'](\.{1,2}\/[^"']+)["']/g
  for (const m of code.matchAll(re)) out.push(m[1])
  return out
}

const files = new Map()
const queue = [entry]
while (queue.length) {
  const url = queue.shift()
  if (files.has(url.href)) continue
  const code = readFileSync(url, 'utf8')
  files.set(url.href, code)
  for (const spec of staticRelativeImports(code)) {
    if (spec.endsWith('.js')) queue.push(new URL(spec, url))
  }
}

let total = 0
for (const [href, code] of files) {
  const name = fileURLToPath(href).replace(/^.*\/dist\//, 'dist/')
  if (heavy.test(code)) {
    console.error(`${name} (entry graph) imports echarts statically`)
    process.exit(1)
  }
  total += gzipSync(code).length
}
console.log(`entry + static imports gzip: ${(total / 1024).toFixed(2)} KB (${files.size} files), no echarts`)
console.log('ENTRY ok')
