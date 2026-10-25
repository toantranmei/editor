import { kindOf, shapeKeyOf } from '../elements/kind'
import type { Scene } from '../model/scene'
import type { SketchElement } from '../model/types'
import type { Theme } from './shapes'

export const MAX_BITMAP_SIDE = 4096
const LOG_SQRT2 = Math.log(Math.SQRT2)

/** Nearest power of √2, so bitmaps are not rebuilt on every wheel tick. */
export function zoomBucket(zoom: number): number {
  return Math.SQRT2 ** Math.round(Math.log(zoom) / LOG_SQRT2)
}

export function cacheKey(el: SketchElement, zoom: number, dpr: number, theme: Theme): string {
  return `${el.id}:${shapeKeyOf(el)}:${zoomBucket(zoom)}:${dpr}:${theme}`
}

/** Scene-unit padding around the element box so ink beyond it (rough strokes) is not clipped. */
export function bitmapPad(el: SketchElement): number {
  return kindOf(el).visualPad(el)
}

/**
 * Binding rule: elements always have w, h >= 0 — tools normalize them before writing —
 * so bitmap sizing does not take absolute values.
 */

/** Device-pixel scale of an element's bitmap: zoomBucket(zoom) * dpr, reduced so no side exceeds MAX_BITMAP_SIDE. */
export function bitmapScale(el: SketchElement, zoom: number, dpr: number): number {
  const pad = bitmapPad(el)
  const s = zoomBucket(zoom) * dpr
  const longest = Math.max(el.w + 2 * pad, el.h + 2 * pad) * s
  return longest > MAX_BITMAP_SIDE ? s * (MAX_BITMAP_SIDE / longest) : s
}

/** Rasterizes the unrotated element (its kind's `draw`), box padded by `bitmapPad`, at `bitmapScale`. */
export function buildBitmap(el: SketchElement, zoom: number, dpr: number, theme: Theme): HTMLCanvasElement {
  const pad = bitmapPad(el)
  const s = bitmapScale(el, zoom, dpr)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.min(MAX_BITMAP_SIDE, Math.ceil((el.w + 2 * pad) * s)))
  canvas.height = Math.max(1, Math.min(MAX_BITMAP_SIDE, Math.ceil((el.h + 2 * pad) * s)))
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.setTransform(s, 0, 0, s, pad * s, pad * s)
  kindOf(el).draw(ctx, el, theme, { dpr })
  return canvas
}

const idOf = (key: string) => key.slice(0, key.indexOf(':'))

/** LRU cache of per-element bitmaps bounded by total pixel count. */
export class BitmapCache {
  private readonly map = new Map<string, HTMLCanvasElement>()
  private readonly byId = new Map<string, Set<string>>()
  private total = 0

  constructor(private readonly maxPixels = 64e6) {}

  get pixels(): number {
    return this.total
  }

  get(key: string): HTMLCanvasElement | undefined {
    const c = this.map.get(key)
    if (c) {
      // refresh recency (Map iteration order = insertion order)
      this.map.delete(key)
      this.map.set(key, c)
    }
    return c
  }

  set(key: string, canvas: HTMLCanvasElement): void {
    this.remove(key)
    this.map.set(key, canvas)
    const id = idOf(key)
    let keys = this.byId.get(id)
    if (!keys) this.byId.set(id, (keys = new Set()))
    keys.add(key)
    this.total += canvas.width * canvas.height
    for (const k of this.map.keys()) {
      if (this.total <= this.maxPixels || k === key) break
      this.remove(k)
    }
  }

  deleteElement(id: string): void {
    const keys = this.byId.get(id)
    if (!keys) return
    for (const k of [...keys]) this.remove(k)
  }

  /** Drops the keys of `id` that do not start with `keepPrefix` (e.g. bitmaps of an old shapeKey). */
  pruneElement(id: string, keepPrefix: string): void {
    const keys = this.byId.get(id)
    if (!keys) return
    for (const k of [...keys]) {
      if (!k.startsWith(keepPrefix)) this.remove(k)
    }
  }

  clear(): void {
    this.map.clear()
    this.byId.clear()
    this.total = 0
  }

  private remove(key: string): void {
    const c = this.map.get(key)
    if (!c) return
    this.map.delete(key)
    this.total -= c.width * c.height
    const id = idOf(key)
    const keys = this.byId.get(id)
    keys?.delete(key)
    if (keys && !keys.size) this.byId.delete(id)
  }
}

/**
 * Frees bitmaps that can no longer be hit: for changed elements those of an outdated shapeKey
 * (moves and rotations keep theirs), for removed elements all of them. Keys are content-addressed,
 * so correctness does not depend on this; it only bounds memory.
 */
export function bindCacheInvalidation(scene: Scene, cache: BitmapCache): () => void {
  return scene.onChange(ids => {
    for (const id of ids) {
      const el = scene.get(id)
      if (el) cache.pruneElement(id, `${id}:${shapeKeyOf(el)}:`)
      else cache.deleteElement(id)
    }
  })
}
