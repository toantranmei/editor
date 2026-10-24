import { PALETTE_NAMES } from './theme/tokens'

/** Color names offered in menus. `default` removes the color. Actual colors come from theme tokens. */
export const COLORS = ['default', ...PALETTE_NAMES] as const
export type ColorName = typeof COLORS[number]
