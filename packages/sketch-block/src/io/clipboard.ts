import { hasKind } from '../elements/kind'
import { cleanBinding, ELEMENT_TYPES, type ElementInit, isImageSrc, normalizeElement, type SketchElement } from '../model/types'
import { isImageFile } from './image-insert'

export const CLIPBOARD_TYPE = 'mei-sketch/clipboard'

/** Foreign / plain clipboard text longer than this is ignored outright (before parsing). */
const MAX_CLIPBOARD_CHARS = 2_000_000
/** Our own payloads (data-URL images make them big) may be this long; longer ones are rejected as too large. */
export const MAX_OWN_CLIPBOARD_CHARS = 24_000_000
/** How our own payload starts (checked before parsing, to pick the size limit). */
const OWN_PREFIX_RE = /^\s*\{\s*"type"\s*:\s*"mei-sketch\/clipboard"/
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
/** Characters of a source element id kept (to remap bindings among pasted elements); longer ids are dropped. */
const MAX_ID_CHARS = 64
/** A frame's name is cut to this length. */
const MAX_FRAME_NAME_CHARS = 200
/** An image's natural width / height is clamped to this (px). */
const MAX_NATURAL = 1e5

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

/** Clipboard text that is our payload and too long to copy / paste (the board says so). */
export interface ClipboardTooLarge { tooLarge: true }

/** Whether `text` (serialized) is too long for the clipboard: copy refuses it, and says so. */
export const clipboardTooLarge = (text: string): boolean => text.length > MAX_OWN_CLIPBOARD_CHARS

/**
 * Untrusted clipboard text → elements (our payload), plain text, `{ tooLarge }` (our payload over
 * MAX_OWN_CLIPBOARD_CHARS), or null (empty / oversized foreign text / malformed own payload). Elements are
 * validated and rebuilt from known props only; invalid ones are dropped. Never throws.
 */
export function parseClipboard(text: string): { elements: ElementInit[] } | { text: string } | ClipboardTooLarge | null {
  try {
    if (typeof text !== 'string') return null
    if (text.length > MAX_CLIPBOARD_CHARS) {
      // only our own payload may be bigger (images as data URLs); foreign text this long is ignored
      if (!OWN_PREFIX_RE.test(text.slice(0, 100))) return null
      if (clipboardTooLarge(text)) return { tooLarge: true }
    }
    if (!text.trim()) return null
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
    if (text.length > MAX_CLIPBOARD_CHARS) return null
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
const STICKY_COLOR_RE = /^#[0-9a-f]{6}$/i
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
  // the sticky fill: a sticky-only prop, always #rrggbb
  if (type === 'sticky' && typeof raw.color === 'string' && STICKY_COLOR_RE.test(raw.color)) out.color = raw.color.toLowerCase()
  for (const k of ['text', 'label'] as const) {
    if (typeof out[k] === 'string') out[k] = (out[k] as string).slice(0, MAX_TEXT_CHARS)
  }
  const g = raw.groupIds
  if (Array.isArray(g) && g.every(isString)) out.groupIds = (g as string[]).slice(0, MAX_GROUP_IDS).map(s => s.slice(0, MAX_GROUP_ID_CHARS))
  // the source id only lets the paster remap bindings to the copies: it never becomes a stored id
  if (typeof raw.id === 'string' && raw.id.length <= MAX_ID_CHARS) out.id = raw.id
  // frame membership is recomputed by the paster; never trust the payload's frame id
  out.frameId = null
  if (type === 'line' || type === 'arrow') {
    // kept when well-formed; the paster keeps only those whose target is pasted along (remapped to its copy)
    const bound = (v: unknown) => {
      const b = cleanBinding(v)
      return b && b.id.length <= MAX_ID_CHARS ? b : null
    }
    out.startBinding = bound(raw.startBinding)
    out.endBinding = bound(raw.endBinding)
  }
  if (finite(raw.opacity)) out.opacity = Math.min(1, Math.max(0, raw.opacity))
  if (type === 'image' && !sanitizeImage(raw, out)) return null
  if (type === 'frame') {
    // frames are never rotated (M2)
    out.angle = 0
    out.name = typeof raw.name === 'string' ? raw.name.slice(0, MAX_FRAME_NAME_CHARS) : ''
  }
  return normalizeElement(out) as unknown as ElementInit
}

/**
 * Image props into `out`; false when the image cannot be used. `src` must be an http(s) or raster data URL
 * (blob: URLs die with the page that made them, so they are refused too); the natural size is clamped to
 * [0, 1e5] (0 = unknown) and the crop to the natural image (an empty or invalid crop becomes null).
 */
function sanitizeImage(raw: Record<string, unknown>, out: Record<string, unknown>): boolean {
  if (!isImageSrc(raw.src, false)) return false
  out.src = raw.src
  const nw = finite(raw.naturalW) ? clamp(raw.naturalW, 0, MAX_NATURAL) : 0
  const nh = finite(raw.naturalH) ? clamp(raw.naturalH, 0, MAX_NATURAL) : 0
  out.naturalW = nw
  out.naturalH = nh
  out.crop = null
  const c = raw.crop
  if (isRecord(c) && finite(c.x) && finite(c.y) && finite(c.w) && finite(c.h) && nw > 0 && nh > 0) {
    const x = clamp(c.x, 0, nw)
    const y = clamp(c.y, 0, nh)
    const w = clamp(c.w, 0, nw - x)
    const h = clamp(c.h, 0, nh - y)
    if (w > 0 && h > 0) out.crop = { x, y, w, h }
  }
  return true
}

/** The parts of a DataTransfer that `clipboardImageFiles` reads. */
export interface FileSource {
  files?: FileList | readonly File[] | null
  items?: DataTransferItemList | ArrayLike<Pick<DataTransferItem, 'kind' | 'type' | 'getAsFile'>> | null
}

/**
 * Image files a paste should insert: those in `files` always win; an image only offered as an `item` (e.g. a
 * browser copying a web page offers text plus a rendered image) is used only when there is no `text/plain`
 * (so our own payload or text is pasted instead).
 */
export function pastedImageFiles(data: (FileSource & { getData?(type: string): string }) | null | undefined): File[] {
  if (!data) return []
  const files = clipboardImageFiles({ files: data.files })
  if (files.length) return files
  const text = data.getData?.('text/plain') ?? ''
  return text.trim() ? [] : clipboardImageFiles({ items: data.items })
}

/**
 * Image files on a paste / drop payload: from `files`, else from file `items`. Non-image files (and SVG) are
 * left out; the caller ignores them.
 */
export function clipboardImageFiles(data: FileSource | null | undefined): File[] {
  if (!data) return []
  const out: File[] = []
  for (const f of Array.from(data.files ?? [])) if (isImageFile(f)) out.push(f)
  if (out.length || !data.items) return out
  for (const item of Array.from(data.items as ArrayLike<DataTransferItem>)) {
    if (item.kind !== 'file' || !isImageFile(item)) continue
    const f = item.getAsFile()
    if (f && isImageFile(f)) out.push(f)
  }
  return out
}
