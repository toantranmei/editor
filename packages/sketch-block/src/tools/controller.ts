import { type Ref, ref, shallowRef } from 'vue'
import type { Box, Point } from '../geometry'
import { elementCorners } from '../geometry/bounds'
import { hitElement } from '../geometry/hit'
import type { History } from '../model/history'
import type { Scene } from '../model/scene'
import type { BoardStore } from '../model/store'
import { type CurrentStyle, INITIAL_STYLE, styleOf, stylePatchFor } from '../model/style'
import type { ElementInit, ElementPatch, SketchElement, TextElement, TextStyle } from '../model/types'
import { linearScenePoints } from '../elements/linear'
import { editedTextBox } from '../elements/text'
import { DEFAULT_STYLE, isLinear, isShape, isText } from '../model/types'
import { stripControl } from '../io/xml'
import { measureText } from '../text/measure'
import type { Overlay } from '../render/interactive'
import type { Viewport } from '../viewport'
import { EraserTool } from './eraser'
import { EyedropperTool } from './eyedropper'
import { HandTool } from './hand'
import { LASER_FADE_MS, type LaserPoint, LaserTool } from './laser'
import { LassoTool } from './lasso'
import { LinearTool } from './linear'
import { PenTool } from './pen'
import { SelectTool } from './select'
import { ShapeTool } from './shape'
import { TextTool } from './text'

export type ToolName =
  | 'hand' | 'select' | 'rectangle' | 'ellipse' | 'diamond' | 'pen' | 'highlighter' | 'line' | 'arrow' | 'text'
  | 'eraser' | 'laser' | 'lasso' | 'eyedropper'

/** Tools with an implementation (besides `hand`); later tasks register theirs here and in TOOL_KEYS. */
type PointerToolName =
  | 'select' | 'rectangle' | 'ellipse' | 'diamond' | 'pen' | 'highlighter' | 'line' | 'arrow' | 'text'
  | 'eraser' | 'laser' | 'lasso' | 'eyedropper'

export type { CurrentStyle }

/** The element whose text (a text element) or label (a shape) is open in the editor overlay. */
export interface EditingTarget {
  id: string
  kind: 'text' | 'label'
}

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
  invalidate: () => void
  /** Clock for the laser trail, in ms (defaults to `performance.now`). */
  now?: () => number
}

/** Shared state the individual tools act on. */
export interface ToolHost {
  readonly ctx: ToolControllerContext
  readonly tool: Ref<ToolName>
  readonly toolLocked: Ref<boolean>
  readonly selectedIds: Ref<Set<string>>
  readonly cursor: Ref<string>
  /** Style new elements are drawn with (edited by the style panel). */
  readonly currentStyle: Ref<CurrentStyle>
  marquee: Box | null
  hoverId: string | null
  draft: SketchElement | null
  /** In-progress multi-point segment (last placed point → pointer), scene coords. */
  previewSegment: [Point, Point] | null
  /** Ids marked by the eraser sweep in progress; replaced by a new Set whenever it changes. */
  erasing: Set<string>
  /** Laser trail (scene coords, host clock times), oldest first. */
  readonly laser: LaserPoint[]
  /** Lasso polygon in progress (scene coords). */
  lasso: Point[] | null
  /** Host clock in ms. */
  now(): number
  setSelection(ids: Iterable<string>): void
  setTool(t: ToolName): void
  /** Back to the tool active before the eyedropper (select if none). */
  restoreTool(): void
  /** Sets the current style and applies the relevant props to the selected, unlocked elements (one undo step). */
  applyStyle(patch: Partial<CurrentStyle>): void
  /** Restores the idle cursor for the current tool / pan state. */
  resetCursor(): void
  /** Text tool click at scene point `p`: edit the text / shape label there, else create a text element. */
  editAt(p: Point): void
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
const CREATORS = new Set<ToolName>(['rectangle', 'ellipse', 'diamond', 'pen', 'highlighter', 'line', 'arrow', 'text'])
/** Tools that write (creators plus the eraser): unavailable when read-only. */
const WRITERS = new Set<ToolName>([...CREATORS, 'eraser', 'eyedropper'])
const TOOL_KEYS: Record<string, 'hand' | PointerToolName> = {
  v: 'select', 1: 'select', h: 'hand',
  r: 'rectangle', 2: 'rectangle', d: 'diamond', 3: 'diamond', o: 'ellipse', 4: 'ellipse',
  a: 'arrow', 5: 'arrow', l: 'line', 6: 'line',
  p: 'pen', 7: 'pen', m: 'highlighter', t: 'text', 8: 'text',
  e: 'eraser', 0: 'eraser', k: 'laser', i: 'eyedropper',
}
/** Non-creating tools that still show a crosshair. */
const POINTERS = new Set<ToolName>(['eraser', 'laser', 'lasso', 'eyedropper'])
/** Offset of pasted / duplicated elements from their originals when there is no pointer position, scene px. */
const PASTE_OFFSET = 16
/** Hit tolerance for picking the element to edit, in screen px. */
const EDIT_HIT_PX = 6
const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
}

/** Routes board input to tools; owns selection, tool state and the interactive overlay. */
export class ToolController implements ToolHost {
  readonly tool: Ref<ToolName> = ref('select')
  readonly toolLocked: Ref<boolean> = ref(false)
  readonly selectedIds: Ref<Set<string>> = ref(new Set())
  readonly cursor: Ref<string> = ref('default')
  readonly currentStyle: Ref<CurrentStyle> = ref({ ...INITIAL_STYLE })
  marquee: Box | null = null
  hoverId: string | null = null
  draft: SketchElement | null = null
  previewSegment: [Point, Point] | null = null
  erasing: Set<string> = new Set()
  readonly laser: LaserPoint[] = []
  lasso: Point[] | null = null
  /** Text / label being edited in the overlay (null = none). Editing counts as an active gesture. */
  readonly editing: Ref<EditingTarget | null> = shallowRef(null)

  /** The edited text element was created for this edit (cancel / empty commit removes it, leaving no undo step). */
  private editCreated = false
  /** Tool to return to when the eyedropper is done. */
  private prevTool: ToolName = 'select'
  /** Style taken by "copy style" (props relevant to the source element's type). */
  private copiedStyle: Partial<CurrentStyle> | null = null
  /** Tool at the last pointer press; a dblclick only acts when it was the select tool. */
  private downTool: ToolName | null = null
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
      text: new TextTool(this),
      eraser: new EraserTool(this),
      laser: new LaserTool(this),
      lasso: new LassoTool(this),
      eyedropper: new EyedropperTool(this),
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
      erasing: this.erasing,
      laser: this.laserTrail() as LaserPoint[],
      lasso: this.lasso,
      now: this.now(),
    }
  }

  now(): number {
    return this.ctx.now ? this.ctx.now() : performance.now()
  }

  /** The live laser trail (points older than the fade time are dropped first). */
  laserTrail(): readonly LaserPoint[] {
    const trail = this.laser
    if (trail.length) {
      const cutoff = this.now() - LASER_FADE_MS
      let n = 0
      while (n < trail.length && trail[n]!.t <= cutoff) n++
      if (n) trail.splice(0, n)
    }
    return trail
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
    if (t === 'eyedropper' && this.tool.value !== 'eyedropper') this.prevTool = this.tool.value
    this.tool.value = t
    if (CREATORS.has(t)) this.setSelection([])
    this.hoverId = null
    this.resetCursor()
    this.ctx.invalidate()
  }

  restoreTool(): void {
    const prev = this.prevTool
    this.prevTool = 'select'
    this.setTool(prev === 'eyedropper' ? 'select' : prev)
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
    this.cursor.value = this.spaceHeld || t === 'hand'
      ? 'grab'
      : t === 'text' ? 'text' : CREATORS.has(t) || POINTERS.has(t) ? 'crosshair' : 'default'
  }

  // ---------- pointer ----------

  pointerDown(e: PointerInput): void {
    // the editor commits on blur, before the board forwards the press; still editing = nothing else acts
    if (this.active || this.editing.value) return
    const panning = e.button === 1 || this.spaceHeld || this.tool.value === 'hand'
    this.downTool = panning ? 'hand' : this.tool.value
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
    return this.active !== null || this.pendingTool() !== null || this.editing.value !== null
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

  /** `code` is the physical key (`KeyC`); copy/paste style match it, as Alt on macOS composes `key`. */
  keyDown(e: { key: string; mod: boolean; shift: boolean; alt?: boolean; code?: string }): boolean {
    // keys belong to the editor overlay while it is open
    if (this.editing.value) return false
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
      if (e.alt && e.code === 'KeyC') {
        return this.copyStyle()
      }
      if (e.alt && e.code === 'KeyV') {
        if (ro) return false
        this.pasteStyle()
        return true
      }
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
      if (k === 'd' && !e.alt) {
        // claimed even with nothing selected, so the browser's bookmark shortcut never fires on the board
        if (ro) return false
        this.duplicate()
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
    // Alt+letter is a menu / OS shortcut on Windows and Linux, and Alt / mod combos are reserved for explicit
    // shortcuts: tool letters and the lock toggle only act on the bare key
    if (e.alt && k.length === 1) return false
    const t = TOOL_KEYS[k]
    if (t) {
      if (ro && WRITERS.has(t)) return false
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

  /** Selected, existing elements in z-order (bottom first): what copy / cut put on the clipboard. */
  selectedElements(): SketchElement[] {
    const sel = this.selectedIds.value
    return sel.size ? this.ctx.scene.elements.filter(el => sel.has(el.id)) : []
  }

  /**
   * Creates copies of `inits` with new ids, keeping their relative layout and z-order, above everything else.
   * The group's top-left lands at `at`, or +16,+16 from the originals when null. One undo step; selects them.
   */
  pasteElements(inits: ElementInit[], at: Point | null): void {
    if (this.ctx.readonly() || this.isGestureActive() || !inits.length) return
    let minX = Infinity
    let minY = Infinity
    for (const el of inits) {
      for (const c of elementCorners(el)) {
        minX = Math.min(minX, c.x)
        minY = Math.min(minY, c.y)
      }
    }
    const dx = at ? at.x - minX : PASTE_OFFSET
    const dy = at ? at.y - minY : PASTE_OFFSET
    const copies = inits.map(init => {
      // new id; the store assigns index / version
      const { id: _id, index: _index, version: _version, ...rest } = init as ElementInit & Partial<SketchElement>
      const copy = { ...rest, x: init.x + dx, y: init.y + dy } as ElementInit
      // fresh arrays: never share a source's arrays
      if ('points' in copy) copy.points = copy.points.map(p => [p[0], p[1]])
      if ('pressures' in copy) copy.pressures = [...copy.pressures]
      return copy
    })
    this.insert(copies)
  }

  /** Creates an auto-sized text element (current text style) with its top-left at `at`; one undo step. */
  pasteText(text: string, at: Point | null): void {
    if (this.ctx.readonly() || this.isGestureActive()) return
    const value = stripControl(text.replace(/\r\n?/g, '\n'))
    if (!value.trim()) return
    const p = at ?? this.ctx.viewport.toScene({ x: PASTE_OFFSET, y: PASTE_OFFSET })
    const { stroke, strokeWidth, strokeStyle, roughness, roundness, opacity, ...style } = this.currentStyle.value
    const { fill, fillStyle } = DEFAULT_STYLE
    const font: TextStyle = { fontFamily: style.fontFamily, fontSize: style.fontSize, textAlign: style.textAlign }
    const { w, h } = measureText(value, font, null)
    this.insert([{
      stroke, fill, fillStyle, strokeWidth, strokeStyle, roughness, roundness, opacity,
      ...font, type: 'text', text: value, autoSize: true,
      x: p.x, y: p.y, w, h, angle: 0, locked: false,
    }])
  }

  /** Copies of the selected, unlocked elements, offset +16,+16 (mod+d). */
  duplicate(): void {
    const els = this.movableSelection()
    if (!els.length) return
    const order = new Set(els.map(el => el.id))
    this.pasteElements(this.ctx.scene.elements.filter(el => order.has(el.id)), null)
  }

  /** Creates `inits` as one undo step and selects them (back to select from a drawing tool). */
  private insert(inits: ElementInit[]): void {
    const { history, store } = this.ctx
    history.stopCapturing()
    const created = store.createMany(inits)
    history.stopCapturing()
    if (CREATORS.has(this.tool.value)) this.setTool('select')
    this.setSelection(created.map(el => el.id))
  }

  selectAll(): void {
    this.setSelection(this.ctx.scene.elements.map(el => el.id))
  }

  applyStyle(patch: Partial<CurrentStyle>): void {
    const next = { ...this.currentStyle.value }
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (next as Record<string, unknown>)[k] = v
    this.currentStyle.value = next
    if (this.ctx.readonly()) return
    const patches: Record<string, ElementPatch> = {}
    for (const el of this.movableSelection()) {
      const p: ElementPatch | null = stylePatchFor(el, patch)
      if (!p) continue
      // an auto-sized / wrapped text refits to its new font
      patches[el.id] = isText(el) ? { ...p, ...editedTextBox({ ...el, ...p } as TextElement, el.text) } : p
    }
    if (!Object.keys(patches).length) return
    this.ctx.history.stopCapturing()
    this.ctx.store.updateMany(patches)
    this.ctx.history.stopCapturing()
  }

  /** Takes the style of the first selected element; false when nothing is selected. */
  copyStyle(): boolean {
    const id = this.selectedIds.value.values().next().value
    const el = id === undefined ? undefined : this.ctx.scene.get(id)
    if (!el) return false
    this.copiedStyle = styleOf(el)
    return true
  }

  /** Applies the copied style to the selection (and the current style). */
  pasteStyle(): void {
    if (this.copiedStyle) this.applyStyle(this.copiedStyle)
  }

  /** Moves the selected, unlocked elements to the front / back, keeping their relative order (one undo step). */
  reorderSelection(to: 'front' | 'back'): void {
    if (this.ctx.readonly()) return
    const els = this.movableSelection()
    if (!els.length) return
    const { history, store } = this.ctx
    history.stopCapturing()
    store.reorderMany(els.map(el => el.id), to)
    history.stopCapturing()
  }

  // ---------- text editing ----------

  /**
   * Double-click at a screen point with the select tool: edits a text element or a shape's label there, or
   * creates a text element on empty canvas. Ignored unless the press began with the select tool (a click that
   * finished a line/arrow switches to select on pointerup, and its dblclick must do nothing).
   */
  doubleClick(screen: Point): void {
    if (this.ctx.readonly() || this.editing.value || this.active) return
    if (this.tool.value !== 'select' || this.downTool !== 'select') return
    const p = this.ctx.viewport.toScene(screen)
    const hit = this.editableAt(p)
    if (!hit) this.createText(p)
    else this.editElement(hit)
  }

  editAt(p: Point): void {
    if (this.ctx.readonly() || this.editing.value) return
    const hit = this.editableAt(p)
    if (!hit || !this.editElement(hit)) this.createText(p)
  }

  /** Opens the editor on an existing text element (`text`) or shape (`label`). */
  startEditing(id: string, kind: EditingTarget['kind']): void {
    if (this.ctx.readonly() || this.editing.value) return
    const el = this.ctx.scene.get(id)
    if (!el || el.locked || (kind === 'text' ? !isText(el) : !isShape(el))) return
    this.ctx.history.beginGesture()
    this.openEditor(id, kind, false)
  }

  /**
   * Ends the edit with the editor's value. Text: blank removes the element, else sets the text and refits the
   * box. Label: sets it. Creation plus commit is one undo step.
   */
  commitEditing(raw: string): void {
    const target = this.editing.value
    if (!target) return
    const value = stripControl(raw)
    const created = this.closeEditor()
    const { store, scene, history } = this.ctx
    const el = scene.get(target.id)
    if (el && target.kind === 'text' && isText(el)) {
      if (value.trim() === '') {
        store.remove([el.id])
        if (created) history.discardGesture()
        else history.endGesture()
      } else {
        const patch = changedProps(el, { text: value, ...editedTextBox(el, value) })
        if (patch) store.update(el.id, patch)
        history.endGesture()
        this.setSelection([el.id])
      }
    } else if (el && target.kind === 'label' && isShape(el)) {
      if (el.label !== value) store.update(el.id, { label: value })
      history.endGesture()
      this.setSelection([el.id])
    } else {
      history.endGesture()
    }
    this.afterEditing()
  }

  /** Ends the edit discarding the editor's value: a text element created for it is removed, with no undo step. */
  cancelEditing(): void {
    const target = this.editing.value
    if (!target) return
    const created = this.closeEditor()
    if (created && this.ctx.scene.get(target.id)) this.ctx.store.remove([target.id])
    this.ctx.history.discardGesture()
    this.afterEditing()
  }

  /** Creates an empty text element centered vertically on `p` (current text style) and edits it. */
  private createText(p: Point): void {
    // text has no background: it never takes the current fill
    const { stroke, strokeWidth, strokeStyle, roughness, roundness, opacity, ...style } = this.currentStyle.value
    const { fill, fillStyle } = DEFAULT_STYLE
    const font: TextStyle = { fontFamily: style.fontFamily, fontSize: style.fontSize, textAlign: style.textAlign }
    const { h } = measureText('', font, null)
    const { history, store } = this.ctx
    history.beginGesture()
    const el = store.create({
      stroke, fill, fillStyle, strokeWidth, strokeStyle, roughness, roundness, opacity,
      ...font, type: 'text', text: '', autoSize: true,
      x: p.x, y: p.y - h / 2, w: 0, h, angle: 0, locked: false,
    })
    this.openEditor(el.id, 'text', true)
  }

  /** Starts editing `el` if it is an unlocked text or shape; false otherwise. */
  private editElement(el: SketchElement): boolean {
    if (el.locked || !(isText(el) || isShape(el))) return false
    this.startEditing(el.id, isText(el) ? 'text' : 'label')
    return this.editing.value !== null
  }

  /** Topmost element at `p`; inside an unfilled shape (which only hits on its outline) that shape. */
  private editableAt(p: Point): SketchElement | undefined {
    const { scene, viewport } = this.ctx
    const tol = EDIT_HIT_PX / viewport.zoom
    const hit = scene.hitTest(p, tol)
    if (hit) return hit
    const under = scene.queryBox({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y })
    for (let i = under.length - 1; i >= 0; i--) {
      const el = under[i]!
      if (isShape(el) && hitElement({ ...el, fill: '#000000', fillStyle: 'solid' }, p, tol)) return el
    }
    return undefined
  }

  private openEditor(id: string, kind: EditingTarget['kind'], created: boolean): void {
    this.editCreated = created
    this.hoverId = null
    this.setSelection([])
    this.editing.value = { id, kind }
    this.ctx.invalidate()
  }

  /** Clears the editing state; returns whether the element was created for this edit. */
  private closeEditor(): boolean {
    const created = this.editCreated
    this.editCreated = false
    this.editing.value = null
    return created
  }

  /** After an edit from the text tool: back to select unless the tool is locked. */
  private afterEditing(): void {
    if (this.tool.value === 'text' && !this.toolLocked.value) this.setTool('select')
    this.ctx.invalidate()
  }

  destroy(): void {
    this.cancelEditing()
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
    const target = this.editing.value
    if (target && !scene.get(target.id)) {
      // deleted remotely while open: close the editor, keeping whatever undo step the edit made
      this.closeEditor()
      this.ctx.history.endGesture()
      this.ctx.invalidate()
    }
    const cur = this.selectedIds.value
    const kept = [...cur].filter(id => scene.get(id))
    if (kept.length !== cur.size) this.setSelection(kept)
    if (this.hoverId && !scene.get(this.hoverId)) {
      this.hoverId = null
      this.ctx.invalidate()
    }
  }
}

/** The entries of `next` that differ from `el`, or null when none do. */
function changedProps(el: TextElement, next: Partial<TextElement>): ElementPatch | null {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(next)) {
    if ((el as unknown as Record<string, unknown>)[k] !== v) out[k] = v
  }
  return Object.keys(out).length ? out as ElementPatch : null
}
