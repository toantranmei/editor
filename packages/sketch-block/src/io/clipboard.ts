import { type ElementInit, type ElementType, normalizeElement, type SketchElement } from '../model/types'

export const CLIPBOARD_TYPE = 'mei-sketch/clipboard'

/** Clipboard text longer than this is ignored outright (before parsing). */
const MAX_CLIPBOARD_CHARS = 2_000_000
/** Payloads with more elements than this are ignored. */
const MAX_ELEMENTS = 5000
/** Plain text pasted as a text element is cut to this length. */
const MAX_TEXT_CHARS = 10_000

const ELEMENT_TYPES: ReadonlySet<string> = new Set<ElementType>([
  'rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'freedraw', 'text',
])

/** Our own element payload: `{ type, version: 1, elements }` without `index` / `version` (seed is kept). */
export function serializeClipboard(elements: readonly SketchElement[]): string {
  return JSON.stringify({
    type: CLIPBOARD_TYPE,
    version: 1,
    elements: elements.map(el => {
      const { index: _index, version: _version, ...rest } = el
      return rest
    }),
  })
}

/**
 * Untrusted clipboard text → elements (our payload), plain text, or null (empty / oversized / malformed own
 * payload). Elements are validated and rebuilt from known props only; invalid ones are dropped. Never throws.
 */
export function parseClipboard(text: string): { elements: ElementInit[] } | { text: string } | null {
  try {
    if (typeof text !== 'string' || text.length > MAX_CLIPBOARD_CHARS || !text.trim()) return null
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      data = undefined
    }
    if (isRecord(data) && data.type === CLIPBOARD_TYPE) {
      const raw = data.elements
      if (!Array.isArray(raw) || raw.length > MAX_ELEMENTS) return null
      const elements: ElementInit[] = []
      for (const r of raw) {
        const el = sanitizeElement(r)
        if (el) elements.push(el)
      }
      return { elements }
    }
    return { text: text.slice(0, MAX_TEXT_CHARS) }
  } catch {
    return null
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const oneOf = (...values: unknown[]) => (v: unknown) => values.includes(v)
const isString = (v: unknown) => typeof v === 'string'
const isBool = (v: unknown) => typeof v === 'boolean'
const COLOR_RE = /^(?:#[0-9a-f]{3,8}|transparent)$/i
const isColor = (v: unknown) => typeof v === 'string' && COLOR_RE.test(v)
const ARROWHEAD = oneOf('none', 'arrow', 'triangle', 'dot', 'bar')

/** Optional props: kept when valid, otherwise left to `normalizeElement`'s defaults. */
const OPTIONAL: Record<string, (v: unknown) => boolean> = {
  stroke: isColor,
  fill: isColor,
  fillStyle: oneOf('hachure', 'cross-hatch', 'solid', 'none'),
  strokeWidth: oneOf(1, 2, 4),
  strokeStyle: oneOf('solid', 'dashed', 'dotted'),
  roughness: oneOf(0, 1, 2),
  roundness: oneOf('sharp', 'round'),
  fontFamily: oneOf('hand', 'normal', 'code'),
  fontSize: oneOf(16, 20, 28, 36),
  textAlign: oneOf('left', 'center', 'right'),
  seed: v => finite(v) && Number.isInteger(v),
  label: isString,
  text: isString,
  autoSize: isBool,
  highlighter: isBool,
  routing: oneOf('straight', 'elbow', 'curved'),
  startArrowhead: ARROWHEAD,
  endArrowhead: ARROWHEAD,
}

function sanitizePoints(v: unknown): [number, number][] | null {
  if (!Array.isArray(v)) return null
  const out: [number, number][] = []
  for (const p of v) {
    if (!Array.isArray(p) || p.length < 2 || !finite(p[0]) || !finite(p[1])) return null
    out.push([p[0], p[1]])
  }
  return out
}

/** A validated element init rebuilt from known props, or null when it cannot be used. */
function sanitizeElement(raw: unknown): ElementInit | null {
  if (!isRecord(raw)) return null
  const type = raw.type
  if (typeof type !== 'string' || !ELEMENT_TYPES.has(type)) return null
  const { x, y, w, h, angle } = raw
  if (!finite(x) || !finite(y) || !finite(w) || !finite(h) || !finite(angle)) return null
  const out: Record<string, unknown> = {
    type, x, y, w: Math.max(0, w), h: Math.max(0, h), angle, locked: raw.locked === true,
  }
  if (type === 'line' || type === 'arrow' || type === 'freedraw') {
    const points = sanitizePoints(raw.points)
    if (!points || points.length < (type === 'freedraw' ? 1 : 2)) return null
    out.points = points
  }
  if (type === 'freedraw' && raw.pressures !== undefined) {
    const p = raw.pressures
    if (!Array.isArray(p) || !p.every(finite)) return null
    out.pressures = [...p]
  }
  for (const [k, ok] of Object.entries(OPTIONAL)) {
    if (ok(raw[k])) out[k] = raw[k]
  }
  if (finite(raw.opacity)) out.opacity = Math.min(1, Math.max(0, raw.opacity))
  return normalizeElement(out) as unknown as ElementInit
}
