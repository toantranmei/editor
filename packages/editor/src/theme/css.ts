import { declarations, flatten, type TokenTree } from './define'
import { component, PALETTE_NAMES, primitive, semanticBase, semanticDark, semanticLight, type ThemeTokens } from './tokens'

/** CSS cascade layer for all library styles; app CSS outside layers always wins. */
export const LAYER = 'mei-editor'

/**
 * Layer order declared wherever library CSS loads. Whichever sheet the browser sees
 * first fixes the order, so every entry point repeats it: resets (`base`, e.g.
 * Tailwind preflight) lose to the editor, while app `components`/`utilities` win.
 */
export const LAYER_ORDER = `@layer theme, base, ${LAYER}, components, utilities;`

const darkSelectors = (scope: string) => [
  `html.dark ${scope}:not(.me-light)`,
  `${scope}.me-dark`,
]

/** Default tokens (light + dark) plus palette mappings, generated from tokens.ts. */
export function baseTokensCss(): string {
  const light = [
    ...flatten(primitive as unknown as TokenTree),
    ...flatten(semanticBase),
    ...flatten(semanticLight as unknown as TokenTree),
    ...flatten(component),
  ]
  const dark = flatten(semanticDark as unknown as TokenTree)

  // Colors are stored by name in documents; map each name to its palette tokens.
  const tints = PALETTE_NAMES.map(name => [
    `:where(.me-scope) [data-text-color="${name}"]{color:var(--me-palette-${name}-text);}`,
    `:where(.me-scope) [data-bg-color="${name}"]{background-color:var(--me-palette-${name}-bg);}`,
    `:where(.me-scope) [data-color="${name}"]{--me-tint-text:var(--me-palette-${name}-text);--me-tint-bg:var(--me-palette-${name}-bg);}`,
  ].join('\n')).join('\n')

  return [
    LAYER_ORDER,
    `@layer ${LAYER} {`,
    `:where(.me-scope){${declarations(light)}}`,
    `${darkSelectors('.me-scope').map(s => `:where(${s})`).join(',')}{${declarations(dark)}}`,
    tints,
    '}',
  ].join('\n')
}

function overridePairs(tokens: Omit<ThemeTokens, 'dark'>): [string, string][] {
  const { components, ...semantic } = tokens
  return [...flatten(semantic as TokenTree), ...flatten((components ?? {}) as TokenTree)]
}

/**
 * CSS that applies token overrides to every editor matching `scope`
 * (unlayered, so it beats the defaults). Returns '' when there is nothing to override.
 */
export function overridesCss(tokens: ThemeTokens | undefined, scope = '.me-scope'): string {
  if (!tokens) return ''
  const { dark, ...rest } = tokens
  const light = overridePairs(rest)
  const darkPairs = dark ? overridePairs(dark) : []
  return [
    light.length ? `${scope}{${declarations(light)}}` : '',
    darkPairs.length ? `${darkSelectors(scope).join(',')}{${declarations(darkPairs)}}` : '',
  ].filter(Boolean).join('\n')
}

/** Adds or replaces a <style> tag in <head>. Pass empty css to remove it. */
export function injectStyle(id: string, css: string) {
  if (typeof document === 'undefined') return
  let el = document.getElementById(id) as HTMLStyleElement | null
  if (!css) return el?.remove()
  if (!el) {
    el = document.createElement('style')
    el.id = id
    // Base tokens go first so later sheets (and app CSS) can override them.
    if (id === BASE_STYLE_ID) document.head.prepend(el)
    else document.head.appendChild(el)
  }
  if (el.textContent !== css) el.textContent = css
}

const BASE_STYLE_ID = 'mei-editor-tokens'

/** Injects the default tokens once per document. */
export function installBaseTokens() {
  if (typeof document === 'undefined' || document.getElementById(BASE_STYLE_ID)) return
  injectStyle(BASE_STYLE_ID, baseTokensCss())
}
