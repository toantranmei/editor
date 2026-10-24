// The main entry must stay light: roughjs, rbush and the engine load lazily.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const MAX_GZIP = 15 * 1024
const file = new URL('../dist/index.js', import.meta.url)
const code = readFileSync(file, 'utf8')

const heavy = [
  [/(?:^|\n)\s*(?:import|export)\b[^;]*?from\s*["']roughjs/, 'roughjs'],
  [/(?:^|\n)\s*(?:import|export)\b[^;]*?from\s*["']rbush["']/, 'rbush'],
  [/(?:^|\n)\s*(?:import|export)\b[^;]*?from\s*["']\.\/engine/, './engine'],
  [/(?:^|\n)\s*import\s*["'](?:roughjs|rbush|\.\/engine)/, 'side-effect import'],
]
for (const [re, name] of heavy) {
  if (re.test(code)) {
    console.error(`entry imports heavy module: ${name}`)
    process.exit(1)
  }
}

const size = gzipSync(code).length
console.log(`dist/index.js gzip: ${(size / 1024).toFixed(2)} KB`)
if (size > MAX_GZIP) {
  console.error(`entry too large: ${(size / 1024).toFixed(2)} KB gzip > 15 KB`)
  process.exit(1)
}
console.log('ENTRY ok')
