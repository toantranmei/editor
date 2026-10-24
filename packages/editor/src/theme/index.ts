export { component, PALETTE_NAMES, primitive, semanticBase, semanticDark, semanticLight, type PaletteName, type ThemeTokens } from './tokens'
export { baseTokensCss, installBaseTokens, injectStyle, LAYER, overridesCss } from './css'
export { cssVar, ref } from './define'

/** Light / dark mode of an editor. `auto` follows `<html class="dark">`. */
export type ThemeMode = 'light' | 'dark' | 'auto'

/** Identity helper for typed token overrides: `defineTokens({ color: { accent: '#7c3aed' } })`. */
export const defineTokens = <T extends import('./tokens').ThemeTokens>(tokens: T) => tokens
