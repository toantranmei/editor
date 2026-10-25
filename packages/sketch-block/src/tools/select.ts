import { canRotate, directLines, membershipPatches, withFrameChildren } from '../elements/frame'
import { kindOf } from '../elements/kind'
import { hasTransformHandles, linearScenePoints, movePointPatch } from '../elements/linear'
import {
  type Box, boxCenter, cornersBox, elementCorners, type Handle, handlePositions, type Point, resizeBox, rotateAngle,
  snapSegment,
} from '../geometry'
import { GRID_SIZE, type Snapper, snapPoint } from '../geometry/snap'
import { bindingAt, boundPatch, followBindings } from '../geometry/binding'
import { type ElementPatch, isImage, isLinear, type LinearElement, type SketchElement } from '../model/types'
import { frameLabelAt } from '../render/frame-labels'
import { onLinkBadge } from '../render/interactive'
import type { PointerInput, Tool, ToolHost } from './controller'

/** Hit tolerances in screen px (divided by zoom → scene units). */
const HIT_PX = 6
const HANDLE_HIT_PX = 8
/** A move snaps only once the pointer has travelled farther than this from the press, screen px. */
const DRAG_PX = 3

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', rotate: 'alias',
}

type Gesture =
  | { kind: 'move'; start: Point; origins: SketchElement[]; detach: Set<string>; box: Box | null; snap: Snapper; dragging: boolean }
  | { kind: 'resize'; handle: Exclude<Handle, 'rotate'>; el: SketchElement; snap: Snapper }
  | { kind: 'rotate'; el: SketchElement }
  | { kind: 'point'; el: LinearElement; index: number }
  | { kind: 'marquee'; start: Point; base: Set<string> }
  | { kind: 'none' }

/** Batches element patches to at most one `store.updateMany` per animation frame. */
class FrameWriter {
  private pending: Record<string, ElementPatch> | null = null
  private scheduled = false
  /** Keys written to the store per element id since the last `reset`. */
  readonly touched = new Map<string, Set<string>>()
  /** Each written element as it was before its first write since the last `reset` (what a cancel restores). */
  readonly snapshots = new Map<string, SketchElement>()
  /** Ids taken out of the gesture since the last `reset` (deleted remotely mid-gesture). */
  private readonly forgotten = new Set<string>()

  constructor(
    private readonly write: (patches: Record<string, ElementPatch>) => void,
    private readonly snapshot: (id: string) => SketchElement | undefined,
  ) {}

  set(patches: Record<string, ElementPatch>): void {
    this.pending = patches
    if (this.scheduled) return
    this.scheduled = true
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16)
    raf(() => {
      this.scheduled = false
      this.flush()
    })
  }

  flush(): void {
    const p = this.pending
    this.pending = null
    if (!p) return
    const out: Record<string, ElementPatch> = {}
    for (const [id, patch] of Object.entries(p)) {
      // left the gesture (deleted by a peer): never written again, even if it comes back
      if (this.forgotten.has(id)) continue
      let keys = this.touched.get(id)
      if (!keys) {
        const before = this.snapshot(id)
        // gone (a peer deleted it): nothing to write, and nothing to revert
        if (!before) continue
        this.touched.set(id, keys = new Set())
        this.snapshots.set(id, before)
      }
      for (const k of Object.keys(patch)) keys.add(k)
      out[id] = patch
    }
    if (Object.keys(out).length) this.write(out)
  }

  drop(): void {
    this.pending = null
  }

  /** Takes `id` out of the gesture: later writes skip it and a revert leaves it alone. */
  forget(id: string): void {
    this.forgotten.add(id)
    this.touched.delete(id)
    this.snapshots.delete(id)
    if (this.pending) delete this.pending[id]
  }

  reset(): void {
    this.pending = null
    this.touched.clear()
    this.snapshots.clear()
    this.forgotten.clear()
  }
}

/**
 * Patches restoring, from each snapshot, only the keys the gesture wrote, so concurrent remote edits
 * to other props (and untouched arrays such as `points`) survive the cancel.
 */
function revertPatches(origins: Iterable<SketchElement>, touched: Map<string, Set<string>>): Record<string, ElementPatch> {
  const out: Record<string, ElementPatch> = {}
  for (const el of origins) {
    const keys = touched.get(el.id)
    if (!keys?.size) continue
    const src = el as unknown as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    for (const k of keys) patch[k] = src[k]
    out[el.id] = patch as ElementPatch
  }
  return out
}

/** Click/shift-click selection, marquee, move, single-element resize and rotate. */
export class SelectTool implements Tool {
  private g: Gesture = { kind: 'none' }
  private downAt: Point = { x: 0, y: 0 }
  private dirty = false
  private writing = false
  /**
   * Link to follow on pointerup (pressed on a badge, or mod+pressed on a linked element), with the press position
   * (screen px). Opened on up, not down: only pointerup grants the user activation popup blockers require.
   */
  private pendingLink: { id: string; at: Point } | null = null
  private readonly writer: FrameWriter

  constructor(private readonly host: ToolHost) {
    this.writer = new FrameWriter(patches => host.ctx.store.updateMany(patches), id => host.ctx.scene.get(id))
  }

  down(e: PointerInput, p: Point): void {
    const { ctx } = this.host
    const ro = ctx.readonly()
    this.downAt = p
    this.dirty = false
    this.pendingLink = null
    // a link badge (screen size, outside the element) follows its link on release, also when read-only
    const badge = this.badgeAt(e)
    if (badge) {
      this.g = { kind: 'none' }
      this.pendingLink = { id: badge.id, at: e.screen }
      return
    }
    // point handles win over the resize handles they may overlap
    const point = ro ? null : this.pointAt(p)
    if (point) {
      this.beginWrite()
      this.g = { kind: 'point', ...point }
      return
    }
    const handle = ro ? null : this.handleAt(p)
    if (handle) {
      this.beginWrite()
      this.g = handle.handle === 'rotate'
        ? { kind: 'rotate', el: handle.el }
        : { kind: 'resize', handle: handle.handle, el: handle.el, snap: this.host.snapper([handle.el.id]) }
      return
    }

    const hit = this.hitAt(p)
    // mod+click follows the element's link on release (instead of selecting it)
    if (hit?.link && e.mod) {
      this.g = { kind: 'none' }
      this.pendingLink = { id: hit.id, at: e.screen }
      return
    }
    const sel = this.host.selectedIds.value
    if (!hit) {
      const base = e.shift ? new Set(sel) : new Set<string>()
      this.host.setSelection(base)
      this.g = { kind: 'marquee', start: p, base }
      return
    }
    // a group is picked whole (its outermost group)
    const picked = this.host.expandGroups([hit.id])
    if (e.shift) {
      const next = new Set(sel)
      const remove = sel.has(hit.id)
      for (const id of picked) {
        if (remove) next.delete(id)
        else next.add(id)
      }
      this.host.setSelection(next)
      if (remove) {
        this.g = { kind: 'none' }
        return
      }
    } else if (!sel.has(hit.id)) {
      this.host.setSelection(picked)
    }
    if (ro) {
      this.g = { kind: 'none' }
      return
    }
    // a frame takes its children along (each element moves once, selected or not)
    const selected = [...this.host.selectedIds.value]
      .map(id => ctx.scene.get(id))
      .filter((el): el is SketchElement => !!el && !el.locked)
    const origins = withFrameChildren(ctx.scene, selected)
    // only lines moved on their own let go of targets that stay put (a frame's child line keeps its bindings)
    const detach = directLines(selected)
    if (origins.length) this.beginWrite()
    // the union box of what moves is snapped; candidates exclude it (and the lines bound to it)
    let box: Box | null = null
    for (const el of origins) {
      const b = cornersBox(el)
      box = box
        ? { minX: Math.min(box.minX, b.minX), minY: Math.min(box.minY, b.minY), maxX: Math.max(box.maxX, b.maxX), maxY: Math.max(box.maxY, b.maxY) }
        : b
    }
    const snap = this.host.snapper(origins.map(el => el.id))
    this.g = { kind: 'move', start: p, origins, detach, box, snap, dragging: false }
    this.host.cursor.value = 'move'
  }

  move(e: PointerInput, p: Point): void {
    const g = this.g
    if (g.kind !== 'none' && g.kind !== 'marquee') this.dirty = true
    switch (g.kind) {
      case 'move': {
        if (!g.origins.length) return
        let dx = p.x - g.start.x
        let dy = p.y - g.start.y
        // no snapping until a real drag (a jittery click must not jump to the grid)
        if (!g.dragging && Math.hypot(dx, dy) * this.host.ctx.viewport.zoom > DRAG_PX) g.dragging = true
        // Alt (held at this moment) skips snapping
        if (g.dragging && g.box && !e.alt && !g.snap.idle) {
          const s = g.snap.move({ minX: g.box.minX + dx, minY: g.box.minY + dy, maxX: g.box.maxX + dx, maxY: g.box.maxY + dy })
          dx += s.dx
          dy += s.dy
          this.host.setGuides(s.guides)
        } else {
          this.host.setGuides([])
        }
        const patches: Record<string, ElementPatch> = {}
        for (const el of g.origins) {
          // a bound line is re-placed from its whole origin geometry (an earlier frame may have rewritten its box)
          patches[el.id] = isLinear(el) && (el.startBinding || el.endBinding)
            ? { x: el.x + dx, y: el.y + dy, w: el.w, h: el.h, angle: el.angle, points: el.points }
            : { x: el.x + dx, y: el.y + dy }
        }
        // bound lines follow in the same write (and are reverted with it on cancel)
        this.writer.set(this.host.withFollowers(patches, g.detach))
        return
      }
      case 'resize': {
        // images keep their aspect ratio unless Shift is held; everything else the other way round
        const keepRatio = isImage(g.el) ? !e.shift : e.shift
        // the moving edge(s) of an unrotated element snap (the edge lands on the pointer); Alt resizes from the
        // center, so it also skips snapping
        let target = p
        if (!e.alt && !g.el.angle && !g.snap.idle) {
          const s = g.snap.point(p, { x: /[ew]/.test(g.handle), y: /[ns]/.test(g.handle) })
          target = s.p
          this.host.setGuides(s.guides)
        } else {
          this.host.setGuides([])
        }
        this.writer.set(this.host.withFollowers({
          [g.el.id]: kindOf(g.el).resize(g.el, resizeBox(g.el, g.handle, target, { keepRatio, fromCenter: e.alt })),
        }))
        return
      }
      case 'rotate':
        this.writer.set(this.host.withFollowers({ [g.el.id]: { angle: rotateAngle(boxCenter(g.el), p, e.shift) } }))
        return
      case 'point': {
        let target = p
        if (e.shift && g.el.points.length > 1) {
          // snap the segment from the neighbouring point
          const scene = linearScenePoints(g.el)
          target = snapSegment(scene[g.index === 0 ? 1 : g.index - 1]!, p)
        } else if (!e.alt && this.host.grid.value && !this.bindsAt(g.el, g.index, p)) {
          // points snap to the grid only (no object snap); an end that binds at the raw point keeps it
          target = snapPoint(p, GRID_SIZE)
        }
        this.writer.set({ [g.el.id]: this.pointPatch(g.el, g.index, target) })
        return
      }
      case 'marquee': {
        const box: Box = {
          minX: Math.min(g.start.x, p.x), minY: Math.min(g.start.y, p.y),
          maxX: Math.max(g.start.x, p.x), maxY: Math.max(g.start.y, p.y),
        }
        this.host.marquee = box
        const inside: string[] = []
        // containment uses the unpadded rotated box (rough-ink padding would make it stricter)
        for (const el of this.host.ctx.scene.queryBox(box)) {
          if (elementCorners(el).every(c => c.x >= box.minX && c.x <= box.maxX && c.y >= box.minY && c.y <= box.maxY)) {
            inside.push(el.id)
          }
        }
        // groups are selected whole
        this.host.setSelection(new Set([...g.base, ...this.host.expandGroups(inside)]))
        this.host.ctx.invalidate()
      }
    }
  }

  up(e: PointerInput, p: Point): void {
    const link = this.pendingLink
    this.pendingLink = null
    // a press that turned into a drag does not follow the link
    if (link && Math.hypot(e.screen.x - link.at.x, e.screen.y - link.at.y) <= DRAG_PX) this.host.followLink(link.id)
    const g = this.g
    if (g.kind === 'move' || g.kind === 'resize' || g.kind === 'rotate' || g.kind === 'point') {
      // a plain click must not write (no version bump, no empty undo step)
      if (this.dirty || p.x !== this.downAt.x || p.y !== this.downAt.y) this.move(e, p)
      this.writer.flush()
      this.writeMembership()
    } else if (g.kind === 'marquee') {
      this.host.marquee = null
      this.host.ctx.invalidate()
    }
    this.setBindTarget(null)
    this.endWrite()
    this.g = { kind: 'none' }
    this.hover(e, p)
  }

  hover(e: PointerInput, p: Point): void {
    const { ctx } = this.host
    // the hovered element keeps its hover while the pointer is on its link badge (outside its box)
    if (this.badgeAt(e)) {
      this.host.cursor.value = 'pointer'
      return
    }
    const hit = this.hitAt(p)
    const hoverId = hit?.id ?? null
    if (hoverId !== this.host.hoverId) {
      this.host.hoverId = hoverId
      ctx.invalidate()
    }
    const point = ctx.readonly() ? null : this.pointAt(p)
    const handle = ctx.readonly() || point ? null : this.handleAt(p)
    this.host.cursor.value = point
      ? 'pointer'
      : handle
      ? HANDLE_CURSOR[handle.handle]
      : hit && this.host.selectedIds.value.has(hit.id) ? 'move' : 'default'
  }

  /** Aborts the gesture; a move/resize/rotate that already wrote is reverted to its origins (no undo step). */
  cancel(): void {
    this.pendingLink = null
    this.writer.drop()
    this.setBindTarget(null)
    if (this.writing) {
      const { store, scene, history } = this.host.ctx
      const patches = revertPatches(this.writer.snapshots.values(), this.writer.touched)
      if (Object.keys(patches).length) {
        // derived data from the reverted state as it is now: a repair (a peer's concurrent move) may have re-routed
        // a bound line mid-gesture, so its snapshot alone can be stale. Lines re-follow their targets (never let go)
        const all = { ...patches }
        for (const [id, p] of Object.entries(followBindings(store, scene, Object.keys(patches), patches, new Set()))) {
          all[id] = { ...all[id], ...p }
        }
        store.updateMany(all)
        // membership needs the reverted boxes in the scene: a second write, dropped with the gesture all the same
        const members = membershipPatches(scene, Object.keys(all))
        if (Object.keys(members).length) store.updateMany(members)
      }
      this.writing = false
      history.discardGesture()
    }
    if (this.g.kind === 'marquee') {
      this.host.marquee = null
      this.host.ctx.invalidate()
    }
    this.g = { kind: 'none' }
  }

  /**
   * The scene changed (a peer may have deleted elements mid-gesture): every element of the gesture in progress that
   * no longer exists leaves it for good. Later frames skip it and a cancel does not revert it, even if a peer brings
   * it back (its undo), also when it was deleted before the first write. A resize / rotate / point drag whose
   * target is gone keeps its undo bracket (bound lines it already moved stay part of it) but writes nothing more.
   */
  prune(): void {
    // the gesture's targets are known from pointerdown (before any write)
    const { scene } = this.host.ctx
    const g = this.g
    for (const id of [...this.writer.touched.keys()]) if (!scene.get(id)) this.writer.forget(id)
    if (g.kind === 'move') {
      const gone = g.origins.filter(el => !scene.get(el.id))
      if (!gone.length) return
      for (const el of gone) this.writer.forget(el.id)
      g.origins = g.origins.filter(el => !gone.includes(el))
    } else if ((g.kind === 'resize' || g.kind === 'rotate' || g.kind === 'point') && !scene.get(g.el.id)) {
      this.writer.forget(g.el.id)
      this.writer.drop()
      this.setBindTarget(null)
      this.host.setGuides([])
      this.g = { kind: 'none' }
    }
  }

  /**
   * Ids of every element the move gesture in progress moves (frame children included); empty when no move is
   * in progress. Elements moved indirectly need the same follow-up (e.g. bound arrows) as selected ones.
   */
  movedIds(): string[] {
    return this.g.kind === 'move' ? this.g.origins.map(el => el.id) : []
  }

  /** The element whose link badge (shown on the hovered and selected elements with a link) is under the pointer. */
  private badgeAt(e: PointerInput): SketchElement | null {
    const { scene, viewport } = this.host.ctx
    const ids = new Set(this.host.selectedIds.value)
    if (this.host.hoverId) ids.add(this.host.hoverId)
    for (const id of ids) {
      const el = scene.get(id)
      if (el?.link && onLinkBadge(el, viewport, e.screen)) return el
    }
    return null
  }

  /** Element under `p`: a frame name label (drawn on top of everything) first, then the scene hit-test. */
  private hitAt(p: Point): SketchElement | undefined {
    const { scene, viewport } = this.host.ctx
    return frameLabelAt(scene, p, viewport.zoom) ?? scene.hitTest(p, HIT_PX / viewport.zoom)
  }

  /**
   * After the gesture's last write (before its undo step closes): recomputes frame membership for what it
   * changed, writing `frameId` only where it differs.
   */
  private writeMembership(): void {
    if (!this.writing || !this.writer.touched.size) return
    const { scene, store } = this.host.ctx
    const patches = membershipPatches(scene, this.writer.touched.keys())
    if (Object.keys(patches).length) store.updateMany(patches)
  }

  /** Opens one undo step spanning the whole move/resize/rotate gesture (pauses included). */
  private beginWrite(): void {
    this.host.ctx.history.beginGesture()
    this.writer.reset()
    this.writing = true
  }

  /**
   * Patch moving point `index` of `el` (the gesture's snapshot) to `p`. An arrow's end point binds to the shape it
   * is dropped near (snapping onto its anchor) and comes loose anywhere else; the bind target is highlighted.
   */
  private pointPatch(el: LinearElement, index: number, p: Point): ElementPatch {
    const patch: ElementPatch = movePointPatch(el, index, p)
    const last = el.points.length - 1
    if (last < 1 || (index !== 0 && index !== last)) return patch
    const key = index === 0 ? 'startBinding' : 'endBinding'
    const other = index === 0 ? el.endBinding : el.startBinding
    if (el.type !== 'arrow' && !el[key]) return patch
    const { scene, viewport } = this.host.ctx
    const b = bindingAt(scene, el, p, viewport.zoom, other)
    this.setBindTarget(b?.id ?? null)
    if (!b) return { ...patch, [key]: null }
    const next = { ...el, ...patch, [key]: b } as LinearElement
    return { ...patch, [key]: b, ...boundPatch(next, id => scene.get(id)) }
  }

  /** Point `index` of `el` dropped at `p` would bind (same rule as `pointPatch`). */
  private bindsAt(el: LinearElement, index: number, p: Point): boolean {
    const last = el.points.length - 1
    if (last < 1 || (index !== 0 && index !== last)) return false
    if (el.type !== 'arrow' && !el[index === 0 ? 'startBinding' : 'endBinding']) return false
    const { scene, viewport } = this.host.ctx
    return bindingAt(scene, el, p, viewport.zoom, index === 0 ? el.endBinding : el.startBinding) !== null
  }

  private setBindTarget(id: string | null): void {
    if (this.host.bindTarget === id) return
    this.host.bindTarget = id
    this.host.ctx.invalidate()
  }

  private endWrite(): void {
    if (!this.writing) return
    this.writing = false
    this.host.ctx.history.endGesture()
  }

  /** Handle under `p` when exactly one unlocked element is selected. */
  private handleAt(p: Point): { el: SketchElement; handle: Handle } | null {
    const sel = this.host.selectedIds.value
    if (sel.size !== 1) return null
    const { scene, viewport } = this.host.ctx
    const el = scene.get([...sel][0]!)
    if (!el || el.locked || !hasTransformHandles(el)) return null
    const tol = HANDLE_HIT_PX / viewport.zoom
    const handles = handlePositions(el, viewport.zoom)
    for (const k of Object.keys(handles) as Handle[]) {
      if (k === 'rotate' && !canRotate(el)) continue
      const h = handles[k]
      if (Math.abs(h.x - p.x) <= tol && Math.abs(h.y - p.y) <= tol) return { el, handle: k }
    }
    return null
  }

  /** Point handle under `p` when exactly one unlocked line/arrow is selected (nearest within tolerance). */
  private pointAt(p: Point): { el: LinearElement; index: number } | null {
    const sel = this.host.selectedIds.value
    if (sel.size !== 1) return null
    const { scene, viewport } = this.host.ctx
    const el = scene.get([...sel][0]!)
    if (!el || el.locked || !isLinear(el)) return null
    const tol = HANDLE_HIT_PX / viewport.zoom
    const pts = linearScenePoints(el)
    let index = -1
    let bestD = tol
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i]!.x - p.x, pts[i]!.y - p.y)
      if (d <= bestD) {
        bestD = d
        index = i
      }
    }
    return index < 0 ? null : { el, index }
  }
}
