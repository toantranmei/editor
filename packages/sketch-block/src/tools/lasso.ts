import { elementCorners, type Point, pointInPolygon, pointsBox } from '../geometry'
import type { PointerInput, Tool, ToolHost } from './controller'

/**
 * Lasso selection: collects a polygon of scene points while dragging; pointerUp selects the unlocked elements
 * whose 4 rotated box corners all lie inside it (even-odd), each expanded to every member of its outermost group
 * (locked members included: groups are selected whole). Shift adds to the selection. Then back to select (unless
 * the tool is locked).
 */
export class LassoTool implements Tool {
  private base: Set<string> | null = null

  constructor(private readonly host: ToolHost) {}

  down(e: PointerInput, p: Point): void {
    this.base = e.shift ? new Set(this.host.selectedIds.value) : new Set()
    this.host.lasso = [p]
    this.host.ctx.invalidate()
  }

  move(e: PointerInput, p: Point): void {
    const poly = this.host.lasso
    if (!this.base || !poly) return
    const { viewport } = this.host.ctx
    const pts = e.coalesced?.length ? e.coalesced.map(s => viewport.toScene(s)) : [p]
    for (const q of pts) {
      const last = poly[poly.length - 1]!
      if (last.x !== q.x || last.y !== q.y) poly.push(q)
    }
    this.host.ctx.invalidate()
  }

  up(e: PointerInput, p: Point): void {
    const base = this.base
    if (!base) return
    this.move({ ...e, coalesced: undefined }, p)
    const poly = this.host.lasso!
    this.cancel()
    const inside: string[] = []
    if (poly.length >= 3) {
      for (const el of this.host.ctx.scene.queryBox(pointsBox(poly))) {
        if (!el.locked && elementCorners(el).every(c => pointInPolygon(c, poly))) inside.push(el.id)
      }
    }
    // groups are selected whole
    this.host.setSelection(new Set([...base, ...this.host.expandGroups(inside)]))
    if (!this.host.toolLocked.value) this.host.setTool('select')
  }

  cancel(): void {
    this.base = null
    if (!this.host.lasso) return
    this.host.lasso = null
    this.host.ctx.invalidate()
  }
}
