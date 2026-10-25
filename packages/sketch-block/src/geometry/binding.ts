import { frameDeletePatches } from '../elements/frame'
import { boxFromPoints, linearScenePoints } from '../elements/linear'
import { outlinePoints, shapeOutline } from '../elements/outlines'
import type { Scene } from '../model/scene'
import type { BoardStore } from '../model/store'
import {
  type Binding, type ElementPatch, isBindable, isLinear, isShape, type LinearElement, type LocalPoint,
  type SketchElement,
} from '../model/types'
import { boxCenter } from './bounds'
import { type Point, rotatePoint } from './math'

/** An arrow endpoint released within this many screen px of a bindable outline binds to it. */
export const BIND_PX = 12
/** Distance between a bound arrow tip and the target's outline, scene units. */
export const BIND_GAP = 4
/** Two anchors closer than this (unit coords) on the same element are the same anchor. */
const SAME_ANCHOR = 1e-3
/** Patch keys that change an element's geometry (what bound arrows must follow). */
const GEOMETRY_KEYS = ['x', 'y', 'w', 'h', 'angle', 'points'] as const

/**
 * The outline an arrow binds to, in the element's unrotated local frame (closed polygon): a shape's outline, else
 * its box.
 */
export function bindOutline(el: SketchElement): LocalPoint[] {
  if (isShape(el)) return outlinePoints(shapeOutline(el.type, el.w, el.h))
  return [[0, 0], [el.w, 0], [el.w, el.h], [0, el.h]]
}

/** Nearest point to `q` on the closed polygon `poly`, with its distance. */
function nearestOnPolygon(poly: readonly LocalPoint[], q: Point): { x: number; y: number; d: number } {
  let best = { x: poly[0]?.[0] ?? 0, y: poly[0]?.[1] ?? 0, d: Infinity }
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i]!
    const [bx, by] = poly[(i + 1) % poly.length]!
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - ax) * dx + (q.y - ay) * dy) / len2))
    const x = ax + t * dx
    const y = ay + t * dy
    const d = Math.hypot(q.x - x, q.y - y)
    if (d < best.d) best = { x, y, d }
  }
  return best
}

/** Snaps float noise (e.g. 0.49999999) so anchors on an edge's middle or end read as exact values. */
const tidy = (v: number): number => Math.round(v * 1e9) / 1e9

/**
 * The outline point of `target` nearest to `scenePoint`, as an anchor in the target's unrotated unit box
 * (ax, ay; 0.5 on a zero-size axis), plus the distance to it in scene units.
 */
export function outlineAnchor(target: SketchElement, scenePoint: Point): { ax: number; ay: number; distance: number } {
  const q = rotatePoint(scenePoint, boxCenter(target), -target.angle)
  const n = nearestOnPolygon(bindOutline(target), { x: q.x - target.x, y: q.y - target.y })
  return {
    ax: target.w > 0 ? tidy(n.x / target.w) : 0.5,
    ay: target.h > 0 ? tidy(n.y / target.h) : 0.5,
    distance: n.d,
  }
}

/** The anchor's point on `target` in scene coordinates (no gap). */
function anchorPoint(target: SketchElement, b: Binding): Point {
  const p = { x: target.x + b.ax * target.w, y: target.y + b.ay * target.h }
  return target.angle ? rotatePoint(p, boxCenter(target), target.angle) : p
}

/**
 * Where a tip bound to `target` at `b` sits: the anchor's outline point pushed `gap` outward, approximating the
 * outward normal by the direction from the target's center (towards `from`, the point the shaft comes from,
 * when the anchor is the center itself).
 */
export function anchorScenePoint(target: SketchElement, b: Binding, gap: number, from: Point): Point {
  const p = anchorPoint(target, b)
  const c = boxCenter(target)
  let dx = p.x - c.x
  let dy = p.y - c.y
  let d = Math.hypot(dx, dy)
  if (d < 1e-9) {
    dx = from.x - p.x
    dy = from.y - p.y
    d = Math.hypot(dx, dy)
  }
  if (!(d > 1e-9) || !Number.isFinite(d)) return p
  return { x: p.x + (dx / d) * gap, y: p.y + (dy / d) * gap }
}

/**
 * The topmost bindable element (shape, sticky, text, image) whose outline is within BIND_PX / zoom of `p`, skipping
 * `excludeIds`; null when none.
 */
export function findBindTarget(scene: Scene, p: Point, zoom: number, excludeIds: ReadonlySet<string>): SketchElement | null {
  const tol = BIND_PX / zoom
  const hits = scene.queryBox({ minX: p.x - tol, minY: p.y - tol, maxX: p.x + tol, maxY: p.y + tol })
  for (let i = hits.length - 1; i >= 0; i--) {
    const el = hits[i]!
    if (!isBindable(el) || excludeIds.has(el.id)) continue
    if (outlineAnchor(el, p).distance <= tol) return el
  }
  return null
}

/**
 * The binding an endpoint at `p` gets: to the bind target there (none for a line, which never binds), unless that
 * is the element the other end is bound to at the same anchor (a line from a point to itself). Null = unbound.
 */
export function bindingAt(
  scene: Scene, el: Pick<LinearElement, 'id' | 'type'>, p: Point, zoom: number, other: Binding | null,
): Binding | null {
  if (el.type !== 'arrow') return null
  const target = findBindTarget(scene, p, zoom, new Set([el.id]))
  if (!target) return null
  const { ax, ay } = outlineAnchor(target, p)
  if (other && other.id === target.id && Math.abs(other.ax - ax) < SAME_ANCHOR && Math.abs(other.ay - ay) < SAME_ANCHOR) {
    return null
  }
  return { id: target.id, ax, ay }
}

const finitePoint = (p: Point): boolean => Number.isFinite(p.x) && Number.isFinite(p.y)

/**
 * The patch placing `el`'s bound ends on their targets (looked up with `get`): each bound tip moves to its anchor
 * (BIND_GAP outside the outline), everything else keeps its scene position, and the result is written unrotated
 * (angle 0) so the box stays normalized. A binding whose target is gone (or no longer bindable) is set to null and
 * its point kept. Never produces NaN: a non-finite result keeps the points as they are.
 */
export function boundPatch(el: LinearElement, get: (id: string) => SketchElement | undefined): ElementPatch {
  const patch: ElementPatch = {}
  const resolve = (b: Binding | null): SketchElement | null => {
    if (!b) return null
    const t = get(b.id)
    return t && t.id !== el.id && isBindable(t) ? t : null
  }
  const sb = el.startBinding
  const eb = el.endBinding
  const ts = resolve(sb)
  const te = resolve(eb)
  if (sb && !ts) patch.startBinding = null
  if (eb && !te) patch.endBinding = null
  const pts = linearScenePoints(el)
  const n = pts.length
  if ((!ts && !te) || n < 2) return patch
  const next = [...pts]
  // the neighbour each tip's shaft comes from: on a 2-point line, the other end's anchor when bound
  const rawS = ts ? anchorPoint(ts, sb!) : null
  const rawE = te ? anchorPoint(te, eb!) : null
  if (ts) next[0] = anchorScenePoint(ts, sb!, BIND_GAP, n === 2 && rawE ? rawE : pts[1]!)
  if (te) next[n - 1] = anchorScenePoint(te, eb!, BIND_GAP, n === 2 && rawS ? rawS : pts[n - 2]!)
  if (!next.every(finitePoint)) return patch
  return { ...patch, ...boxFromPoints(next.map(p => [p.x, p.y])), angle: 0 }
}

const changesGeometry = (patch: ElementPatch | undefined): boolean =>
  !!patch && GEOMETRY_KEYS.some(k => patch[k] !== undefined)

/**
 * Patches for the lines bound to `changedIds` (whose geometry changed), so they follow their targets. `pending`
 * holds patches not written yet (they are applied over the scene, and the caller merges the result into the same
 * write). A line in `changedIds` that moved itself lets go of the ends whose target did not change. A binding to
 * a missing target (deleted, e.g. by a remote peer) is set to null in the patch and its point kept. Locked lines
 * are left alone.
 */
export function followBindings(
  store: BoardStore,
  scene: Scene,
  changedIds: Iterable<string>,
  pending: Record<string, ElementPatch> = {},
): Record<string, ElementPatch> {
  const changed = new Set(changedIds)
  const out: Record<string, ElementPatch> = {}
  if (!changed.size) return out
  const get = (id: string): SketchElement | undefined => {
    const base = scene.get(id) ?? store.get(id)
    const p = pending[id]
    return base && p ? { ...base, ...p } as SketchElement : base
  }
  for (const line of scene.elements) {
    // locked elements are never written (as elsewhere): a locked line keeps its points
    if (!isLinear(line) || line.locked) continue
    const s = line.startBinding
    const e = line.endBinding
    if (!s && !e) continue
    const self = changed.has(line.id)
    if (!self && !(s && changed.has(s.id)) && !(e && changed.has(e.id))) continue
    const cur = get(line.id) as LinearElement
    const loose: ElementPatch = {}
    if (self) {
      if (cur.startBinding && !changed.has(cur.startBinding.id)) loose.startBinding = null
      if (cur.endBinding && !changed.has(cur.endBinding.id)) loose.endBinding = null
    }
    const patch = { ...loose, ...boundPatch({ ...cur, ...loose } as LinearElement, get) }
    if (Object.keys(patch).length) out[line.id] = patch
  }
  return out
}

/**
 * `patches` plus the follow-up patches of the lines bound to the elements whose geometry they change, merged per
 * element (a follower's patch wins over its own entry). The single integration point for writers that move,
 * resize or rotate elements.
 */
export function withFollowers(
  store: BoardStore, scene: Scene, patches: Record<string, ElementPatch>,
): Record<string, ElementPatch> {
  const moved = Object.keys(patches).filter(id => changesGeometry(patches[id]))
  const follow = followBindings(store, scene, moved, patches)
  if (!Object.keys(follow).length) return patches
  const out = { ...patches }
  for (const [id, p] of Object.entries(follow)) out[id] = { ...out[id], ...p }
  return out
}

/** Patches clearing the bindings that point at `ids` (being deleted), for the lines that remain. */
export function bindingDeletePatches(scene: Scene, ids: readonly string[]): Record<string, ElementPatch> {
  const gone = new Set(ids)
  const out: Record<string, ElementPatch> = {}
  for (const el of scene.elements) {
    // locked elements are never written: a dangling binding is treated as unbound when followed
    if (!isLinear(el) || el.locked || gone.has(el.id)) continue
    const patch: ElementPatch = {}
    if (el.startBinding && gone.has(el.startBinding.id)) patch.startBinding = null
    if (el.endBinding && gone.has(el.endBinding.id)) patch.endBinding = null
    if (Object.keys(patch).length) out[el.id] = patch
  }
  return out
}

/** Everything deleting `ids` changes on the elements that remain: frame children leave, bindings come loose. */
export function deletePatches(scene: Scene, ids: readonly string[]): Record<string, ElementPatch> {
  const out = frameDeletePatches(scene, ids)
  for (const [id, p] of Object.entries(bindingDeletePatches(scene, ids))) out[id] = { ...out[id], ...p }
  return out
}
