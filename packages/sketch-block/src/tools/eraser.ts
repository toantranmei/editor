import { frameDeletePatches } from '../elements/frame'
import { hitElement, type Point } from '../geometry'
import type { PointerInput, Tool, ToolHost } from './controller'

/** Hit distance from the swept path, and the step between samples along it, in screen px. */
const ERASE_HIT_PX = 8
const SAMPLE_STEP_PX = 4

/**
 * Eraser: while down, sweeps the segments between consecutive pointer positions and marks every unlocked
 * element within 8/zoom of a sample along them (marks stay out of Y). pointerUp removes the marked elements in
 * one transaction (one undo step); cancel (Escape) just clears the marks.
 */
export class EraserTool implements Tool {
  private last: Point | null = null

  constructor(private readonly host: ToolHost) {}

  down(_e: PointerInput, p: Point): void {
    if (this.host.ctx.readonly()) return
    this.last = p
    this.sweep(p, p)
  }

  move(e: PointerInput, p: Point): void {
    if (!this.last) return
    const { viewport } = this.host.ctx
    const pts = e.coalesced?.length ? e.coalesced.map(s => viewport.toScene(s)) : [p]
    for (const q of pts) {
      this.sweep(this.last, q)
      this.last = q
    }
  }

  up(e: PointerInput, p: Point): void {
    if (!this.last) return
    this.move({ ...e, coalesced: undefined }, p)
    const { scene, store, history, readonly } = this.host.ctx
    const ids = [...this.host.erasing].filter(id => scene.get(id))
    this.cancel()
    if (!ids.length || readonly()) return
    history.stopCapturing()
    // an erased frame's children leave it, in the same transaction
    store.remove(ids, frameDeletePatches(scene, ids))
    history.stopCapturing()
  }

  cancel(): void {
    this.last = null
    if (!this.host.erasing.size) return
    this.host.erasing = new Set()
    this.host.ctx.invalidate()
  }

  /** Marks the elements hit along the segment a → b (a fresh Set on change, so the board can notice). */
  private sweep(a: Point, b: Point): void {
    const { scene, viewport } = this.host.ctx
    const tol = ERASE_HIT_PX / viewport.zoom
    const step = SAMPLE_STEP_PX / viewport.zoom
    const candidates = scene.queryBox({
      minX: Math.min(a.x, b.x) - tol, minY: Math.min(a.y, b.y) - tol,
      maxX: Math.max(a.x, b.x) + tol, maxY: Math.max(a.y, b.y) + tol,
    }).filter(el => !el.locked && !this.host.erasing.has(el.id))
    if (!candidates.length) return
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
    const hit: string[] = []
    for (const el of candidates) {
      for (let i = 0; i <= n; i++) {
        const t = i / n
        if (hitElement(el, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, tol)) {
          hit.push(el.id)
          break
        }
      }
    }
    if (!hit.length) return
    this.host.erasing = new Set([...this.host.erasing, ...hit])
    this.host.ctx.invalidate()
  }
}
