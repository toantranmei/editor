import { elementCorners } from '../geometry/bounds'
import type { Box } from '../geometry/math'
import { escXml } from '../io/xml'
import type { Scene } from '../model/scene'
import { type ElementPatch, type FrameElement, isFrame, type SketchElement } from '../model/types'
import type { Theme } from '../render/shapes'
import { FONT_FAMILIES } from '../text/fonts'
import { type ElementKind, hashString } from './kind'

/** Frame border / name color per theme. */
export const FRAME_COLOR: Record<Theme, string> = { light: '#868e96', dark: '#adb5bd' }
/** A frame name is cut to this many characters. */
export const FRAME_NAME_MAX = 200
/** Min width / height of a frame drawn with the frame tool, scene units. */
export const FRAME_MIN = 40
/** Name label font size, screen px (never scales with zoom). */
export const FRAME_LABEL_PX = 12

const num = (n: number): string => String(Math.round(n * 100) / 100)

/** Device px per scene unit of the current transform. */
function deviceScale(ctx: CanvasRenderingContext2D): number {
  const t = typeof ctx.getTransform === 'function' ? ctx.getTransform() : undefined
  return t && Number.isFinite(t.a) ? Math.hypot(t.a, t.b) || 1 : 1
}

const cssPx = (): number => (typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1)

/**
 * A frame: a thin 1 px (screen) border, no fill. Its name is drawn by the interactive layer (render/frame-labels),
 * not in the bitmap, so it stays 12 px at every zoom. Hits only on the border band: clicks inside reach the
 * children or start a marquee.
 */
export const frameKind: ElementKind<FrameElement> = {
  visualPad: () => 2,

  shapeKey: el => hashString(JSON.stringify(['frame', el.w, el.h])),

  draw(ctx, el, theme) {
    ctx.save()
    ctx.setLineDash([])
    ctx.lineWidth = cssPx() / deviceScale(ctx)
    ctx.strokeStyle = FRAME_COLOR[theme]
    ctx.strokeRect(0, 0, el.w, el.h)
    ctx.restore()
  },

  drawLod(ctx, el, theme, zoom) {
    ctx.save()
    ctx.setLineDash([])
    ctx.lineWidth = 1 / zoom
    ctx.strokeStyle = FRAME_COLOR[theme]
    ctx.strokeRect(-el.w / 2, -el.h / 2, el.w, el.h)
    ctx.restore()
  },

  svg: (el, theme) =>
    `<rect x="0" y="0" width="${num(el.w)}" height="${num(el.h)}" fill="none" stroke="${FRAME_COLOR[theme]}" stroke-width="1"/>`
    + (el.name
      ? `<text x="0" y="-6" font-family="${escXml(FONT_FAMILIES.normal)}" font-size="${FRAME_LABEL_PX}" fill="${FRAME_COLOR[theme]}">${escXml(el.name)}</text>`
      : ''),

  hit(el, local, tol) {
    const inOuter = local.x >= -tol && local.x <= el.w + tol && local.y >= -tol && local.y <= el.h + tol
    const inInner = local.x > tol && local.x < el.w - tol && local.y > tol && local.y < el.h - tol
    return inOuter && !inInner
  },

  resize: (_el, next) => ({ x: next.x, y: next.y, w: next.w, h: next.h }),
}

/** Frames are never rotated (M2): no rotate handle. */
export const canRotate = (el: SketchElement): boolean => !isFrame(el)

const frameBox = (f: FrameElement): Box => ({ minX: f.x, minY: f.y, maxX: f.x + f.w, maxY: f.y + f.h })

/** Whether all 4 corners of `el`'s unpadded rotated box lie inside frame `f`'s box. */
export function insideFrame(el: SketchElement, f: FrameElement): boolean {
  const b = frameBox(f)
  return elementCorners(el).every(c => c.x >= b.minX && c.x <= b.maxX && c.y >= b.minY && c.y <= b.maxY)
}

/** The topmost frame whose box fully contains `el`'s corners, or null. Frames never nest (null for a frame). */
export function frameMembership(scene: Scene, el: SketchElement): string | null {
  if (isFrame(el)) return null
  const corners = elementCorners(el)
  const box: Box = {
    minX: Math.min(...corners.map(c => c.x)), minY: Math.min(...corners.map(c => c.y)),
    maxX: Math.max(...corners.map(c => c.x)), maxY: Math.max(...corners.map(c => c.y)),
  }
  const found = scene.queryBox(box)
  for (let i = found.length - 1; i >= 0; i--) {
    const f = found[i]!
    if (f.id !== el.id && isFrame(f) && insideFrame(el, f)) return f.id
  }
  return null
}

/** Elements whose `frameId` is `frameId`, in z-order. */
export function childrenOf(scene: Scene, frameId: string): SketchElement[] {
  return scene.elements.filter(el => el.frameId === frameId)
}

/**
 * `els` plus the children of every frame among them (deduplicated, first occurrence kept): what moving `els`
 * actually moves. Locked children stay put.
 */
export function withFrameChildren(scene: Scene, els: readonly SketchElement[]): SketchElement[] {
  const out = new Map<string, SketchElement>()
  for (const el of els) out.set(el.id, el)
  for (const el of els) {
    if (!isFrame(el)) continue
    for (const child of childrenOf(scene, el.id)) {
      if (!child.locked && !out.has(child.id)) out.set(child.id, child)
    }
  }
  return [...out.values()]
}

/**
 * Ids whose membership may have changed after `ids` moved / resized / appeared: the elements themselves, and for
 * every frame among them its current children and every element now inside its box.
 */
export function affectedByChange(scene: Scene, ids: Iterable<string>): Set<string> {
  const out = new Set<string>()
  for (const id of ids) {
    const el = scene.get(id)
    if (!el) continue
    out.add(id)
    if (!isFrame(el)) continue
    for (const child of childrenOf(scene, id)) out.add(child.id)
    for (const other of scene.queryBox(frameBox(el))) {
      if (!isFrame(other) && insideFrame(other, el)) out.add(other.id)
    }
  }
  return out
}

/** `frameId` patches for the elements among `ids` whose membership changed (scene state as it is now). */
export function membershipPatches(scene: Scene, ids: Iterable<string>): Record<string, ElementPatch> {
  const out: Record<string, ElementPatch> = {}
  for (const id of affectedByChange(scene, ids)) {
    const el = scene.get(id)
    if (!el) continue
    const next = frameMembership(scene, el)
    if (next !== el.frameId) out[id] = { frameId: next }
  }
  return out
}

/** Patches clearing `frameId` on the children of the frames among `ids` (those not deleted themselves). */
export function frameDeletePatches(scene: Scene, ids: readonly string[]): Record<string, ElementPatch> {
  const gone = new Set(ids)
  const out: Record<string, ElementPatch> = {}
  for (const el of scene.elements) {
    if (el.frameId && gone.has(el.frameId) && !gone.has(el.id)) out[el.id] = { frameId: null }
  }
  return out
}

/** Single-line frame name: line breaks become spaces, cut to FRAME_NAME_MAX. */
export function cleanFrameName(raw: string): string {
  return raw.replace(/\r\n?|\n/g, ' ').slice(0, FRAME_NAME_MAX)
}
