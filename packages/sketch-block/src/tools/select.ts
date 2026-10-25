import { canRotate, membershipPatches, withFrameChildren } from '../elements/frame'
import { kindOf } from '../elements/kind'
import { hasTransformHandles, linearScenePoints, movePointPatch } from '../elements/linear'
import {
  type Box, boxCenter, elementCorners, type Handle, handlePositions, type Point, resizeBox, rotateAngle,
  snapSegment,
} from '../geometry'
import { type ElementPatch, isImage, isLinear, type LinearElement, type SketchElement } from '../model/types'
import { frameLabelAt } from '../render/frame-labels'
import type { PointerInput, Tool, ToolHost } from './controller'

/** Hit tolerances in screen px (divided by zoom → scene units). */
const HIT_PX = 6
const HANDLE_HIT_PX = 8

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', rotate: 'alias',
}

type Gesture =
  | { kind: 'move'; start: Point; origins: SketchElement[] }
  | { kind: 'resize'; handle: Exclude<Handle, 'rotate'>; el: SketchElement }
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

  constructor(private readonly write: (patches: Record<string, ElementPatch>) => void) {}

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
    for (const [id, patch] of Object.entries(p)) {
      let keys = this.touched.get(id)
      if (!keys) this.touched.set(id, keys = new Set())
      for (const k of Object.keys(patch)) keys.add(k)
    }
    this.write(p)
  }

  drop(): void {
    this.pending = null
  }

  reset(): void {
    this.pending = null
    this.touched.clear()
  }
}

/**
 * Patches restoring, from each origin snapshot, only the keys the gesture wrote, so concurrent remote edits
 * to other props (and untouched arrays such as `points`) survive the cancel.
 */
function revertPatches(origins: SketchElement[], touched: Map<string, Set<string>>): Record<string, ElementPatch> {
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
  private readonly writer: FrameWriter

  constructor(private readonly host: ToolHost) {
    this.writer = new FrameWriter(patches => host.ctx.store.updateMany(patches))
  }

  down(e: PointerInput, p: Point): void {
    const { ctx } = this.host
    const ro = ctx.readonly()
    this.downAt = p
    this.dirty = false
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
        : { kind: 'resize', handle: handle.handle, el: handle.el }
      return
    }

    const hit = this.hitAt(p)
    const sel = this.host.selectedIds.value
    if (!hit) {
      const base = e.shift ? new Set(sel) : new Set<string>()
      this.host.setSelection(base)
      this.g = { kind: 'marquee', start: p, base }
      return
    }
    if (e.shift) {
      const next = new Set(sel)
      if (next.has(hit.id)) next.delete(hit.id)
      else next.add(hit.id)
      this.host.setSelection(next)
      if (!next.has(hit.id)) {
        this.g = { kind: 'none' }
        return
      }
    } else if (!sel.has(hit.id)) {
      this.host.setSelection([hit.id])
    }
    if (ro) {
      this.g = { kind: 'none' }
      return
    }
    // a frame takes its children along (each element moves once, selected or not)
    const origins = withFrameChildren(ctx.scene, [...this.host.selectedIds.value]
      .map(id => ctx.scene.get(id))
      .filter((el): el is SketchElement => !!el && !el.locked))
    if (origins.length) this.beginWrite()
    this.g = { kind: 'move', start: p, origins }
    this.host.cursor.value = 'move'
  }

  move(e: PointerInput, p: Point): void {
    const g = this.g
    if (g.kind !== 'none' && g.kind !== 'marquee') this.dirty = true
    switch (g.kind) {
      case 'move': {
        const dx = p.x - g.start.x
        const dy = p.y - g.start.y
        if (!g.origins.length) return
        const patches: Record<string, ElementPatch> = {}
        for (const el of g.origins) patches[el.id] = { x: el.x + dx, y: el.y + dy }
        this.writer.set(patches)
        return
      }
      case 'resize': {
        // images keep their aspect ratio unless Shift is held; everything else the other way round
        const keepRatio = isImage(g.el) ? !e.shift : e.shift
        this.writer.set({
          [g.el.id]: kindOf(g.el).resize(g.el, resizeBox(g.el, g.handle, p, { keepRatio, fromCenter: e.alt })),
        })
        return
      }
      case 'rotate':
        this.writer.set({ [g.el.id]: { angle: rotateAngle(boxCenter(g.el), p, e.shift) } })
        return
      case 'point': {
        let target = p
        if (e.shift && g.el.points.length > 1) {
          // snap the segment from the neighbouring point
          const scene = linearScenePoints(g.el)
          target = snapSegment(scene[g.index === 0 ? 1 : g.index - 1]!, p)
        }
        this.writer.set({ [g.el.id]: movePointPatch(g.el, g.index, target) })
        return
      }
      case 'marquee': {
        const box: Box = {
          minX: Math.min(g.start.x, p.x), minY: Math.min(g.start.y, p.y),
          maxX: Math.max(g.start.x, p.x), maxY: Math.max(g.start.y, p.y),
        }
        this.host.marquee = box
        const next = new Set(g.base)
        // containment uses the unpadded rotated box (rough-ink padding would make it stricter)
        for (const el of this.host.ctx.scene.queryBox(box)) {
          if (elementCorners(el).every(c => c.x >= box.minX && c.x <= box.maxX && c.y >= box.minY && c.y <= box.maxY)) {
            next.add(el.id)
          }
        }
        this.host.setSelection(next)
        this.host.ctx.invalidate()
      }
    }
  }

  up(e: PointerInput, p: Point): void {
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
    this.endWrite()
    this.g = { kind: 'none' }
    this.hover(e, p)
  }

  hover(_e: PointerInput, p: Point): void {
    const { ctx } = this.host
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
    this.writer.drop()
    if (this.writing) {
      const { store, history } = this.host.ctx
      const patches = revertPatches(this.origins(), this.writer.touched)
      if (Object.keys(patches).length) store.updateMany(patches)
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
   * Ids of every element the move gesture in progress moves (frame children included); empty when no move is
   * in progress. Elements moved indirectly need the same follow-up (e.g. bound arrows) as selected ones.
   */
  movedIds(): string[] {
    return this.g.kind === 'move' ? this.g.origins.map(el => el.id) : []
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

  private origins(): SketchElement[] {
    const g = this.g
    return g.kind === 'move' ? g.origins : g.kind === 'resize' || g.kind === 'rotate' || g.kind === 'point' ? [g.el] : []
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
