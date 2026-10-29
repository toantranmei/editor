// Keeps the design system centralized: every visual value must live in src/theme/tokens.ts.
//  - src/styles/*.css: no raw colors or lengths (use var(--me-…)).
//  - .vue templates: static classes must be `me-*` / `is-*`; no inline colors or lengths.
// Opt out for a single line with the comment `me-allow-literal` (and say why).
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// Optional argument: another package's src dir (block packages reuse this check).
const root = process.argv[2] ? join(process.cwd(), process.argv[2], '/') : new URL('../src/', import.meta.url).pathname
const RAW_VALUE = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|(?<![\w-])\d*\.?\d+(px|rem|em|ms|s|vh|vw)\b/i
const errors = []

const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
const files = walk(root)

for (const file of files.filter(f => f.endsWith('.css'))) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    const code = line.replace(/\/\*.*?\*\//g, '')
    if (line.includes('me-allow-literal') || lines(file)[i - 1]?.includes('me-allow-literal')) return
    if (RAW_VALUE.test(code)) errors.push(`${relative(root, file)}:${i + 1}  raw value → use a token: ${line.trim()}`)
  })
}

for (const file of files.filter(f => f.endsWith('.vue'))) {
  const src = readFileSync(file, 'utf8')
  const template = src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>'))
  const offset = src.slice(0, src.indexOf('<template>')).split('\n').length - 1
  template.split('\n').forEach((line, i) => {
    if (line.includes('me-allow-literal')) return
    for (const [, classes] of line.matchAll(/(?<![:\w-])class="([^"]*)"/g)) {
      const bad = classes.split(/\s+/).filter(c => c && !/^(me-|is-)/.test(c))
      if (bad.length) errors.push(`${relative(root, file)}:${offset + i + 1}  non-token class "${bad.join(' ')}" → add a me-* class in src/styles`)
    }
    for (const [, style] of line.matchAll(/(?<![:\w-])style="([^"]*)"/g)) {
      if (RAW_VALUE.test(style)) errors.push(`${relative(root, file)}:${offset + i + 1}  inline style value → use a token`)
    }
  })
}

function lines(file) {
  return readFileSync(file, 'utf8').split('\n')
}

if (errors.length) {
  console.error(`Design-token check failed (${errors.length}):\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
console.log('Design-token check ok')
