import { boxFromPoints } from '../elements/linear'
import type { Point } from '../geometry'
import { simplify } from '../geometry/simplify'
import type { FreedrawElement, LocalPoint } from '../model/types'
import type { PointerInput, Tool, ToolHost } from './controller'

/** Scene-unit tolerance for simplifying the committed stroke. */
const SIMPLIFY_TOLERANCE = 0.5
/** What a mouse reports while a button is held; a stroke made only of it carries no real pressure. */
const MOUSE_PRESSURE = 0.5

/**
 * Pen / highlighter: accumulates absolute scene points (and pressures) into a freedraw draft that stays out
 * of Y; pointerUp simplifies it and commits one element in one transaction (one undo step). The tool stays active.
 */
export class PenTool implements Tool {
  private points: LocalPoint[] | null = null
  private pressures: number[] = []
  private seed = 0

  constructor(private readonly host: ToolHost, private readonly highlighter: boolean) {}

  down(e: PointerInput, p: Point): void {
    if (this.host.ctx.readonly()) return
    this.points = []
    this.pressures = []
    this.seed = Math.floor(Math.random() * 2 ** 31)
    this.add(p, e.pressure)
    this.refreshDraft()
  }

  move(e: PointerInput, p: Point): void {
    if (!this.points) return
    if (e.coalesced?.length) {
      const { viewport } = this.host.ctx
      for (const s of e.coalesced) this.add(viewport.toScene(s), s.pressure ?? e.pressure)
    } else {
      this.add(p, e.pressure)
    }
    this.refreshDraft()
  }

  up(e: PointerInput, p: Point): void {
    if (!this.points) return
    // pens report pressure 0 on release: keep the last real one
    this.add(p, e.pressure || this.pressures[this.pressures.length - 1]!)
    const draft = this.makeDraft(true)
    this.cancel()
    const { store, history, readonly } = this.host.ctx
    if (readonly()) return
    const { id: _id, index: _index, version: _v, ...init } = draft
    history.stopCapturing()
    store.create(init)
    history.stopCapturing()
  }

  cancel(): void {
    this.points = null
    this.pressures = []
    if (this.host.draft) {
      this.host.draft = null
      this.host.ctx.invalidate()
    }
  }

  /** Appends a sample, skipping exact repeats (so a click stays a single-point dot). */
  private add(p: Point, pressure: number): void {
    const pts = this.points!
    const last = pts[pts.length - 1]
    if (last && last[0] === p.x && last[1] === p.y) return
    pts.push([p.x, p.y])
    this.pressures.push(pressure || MOUSE_PRESSURE)
  }

  private refreshDraft(): void {
    this.host.draft = this.makeDraft(false)
    this.host.ctx.invalidate()
  }

  private makeDraft(final: boolean): FreedrawElement {
    let abs = this.points!
    let pressures = this.pressures
    if (final) {
      const at = new Map(abs.map((pt, i) => [pt, i]))
      abs = simplify(abs, SIMPLIFY_TOLERANCE)
      pressures = abs.map(pt => this.pressures[at.get(pt)!]!)
    }
    // constant mouse pressure → store none, so the renderer simulates it
    if (pressures.every(v => v === MOUSE_PRESSURE)) pressures = []
    const { stroke, fill, fillStyle, strokeWidth, strokeStyle, roughness, roundness, opacity } = this.host.ctx.style()
    return {
      stroke, fill, fillStyle, strokeWidth, strokeStyle, roughness, roundness, opacity,
      ...boxFromPoints(abs),
      id: 'draft',
      type: 'freedraw',
      pressures: pressures.slice(),
      highlighter: this.highlighter,
      angle: 0,
      index: 'a0',
      seed: this.seed,
      version: 1,
      locked: false,
    }
  }
}
