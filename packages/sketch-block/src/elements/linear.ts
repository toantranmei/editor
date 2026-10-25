import rough from 'roughjs'
import type { Drawable, Options } from 'roughjs/bin/core'
import { type Point, polylineDistance, rotatePoint, scalePoints } from '../geometry/math'
import { type Arrowhead, isLinear, type LinearElement, type LocalPoint, type SketchElement } from '../model/types'
import { displayColor, roughOptions, type Theme } from '../render/shapes'
import { type ElementKind, hashArray, hashString, shapeKeyOf } from './kind'
import { escXml } from '../io/xml'
import { measureText, memoByElement } from '../text/measure'
import { drawTextBlock, MIN_LOD_TEXT_PX, svgTextBlock, type TextBlock } from './text'

/** Points the shaft actually passes through, in the local frame. */
export function routePoints(el: LinearElement): LocalPoint[] {
  if (el.routing !== 'elbow' || el.points.length < 2) return el.points
  const p0 = el.points[0]!
  const pn = el.points[el.points.length - 1]!
  if (Math.abs(pn[0] - p0[0]) >= Math.abs(pn[1] - p0[1])) {
    const mx = (p0[0] + pn[0]) / 2
    return [p0, [mx, p0[1]], [mx, pn[1]], pn]
  }
  const my = (p0[1] + pn[1]) / 2
  return [p0, [p0[0], my], [pn[0], my], pn]
}

/** Samples per curve span in `curvePoints`. */
const CURVE_STEPS = 16

/**
 * The curve roughjs draws through `route` (`generator.curve`, curveTightness 0, before its random offsets): a
 * Catmull-Rom spline as cubic Béziers, the end points doubled. Sampled CURVE_STEPS per span; every route point is
 * on it. Fewer than 3 points: the route itself.
 */
export function curvePoints(route: readonly LocalPoint[]): LocalPoint[] {
  if (route.length < 3) return route.map(p => [p[0], p[1]])
  const pts = [route[0]!, ...route, route[route.length - 1]!]
  const out: LocalPoint[] = [[pts[1]![0], pts[1]![1]]]
  for (let i = 1; i + 2 < pts.length; i++) {
    const p0 = pts[i - 1]!
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p3 = pts[i + 2]!
    const c1: LocalPoint = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: LocalPoint = [p2[0] + (p1[0] - p3[0]) / 6, p2[1] + (p1[1] - p3[1]) / 6]
    for (let k = 1; k <= CURVE_STEPS; k++) {
      if (k === CURVE_STEPS) {
        out.push([p2[0], p2[1]])
        break
      }
      const t = k / CURVE_STEPS
      const u = 1 - t
      const a = u * u * u
      const b = 3 * u * u * t
      const c = 3 * u * t * t
      const d = t * t * t
      out.push([a * p1[0] + b * c1[0] + c * c2[0] + d * p2[0], a * p1[1] + b * c1[1] + c * c2[1] + d * p2[1]])
    }
  }
  return out
}

const isCurved = (el: LinearElement, route: readonly LocalPoint[]): boolean => el.routing === 'curved' && route.length > 2

/** The polyline the shaft is drawn along (local frame): the sampled curve for a curved line, else the route. */
export function shaftPoints(el: LinearElement): LocalPoint[] {
  const route = routePoints(el)
  return isCurved(el, route) ? curvePoints(route) : route
}

/** Point at half the length of `pts` (a polyline); the first point when it has no length. */
export function polylineMidpoint(pts: readonly LocalPoint[]): Point {
  if (pts.length === 0) return { x: 0, y: 0 }
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1])
  let left = total / 2
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const d = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (d > 0 && left <= d) {
      const t = left / d
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t }
    }
    left -= d
  }
  return { x: pts[0]![0], y: pts[0]![1] }
}

/** Where a line / arrow label sits (local frame): the midpoint along the drawn shaft (route or sampled curve). */
export const labelMidpoint = (el: LinearElement): Point => polylineMidpoint(shaftPoints(el))

/** Space kept clear of the shaft around the label text, scene units. */
export const LABEL_CLEAR = 4

/**
 * Box of the label `text` in the line's local frame: auto-width (one line per newline, never wrapped), centered on
 * the shaft midpoint. Shared by drawing, hit-testing and the label editor overlay.
 */
export function linearLabelBox(el: LinearElement, text: string): { x: number; y: number; w: number; h: number; lines: string[] } {
  const { w, h, lines } = measureText(text, el, null)
  const m = labelMidpoint(el)
  return { x: m.x - w / 2, y: m.y - h / 2, w, h, lines }
}

/** The label as a text block (null without a label). Memoized per snapshot. */
const labelBlock = memoByElement((el: LinearElement, theme: Theme): (TextBlock & { h: number }) | null => {
  if (el.label === '') return null
  const { lines, x, y, w, h } = linearLabelBox(el, el.label)
  return { lines, style: el, color: displayColor(el.stroke, theme), x, y, w, h }
})

/** A mask / element id safe inside attributes and `url(#…)`, unique per element id. */
const labelMaskId = (id: string): string => `me-sketch-label-${id.replace(/[^\w-]/g, '_')}-${hashString(id)}`

export interface ArrowheadShape {
  kind: 'polyline' | 'polygon' | 'circle' | 'line'
  points: LocalPoint[]
  r?: number
}

const HEAD_HALF_ANGLE = (25 * Math.PI) / 180

export const arrowheadLength = (strokeWidth: number): number => 10 + strokeWidth * 3

/**
 * Head geometry at `tip`, the shaft arriving from `from`.
 * arrow: open polyline wing–tip–wing; triangle: polygon tip–wing–wing; dot: circle at the tip;
 * bar: perpendicular line centered on the tip. Wings are `length` long, 25° off the shaft.
 */
export function arrowheadPoints(
  head: Exclude<Arrowhead, 'none'>,
  tip: LocalPoint,
  from: LocalPoint,
  strokeWidth: number,
): ArrowheadShape {
  if (head === 'dot') return { kind: 'circle', points: [tip], r: 3 + strokeWidth }
  const len = arrowheadLength(strokeWidth)
  const dx = tip[0] - from[0]
  const dy = tip[1] - from[1]
  const d = Math.hypot(dx, dy)
  const [ux, uy] = d === 0 ? [1, 0] : [dx / d, dy / d]
  if (head === 'bar') {
    const h = len / 2
    return { kind: 'line', points: [[tip[0] - uy * h, tip[1] + ux * h], [tip[0] + uy * h, tip[1] - ux * h]] }
  }
  const wing = (a: number): LocalPoint => {
    // `back` (-u) rotated by a
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    return [tip[0] + len * (-ux * cos + uy * sin), tip[1] + len * (-ux * sin - uy * cos)]
  }
  const w1 = wing(HEAD_HALF_ANGLE)
  const w2 = wing(-HEAD_HALF_ANGLE)
  return head === 'arrow' ? { kind: 'polyline', points: [w1, tip, w2] } : { kind: 'polygon', points: [tip, w1, w2] }
}

/** Normalizes absolute scene points into a box (w, h ≥ 0) and points relative to its corner. */
export function boxFromPoints(abs: LocalPoint[]): { x: number; y: number; w: number; h: number; points: LocalPoint[] } {
  if (abs.length === 0) return { x: 0, y: 0, w: 0, h: 0, points: [] }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of abs) {
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, points: abs.map(([x, y]) => [x - minX, y - minY]) }
}

/** The element's points in scene coordinates (rotated about the box center). */
export function linearScenePoints(el: LinearElement): Point[] {
  const c = { x: el.x + el.w / 2, y: el.y + el.h / 2 }
  return el.points.map(([x, y]) => rotatePoint({ x: el.x + x, y: el.y + y }, c, el.angle))
}

/**
 * Patch moving point `index` of `el` to scene point `p`: points are re-normalized (w, h ≥ 0) and, for a
 * rotated element, the box is shifted so every other point keeps its scene position.
 */
export function movePointPatch(
  el: LinearElement,
  index: number,
  p: Point,
): { x: number; y: number; w: number; h: number; points: LocalPoint[] } {
  const c0 = { x: el.x + el.w / 2, y: el.y + el.h / 2 }
  // unrotated frame about the original center
  const q = rotatePoint(p, c0, -el.angle)
  const abs = el.points.map(([x, y], i): LocalPoint => (i === index ? [q.x, q.y] : [el.x + x, el.y + y]))
  const box = boxFromPoints(abs)
  if (!el.angle) return box
  // rotating about the new center c1 instead of c0 shifts every point by (R - I)(c1 - c0); undo that
  const d = { x: c0.x - (box.x + box.w / 2), y: c0.y - (box.y + box.h / 2) }
  const rd = rotatePoint(d, { x: 0, y: 0 }, el.angle)
  return { ...box, x: box.x + d.x - rd.x, y: box.y + d.y - rd.y }
}

/** Resize / rotate handles apply to everything except a plain 2-point line or arrow. */
export const hasTransformHandles = (el: SketchElement): boolean => !isLinear(el) || el.points.length > 2

/**
 * Heads with their tip and the point the shaft arrives from: the nearest distinct route point, or on a curve the
 * first point along it at least a head length from the tip (so the head follows the bend, not the chord).
 */
function heads(el: LinearElement, route: LocalPoint[]): ArrowheadShape[] {
  const out: ArrowheadShape[] = []
  if (route.length === 0) return out
  const curved = isCurved(el, route)
  const shaft = curved ? curvePoints(route) : route
  const reach = arrowheadLength(el.strokeWidth)
  const from = (tip: LocalPoint, seq: LocalPoint[]): LocalPoint => {
    if (curved) {
      let last = tip
      for (const p of seq) {
        if (p[0] !== tip[0] || p[1] !== tip[1]) last = p
        if (Math.hypot(p[0] - tip[0], p[1] - tip[1]) >= reach) return p
      }
      return last
    }
    return seq.find(p => p[0] !== tip[0] || p[1] !== tip[1]) ?? tip
  }
  if (el.startArrowhead !== 'none') {
    const tip = shaft[0]!
    out.push(arrowheadPoints(el.startArrowhead, tip, from(tip, shaft.slice(1)), el.strokeWidth))
  }
  if (el.endArrowhead !== 'none') {
    const tip = shaft[shaft.length - 1]!
    out.push(arrowheadPoints(el.endArrowhead, tip, from(tip, shaft.slice(0, -1).reverse()), el.strokeWidth))
  }
  return out
}

/** The arrowheads of `el` in its local frame. */
export const arrowheadsOf = (el: LinearElement): ArrowheadShape[] => heads(el, routePoints(el))

const hasHead = (el: LinearElement): boolean => el.startArrowhead !== 'none' || el.endArrowhead !== 'none'

const generator = rough.generator()
const MAX_DRAWABLES = 5000
/** LRU of drawable lists keyed by `shapeKey:theme` (same scheme as shapes). */
const drawableCache = new Map<string, Drawable[]>()

/** Shaft options: the element's rough style without any fill. */
function shaftOptions(el: LinearElement, theme: Theme): Options {
  const o = roughOptions(el, theme)
  delete o.fill
  delete o.fillStyle
  delete o.fillWeight
  delete o.hachureGap
  return o
}

/** Head options: never dashed; triangle and dot are filled with the stroke color. */
function headOptions(shaft: Options, filled: boolean): Options {
  const { strokeLineDash: _dash, ...o } = shaft
  return filled ? { ...o, fill: o.stroke, fillStyle: 'solid' } : o
}

/** roughjs drawables in the local frame: the shaft first, then start/end heads (same seed). */
export function linearDrawables(el: LinearElement, theme: Theme = 'light'): Drawable[] {
  const key = `${shapeKeyOf(el)}:${theme}`
  let list = drawableCache.get(key)
  if (list) {
    drawableCache.delete(key)
    drawableCache.set(key, list)
    return list
  }
  const o = shaftOptions(el, theme)
  let route = routePoints(el)
  if (route.length === 1) route = [route[0]!, route[0]!]
  list = []
  if (route.length >= 2) {
    list.push(el.routing === 'curved' && route.length > 2
      ? generator.curve(route, o)
      : generator.linearPath(route, o))
  }
  for (const h of heads(el, route)) {
    if (h.kind === 'circle') list.push(generator.circle(h.points[0]![0], h.points[0]![1], 2 * h.r!, headOptions(o, true)))
    else if (h.kind === 'polygon') list.push(generator.polygon(h.points, headOptions(o, true)))
    else if (h.kind === 'line') list.push(generator.line(...h.points[0]!, ...h.points[1]!, headOptions(o, false)))
    else list.push(generator.linearPath(h.points, headOptions(o, false)))
  }
  drawableCache.set(key, list)
  if (drawableCache.size > MAX_DRAWABLES) drawableCache.delete(drawableCache.keys().next().value!)
  return list
}

function plainPolyline(ctx: CanvasRenderingContext2D, pts: LocalPoint[], closed = false): void {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  if (closed) ctx.closePath()
}

const num = (n: number): string => String(Math.round(n * 100) / 100)

/** line / arrow: a rough shaft along `routePoints` with optional heads at either end. */
export const linearKind: ElementKind<LinearElement> = {
  visualPad(el) {
    const ink = el.strokeWidth + el.roughness * 4 + (hasHead(el) ? arrowheadLength(el.strokeWidth) : 0)
    if (el.label === '') return ink
    // the label box may stick out of the line's box (a horizontal line has h = 0); +2 for glyph overshoot
    const b = linearLabelBox(el, el.label)
    return Math.max(ink, Math.max(-b.x, -b.y, b.x + b.w - el.w, b.y + b.h - el.h) + 2)
  },

  shapeKey: el => hashString(JSON.stringify([
    el.type, el.routing, el.startArrowhead, el.endArrowhead, el.stroke, el.strokeWidth, el.strokeStyle,
    el.roughness, el.seed, el.w, el.h, hashArray(el.points),
    // the text style only matters with a label (an unlabeled line keeps its bitmap on a font change)
    ...(el.label === '' ? [] : [el.label, el.fontFamily, el.fontSize, el.textAlign]),
  ])),

  knockout: el => el.label !== '',

  draw(ctx, el, theme) {
    const rc = rough.canvas(ctx.canvas)
    for (const d of linearDrawables(el, theme)) rc.draw(d)
    const label = labelBlock(el, theme)
    if (!label) return
    // drawn onto the element's own bitmap (`knockout`): cut the shaft (and heads) under the text out, then the text
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = '#000000'
    ctx.fillRect(label.x - LABEL_CLEAR, label.y - LABEL_CLEAR, label.w + 2 * LABEL_CLEAR, label.h + 2 * LABEL_CLEAR)
    ctx.restore()
    drawTextBlock(ctx, label)
  },

  drawLod(ctx, el, theme, zoom) {
    const color = displayColor(el.stroke, theme)
    ctx.save()
    ctx.translate(-el.w / 2, -el.h / 2)
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = Math.max(1 / zoom, el.strokeWidth)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    const route = routePoints(el)
    // the label as plain text (layout cached), skipped when too small to read; the shaft is clipped around it
    const label = el.fontSize * zoom >= MIN_LOD_TEXT_PX ? labelBlock(el, theme) : null
    if (label) {
      const pad = linearKind.visualPad(el) + 1
      ctx.save()
      ctx.beginPath()
      ctx.rect(-pad, -pad, el.w + 2 * pad, el.h + 2 * pad)
      ctx.rect(label.x - LABEL_CLEAR, label.y - LABEL_CLEAR, label.w + 2 * LABEL_CLEAR, label.h + 2 * LABEL_CLEAR)
      ctx.clip('evenodd')
    }
    plainPolyline(ctx, isCurved(el, route) ? curvePoints(route) : route)
    ctx.stroke()
    for (const h of heads(el, route)) {
      if (h.kind === 'circle') {
        ctx.beginPath()
        ctx.arc(h.points[0]![0], h.points[0]![1], h.r!, 0, Math.PI * 2)
        ctx.fill()
      } else {
        plainPolyline(ctx, h.points, h.kind === 'polygon')
        if (h.kind === 'polygon') ctx.fill()
        ctx.stroke()
      }
    }
    if (label) {
      ctx.restore()
      drawTextBlock(ctx, label)
    }
    ctx.restore()
  },

  svg(el, theme) {
    const paths = linearDrawables(el, theme).map((drawable) => {
      const dash = drawable.options.strokeLineDash
      // toPaths yields one path per set, in order; only 'path' sets are dashed (as on canvas)
      return generator.toPaths(drawable).map((p, i) => {
        const dashAttr = dash && drawable.sets[i]?.type === 'path' ? ` stroke-dasharray="${dash.map(num).join(' ')}"` : ''
        const strokeAttr = p.stroke ? ` stroke="${escXml(p.stroke)}" stroke-width="${num(p.strokeWidth)}"` : ''
        return `<path d="${escXml(p.d)}"${strokeAttr} fill="${escXml(p.fill || 'none')}"${dashAttr}/>`
      }).join('')
    }).join('')
    const label = labelBlock(el, theme)
    if (!label) return paths
    // a mask cuts the shaft under the text: white everywhere the ink can reach, black over the label (+ clearance)
    const id = labelMaskId(el.id)
    const pad = linearKind.visualPad(el) + 1
    const c = LABEL_CLEAR
    const mask = `<defs><mask id="${escXml(id)}" maskUnits="userSpaceOnUse" x="${num(-pad)}" y="${num(-pad)}"`
      + ` width="${num(el.w + 2 * pad)}" height="${num(el.h + 2 * pad)}">`
      + `<rect x="${num(-pad)}" y="${num(-pad)}" width="${num(el.w + 2 * pad)}" height="${num(el.h + 2 * pad)}" fill="#ffffff"/>`
      + `<rect x="${num(label.x - c)}" y="${num(label.y - c)}" width="${num(label.w + 2 * c)}" height="${num(label.h + 2 * c)}"`
      + ` fill="#000000"/></mask></defs>`
    return `${mask}<g mask="url(#${escXml(id)})">${paths}</g>${svgTextBlock(label)}`
  },

  hit(el, local, tol) {
    if (polylineDistance(shaftPoints(el), local) <= tol + el.strokeWidth / 2) return true
    if (el.label === '') return false
    // the label counts as part of the line
    const b = linearLabelBox(el, el.label)
    return local.x >= b.x - tol && local.x <= b.x + b.w + tol && local.y >= b.y - tol && local.y <= b.y + b.h + tol
  },

  resize: (el, next) => ({
    x: next.x, y: next.y, w: next.w, h: next.h, points: scalePoints(el.points, el, next) as LocalPoint[],
  }),
}
