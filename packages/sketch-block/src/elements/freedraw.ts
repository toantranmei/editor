import { getStroke } from 'perfect-freehand'
import { polylineDistance, scalePoints } from '../geometry/math'
import type { FreedrawElement, LocalPoint } from '../model/types'
import { displayColor, type Theme } from '../render/shapes'
import { type ElementKind, hashString } from './kind'

/** Highlighter ink opacity (multiplied with the element's opacity). */
const HIGHLIGHTER_ALPHA = 0.4

/** perfect-freehand base diameter: pen 1→5, 2→8, 4→14; highlighter 1→15, 2→24, 4→42. */
export function strokeSize(el: Pick<FreedrawElement, 'strokeWidth' | 'highlighter'>): number {
  return el.highlighter ? el.strokeWidth * 3 * 3 + 6 : el.strokeWidth * 3 + 2
}

const outlines = new WeakMap<FreedrawElement, number[][]>()

/** Filled outline polygon of the stroke, in the local frame (memoized per element snapshot). */
export function strokeOutline(el: FreedrawElement): number[][] {
  let o = outlines.get(el)
  if (o) return o
  const withPressure = el.pressures.length === el.points.length && el.pressures.length > 0
  const input = withPressure ? el.points.map(([x, y], i) => [x, y, el.pressures[i]!]) : el.points.map(([x, y]) => [x, y])
  o = getStroke(input, {
    size: strokeSize(el),
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: el.pressures.length === 0,
  })
  outlines.set(el, o)
  return o
}

const num = (n: number): string => String(Math.round(n * 100) / 100)
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

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

/** Highlighter: translucent ink, multiplied onto light backgrounds (multiply would vanish on dark). */
function applyInk(ctx: CanvasRenderingContext2D, el: FreedrawElement, theme: Theme): void {
  if (!el.highlighter) return
  ctx.globalAlpha = ctx.globalAlpha * HIGHLIGHTER_ALPHA
  if (theme === 'light') ctx.globalCompositeOperation = 'multiply'
}

/** Pen and highlighter strokes: a filled perfect-freehand outline. */
export const freedrawKind: ElementKind<FreedrawElement> = {
  visualPad: el => strokeSize(el) / 2 + 2,

  shapeKey: el => hashString(JSON.stringify([
    el.type, el.highlighter, el.stroke, el.strokeWidth, el.w, el.h, hashString(JSON.stringify([el.points, el.pressures])),
  ])),

  draw(ctx, el, theme) {
    const outline = strokeOutline(el)
    ctx.save()
    applyInk(ctx, el, theme)
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
    applyInk(ctx, el, theme)
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
    const ink = el.highlighter ? ` opacity="${HIGHLIGHTER_ALPHA}" style="mix-blend-mode:multiply"` : ''
    return `<path d="${esc(d)}" fill="${esc(displayColor(el.stroke, theme))}"${ink}/>`
  },

  hit: (el, local, tol) => polylineDistance(el.points, local) <= tol + strokeSize(el) / 2,

  resize: (el, next) => ({
    x: next.x, y: next.y, w: next.w, h: next.h, points: scalePoints(el.points, el, next) as LocalPoint[],
  }),
}
