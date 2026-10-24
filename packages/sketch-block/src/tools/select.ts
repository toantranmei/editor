import { kindOf } from '../elements/kind'
import {
  type Box, boxCenter, boxContains, elementBounds, type Handle, handlePositions, type Point, resizeBox, rotateAngle,
} from '../geometry'
import type { ElementPatch, SketchElement } from '../model/types'
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
  | { kind: 'marquee'; start: Point; base: Set<string> }
  | { kind: 'none' }

/** Batches element patches to at most one `store.updateMany` per animation frame. */
class FrameWriter {
  private pending: Record<string, ElementPatch> | null = null
  private scheduled = false

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
    if (p) this.write(p)
  }

  drop(): void {
    this.pending = null
  }
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
    const handle = ro ? null : this.handleAt(p)
    if (handle) {
      this.beginWrite()
      this.g = handle.handle === 'rotate'
        ? { kind: 'rotate', el: handle.el }
        : { kind: 'resize', handle: handle.handle, el: handle.el }
      return
    }

    const hit = ctx.scene.hitTest(p, HIT_PX / ctx.viewport.zoom)
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
    const origins = [...this.host.selectedIds.value]
      .map(id => ctx.scene.get(id))
      .filter((el): el is SketchElement => !!el && !el.locked)
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
      case 'resize':
        this.writer.set({
          [g.el.id]: kindOf(g.el).resize(g.el, resizeBox(g.el, g.handle, p, { keepRatio: e.shift, fromCenter: e.alt })),
        })
        return
      case 'rotate':
        this.writer.set({ [g.el.id]: { angle: rotateAngle(boxCenter(g.el), p, e.shift) } })
        return
      case 'marquee': {
        const box: Box = {
          minX: Math.min(g.start.x, p.x), minY: Math.min(g.start.y, p.y),
          maxX: Math.max(g.start.x, p.x), maxY: Math.max(g.start.y, p.y),
        }
        this.host.marquee = box
        const next = new Set(g.base)
        for (const el of this.host.ctx.scene.queryBox(box)) {
          if (boxContains(box, elementBounds(el))) next.add(el.id)
        }
        this.host.setSelection(next)
        this.host.ctx.invalidate()
      }
    }
  }

  up(e: PointerInput, p: Point): void {
    const g = this.g
    if (g.kind === 'move' || g.kind === 'resize' || g.kind === 'rotate') {
      // a plain click must not write (no version bump, no empty undo step)
      if (this.dirty || p.x !== this.downAt.x || p.y !== this.downAt.y) this.move(e, p)
      this.writer.flush()
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
    const hit = ctx.scene.hitTest(p, HIT_PX / ctx.viewport.zoom)
    const hoverId = hit?.id ?? null
    if (hoverId !== this.host.hoverId) {
      this.host.hoverId = hoverId
      ctx.invalidate()
    }
    const handle = ctx.readonly() ? null : this.handleAt(p)
    this.host.cursor.value = handle
      ? HANDLE_CURSOR[handle.handle]
      : hit && this.host.selectedIds.value.has(hit.id) ? 'move' : 'default'
  }

  cancel(): void {
    this.writer.drop()
    this.endWrite()
    if (this.g.kind === 'marquee') {
      this.host.marquee = null
      this.host.ctx.invalidate()
    }
    this.g = { kind: 'none' }
  }

  /** Opens one undo step spanning the whole move/resize/rotate gesture (pauses included). */
  private beginWrite(): void {
    this.host.ctx.history.beginGesture()
    this.writing = true
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
    if (!el || el.locked) return null
    const tol = HANDLE_HIT_PX / viewport.zoom
    const handles = handlePositions(el, viewport.zoom)
    for (const k of Object.keys(handles) as Handle[]) {
      const h = handles[k]
      if (Math.abs(h.x - p.x) <= tol && Math.abs(h.y - p.y) <= tol) return { el, handle: k }
    }
    return null
  }
}
