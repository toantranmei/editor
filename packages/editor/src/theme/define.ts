/** Helpers to turn token objects into CSS custom properties. No values live here. */

export interface TokenTree { [key: string]: string | TokenTree }

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> }

/** Loosens literal string types so token objects can be compared/overridden. */
export type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> }

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

/** `'menu.itemHeight'` → `'--me-menu-item-height'` */
export const cssVar = (path: string) => `--me-${path.split('.').map(kebab).join('-')}`

/** Reference another token: `ref('color.text')` → `'var(--me-color-text)'` */
export const ref = (path: string) => `var(${cssVar(path)})`

/** Flattens a token tree into `[cssVarName, value]` pairs. */
export function flatten(tree: TokenTree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? [[cssVar(path), value] as [string, string]] : flatten(value, path)
  })
}

export const declarations = (pairs: [string, string][]) => pairs.map(([k, v]) => `${k}:${v};`).join('')
