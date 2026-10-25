import { boxFromPoints } from '../elements/linear'
import type { Point } from '../geometry'
import { simplifyIndices } from '../geometry/simplify'
import { DEFAULT_STYLE, type FreedrawElement, type LocalPoint } from '../model/types'
import type { PointerInput, Tool, ToolHost } from './controller'

/** Tolerance for simplifying the committed stroke, in screen px (0.5 / zoom scene units). */
const SIMPLIFY_PX = 0.5
/** What a mouse reports while a button is held; a stroke made only of it carries no real pressure. */
const MOUSE_PRESSURE = 0.5

/**
 * Pen / highlighter: accumulates absolute scene points (and pressures) into a freedraw draft that stays out
 * of Y; pointerUp simplifies it and commits one element in one transaction (one undo step). The tool stays active.
 */
export class PenTool implements Tool {
  /** Absolute scene points of the stroke in progress (null = no stroke). */
  private points: LocalPoint[] | null = null
  private pressures: number[] = []
  /** Some sample carried a pressure other than the mouse constant. */
  private realPressure = false
  private minX = 0
  private minY = 0
  private maxX = 0
  private maxY = 0
  private seed = 0

  constructor(private readonly host: ToolHost, private readonly highlighter: boolean) {}

  down(e: PointerInput, p: Point): void {
    if (this.host.ctx.readonly()) return
    this.points = []
    this.pressures = []
    this.realPressure = false
    this.minX = this.maxX = p.x
    this.minY = this.maxY = p.y
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
    const abs = this.points
    const kept = simplifyIndices(abs, SIMPLIFY_PX / this.host.ctx.viewport.zoom)
    const pressures = kept.map(i => this.pressures[i]!)
    const init = {
      ...this.styleProps(),
      ...boxFromPoints(kept.map(i => abs[i]!)),
      type: 'freedraw' as const,
      // constant mouse pressure → store none, so the renderer simulates it
      pressures: pressures.some(v => v !== MOUSE_PRESSURE) ? pressures : [],
      highlighter: this.highlighter,
      angle: 0,
      seed: this.seed,
      locked: false,
    }
    this.cancel()
    const { store, history, readonly } = this.host.ctx
    if (readonly()) return
    history.gesture(() => {
      const el = store.create(init)
      this.host.created([el.id])
    })
  }

  cancel(): void {
    this.points = null
    this.pressures = []
    if (this.host.draft) {
      this.host.draft = null
      this.host.ctx.invalidate()
    }
  }

  /** Appends a sample (O(1)), skipping exact repeats so a click stays a single-point dot. */
  private add(p: Point, pressure: number): void {
    const pts = this.points!
    const last = pts[pts.length - 1]
    if (last && last[0] === p.x && last[1] === p.y) return
    pts.push([p.x, p.y])
    const v = pressure || MOUSE_PRESSURE
    this.pressures.push(v)
    if (v !== MOUSE_PRESSURE) this.realPressure = true
    if (p.x < this.minX) this.minX = p.x
    if (p.x > this.maxX) this.maxX = p.x
    if (p.y < this.minY) this.minY = p.y
    if (p.y > this.maxY) this.maxY = p.y
  }

  private styleProps() {
    // freedraw has no background: it never takes the current fill
    const { stroke, strokeWidth, strokeStyle, roughness, roundness, opacity } = this.host.currentStyle.value
    const { fill, fillStyle } = DEFAULT_STYLE
    return { stroke, fill, fillStyle, strokeWidth, strokeStyle, roughness, roundness, opacity }
  }

  /**
   * O(1) per move: the box comes from the running bounds; local points and pressures are materialized
   * lazily (once per draft snapshot) only when the overlay is actually drawn.
   */
  private refreshDraft(): void {
    const abs = this.points!
    const all = this.pressures
    const n = abs.length
    const { minX, minY } = this
    const real = this.realPressure
    let local: LocalPoint[] | null = null
    let press: number[] | null = null
    const draft: FreedrawElement = {
      ...this.styleProps(),
      groupIds: [],
      frameId: null,
      x: minX,
      y: minY,
      w: this.maxX - minX,
      h: this.maxY - minY,
      get points() {
        if (!local) {
          local = new Array<LocalPoint>(n)
          for (let i = 0; i < n; i++) local[i] = [abs[i]![0] - minX, abs[i]![1] - minY]
        }
        return local
      },
      get pressures() {
        return press ??= real ? all.slice(0, n) : []
      },
      id: 'draft',
      type: 'freedraw',
      highlighter: this.highlighter,
      angle: 0,
      index: 'a0',
      seed: this.seed,
      version: 1,
      locked: false,
    }
    this.host.draft = draft
    this.host.ctx.invalidate()
  }
}
