import { type Ref, ref, shallowRef } from 'vue'
import type { Box, Point } from '../geometry'
import { elementCorners } from '../geometry/bounds'
import { hitElement } from '../geometry/hit'
import type { History } from '../model/history'
import type { Scene } from '../model/scene'
import type { BoardStore } from '../model/store'
import { type CurrentStyle, INITIAL_STYLE, styleOf, stylePatchFor } from '../model/style'
import type {
  ElementInit, ElementPatch, ElementType, ImageElement, LinearType, ShapeType, SketchElement, StickyElement,
  TextElement, TextStyle,
} from '../model/types'
import {
  cleanFrameName, frameDeletePatches, membershipPatches, withFrameChildren,
} from '../elements/frame'
import { linearScenePoints } from '../elements/linear'
import { editedTextBox } from '../elements/text'
import {
  DEFAULT_STYLE, isFrame, isImage, isImageSrc, isLinear, isShape, isSticky, isText, LINEAR_TYPES, SHAPE_TYPES,
  stickyInit,
} from '../model/types'
import { fitWithin, type PreparedImage } from '../io/image-insert'
import { stripControl } from '../io/xml'
import { measureText } from '../text/measure'
import { frameLabelAt } from '../render/frame-labels'
import type { Overlay } from '../render/interactive'
import type { Viewport } from '../viewport'
import { CropTool } from './crop'
import { EraserTool } from './eraser'
import { EyedropperTool } from './eyedropper'
import { FrameTool } from './frame'
import { HandTool } from './hand'
import { LASER_FADE_MS, type LaserPoint, LaserTool } from './laser'
import { LassoTool } from './lasso'
import { LinearTool } from './linear'
import { PenTool } from './pen'
import { SelectTool } from './select'
import { ShapeTool } from './shape'
import { StickyTool } from './sticky'
import { TextTool } from './text'

/** Tools with an implementation (besides `hand`); each shape type has a tool of the same name. */
type PointerToolName =
  | 'select' | ShapeType | 'pen' | 'highlighter' | LinearType | 'text' | 'sticky' | 'frame'
  | 'eraser' | 'laser' | 'lasso' | 'eyedropper'

export type ToolName = 'hand' | PointerToolName

/** Element type each creating tool makes (shape and linear tools are named after their type). */
export const TOOL_ELEMENT_TYPES: Readonly<Partial<Record<ToolName, ElementType>>> = {
  ...Object.fromEntries(SHAPE_TYPES.map(t => [t, t])),
  ...Object.fromEntries(LINEAR_TYPES.map(t => [t, t])),
  pen: 'freedraw',
  highlighter: 'freedraw',
  text: 'text',
  sticky: 'sticky',
  frame: 'frame',
}

/** Tools that create elements: crosshair cursor, clear the selection, unavailable when read-only. */
export const CREATOR_TOOLS: ReadonlySet<ToolName> = new Set(Object.keys(TOOL_ELEMENT_TYPES) as ToolName[])

export type { CurrentStyle }

/**
 * The element whose text (a text element or sticky note), label (a shape) or name (a frame) is open in the editor
 * overlay.
 */
export interface EditingTarget {
  id: string
  kind: 'text' | 'label' | 'sticky' | 'frame'
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
  /** Scene point at the center of the visible canvas (where an image without a drop point goes). */
  viewCenter?: () => Point
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
  /** Creates a sticky note with box `box` (last used sticky color, current font) and edits it. */
  createSticky(box: { x: number; y: number; w: number; h: number }): void
  /** Creates a frame with box `box` named "Frame N", at the back, taking in the elements inside it. */
  createFrame(box: { x: number; y: number; w: number; h: number }): void
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

const CREATORS = CREATOR_TOOLS
/** Tools that write (creators plus the eraser): unavailable when read-only. */
const WRITERS = new Set<ToolName>([...CREATORS, 'eraser', 'eyedropper'])
const TOOL_KEYS: Record<string, 'hand' | PointerToolName> = {
  v: 'select', 1: 'select', h: 'hand',
  r: 'rectangle', 2: 'rectangle', d: 'diamond', 3: 'diamond', o: 'ellipse', 4: 'ellipse',
  a: 'arrow', 5: 'arrow', l: 'line', 6: 'line',
  p: 'pen', 7: 'pen', m: 'highlighter', t: 'text', 8: 'text', s: 'sticky', f: 'frame',
  e: 'eraser', 0: 'eraser', k: 'laser', i: 'eyedropper',
}
/** Non-creating tools that still show a crosshair. */
const POINTERS = new Set<ToolName>(['eraser', 'laser', 'lasso', 'eyedropper'])
/** Offset of pasted / duplicated elements from their originals when there is no pointer position, scene px. */
const PASTE_OFFSET = 16
/** Gap between a sticky and the next one quick-created beside it (Tab / mod+Enter), scene units. */
const STICKY_GAP = 20
/** Hit tolerance for picking the element to edit, in screen px. */
const EDIT_HIT_PX = 6
/** An inserted image is scaled down (never up) to fit a square of this side, scene units. */
export const IMAGE_INSERT_BOX = 600
const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
}

/** One shape tool per shape type. */
function shapeTools(host: ToolHost): Record<ShapeType, Tool> {
  return Object.fromEntries(SHAPE_TYPES.map(t => [t, new ShapeTool(host, t)])) as unknown as Record<ShapeType, Tool>
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
  /** Id of the image in crop mode (null = none). Cropping counts as an active gesture. */
  readonly cropping: Ref<string | null> = ref(null)

  /**
   * The edited element was created for this edit: cancel removes it, leaving no undo step (an empty commit too,
   * for a text element).
   */
  private editCreated = false
  /** Images prepared while a gesture was active: inserted (one undo step each) once it ends. */
  private readonly queuedImages: Array<{ info: PreparedImage; at: Point | null }> = []
  /** Tool to return to when the eyedropper is done. */
  private prevTool: ToolName = 'select'
  /** Style taken by "copy style" (props relevant to the source element's type). */
  private copiedStyle: Partial<CurrentStyle> | null = null
  /** Tool at the last pointer press; a dblclick only acts when it was the select tool. */
  private downTool: ToolName | null = null
  private readonly hand: HandTool
  private readonly crop: CropTool
  private readonly tools: Record<PointerToolName, Tool>
  private readonly select: SelectTool
  private active: Tool | null = null
  private spaceHeld = false
  private readonly off: () => void

  constructor(readonly ctx: ToolControllerContext) {
    this.hand = new HandTool(this)
    this.crop = new CropTool(this)
    const select = new SelectTool(this)
    this.select = select
    this.tools = {
      select,
      ...shapeTools(this),
      pen: new PenTool(this, false),
      highlighter: new PenTool(this, true),
      line: new LinearTool(this, 'line'),
      arrow: new LinearTool(this, 'arrow'),
      text: new TextTool(this),
      sticky: new StickyTool(this),
      frame: new FrameTool(this),
      eraser: new EraserTool(this),
      laser: new LaserTool(this),
      lasso: new LassoTool(this),
      eyedropper: new EyedropperTool(this),
    }
    this.off = ctx.scene.onChange(() => this.pruneSelection())
  }

  overlay(): Overlay {
    const crop = this.cropping.value ? this.crop.overlay() : null
    return {
      // the crop UI replaces the selection box and hover outline
      selectedIds: crop ? new Set() : this.selectedIds.value,
      marquee: this.marquee,
      hoverId: crop ? null : this.hoverId,
      draft: this.draft,
      pointHandles: this.pointHandles(),
      previewSegment: this.previewSegment,
      erasing: this.erasing,
      laser: this.laserTrail() as LaserPoint[],
      lasso: this.lasso,
      now: this.now(),
      crop,
      editingFrameId: this.editing.value?.kind === 'frame' ? this.editing.value.id : null,
    }
  }

  /**
   * Ids of every element the select tool's move in progress moves, frame children included (empty when none):
   * for follow-ups that must also cover elements moved indirectly (bound arrows).
   */
  movedIds(): string[] {
    return this.select.movedIds()
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
    if (this.cropping.value) this.commitCrop()
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
    this.afterGesture()
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
    if (!panning && this.cropping.value) {
      // a press on the crop rect / handles drags it; anywhere else commits the crop (and does nothing more)
      this.downTool = null
      if (this.crop.grab(this.toScene(e))) this.active = this.crop
      else this.commitCrop()
      return
    }
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
    if (this.cropping.value) this.crop.hover(e, p)
    else this.tools[this.tool.value as PointerToolName].hover?.(e, p)
  }

  pointerUp(e: PointerInput): void {
    const tool = this.active
    if (!tool) return
    this.active = null
    tool.up(e, this.toScene(e))
    this.afterGesture()
  }

  /**
   * The browser took the pointer away (pointercancel / lostpointercapture); its coordinates are meaningless.
   * A select gesture (move, resize, rotate, point drag, marquee) is reverted; any other gesture (pen, lasso,
   * shape, line, eraser, pan) ends as a pointerup at `last`, the last position the board saw.
   */
  pointerCancel(last: PointerInput): void {
    const tool = this.active
    if (!tool) return
    if (tool === this.tools.select) this.cancelGesture()
    else this.pointerUp(last)
  }

  /**
   * A gesture (draw, move, resize, rotate, marquee, pan, point drag) is in progress, including a multi-point
   * line/arrow that is open between clicks.
   */
  isGestureActive(): boolean {
    return this.active !== null || this.pendingTool() !== null || this.editing.value !== null
      || this.cropping.value !== null
  }

  /** Aborts the gesture: drafts are discarded, a move/resize/rotate reverts with no undo step, crop mode ends. */
  cancelGesture(): void {
    if (this.cropping.value) {
      if (this.active === this.crop) this.active = null
      this.cancelCrop()
    }
    const tool = this.active
    const pending = this.pendingTool()
    if (!tool && !pending) return
    this.active = null
    tool?.cancel?.()
    if (pending && pending !== tool) pending.cancel?.()
    this.resetCursor()
    this.ctx.invalidate()
    this.afterGesture()
  }

  /**
   * Called wherever a gesture may have ended (pointerup, cancel, editor close, crop end, line finish, tool
   * switch): inserts the images queued meanwhile, unless another gesture is still open.
   */
  private afterGesture(): void {
    if (!this.queuedImages.length || this.isGestureActive()) return
    const queued = this.queuedImages.splice(0)
    if (this.ctx.readonly()) return
    for (const q of queued) this.placeImage(q.info, q.at)
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
    if (this.cropping.value && (k === 'Enter' || k === 'Escape')) {
      // Enter commits the crop, Escape cancels it
      if (this.active === this.crop) this.active = null
      if (k === 'Enter') this.commitCrop()
      else this.cancelCrop()
      this.resetCursor()
      return true
    }
    const pending = this.pendingTool()
    if (pending && (k === 'Enter' || k === 'Escape') && this.active !== this.hand) {
      // Enter / Escape complete a multi-point line or arrow (fewer than 2 points → nothing)
      this.active = null
      pending.finish?.()
      this.resetCursor()
      this.ctx.invalidate()
      this.afterGesture()
      return true
    }
    if (this.isGestureActive() && k !== ' ') {
      // mid-gesture: only Escape (cancel) and Space (pan modifier) act
      if (k !== 'Escape') return false
      this.cancelGesture()
      return true
    }
    // quick create (before the mod / alt guards): the next sticky beside the single selected one
    if ((k === 'Tab' && !e.mod && !e.alt && !e.shift) || (k === 'Enter' && e.mod && !e.alt && !e.shift)) {
      if (!ro && this.quickCreateSticky()) return true
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
    if (k === 'Enter' && !e.shift && !e.alt) {
      // Enter with one image selected: crop it
      const id = this.selectedIds.value.size === 1 ? [...this.selectedIds.value][0]! : null
      if (id && this.startCrop(id)) return true
    }
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
    const { history, store, scene } = this.ctx
    history.stopCapturing()
    // a deleted frame's children leave it, in the same transaction
    store.remove(ids, frameDeletePatches(scene, ids))
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

  /**
   * Creates an image element from a prepared image: scaled down to fit IMAGE_INSERT_BOX (ratio kept), centered
   * at `at`, else at the view center. One undo step; selects it. Ignored for a src with a disallowed scheme
   * (blob: included). During a gesture it is queued and inserted when the gesture ends.
   */
  insertImage(info: PreparedImage, at: Point | null): void {
    if (this.ctx.readonly()) return
    const { src, naturalW, naturalH } = info
    // blob: URLs die with the page: never stored
    if (!isImageSrc(src, false) || !(naturalW > 0 && naturalH > 0)) return
    // an upload can finish mid-gesture (drag, crop, text editing): insert it once the gesture ends
    if (this.isGestureActive()) {
      this.queuedImages.push({ info: { src, naturalW, naturalH }, at: at && { x: at.x, y: at.y } })
      return
    }
    this.placeImage(info, at)
  }

  private placeImage(info: PreparedImage, at: Point | null): void {
    const { src, naturalW, naturalH } = info
    const { w, h } = fitWithin(naturalW, naturalH, IMAGE_INSERT_BOX)
    const c = at ?? this.ctx.viewCenter?.() ?? (() => {
      const p = this.ctx.viewport.toScene({ x: PASTE_OFFSET, y: PASTE_OFFSET })
      return { x: p.x + w / 2, y: p.y + h / 2 }
    })()
    this.insert([{
      ...DEFAULT_STYLE, opacity: 1,
      type: 'image', src, naturalW, naturalH, crop: null,
      x: c.x - w / 2, y: c.y - h / 2, w, h, angle: 0, locked: false,
    }])
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

  /**
   * Creates `inits` as one undo step and selects them (back to select from a drawing tool). Frames go to the back;
   * frame membership is computed for the new elements (and what new frames take in).
   */
  private insert(inits: ElementInit[], keepTool = false): void {
    const { history, store, scene } = this.ctx
    history.beginGesture()
    const others = store.createMany(inits.filter(i => i.type !== 'frame'))
    const frames = store.createMany(inits.filter(i => i.type === 'frame'), { atBack: true })
    const created = [...others, ...frames]
    const patches = membershipPatches(scene, created.map(el => el.id))
    if (Object.keys(patches).length) store.updateMany(patches)
    history.endGesture()
    if (!keepTool && CREATORS.has(this.tool.value)) this.setTool('select')
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
    if (this.cropping.value) {
      // a double-click on the crop rect finishes cropping
      this.commitCrop()
      return
    }
    if (this.tool.value !== 'select' || this.downTool !== 'select') return
    const p = this.ctx.viewport.toScene(screen)
    // a frame's name label (drawn above everything): rename it
    const label = frameLabelAt(this.ctx.scene, p, this.ctx.viewport.zoom)
    if (label) {
      this.editElement(label)
      return
    }
    const hit = this.editableAt(p)
    if (!hit) this.createText(p)
    else if (isImage(hit)) this.startCrop(hit.id)
    else this.editElement(hit)
  }

  // ---------- crop ----------

  /**
   * Enters crop mode on the unlocked image `id` (it becomes the only selected element). The crop is one undo
   * step: nothing is written until `commitCrop`. False when it does not apply.
   */
  startCrop(id: string): boolean {
    if (this.ctx.readonly() || this.editing.value || this.cropping.value || this.active || this.pendingTool()) return false
    const el = this.ctx.scene.get(id)
    if (!el || el.locked || !isImage(el) || !this.crop.begin(el as ImageElement)) return false
    this.ctx.history.beginGesture()
    this.setSelection([id])
    this.cropping.value = id
    this.hoverId = null
    this.ctx.invalidate()
    return true
  }

  /** Leaves crop mode writing the new crop and box (one undo step; none when nothing changed or read-only). */
  commitCrop(): void {
    const id = this.cropping.value
    if (!id) return
    const { store, scene, history } = this.ctx
    // applied to the element as it is now (a peer may have moved it); nothing when it is gone or read-only
    const cur = scene.get(id)
    const patch = cur && isImage(cur) && !this.ctx.readonly() ? this.crop.patch(cur) : null
    this.endCrop()
    if (patch) {
      store.update(id, patch)
      history.endGesture()
    } else {
      history.discardGesture()
    }
    this.ctx.invalidate()
    this.afterGesture()
  }

  /** Leaves crop mode without writing. */
  cancelCrop(): void {
    if (!this.cropping.value) return
    this.endCrop()
    this.ctx.history.discardGesture()
    this.ctx.invalidate()
    this.afterGesture()
  }

  private endCrop(): void {
    if (this.active === this.crop) this.active = null
    this.crop.end()
    this.cropping.value = null
  }

  editAt(p: Point): void {
    if (this.ctx.readonly() || this.editing.value) return
    const hit = this.editableAt(p)
    // the text tool never renames a frame (its border is thin): text goes there instead
    if (!hit || isFrame(hit) || !this.editElement(hit)) this.createText(p)
  }

  /** Opens the editor on an existing text element (`text`) or shape (`label`). */
  startEditing(id: string, kind: EditingTarget['kind']): void {
    if (this.ctx.readonly() || this.editing.value) return
    const el = this.ctx.scene.get(id)
    if (!el || el.locked || kindOfEdit(el) !== kind) return
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
    } else if (el && target.kind === 'sticky' && isSticky(el)) {
      // an empty sticky is kept (it is still a colored note), by design: also when it was just created and the
      // editor closed with Escape (which commits), unlike an empty text element, which is removed
      if (el.text !== value) store.update(el.id, { text: value })
      history.endGesture()
      this.setSelection([el.id])
    } else if (el && target.kind === 'frame' && isFrame(el)) {
      // single line, capped; a blank name keeps the old one
      const name = cleanFrameName(value)
      if (name.trim() && el.name !== name) store.update(el.id, { name })
      history.endGesture()
      this.setSelection([el.id])
    } else if (el && target.kind === 'label' && isShape(el)) {
      if (el.label !== value) store.update(el.id, { label: value })
      history.endGesture()
      this.setSelection([el.id])
    } else {
      history.endGesture()
    }
    this.afterEditing()
  }

  /**
   * Tab in the editor: commits, and when a sticky was being edited, creates the next sticky beside it and edits
   * that one (its creation plus commit is again one undo step).
   */
  commitAndNext(raw: string): void {
    const target = this.editing.value
    if (!target) return
    this.commitEditing(raw)
    if (target.kind === 'sticky') this.quickCreateSticky()
  }

  /**
   * With exactly one unlocked sticky selected (and nothing being edited): creates an empty sticky of the same
   * size, color and font STICKY_GAP to its right and edits it. False when it does not apply.
   */
  quickCreateSticky(): boolean {
    if (this.ctx.readonly() || this.editing.value || this.selectedIds.value.size !== 1) return false
    const src = this.ctx.scene.get([...this.selectedIds.value][0]!)
    if (!src || src.locked || !isSticky(src)) return false
    const { color, fontFamily, textAlign, opacity, w, h } = src
    this.beginSticky(stickyInit(src.x + w + STICKY_GAP, src.y, { w, h, color, fontFamily, textAlign, opacity }))
    return true
  }

  createSticky(box: { x: number; y: number; w: number; h: number }): void {
    if (this.ctx.readonly() || this.editing.value) return
    const { color, fontFamily, textAlign, opacity } = this.currentStyle.value
    this.beginSticky(stickyInit(box.x, box.y, { w: box.w, h: box.h, color, fontFamily, textAlign, opacity }))
  }

  createFrame(box: { x: number; y: number; w: number; h: number }): void {
    if (this.ctx.readonly() || this.editing.value) return
    const n = this.ctx.scene.elements.filter(isFrame).length + 1
    this.insert([{
      ...DEFAULT_STYLE, opacity: 1, type: 'frame', name: `Frame ${n}`,
      x: box.x, y: box.y, w: box.w, h: box.h, angle: 0, locked: false,
    }], true)
    if (!this.toolLocked.value) this.setTool('select')
  }

  /** Creates the sticky inside a gesture that its text commit ends (one undo step) and opens the editor. */
  private beginSticky(init: ElementInit): void {
    const { history, store } = this.ctx
    history.beginGesture()
    const el = store.create(init) as StickyElement
    this.openEditor(el.id, 'sticky', true)
  }

  /** Ends the edit discarding the editor's value: an element created for it is removed, with no undo step. */
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

  /** Starts editing `el` if it is an unlocked text, sticky or shape; false otherwise. */
  private editElement(el: SketchElement): boolean {
    const kind = kindOfEdit(el)
    if (el.locked || !kind) return false
    this.startEditing(el.id, kind)
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

  /** After an edit from the text / sticky tool: back to select unless the tool is locked. */
  private afterEditing(): void {
    const t = this.tool.value
    if ((t === 'text' || t === 'sticky') && !this.toolLocked.value) this.setTool('select')
    this.ctx.invalidate()
    this.afterGesture()
  }

  destroy(): void {
    // nothing queued lands while tearing down
    this.queuedImages.length = 0
    this.cancelEditing()
    this.cancelCrop()
    const pending = this.pendingTool()
    this.active?.cancel?.()
    if (pending !== this.active) pending?.cancel?.()
    this.active = null
    this.off()
  }

  /** Moves the selection (frames with their children) and recomputes frame membership: one undo step. */
  private nudge(dx: number, dy: number): void {
    const { scene, store, history } = this.ctx
    const patches: Record<string, ElementPatch> = {}
    for (const el of withFrameChildren(scene, this.movableSelection())) patches[el.id] = { x: el.x + dx, y: el.y + dy }
    if (!Object.keys(patches).length) return
    history.beginGesture()
    store.updateMany(patches)
    const membership = membershipPatches(scene, Object.keys(patches))
    if (Object.keys(membership).length) store.updateMany(membership)
    history.endGesture()
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
      this.afterGesture()
      this.ctx.invalidate()
    }
    // the image being cropped was deleted remotely: leave crop mode (nothing was written)
    if (this.cropping.value && !scene.get(this.cropping.value)) this.cancelCrop()
    const cur = this.selectedIds.value
    const kept = [...cur].filter(id => scene.get(id))
    if (kept.length !== cur.size) this.setSelection(kept)
    if (this.hoverId && !scene.get(this.hoverId)) {
      this.hoverId = null
      this.ctx.invalidate()
    }
  }
}

/** How `el`'s text is edited: its text (text, sticky), its label (shape), its name (frame), or not at all (null). */
function kindOfEdit(el: SketchElement): EditingTarget['kind'] | null {
  return isText(el) ? 'text' : isSticky(el) ? 'sticky' : isShape(el) ? 'label' : isFrame(el) ? 'frame' : null
}

/** The entries of `next` that differ from `el`, or null when none do. */
function changedProps(el: TextElement, next: Partial<TextElement>): ElementPatch | null {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(next)) {
    if ((el as unknown as Record<string, unknown>)[k] !== v) out[k] = v
  }
  return Object.keys(out).length ? out as ElementPatch : null
}
