import { effectiveCrop } from '../elements/image'
import { boxCenter } from '../geometry/bounds'
import { type Point, rotatePoint } from '../geometry/math'
import type { ElementPatch, ImageCrop, ImageElement } from '../model/types'
import type { CropBox, CropOverlay } from '../render/interactive'
import type { PointerInput, Tool, ToolHost } from './controller'

export type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/** Hit tolerance of the crop handles, screen px. */
const HANDLE_HIT_PX = 8
/** Smallest crop rect side, screen px. */
const MIN_CROP_PX = 8

const CURSORS: Record<CropHandle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Crop frame of `el` in its unrotated local frame (origin at the box's top-left): `full` is where the whole
 * natural image lies at the element's current scale, `rect` the visible box (0,0)–(w,h). Null when the image
 * cannot be cropped (unknown natural size or an empty box).
 */
export function cropFrame(el: ImageElement): { full: CropBox; rect: CropBox } | null {
  const c = effectiveCrop(el)
  if (!(el.naturalW > 0 && el.naturalH > 0 && c.w > 0 && c.h > 0 && el.w > 0 && el.h > 0)) return null
  const sx = el.w / c.w
  const sy = el.h / c.h
  return {
    full: { x: 0 - c.x * sx, y: 0 - c.y * sy, w: el.naturalW * sx, h: el.naturalH * sy },
    rect: { x: 0, y: 0, w: el.w, h: el.h },
  }
}

/**
 * The crop (natural px) that makes `el` show `rect` (its local frame, within the full image), clamped to the
 * natural image; null when it covers the whole image.
 */
export function rectToCrop(el: ImageElement, rect: CropBox): ImageCrop | null {
  const c = effectiveCrop(el)
  const sx = el.w / c.w
  const sy = el.h / c.h
  const nw = el.naturalW
  const nh = el.naturalH
  const x = clamp(c.x + rect.x / sx, 0, nw)
  const y = clamp(c.y + rect.y / sy, 0, nh)
  const crop = { x, y, w: clamp(rect.w / sx, 0, nw - x), h: clamp(rect.h / sy, 0, nh - y) }
  const eps = 1e-6
  const whole = crop.x < eps && crop.y < eps && Math.abs(crop.w - nw) < eps && Math.abs(crop.h - nh) < eps
  return whole ? null : crop
}

/**
 * The patch giving the current element `cur` the crop `crop` (null = whole image): the box moves / resizes so
 * the image keeps `cur`'s scale and position (rotation kept about the new center). Null when `cur` cannot take
 * it (unknown natural size, empty box).
 */
export function applyCrop(cur: ImageElement, crop: ImageCrop | null): ElementPatch | null {
  const c0 = effectiveCrop(cur)
  const c = crop ?? { x: 0, y: 0, w: cur.naturalW, h: cur.naturalH }
  if (!(c0.w > 0 && c0.h > 0 && c.w > 0 && c.h > 0)) return null
  const sx = cur.w / c0.w
  const sy = cur.h / c0.h
  const w = c.w * sx
  const h = c.h * sy
  const dx = (c.x - c0.x) * sx
  const dy = (c.y - c0.y) * sy
  const center = rotatePoint({ x: cur.x + dx + w / 2, y: cur.y + dy + h / 2 }, boxCenter(cur), cur.angle)
  return { x: center.x - w / 2, y: center.y - h / 2, w, h, crop: crop ? { ...crop } : null }
}

/**
 * The patch that makes the image show `rect` (in the local frame of `el`, the snapshot crop mode started
 * from), applied to `cur` (the element now, default `el`): the crop is taken from the snapshot, the box from
 * the current element, so a concurrent remote move / resize is kept. Null when nothing changes.
 */
export function cropPatch(el: ImageElement, rect: CropBox, cur: ImageElement = el): ElementPatch | null {
  if (rect.x === 0 && rect.y === 0 && rect.w === el.w && rect.h === el.h) return null
  return applyCrop(cur, rectToCrop(el, rect))
}

/** The 8 handle positions of `rect` (local frame). */
export function cropHandles(rect: CropBox): Record<CropHandle, Point> {
  const { x, y, w, h } = rect
  return {
    nw: { x, y }, n: { x: x + w / 2, y }, ne: { x: x + w, y },
    e: { x: x + w, y: y + h / 2 }, se: { x: x + w, y: y + h }, s: { x: x + w / 2, y: y + h },
    sw: { x, y: y + h }, w: { x, y: y + h / 2 },
  }
}

type Drag =
  | { kind: 'handle'; handle: CropHandle }
  | { kind: 'move'; start: Point; rect0: CropBox }

/**
 * Crop mode for one image: dragging a handle moves that edge / corner of the crop rect, dragging inside moves
 * the rect, both kept within the full image. Holds no store state: the controller writes `patch()` once on
 * commit (one undo step) or drops it on cancel.
 */
export class CropTool implements Tool {
  private el: ImageElement | null = null
  private full: CropBox = { x: 0, y: 0, w: 0, h: 0 }
  private rect: CropBox = { x: 0, y: 0, w: 0, h: 0 }
  private drag: Drag | null = null

  constructor(private readonly host: ToolHost) {}

  /** Starts cropping `el`; false when it cannot be cropped. */
  begin(el: ImageElement): boolean {
    const frame = cropFrame(el)
    if (!frame) return false
    this.el = el
    this.full = frame.full
    this.rect = frame.rect
    this.drag = null
    return true
  }

  end(): void {
    this.el = null
    this.drag = null
  }

  /** The patch for the current crop rect applied to `cur` (the element now); null = unchanged / not cropping. */
  patch(cur?: ImageElement): ElementPatch | null {
    return this.el ? cropPatch(this.el, this.rect, cur ?? this.el) : null
  }

  overlay(): CropOverlay | null {
    const el = this.el
    return el ? { id: el.id, el, full: { ...this.full }, rect: { ...this.rect } } : null
  }

  /** Whether the press at scene point `p` grabs a handle or the crop rect (starting that drag). */
  grab(p: Point): boolean {
    const el = this.el
    if (!el) return false
    const q = this.toLocal(p)
    const handle = this.handleAt(q)
    if (handle) {
      this.drag = { kind: 'handle', handle }
      return true
    }
    const r = this.rect
    if (q.x >= r.x && q.x <= r.x + r.w && q.y >= r.y && q.y <= r.y + r.h) {
      this.drag = { kind: 'move', start: q, rect0: { ...r } }
      return true
    }
    return false
  }

  down(_e: PointerInput, p: Point): void {
    this.grab(p)
  }

  move(_e: PointerInput, p: Point): void {
    const d = this.drag
    if (!d || !this.el) return
    const q = this.toLocal(p)
    const f = this.full
    if (d.kind === 'move') {
      const r = d.rect0
      const x = clamp(r.x + q.x - d.start.x, f.x, f.x + f.w - r.w)
      const y = clamp(r.y + q.y - d.start.y, f.y, f.y + f.h - r.h)
      this.rect = { ...r, x, y }
    } else {
      const min = Math.min(MIN_CROP_PX / this.host.ctx.viewport.zoom, f.w, f.h)
      const r = this.rect
      let left = r.x
      let top = r.y
      let right = r.x + r.w
      let bottom = r.y + r.h
      const h = d.handle
      if (h.includes('w')) left = clamp(q.x, f.x, right - min)
      if (h.includes('e')) right = clamp(q.x, left + min, f.x + f.w)
      if (h.includes('n')) top = clamp(q.y, f.y, bottom - min)
      if (h.includes('s')) bottom = clamp(q.y, top + min, f.y + f.h)
      this.rect = { x: left, y: top, w: right - left, h: bottom - top }
    }
    this.host.ctx.invalidate()
  }

  up(e: PointerInput, p: Point): void {
    this.move(e, p)
    this.drag = null
    this.hover(e, p)
  }

  hover(_e: PointerInput, p: Point): void {
    if (!this.el) return
    const q = this.toLocal(p)
    const handle = this.handleAt(q)
    const r = this.rect
    const inside = q.x >= r.x && q.x <= r.x + r.w && q.y >= r.y && q.y <= r.y + r.h
    this.host.cursor.value = handle ? CURSORS[handle] : inside ? 'move' : 'default'
  }

  cancel(): void {
    this.drag = null
  }

  /** Scene point → the image's unrotated local frame (origin at its top-left). */
  private toLocal(p: Point): Point {
    const el = this.el!
    const q = rotatePoint(p, boxCenter(el), -el.angle)
    return { x: q.x - el.x, y: q.y - el.y }
  }

  private handleAt(q: Point): CropHandle | null {
    const tol = HANDLE_HIT_PX / this.host.ctx.viewport.zoom
    let best: CropHandle | null = null
    let bestD = Infinity
    const handles = cropHandles(this.rect)
    for (const k of Object.keys(handles) as CropHandle[]) {
      const h = handles[k]
      const d = Math.max(Math.abs(h.x - q.x), Math.abs(h.y - q.y))
      if (d <= tol && d < bestD) {
        best = k
        bestD = d
      }
    }
    return best
  }
}
