/**
 * Heavy libraries load on first use, so apps only pay for what documents contain.
 * KaTeX and Mermaid are optional peer dependencies: install them to use `math` / `mermaid`.
 */
let katexPromise: Promise<typeof import('katex')['default']> | null = null
/**
 * KaTeX's stylesheet is NOT imported here: Vite's dev optimizer can't stub a CSS subpath
 * of a missing optional peer, which would break apps that don't use math. The Nuxt module
 * adds it when `math` is enabled; Vue apps import 'katex/dist/katex.min.css' themselves.
 */
export function loadKatex() {
  katexPromise ??= import('katex').then(m => m.default)
  return katexPromise
}

let mermaidPromise: Promise<typeof import('mermaid')['default']> | null = null
export function loadMermaid() {
  mermaidPromise ??= import('mermaid').then(m => m.default)
  return mermaidPromise
}
