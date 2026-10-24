import { hasKind } from '../elements/kind'
import { ELEMENT_TYPES, type ElementInit, normalizeElement, type SketchElement } from '../model/types'

export const CLIPBOARD_TYPE = 'mei-sketch/clipboard'

/** Clipboard text longer than this is ignored outright (before parsing). */
const MAX_CLIPBOARD_CHARS = 2_000_000
/** Payloads with more elements than this are ignored. */
const MAX_ELEMENTS = 5000
/** Plain text pasted as a text element, and an element's `text` / `label`, are cut to this length. */
const MAX_TEXT_CHARS = 10_000
/** |x|, |y| of a pasted element are clamped to this (scene units). */
const MAX_COORD = 1e6
/** w, h of a pasted element are clamped to this (scene units). */
const MAX_SIZE = 1e5
/** Points farther than this outside the element's box are dropped (scene units). */
const POINT_SLACK = 10
/** Points kept per element. */
const MAX_POINTS = 20_000
/** Group ids kept per element (nesting depth). */
const MAX_GROUP_IDS = 16
/** Characters kept per group id. */
const MAX_GROUP_ID_CHARS = 64

const KNOWN_TYPES: ReadonlySet<string> = new Set<string>(ELEMENT_TYPES)

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

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Valid points inside the box (0,0)–(w,h) ± POINT_SLACK, capped at MAX_POINTS, plus the source indices kept
 * (so per-point arrays stay aligned). Null when any entry is malformed.
 */
function sanitizePoints(v: unknown, w: number, h: number): { points: [number, number][]; kept: number[] } | null {
  if (!Array.isArray(v)) return null
  const points: [number, number][] = []
  const kept: number[] = []
  for (let i = 0; i < v.length && points.length < MAX_POINTS; i++) {
    const p: unknown = v[i]
    if (!Array.isArray(p) || p.length < 2 || !finite(p[0]) || !finite(p[1])) return null
    const [x, y] = p as [number, number]
    if (x < -POINT_SLACK || y < -POINT_SLACK || x > w + POINT_SLACK || y > h + POINT_SLACK) continue
    points.push([x, y])
    kept.push(i)
  }
  return { points, kept }
}

/** A validated element init rebuilt from known props, or null when it cannot be used. */
function sanitizeElement(raw: unknown): ElementInit | null {
  if (!isRecord(raw)) return null
  const type = raw.type
  // types whose kind is not registered yet cannot be rendered: skip them
  if (typeof type !== 'string' || !KNOWN_TYPES.has(type) || !hasKind(type)) return null
  const { x, y, w, h, angle } = raw
  if (!finite(x) || !finite(y) || !finite(w) || !finite(h) || !finite(angle)) return null
  const bw = clamp(w, 0, MAX_SIZE)
  const bh = clamp(h, 0, MAX_SIZE)
  const out: Record<string, unknown> = {
    type,
    x: clamp(x, -MAX_COORD, MAX_COORD),
    y: clamp(y, -MAX_COORD, MAX_COORD),
    w: bw,
    h: bh,
    angle,
    locked: raw.locked === true,
  }
  let kept: number[] = []
  if (type === 'line' || type === 'arrow' || type === 'freedraw') {
    const sane = sanitizePoints(raw.points, bw, bh)
    if (!sane || sane.points.length < (type === 'freedraw' ? 1 : 2)) return null
    out.points = sane.points
    kept = sane.kept
  }
  if (type === 'freedraw' && raw.pressures !== undefined) {
    const p = raw.pressures
    if (!Array.isArray(p) || !p.every(finite)) return null
    const n = (out.points as unknown[]).length
    // per-point pressures follow the kept points; never more pressures than points
    const aligned = p.length === (raw.points as unknown[]).length
    out.pressures = aligned ? kept.map(i => p[i] as number) : p.slice(0, n)
  }
  for (const [k, ok] of Object.entries(OPTIONAL)) {
    if (ok(raw[k])) out[k] = raw[k]
  }
  for (const k of ['text', 'label'] as const) {
    if (typeof out[k] === 'string') out[k] = (out[k] as string).slice(0, MAX_TEXT_CHARS)
  }
  const g = raw.groupIds
  if (Array.isArray(g) && g.every(isString)) out.groupIds = (g as string[]).slice(0, MAX_GROUP_IDS).map(s => s.slice(0, MAX_GROUP_ID_CHARS))
  // frame membership is recomputed and bindings are remapped by the paster; never trust the payload's ids
  out.frameId = null
  if (type === 'line' || type === 'arrow') {
    out.startBinding = null
    out.endBinding = null
  }
  if (finite(raw.opacity)) out.opacity = Math.min(1, Math.max(0, raw.opacity))
  return normalizeElement(out) as unknown as ElementInit
}
