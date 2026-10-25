// The main entry must stay light: roughjs, rbush, perfect-freehand, yjs and the engine load lazily.
// Checks dist/index.js plus every chunk it imports statically (relative imports, followed recursively; dynamic
// `import()` is lazy and not counted): none may import a heavy module, and their gzip sizes summed stay < 15 KB.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const MAX_GZIP = 15 * 1024
const entry = new URL('../dist/index.js', import.meta.url)

const heavy = [
  [/(?:^|\n|;)\s*(?:import|export)\b[^;]*?from\s*["']roughjs/, 'roughjs'],
  [/(?:^|\n|;)\s*(?:import|export)\b[^;]*?from\s*["']rbush["']/, 'rbush'],
  [/(?:^|\n|;)\s*(?:import|export)\b[^;]*?from\s*["']perfect-freehand["']/, 'perfect-freehand'],
  [/(?:^|\n|;)\s*(?:import|export)\b[^;]*?from\s*["']yjs["']/, 'yjs'],
  [/(?:^|\n|;)\s*(?:import|export)\b[^;]*?from\s*["']\.\/engine/, './engine'],
  [/(?:^|\n|;)\s*import\s*["'](?:roughjs|rbush|perfect-freehand|yjs|\.\/engine)/, 'side-effect import'],
]

/** Relative specifiers of the static imports / re-exports in `code` (not dynamic `import()`). */
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
  for (const [re, mod] of heavy) {
    if (re.test(code)) {
      console.error(`${name} (entry graph) imports heavy module: ${mod}`)
      process.exit(1)
    }
  }
  const size = gzipSync(code).length
  total += size
  console.log(`${name} gzip: ${(size / 1024).toFixed(2)} KB`)
}

console.log(`entry + static imports gzip: ${(total / 1024).toFixed(2)} KB (${files.size} files)`)
if (total > MAX_GZIP) {
  console.error(`entry too large: ${(total / 1024).toFixed(2)} KB gzip > 15 KB`)
  process.exit(1)
}
console.log('ENTRY ok')
