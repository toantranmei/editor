import { type Ref, ref } from 'vue'
import type { Box, Point } from '../geometry'
import type { History } from '../model/history'
import type { Scene } from '../model/scene'
import type { BoardStore } from '../model/store'
import type { DEFAULT_STYLE, ElementPatch, SketchElement } from '../model/types'
import { linearScenePoints } from '../elements/linear'
import { isLinear } from '../model/types'
import type { Overlay } from '../render/interactive'
import type { Viewport } from '../viewport'
import { HandTool } from './hand'
import { LinearTool } from './linear'
import { PenTool } from './pen'
import { SelectTool } from './select'
import { ShapeTool } from './shape'

export type ToolName =
  | 'hand' | 'select' | 'rectangle' | 'ellipse' | 'diamond' | 'pen' | 'highlighter' | 'line' | 'arrow' | 'text'
  | 'eraser' | 'laser' | 'lasso' | 'eyedropper'

/** Tools with an implementation (besides `hand`); later tasks register theirs here and in TOOL_KEYS. */
type PointerToolName = 'select' | 'rectangle' | 'ellipse' | 'diamond' | 'pen' | 'highlighter' | 'line' | 'arrow'

export interface PointerInput {
  screen: Point
  button: number
  shift: boolean
  alt: boolean
  mod: boolean
  pressure: number
  /** Screen points of the coalesced events behind this move (last = `screen`); drawing tools consume all. */
  coalesced?: (Point & { pressure?: number })[]
}

export interface ToolControllerContext {
  store: BoardStore
  scene: Scene
  history: History
  viewport: Viewport
  readonly: () => boolean
  style: () => typeof DEFAULT_STYLE
  invalidate: () => void
}

/** Shared state the individual tools act on. */
export interface ToolHost {
  readonly ctx: ToolControllerContext
  readonly tool: Ref<ToolName>
  readonly toolLocked: Ref<boolean>
  readonly selectedIds: Ref<Set<string>>
  readonly cursor: Ref<string>
  marquee: Box | null
  hoverId: string | null
  draft: SketchElement | null
  /** In-progress multi-point segment (last placed point → pointer), scene coords. */
  previewSegment: [Point, Point] | null
  setSelection(ids: Iterable<string>): void
  setTool(t: ToolName): void
  /** Restores the idle cursor for the current tool / pan state. */
  resetCursor(): void
}

/** A gesture handler; `p` is the pointer in scene coordinates. */
export interface Tool {
  down(e: PointerInput, p: Point): void
  move(e: PointerInput, p: Point): void
  up(e: PointerInput, p: Point): void
  /** Pointer movement with no button pressed. */
  hover?(e: PointerInput, p: Point): void
  /** Abort an in-progress gesture (tool switch, destroy). */
  cancel?(): void
  /** The tool holds a gesture open between pointer presses (multi-point line/arrow). */
  pending?(): boolean
  /** Completes a pending gesture (Enter / Escape). */
  finish?(): void
}

/** Tools that create elements: crosshair cursor, clear the selection, unavailable when read-only. */
const CREATORS = new Set<ToolName>(['rectangle', 'ellipse', 'diamond', 'pen', 'highlighter', 'line', 'arrow'])
const TOOL_KEYS: Record<string, 'hand' | PointerToolName> = {
  v: 'select', 1: 'select', h: 'hand',
  r: 'rectangle', 2: 'rectangle', d: 'diamond', 3: 'diamond', o: 'ellipse', 4: 'ellipse',
  a: 'arrow', 5: 'arrow', l: 'line', 6: 'line',
  p: 'pen', 7: 'pen', m: 'highlighter',
}
const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
}

/** Routes board input to tools; owns selection, tool state and the interactive overlay. */
export class ToolController implements ToolHost {
  readonly tool: Ref<ToolName> = ref('select')
  readonly toolLocked: Ref<boolean> = ref(false)
  readonly selectedIds: Ref<Set<string>> = ref(new Set())
  readonly cursor: Ref<string> = ref('default')
  marquee: Box | null = null
  hoverId: string | null = null
  draft: SketchElement | null = null
  previewSegment: [Point, Point] | null = null

  private readonly hand: HandTool
  private readonly tools: Record<PointerToolName, Tool>
  private active: Tool | null = null
  private spaceHeld = false
  private readonly off: () => void

  constructor(readonly ctx: ToolControllerContext) {
    this.hand = new HandTool(this)
    const select = new SelectTool(this)
    this.tools = {
      select,
      rectangle: new ShapeTool(this, 'rectangle'),
      ellipse: new ShapeTool(this, 'ellipse'),
      diamond: new ShapeTool(this, 'diamond'),
      pen: new PenTool(this, false),
      highlighter: new PenTool(this, true),
      line: new LinearTool(this, 'line'),
      arrow: new LinearTool(this, 'arrow'),
    }
    this.off = ctx.scene.onChange(() => this.pruneSelection())
  }

  overlay(): Overlay {
    return {
      selectedIds: this.selectedIds.value,
      marquee: this.marquee,
      hoverId: this.hoverId,
      draft: this.draft,
      pointHandles: this.pointHandles(),
      previewSegment: this.previewSegment,
    }
  }

  /** Scene points of the single selected, unlocked line/arrow (editable), else null. */
  pointHandles(): Point[] | null {
    const sel = this.selectedIds.value
    if (sel.size !== 1 || this.ctx.readonly()) return null
    const el = this.ctx.scene.get([...sel][0]!)
    return el && !el.locked && isLinear(el) ? linearScenePoints(el) : null
  }

  /** Switches tool; tools without an implementation yet are ignored. */
  setTool(t: ToolName): void {
    if (t !== 'hand' && !(t in this.tools)) return
    const pending = this.pendingTool()
    this.active?.cancel?.()
    if (pending !== this.active) pending?.cancel?.()
    this.active = null
    this.tool.value = t
    if (CREATORS.has(t)) this.setSelection([])
    this.hoverId = null
    this.resetCursor()
    this.ctx.invalidate()
  }

  setSelection(ids: Iterable<string>): void {
    const next = new Set(ids)
    const cur = this.selectedIds.value
    if (next.size === cur.size && [...next].every(id => cur.has(id))) return
    this.selectedIds.value = next
    this.ctx.invalidate()
  }

  resetCursor(): void {
    const t = this.tool.value
    this.cursor.value = this.spaceHeld || t === 'hand' ? 'grab' : CREATORS.has(t) ? 'crosshair' : 'default'
  }

  // ---------- pointer ----------

  pointerDown(e: PointerInput): void {
    if (this.active) return
    const panning = e.button === 1 || this.spaceHeld || this.tool.value === 'hand'
    if (!panning && e.button !== 0) return
    this.active = panning ? this.hand : this.tools[this.tool.value as PointerToolName]
    this.active.down(e, this.toScene(e))
  }

  pointerMove(e: PointerInput): void {
    const p = this.toScene(e)
    if (this.active) {
      this.active.move(e, p)
      return
    }
    if (this.spaceHeld || this.tool.value === 'hand') return
    this.tools[this.tool.value as PointerToolName].hover?.(e, p)
  }

  pointerUp(e: PointerInput): void {
    const tool = this.active
    if (!tool) return
    this.active = null
    tool.up(e, this.toScene(e))
  }

  /**
   * A gesture (draw, move, resize, rotate, marquee, pan, point drag) is in progress, including a multi-point
   * line/arrow that is open between clicks.
   */
  isGestureActive(): boolean {
    return this.active !== null || this.pendingTool() !== null
  }

  /** Aborts the gesture: drafts are discarded, a move/resize/rotate reverts with no undo step. */
  cancelGesture(): void {
    const tool = this.active
    const pending = this.pendingTool()
    if (!tool && !pending) return
    this.active = null
    tool?.cancel?.()
    if (pending && pending !== tool) pending.cancel?.()
    this.resetCursor()
    this.ctx.invalidate()
  }

  /** The current tool when it holds a multi-click gesture open. */
  private pendingTool(): Tool | null {
    const t = this.tool.value
    if (t === 'hand') return null
    const tool = this.tools[t as PointerToolName]
    return tool?.pending?.() ? tool : null
  }

  private toScene(e: PointerInput): Point {
    return this.ctx.viewport.toScene(e.screen)
  }

  // ---------- keyboard ----------

  keyDown(e: { key: string; mod: boolean; shift: boolean }): boolean {
    const ro = this.ctx.readonly()
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    const pending = this.pendingTool()
    if (pending && (k === 'Enter' || k === 'Escape') && this.active !== this.hand) {
      // Enter / Escape complete a multi-point line or arrow (fewer than 2 points → nothing)
      this.active = null
      pending.finish?.()
      this.resetCursor()
      this.ctx.invalidate()
      return true
    }
    if (this.isGestureActive() && k !== ' ') {
      // mid-gesture: only Escape (cancel) and Space (pan modifier) act
      if (k !== 'Escape') return false
      this.cancelGesture()
      return true
    }
    if (e.mod) {
      if (k === 'z' || k === 'y') {
        if (ro) return false
        this.ctx.history.stopCapturing()
        if (k === 'y' || e.shift) this.ctx.history.redo()
        else this.ctx.history.undo()
        return true
      }
      if (k === 'a') {
        this.selectAll()
        return true
      }
      return false
    }
    if (k === ' ') {
      if (!this.spaceHeld) {
        this.spaceHeld = true
        if (!this.active) this.resetCursor()
      }
      return true
    }
    const t = TOOL_KEYS[k]
    if (t) {
      if (ro && CREATORS.has(t)) return false
      this.setTool(t)
      return true
    }
    if (k === 'q') {
      if (ro) return false
      this.toolLocked.value = !this.toolLocked.value
      return true
    }
    if (k === 'Escape') {
      this.setSelection([])
      return true
    }
    if (k === 'Delete' || k === 'Backspace') {
      if (ro || !this.selectedIds.value.size) return false
      this.deleteSelection()
      return true
    }
    const dir = NUDGE[k]
    if (dir) {
      if (ro || !this.selectedIds.value.size) return false
      const step = e.shift ? 10 : 1
      this.nudge(dir[0] * step, dir[1] * step)
      return true
    }
    return false
  }

  keyUp(e: { key: string }): void {
    if (e.key !== ' ' || !this.spaceHeld) return
    this.spaceHeld = false
    if (!this.active) this.resetCursor()
  }

  // ---------- commands ----------

  deleteSelection(): void {
    if (this.ctx.readonly()) return
    const ids = this.movableSelection().map(el => el.id)
    if (!ids.length) return
    const { history, store } = this.ctx
    history.stopCapturing()
    store.remove(ids)
    history.stopCapturing()
  }

  selectAll(): void {
    this.setSelection(this.ctx.scene.elements.map(el => el.id))
  }

  destroy(): void {
    const pending = this.pendingTool()
    this.active?.cancel?.()
    if (pending !== this.active) pending?.cancel?.()
    this.active = null
    this.off()
  }

  private nudge(dx: number, dy: number): void {
    const patches: Record<string, ElementPatch> = {}
    for (const el of this.movableSelection()) patches[el.id] = { x: el.x + dx, y: el.y + dy }
    if (!Object.keys(patches).length) return
    this.ctx.history.stopCapturing()
    this.ctx.store.updateMany(patches)
    this.ctx.history.stopCapturing()
  }

  /** Selected, existing, unlocked elements. */
  private movableSelection(): SketchElement[] {
    const out: SketchElement[] = []
    for (const id of this.selectedIds.value) {
      const el = this.ctx.scene.get(id)
      if (el && !el.locked) out.push(el)
    }
    return out
  }

  private pruneSelection(): void {
    const { scene } = this.ctx
    const cur = this.selectedIds.value
    const kept = [...cur].filter(id => scene.get(id))
    if (kept.length !== cur.size) this.setSelection(kept)
    if (this.hoverId && !scene.get(this.hoverId)) {
      this.hoverId = null
      this.ctx.invalidate()
    }
  }
}
