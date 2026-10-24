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
}

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

  const { draft } = overlay
  if (draft) {
    ctx.globalAlpha = draft.opacity
    elementFrame(ctx, state, draft.x + draft.w / 2, draft.y + draft.h / 2, draft.angle)
    ctx.translate(-draft.w / 2, -draft.h / 2)
    const multiply = blendsMultiply(draft, state.theme)
    if (multiply) ctx.globalCompositeOperation = 'multiply'
    kindOf(draft).draw(ctx, draft, state.theme)
    if (multiply) ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

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
