import { getStroke } from 'perfect-freehand'
import { polylineDistance, scalePoints } from '../geometry/math'
import { type FreedrawElement, isFreedraw, type LocalPoint, type SketchElement } from '../model/types'
import { displayColor, type Theme } from '../render/shapes'
import { type ElementKind, hashArray, hashString } from './kind'
import { escXml } from '../io/xml'

/** Highlighter ink opacity (multiplied with the element's opacity). */
const HIGHLIGHTER_ALPHA = 0.4

/** perfect-freehand base diameter: pen 1→5, 2→8, 4→14; highlighter 1→15, 2→24, 4→42. */
export function strokeSize(el: Pick<FreedrawElement, 'strokeWidth' | 'highlighter'>): number {
  return el.highlighter ? el.strokeWidth * 3 * 3 + 6 : el.strokeWidth * 3 + 2
}

/** perfect-freehand's radius at pressure 1 with thinning 0.6: size * (0.5 + 0.6 * 0.5). */
const MAX_RADIUS = 0.8

const hasPressures = (el: FreedrawElement): boolean =>
  el.pressures.length > 0 && el.pressures.length === el.points.length

/** Ink half-width estimate used for hit-testing (simulated pressure stays near size / 2). */
const halfWidth = (el: FreedrawElement): number => strokeSize(el) * (hasPressures(el) ? MAX_RADIUS : 0.5)

const outlines = new WeakMap<FreedrawElement, number[][]>()
const liveOutlines = new WeakMap<FreedrawElement, number[][]>()

/**
 * Filled outline polygon of the stroke, in the local frame (memoized per element snapshot).
 * Committed strokes are finished (`last: true`, full end cap); `live` is for the in-progress pen draft.
 */
export function strokeOutline(el: FreedrawElement, opts?: { live?: boolean }): number[][] {
  const live = !!opts?.live
  const memo = live ? liveOutlines : outlines
  let o = memo.get(el)
  if (o) return o
  const withPressure = hasPressures(el)
  const input = withPressure ? el.points.map(([x, y], i) => [x, y, el.pressures[i]!]) : el.points.map(([x, y]) => [x, y])
  o = getStroke(input, {
    size: strokeSize(el),
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: !withPressure,
    last: !live,
  })
  memo.set(el, o)
  return o
}

const num = (n: number): string => String(Math.round(n * 100) / 100)

const mid = (a: number[], b: number[]): [number, number] => [(a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2]

/** SVG path data for an outline: quadratic curves through edge midpoints (outline points as controls), closed. */
export function outlineToPath(outline: number[][]): string {
  const n = outline.length
  if (n === 0) return ''
  const first = outline[0]!
  let d = `M ${num(first[0]!)} ${num(first[1]!)}`
  for (let i = 0; i < n; i++) {
    const p = outline[i]!
    const [mx, my] = mid(p, outline[(i + 1) % n]!)
    d += ` Q ${num(p[0]!)} ${num(p[1]!)} ${num(mx)} ${num(my)}`
  }
  return `${d} Z`
}

/** Same geometry as outlineToPath, traced on the context (no Path2D available). */
function traceOutline(ctx: CanvasRenderingContext2D, outline: number[][]): void {
  const n = outline.length
  ctx.beginPath()
  if (n === 0) return
  ctx.moveTo(outline[0]![0]!, outline[0]![1]!)
  for (let i = 0; i < n; i++) {
    const p = outline[i]!
    const [mx, my] = mid(p, outline[(i + 1) % n]!)
    ctx.quadraticCurveTo(p[0]!, p[1]!, mx, my)
  }
  ctx.closePath()
}

/**
 * Whether the element's ink is composited onto the scene with `multiply`: highlighters in light theme
 * (multiply would vanish on dark). Callers drawing straight onto the scene (static bitmaps, draft) apply it.
 */
export function blendsMultiply(el: SketchElement, theme: Theme): boolean {
  return isFreedraw(el) && el.highlighter && theme === 'light'
}

/** Highlighter: translucent ink (source-over; the scene blend is applied when compositing). */
function applyAlpha(ctx: CanvasRenderingContext2D, el: FreedrawElement): void {
  if (el.highlighter) ctx.globalAlpha = ctx.globalAlpha * HIGHLIGHTER_ALPHA
}

/** Pen and highlighter strokes: a filled perfect-freehand outline. */
export const freedrawKind: ElementKind<FreedrawElement> = {
  visualPad: el => MAX_RADIUS * strokeSize(el) + 2,

  shapeKey: el => hashString(JSON.stringify([
    el.type, el.highlighter, el.stroke, el.strokeWidth, el.w, el.h, hashArray(el.points), hashArray(el.pressures),
  ])),

  draw(ctx, el, theme) {
    const outline = strokeOutline(el)
    ctx.save()
    applyAlpha(ctx, el)
    ctx.fillStyle = displayColor(el.stroke, theme)
    if (typeof Path2D === 'function') {
      ctx.fill(new Path2D(outlineToPath(outline)))
    } else {
      traceOutline(ctx, outline)
      ctx.fill()
    }
    ctx.restore()
  },

  drawLod(ctx, el, theme, zoom) {
    ctx.save()
    applyAlpha(ctx, el)
    if (blendsMultiply(el, theme)) ctx.globalCompositeOperation = 'multiply'
    ctx.beginPath()
    el.points.forEach(([x, y], i) => {
      const lx = x - el.w / 2
      const ly = y - el.h / 2
      if (i === 0) ctx.moveTo(lx, ly)
      else ctx.lineTo(lx, ly)
    })
    if (el.points.length === 1) ctx.lineTo(el.points[0]![0] - el.w / 2, el.points[0]![1] - el.h / 2)
    ctx.strokeStyle = displayColor(el.stroke, theme)
    ctx.lineWidth = Math.max(1 / zoom, strokeSize(el))
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.restore()
  },

  svg(el, theme) {
    const d = outlineToPath(strokeOutline(el))
    const blend = blendsMultiply(el, theme) ? ' style="mix-blend-mode:multiply"' : ''
    const ink = el.highlighter ? ` opacity="${HIGHLIGHTER_ALPHA}"${blend}` : ''
    return `<path d="${escXml(d)}" fill="${escXml(displayColor(el.stroke, theme))}"${ink}/>`
  },

  hit: (el, local, tol) => polylineDistance(el.points, local) <= tol + halfWidth(el),

  resize: (el, next) => ({
    x: next.x, y: next.y, w: next.w, h: next.h, points: scalePoints(el.points, el, next) as LocalPoint[],
  }),
}
