// Verifies that RUNTIME_DEPS in src/nuxt.ts matches the bare imports of dist/index.js.
import { readFileSync } from 'node:fs'

const bundle = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8')
const source = readFileSync(new URL('../src/nuxt.ts', import.meta.url), 'utf8')

const imported = new Set([...bundle.matchAll(/from\s*["']([^"'.][^"']*)["']/g)].map(m => m[1]).filter(d => d !== 'vue'))
const listBlock = source.match(/RUNTIME_DEPS = \[([\s\S]*?)\]/)?.[1] ?? ''
const listed = new Set([...listBlock.matchAll(/'([^']+)'/g)].map(m => m[1]))

const missing = [...imported].filter(d => !listed.has(d))
const extra = [...listed].filter(d => !imported.has(d))
if (missing.length || extra.length) {
  console.error('RUNTIME_DEPS out of sync with dist/index.js')
  if (missing.length) console.error('  missing:', missing.join(', '))
  if (extra.length) console.error('  unused :', extra.join(', '))
  process.exit(1)
}
console.log(`RUNTIME_DEPS ok (${listed.size} deps)`)
