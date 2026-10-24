import { blendsMultiply } from '../elements/freedraw'
import { kindOf } from '../elements/kind'
import { hasTransformHandles } from '../elements/linear'
import { type Box, type Handle, handlePositions, type Point } from '../geometry'
import type { Scene } from '../model/scene'
import type { SketchElement } from '../model/types'
import { applyViewTransform, type RenderState } from './static'

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
}

/** Opacity factor of erase-marked elements. */
export const ERASING_ALPHA = 0.3
export const LASER_COLOR = '#e03131'
const LASER_FADE_MS = 1000
const LASER_WIDTH_PX = 4

const FALLBACK_ACCENT = '#2383e2'
const HANDLE_PX = 8
const SELECTION_GAP_PX = 4

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

/** Draws `el` with its kind's full-fidelity draw, in its element frame, at `alpha`. */
function drawElement(
  ctx: CanvasRenderingContext2D, state: RenderState, el: SketchElement, alpha: number,
): void {
  ctx.globalAlpha = alpha
  elementFrame(ctx, state, el.x + el.w / 2, el.y + el.h / 2, el.angle)
  ctx.translate(-el.w / 2, -el.h / 2)
  const multiply = blendsMultiply(el, state.theme)
  if (multiply) ctx.globalCompositeOperation = 'multiply'
  kindOf(el).draw(ctx, el, state.theme)
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

function outline(ctx: CanvasRenderingContext2D, el: SketchElement, gap: number): void {
  ctx.strokeRect(-el.w / 2 - gap, -el.h / 2 - gap, el.w + 2 * gap, el.h + 2 * gap)
}

/**
 * Draws transient UI: the draft element (its kind's full-fidelity draw), the multi-point preview segment,
 * hover, selection, handles, point handles, marquee.
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

  // erase-marked elements are skipped on the static layer and drawn faded here, in z-order
  if (overlay.erasing.size) {
    for (const el of scene.elements) {
      if (overlay.erasing.has(el.id)) drawElement(ctx, state, el, el.opacity * ERASING_ALPHA)
    }
  }

  const { draft } = overlay
  if (draft) drawElement(ctx, state, draft, draft.opacity)

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
