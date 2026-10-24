import rough from 'roughjs'
import type { Drawable } from 'roughjs/bin/core'
import type { ShapeElement } from '../model/types'
import { cornerRadius, displayColor, hasFill, roughOptions, type Theme } from '../render/shapes'
import { type ElementKind, hashString, shapeKeyOf } from './kind'

function roundedRectPath(w: number, h: number, r: number): string {
  return `M ${r} 0 L ${w - r} 0 Q ${w} 0, ${w} ${r} L ${w} ${h - r} Q ${w} ${h}, ${w - r} ${h}`
    + ` L ${r} ${h} Q 0 ${h}, 0 ${h - r} L 0 ${r} Q 0 0, ${r} 0 Z`
}

const generator = rough.generator()
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
    default:
      d = el.roundness === 'round' && cornerRadius(el) > 0
        ? generator.path(roundedRectPath(w, h, cornerRadius(el)), o)
        : generator.rectangle(0, 0, w, h, o)
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
  if (el.type === 'ellipse') {
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
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** rectangle / ellipse / diamond. The label is part of the key but drawn from Task 3 on. */
export const shapeKind: ElementKind<ShapeElement> = {
  visualPad: el => el.strokeWidth + el.roughness * 4,

  shapeKey,

  draw(ctx, el, theme) {
    rough.canvas(ctx.canvas).draw(shapeFor(el, theme))
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
  },

  svg(el, theme) {
    const dash = roughOptions(el, theme).strokeLineDash
    const drawable = shapeFor(el, theme)
    // toPaths yields one path per set, in order; only 'path' sets are dashed (as on canvas)
    return generator.toPaths(drawable).map((p, i) => {
      const dashAttr = dash && drawable.sets[i]?.type === 'path' ? ` stroke-dasharray="${dash.map(num).join(' ')}"` : ''
      const strokeAttr = p.stroke ? ` stroke="${esc(p.stroke)}" stroke-width="${num(p.strokeWidth)}"` : ''
      return `<path d="${esc(p.d)}"${strokeAttr} fill="${esc(p.fill || 'none')}"${dashAttr}/>`
    }).join('')
  },

  hit(el, local, tol) {
    const hw = el.w / 2
    const hh = el.h / 2
    const m = shapeMetrics(el.type, local.x - hw, local.y - hh, hw, hh)
    if (hasFill(el) && m.inside) return true
    return m.dist <= tol + el.strokeWidth / 2
  },

  resize: (_el, next) => ({ x: next.x, y: next.y, w: next.w, h: next.h }),
}
