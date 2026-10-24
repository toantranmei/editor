import rough from 'roughjs'
import type { Drawable } from 'roughjs/bin/core'
import { type Point, polylineDistance } from '../geometry/math'
import { pointInPolygon } from '../geometry/polygon'
import type { LocalPoint, ShapeElement, ShapeType } from '../model/types'
import { cornerRadius, displayColor, hasFill, roughOptions, type Theme } from '../render/shapes'
import { measureText } from '../text/measure'
import { type ElementKind, hashString, shapeKeyOf } from './kind'
import { outlinePoints, shapeOutline } from './outlines'
import { drawTextBlock, MIN_LOD_TEXT_PX, svgTextBlock, type TextBlock } from './text'
import { escXml } from '../io/xml'

/** Horizontal padding between the shape box and its label. */
const LABEL_PAD = 8

/**
 * Box of the label `text` in the shape's local frame: the padded box width, the wrapped block centered
 * vertically. Shared by drawing and the label editor overlay.
 */
export function labelBox(el: ShapeElement, text: string): { x: number; y: number; w: number; h: number; lines: string[] } {
  const w = Math.max(0, el.w - 2 * LABEL_PAD)
  const { lines, h } = measureText(text, el, w)
  return { x: LABEL_PAD, y: (el.h - h) / 2, w, h, lines }
}

/** Label lines wrapped to the padded box width, the block centered vertically in the box. */
function labelBlock(el: ShapeElement, theme: Theme): TextBlock | null {
  if (el.label === '') return null
  const { lines, x, y, w } = labelBox(el, el.label)
  return { lines, style: el, color: displayColor(el.stroke, theme), x, y, w }
}

function roundedRectPath(w: number, h: number, r: number): string {
  return `M ${r} 0 L ${w - r} 0 Q ${w} 0, ${w} ${r} L ${w} ${h - r} Q ${w} ${h}, ${w - r} ${h}`
    + ` L ${r} ${h} Q 0 ${h}, 0 ${h - r} L 0 ${r} Q 0 0, ${r} 0 Z`
}

const generator = rough.generator()

/** Shapes drawn by their M0 code paths (kept byte-identical); every other type is drawn from `shapeOutline`. */
const M0_SHAPES: ReadonlySet<ShapeType> = new Set<ShapeType>(['rectangle', 'ellipse', 'diamond'])
const isM0Shape = (type: ShapeType): boolean => M0_SHAPES.has(type)

/** roughjs drawable for an outline-based shape (same options and seed as the M0 shapes). */
function outlineDrawable(el: ShapeElement, o: ReturnType<typeof roughOptions>): Drawable {
  const outline = shapeOutline(el.type, el.w, el.h)
  if (outline.kind === 'polygon') return generator.polygon(outline.points, o)
  const d = generator.path(outline.d, o)
  if (!outline.detail) return d
  // stroke-only detail (cylinder front edge) appended as extra sets, so canvas and SVG draw it in order
  const detail = generator.path(outline.detail, { ...o, fill: undefined })
  return { ...d, sets: [...d.sets, ...detail.sets] }
}
const MAX_DRAWABLES = 5000
/** LRU of drawables keyed by `shapeKey:theme` (content-addressed, so moved/rotated copies share one). */
const drawables = new Map<string, Drawable>()

function shapeKey(el: ShapeElement): string {
  return hashString(JSON.stringify([
    el.type, el.w, el.h, el.stroke, el.fill, el.fillStyle, el.strokeWidth, el.strokeStyle, el.roughness,
    el.roundness, el.seed, el.label, el.fontFamily, el.fontSize, el.textAlign,
  ]))
}

/** roughjs drawable for the shape in its local, unrotated frame: box (0,0)–(w,h). */
export function shapeFor(el: ShapeElement, theme: Theme = 'light'): Drawable {
  const key = `${shapeKeyOf(el)}:${theme}`
  let d = drawables.get(key)
  if (d) {
    // refresh recency (Map iteration order = insertion order)
    drawables.delete(key)
    drawables.set(key, d)
    return d
  }
  const o = roughOptions(el, theme)
  const { w, h } = el
  switch (el.type) {
    case 'ellipse':
      d = generator.ellipse(w / 2, h / 2, w, h, o)
      break
    case 'diamond':
      d = generator.polygon([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]], o)
      break
    case 'rectangle':
      d = el.roundness === 'round' && cornerRadius(el) > 0
        ? generator.path(roundedRectPath(w, h, cornerRadius(el)), o)
        : generator.rectangle(0, 0, w, h, o)
      break
    default:
      d = outlineDrawable(el, o)
  }
  drawables.set(key, d)
  if (drawables.size > MAX_DRAWABLES) drawables.delete(drawables.keys().next().value!)
  return d
}

/** Plain geometric path in the element's centered frame (used for LOD). */
function plainPath(ctx: CanvasRenderingContext2D, el: ShapeElement): void {
  const hw = el.w / 2
  const hh = el.h / 2
  ctx.beginPath()
  if (!isM0Shape(el.type)) {
    const pts = outlinePoints(shapeOutline(el.type, el.w, el.h))
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x - hw, y - hh) : ctx.moveTo(x - hw, y - hh)))
    ctx.closePath()
  } else if (el.type === 'ellipse') {
    ctx.ellipse(0, 0, Math.abs(hw), Math.abs(hh), 0, 0, Math.PI * 2)
  } else if (el.type === 'diamond') {
    ctx.moveTo(0, -hh)
    ctx.lineTo(hw, 0)
    ctx.lineTo(0, hh)
    ctx.lineTo(-hw, 0)
    ctx.closePath()
  } else if (el.roundness === 'round' && typeof ctx.roundRect === 'function') {
    ctx.roundRect(-hw, -hh, el.w, el.h, cornerRadius(el))
  } else {
    ctx.rect(-hw, -hh, el.w, el.h)
  }
}

/** Inside flag and distance to the outline of an outline-based shape, `local` in the box frame. */
function outlineMetrics(el: ShapeElement, local: Point) {
  const pts = outlinePoints(shapeOutline(el.type, el.w, el.h))
  const closed: LocalPoint[] = pts.length ? [...pts, pts[0]!] : pts
  return {
    inside: pointInPolygon(local, pts.map(([x, y]) => ({ x, y }))),
    dist: polylineDistance(closed, local),
  }
}

/** Inside flag and approximate distance to the outline, relative to the box center. */
function shapeMetrics(type: ShapeElement['type'], dx: number, dy: number, hw: number, hh: number) {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (type === 'ellipse') {
    if (hw === 0 || hh === 0) return { inside: false, dist: Math.hypot(ax, ay) }
    const f = Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2)
    return { inside: f <= 1, dist: Math.abs(f - 1) * Math.min(hw, hh) }
  }
  if (type === 'diamond') {
    if (hw === 0 || hh === 0) return { inside: false, dist: Math.hypot(ax, ay) }
    const s = ax / hw + ay / hh
    return { inside: s <= 1, dist: Math.abs(s - 1) * (hw * hh) / Math.hypot(hw, hh) }
  }
  const ox = ax - hw
  const oy = ay - hh
  if (ox <= 0 && oy <= 0) return { inside: true, dist: Math.min(-ox, -oy) }
  return { inside: false, dist: Math.hypot(Math.max(ox, 0), Math.max(oy, 0)) }
}

const num = (n: number): string => String(Math.round(n * 100) / 100)

/** Every shape type (rectangle / ellipse / diamond on their M0 paths, the rest from `shapeOutline`), with an optional centered label. */
export const shapeKind: ElementKind<ShapeElement> = {
  visualPad: el => el.strokeWidth + el.roughness * 4,

  shapeKey,

  draw(ctx, el, theme) {
    rough.canvas(ctx.canvas).draw(shapeFor(el, theme))
    const label = labelBlock(el, theme)
    if (label) drawTextBlock(ctx, label)
  },

  drawLod(ctx, el, theme, zoom) {
    plainPath(ctx, el)
    if (hasFill(el)) {
      ctx.fillStyle = displayColor(el.fill, theme)
      ctx.fill()
    }
    ctx.strokeStyle = displayColor(el.stroke, theme)
    ctx.lineWidth = Math.max(1 / zoom, el.strokeWidth)
    ctx.stroke()
    // the label as plain text (layout cached by measure.ts), skipped when too small to read
    const label = el.fontSize * zoom >= MIN_LOD_TEXT_PX ? labelBlock(el, theme) : null
    if (label) {
      // drawLod's origin is the box center
      ctx.save()
      ctx.translate(-el.w / 2, -el.h / 2)
      drawTextBlock(ctx, label)
      ctx.restore()
    }
  },

  svg(el, theme) {
    const dash = roughOptions(el, theme).strokeLineDash
    const drawable = shapeFor(el, theme)
    // toPaths yields one path per set, in order; only 'path' sets are dashed (as on canvas)
    const label = labelBlock(el, theme)
    return generator.toPaths(drawable).map((p, i) => {
      const dashAttr = dash && drawable.sets[i]?.type === 'path' ? ` stroke-dasharray="${dash.map(num).join(' ')}"` : ''
      const strokeAttr = p.stroke ? ` stroke="${escXml(p.stroke)}" stroke-width="${num(p.strokeWidth)}"` : ''
      return `<path d="${escXml(p.d)}"${strokeAttr} fill="${escXml(p.fill || 'none')}"${dashAttr}/>`
    }).join('') + (label ? svgTextBlock(label) : '')
  },

  hit(el, local, tol) {
    const hw = el.w / 2
    const hh = el.h / 2
    const m = isM0Shape(el.type) ? shapeMetrics(el.type, local.x - hw, local.y - hh, hw, hh) : outlineMetrics(el, local)
    if (hasFill(el) && m.inside) return true
    return m.dist <= tol + el.strokeWidth / 2
  },

  resize: (_el, next) => ({ x: next.x, y: next.y, w: next.w, h: next.h }),
}
