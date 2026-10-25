import { canRotate } from '../elements/frame'
import { blendsMultiply } from '../elements/freedraw'
import { drawImagePlaceholder } from '../elements/image'
import { kindOf } from '../elements/kind'
import { hasTransformHandles } from '../elements/linear'
import { type Box, type Handle, handlePositions, type Point } from '../geometry'
import { bindOutline } from '../geometry/binding'
import type { Guide } from '../geometry/snap'
import { getLoadedImage } from '../io/image-loader'
import type { Scene } from '../model/scene'
import type { ImageElement, SketchElement } from '../model/types'
import { cropHandles } from '../tools/crop'
import { bitmapPad, bitmapScale, buildBitmap, cacheKey } from './bitmap-cache'
import { drawFrameLabels } from './frame-labels'
import { applyViewTransform, type RenderState } from './static'

/** A rect in an element's unrotated local frame (origin at its box's top-left). */
export interface CropBox { x: number; y: number; w: number; h: number }

/** Crop mode: the whole image (`full`) and the crop rect, both in the image's local frame. */
export interface CropOverlay {
  id: string
  el: ImageElement
  full: CropBox
  rect: CropBox
}

export interface Overlay {
  selectedIds: Set<string>
  marquee: Box | null
  hoverId: string | null
  draft: SketchElement | null
  /** Editable points of the single selected line/arrow (scene coords). */
  pointHandles: Point[] | null
  /** Multi-point line/arrow in progress: last placed point → pointer (scene coords). */
  previewSegment: [Point, Point] | null
  /** Elements marked by the eraser: hidden on the static layer, drawn faded here. */
  erasing: Set<string>
  /** Laser trail (scene coords; `t` in ms on the clock `now` comes from; `start` begins a stroke). */
  laser: { x: number; y: number; t: number; start?: boolean }[]
  /** Lasso polygon in progress (scene coords). */
  lasso: Point[] | null
  /** Current clock time for the laser fade (defaults to `performance.now()`). */
  now?: number
  /** Image being cropped (its static rendering is hidden meanwhile). */
  crop?: CropOverlay | null
  /** Frame being renamed: its name label is left to the editor. */
  editingFrameId?: string | null
  /** Element an arrow endpoint being drawn / dragged would bind to: outlined in the accent color. */
  bindTarget: string | null
  /** Snap guides of the gesture in progress (scene coords): accent lines, 1 screen px. */
  guides: Guide[]
}

/** Opacity factor of the image outside the crop rect. */
export const CROP_DIM_ALPHA = 0.35

/** Opacity factor of erase-marked elements. */
export const ERASING_ALPHA = 0.3
export const LASER_COLOR = '#e03131'
const LASER_FADE_MS = 1000
const LASER_WIDTH_PX = 4

const FALLBACK_ACCENT = '#2383e2'
const HANDLE_PX = 8
const SELECTION_GAP_PX = 4
/** Line width of the bind target's outline, screen px. */
const BIND_TARGET_PX = 2

let accentCache = new WeakMap<HTMLCanvasElement, string>()

/** Forget cached accent colors (call on theme change). */
export function resetAccentCache(): void {
  accentCache = new WeakMap()
}

/** `--me-accent` of the canvas, read once per canvas (getComputedStyle forces style recalc). */
function readAccent(canvas: HTMLCanvasElement | undefined): string {
  if (!canvas || typeof getComputedStyle !== 'function') return FALLBACK_ACCENT
  let accent = accentCache.get(canvas)
  if (accent !== undefined) return accent
  try {
    accent = getComputedStyle(canvas).getPropertyValue('--me-accent').trim() || FALLBACK_ACCENT
  } catch {
    accent = FALLBACK_ACCENT
  }
  accentCache.set(canvas, accent)
  return accent
}

/** Sets the element's rotated, centered frame on top of the view transform `s`. */
function elementFrame(ctx: CanvasRenderingContext2D, state: RenderState, cx: number, cy: number, angle: number) {
  const vp = state.viewport
  const s = state.dpr * vp.zoom
  ctx.setTransform(s, 0, 0, s, -vp.x * s, -vp.y * s)
  ctx.translate(cx, cy)
  if (angle) ctx.rotate(angle)
}

/** Bitmaps of knockout elements drawn on the overlay, by cache key (few: erase-marked elements and the draft). */
const knockoutBitmaps = new Map<string, HTMLCanvasElement>()
const MAX_KNOCKOUT_BITMAPS = 16

/** `el`'s own bitmap (as the static layer builds it), memoized in a small LRU. */
function knockoutBitmap(el: SketchElement, state: RenderState): HTMLCanvasElement {
  const zoom = state.viewport.zoom
  const key = cacheKey(el, zoom, state.dpr, state.theme)
  let bmp = knockoutBitmaps.get(key)
  if (bmp) knockoutBitmaps.delete(key)
  else bmp = buildBitmap(el, zoom, state.dpr, state.theme)
  knockoutBitmaps.set(key, bmp)
  if (knockoutBitmaps.size > MAX_KNOCKOUT_BITMAPS) knockoutBitmaps.delete(knockoutBitmaps.keys().next().value!)
  return bmp
}

/**
 * Draws `el` with its kind's full-fidelity draw, in its element frame, at `alpha`. A kind that knocks pixels out
 * (a labeled line) is rasterized onto its own bitmap first and composited, so it never erases overlay ink.
 */
function drawElement(
  ctx: CanvasRenderingContext2D, state: RenderState, el: SketchElement, alpha: number,
): void {
  ctx.globalAlpha = alpha
  elementFrame(ctx, state, el.x + el.w / 2, el.y + el.h / 2, el.angle)
  const multiply = blendsMultiply(el, state.theme)
  if (multiply) ctx.globalCompositeOperation = 'multiply'
  const kind = kindOf(el)
  if (kind.knockout?.(el)) {
    // same placement as the static layer's bitmaps (centered frame, padded box, exact scale)
    const bmp = knockoutBitmap(el, state)
    const pad = bitmapPad(el)
    const s = bitmapScale(el, state.viewport.zoom, state.dpr)
    ctx.drawImage(bmp, -el.w / 2 - pad, -el.h / 2 - pad, bmp.width / s, bmp.height / s)
  } else {
    ctx.translate(-el.w / 2, -el.h / 2)
    kind.draw(ctx, el, state.theme, { dpr: state.dpr })
  }
  if (multiply) ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

/** Laser trail: each segment fades linearly with the age of its newer point; a lone stroke start is a dot. */
function drawLaser(ctx: CanvasRenderingContext2D, state: RenderState, trail: Overlay['laser'], now: number): void {
  const zoom = state.viewport.zoom
  elementFrame(ctx, state, 0, 0, 0)
  ctx.strokeStyle = LASER_COLOR
  ctx.fillStyle = LASER_COLOR
  ctx.lineWidth = LASER_WIDTH_PX / zoom
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([])
  const alphaOf = (t: number) => Math.max(0, Math.min(1, 1 - (now - t) / LASER_FADE_MS))
  for (let i = 0; i < trail.length; i++) {
    const p = trail[i]!
    const next = trail[i + 1]
    if (i === 0 || p.start) {
      if (next && !next.start) continue
      // a stroke of one point
      const a = alphaOf(p.t)
      if (a <= 0) continue
      ctx.globalAlpha = a
      ctx.beginPath()
      ctx.arc(p.x, p.y, LASER_WIDTH_PX / zoom / 2, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    const a = alphaOf(p.t)
    if (a <= 0) continue
    const prev = trail[i - 1]!
    ctx.globalAlpha = a
    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
}

/** Crop mode: the whole image dimmed, the crop rect at full opacity, its outline and 8 handles. */
function drawCrop(ctx: CanvasRenderingContext2D, state: RenderState, crop: CropOverlay, accent: string): void {
  const { el, full, rect } = crop
  const zoom = state.viewport.zoom
  elementFrame(ctx, state, el.x + el.w / 2, el.y + el.h / 2, el.angle)
  ctx.translate(-el.w / 2, -el.h / 2)
  const found = getLoadedImage(el.src)
  const img = found && found !== 'error' ? found : null
  const paint = (): void => {
    if (img) {
      try {
        ctx.drawImage(img, 0, 0, el.naturalW, el.naturalH, full.x, full.y, full.w, full.h)
        return
      } catch {
        // undecodable: placeholder below
      }
    }
    ctx.save()
    ctx.translate(full.x, full.y)
    drawImagePlaceholder(ctx, full.w, full.h, state.theme)
    ctx.restore()
  }
  ctx.globalAlpha = el.opacity * CROP_DIM_ALPHA
  paint()
  ctx.globalAlpha = el.opacity
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.w, rect.h)
  ctx.clip()
  paint()
  ctx.restore()
  ctx.globalAlpha = 1
  ctx.setLineDash([])
  ctx.strokeStyle = accent
  ctx.lineWidth = 1 / zoom
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
  const size = HANDLE_PX / zoom
  ctx.fillStyle = '#ffffff'
  for (const p of Object.values(cropHandles(rect))) {
    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size)
    ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size)
  }
}

function outline(ctx: CanvasRenderingContext2D, el: SketchElement, gap: number): void {
  ctx.strokeRect(-el.w / 2 - gap, -el.h / 2 - gap, el.w + 2 * gap, el.h + 2 * gap)
}

/**
 * Draws transient UI: the draft element (its kind's full-fidelity draw), the multi-point preview segment, the
 * bind target, hover, selection, handles, point handles, marquee.
 */
export function renderInteractive(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  state: RenderState,
  overlay: Overlay,
): void {
  const zoom = state.viewport.zoom
  const accent = readAccent(ctx.canvas)
  applyViewTransform(ctx, state)

  // frame names sit above the static layer, in screen-size text
  drawFrameLabels(ctx, scene, state, overlay.editingFrameId ?? null)

  // erase-marked elements are skipped on the static layer and drawn faded here, in z-order
  if (overlay.erasing.size) {
    for (const el of scene.elements) {
      if (overlay.erasing.has(el.id)) drawElement(ctx, state, el, el.opacity * ERASING_ALPHA)
    }
  }

  const { draft } = overlay
  if (draft) drawElement(ctx, state, draft, draft.opacity)

  if (overlay.crop) drawCrop(ctx, state, overlay.crop, accent)

  ctx.strokeStyle = accent
  ctx.lineWidth = 1 / zoom

  const seg = overlay.previewSegment
  if (seg) {
    elementFrame(ctx, state, 0, 0, 0)
    ctx.setLineDash([4 / zoom, 4 / zoom])
    ctx.beginPath()
    ctx.moveTo(seg[0].x, seg[0].y)
    ctx.lineTo(seg[1].x, seg[1].y)
    ctx.stroke()
    ctx.setLineDash([])
  }

  const bind = overlay.bindTarget ? scene.get(overlay.bindTarget) : undefined
  if (bind) {
    // the outline the endpoint will bind to, slightly bolder than the hover outline
    const pts = bindOutline(bind)
    ctx.setLineDash([])
    ctx.lineWidth = BIND_TARGET_PX / zoom
    elementFrame(ctx, state, bind.x + bind.w / 2, bind.y + bind.h / 2, bind.angle)
    ctx.translate(-bind.w / 2, -bind.h / 2)
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.closePath()
    ctx.stroke()
    ctx.lineWidth = 1 / zoom
  }

  if (overlay.hoverId && !overlay.selectedIds.has(overlay.hoverId)) {
    const el = scene.get(overlay.hoverId)
    if (el) {
      ctx.setLineDash([])
      elementFrame(ctx, state, el.x + el.w / 2, el.y + el.h / 2, el.angle)
      outline(ctx, el, 0)
    }
  }

  const selected: SketchElement[] = []
  for (const id of overlay.selectedIds) {
    const el = scene.get(id)
    if (el) selected.push(el)
  }
  ctx.setLineDash([4 / zoom, 4 / zoom])
  for (const el of selected) {
    elementFrame(ctx, state, el.x + el.w / 2, el.y + el.h / 2, el.angle)
    outline(ctx, el, SELECTION_GAP_PX / zoom)
  }
  ctx.setLineDash([])

  if (selected.length === 1 && hasTransformHandles(selected[0]!)) {
    const el = selected[0]!
    const size = HANDLE_PX / zoom
    const handles = handlePositions(el, zoom)
    ctx.fillStyle = '#ffffff'
    for (const k of Object.keys(handles) as Handle[]) {
      if (k === 'rotate' && !canRotate(el)) continue
      const p = handles[k]
      elementFrame(ctx, state, p.x, p.y, el.angle)
      ctx.fillRect(-size / 2, -size / 2, size, size)
      ctx.strokeRect(-size / 2, -size / 2, size, size)
    }
  }

  if (overlay.pointHandles) {
    const r = HANDLE_PX / zoom / 2
    elementFrame(ctx, state, 0, 0, 0)
    ctx.fillStyle = '#ffffff'
    for (const p of overlay.pointHandles) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  const lasso = overlay.lasso
  if (lasso && lasso.length > 1) {
    elementFrame(ctx, state, 0, 0, 0)
    ctx.strokeStyle = accent
    ctx.lineWidth = 1 / zoom
    ctx.setLineDash([4 / zoom, 4 / zoom])
    ctx.beginPath()
    ctx.moveTo(lasso[0]!.x, lasso[0]!.y)
    for (let i = 1; i < lasso.length; i++) ctx.lineTo(lasso[i]!.x, lasso[i]!.y)
    ctx.closePath()
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.1
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (overlay.laser.length) {
    drawLaser(ctx, state, overlay.laser, overlay.now ?? performance.now())
    ctx.strokeStyle = accent
    ctx.lineWidth = 1 / zoom
  }

  if (overlay.guides.length) {
    elementFrame(ctx, state, 0, 0, 0)
    ctx.strokeStyle = accent
    ctx.lineWidth = 1 / zoom
    ctx.setLineDash([])
    ctx.beginPath()
    for (const g of overlay.guides) {
      ctx.moveTo(g.x1, g.y1)
      ctx.lineTo(g.x2, g.y2)
    }
    ctx.stroke()
  }

  const m = overlay.marquee
  if (m) {
    elementFrame(ctx, state, 0, 0, 0)
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.1
    ctx.fillRect(m.minX, m.minY, m.maxX - m.minX, m.maxY - m.minY)
    ctx.globalAlpha = 1
    ctx.strokeRect(m.minX, m.minY, m.maxX - m.minX, m.maxY - m.minY)
  }
}
