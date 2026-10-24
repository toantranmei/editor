import type { FontFamily } from '../model/types'

/** CSS font stacks. "Mei Hand" is our FontFace registration of Patrick Hand (covers Vietnamese). */
export const FONT_FAMILIES: Record<FontFamily, string> = {
  hand: '"Mei Hand", "Patrick Hand", cursive',
  normal: 'system-ui, sans-serif',
  code: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}

export const LINE_HEIGHT = 1.25

const HAND_FAMILY = 'Mei Hand'

// unicode-range values copied from @fontsource/patrick-hand@5.3.0 (unicode.json / 400.css).
// Each URL is a literal so the bundler emits the woff2 as an asset of the engine chunk; `?no-inline`
// stops Vite's lib mode from base64-inlining it (lib mode ignores assetsInlineLimit).
const FACES: readonly { url: () => string; unicodeRange: string }[] = [
  {
    url: () => new URL('../fonts/patrick-hand-vietnamese-400-normal.woff2?no-inline', import.meta.url).href,
    unicodeRange: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
  },
  {
    url: () => new URL('../fonts/patrick-hand-latin-ext-400-normal.woff2?no-inline', import.meta.url).href,
    unicodeRange: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  },
  {
    url: () => new URL('../fonts/patrick-hand-latin-400-normal.woff2?no-inline', import.meta.url).href,
    unicodeRange: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  },
]

let loading: Promise<void> | null = null
let loaded = false
const listeners = new Set<() => void>()

/**
 * Registers and loads the hand font. Idempotent (one shared promise); never rejects — when FontFace /
 * document.fonts are unavailable or a file fails, it warns and the fallback stack is used.
 */
export function loadFonts(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
      console.warn('sketch-block: FontFace API unavailable, using fallback fonts')
      return
    }
    try {
      const faces = FACES.map(f => new FontFace(HAND_FAMILY, `url(${f.url()}) format('woff2')`, {
        style: 'normal', weight: '400', display: 'swap', unicodeRange: f.unicodeRange,
      }))
      for (const face of faces) document.fonts.add(face)
      await Promise.all(faces.map(face => face.load()))
    } catch (err) {
      console.warn('sketch-block: failed to load the hand font', err)
      return
    }
    loaded = true
    for (const cb of [...listeners]) cb()
  })()
  return loading
}

/** Calls `cb` once the hand font has loaded (immediately if it already has). Returns an unsubscribe. */
export function onFontsLoaded(cb: () => void): () => void {
  if (loaded) {
    cb()
    return () => {}
  }
  listeners.add(cb)
  return () => listeners.delete(cb)
}
