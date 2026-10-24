import { Extension } from '@tiptap/core'
import type { Node as PMNode, Slice } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { dissolveEmptyColumn } from '../block-ops'

export interface BlockDropOptions {
  /** Node types whose direct children are "blocks" you can drop between. */
  containers: string[]
  /** Class of the drop indicator line. */
  indicatorClass: string
  /** Max columns when dropping beside a block. */
  maxColumns: number
}

export interface BlockDropStorage {
  /** True while a block is being dragged from the drag handle. */
  active: boolean
}

declare module '@tiptap/core' {
  interface Storage {
    blockDrop: BlockDropStorage
  }
}

interface Line { left: number, top: number, width: number, height?: number, vertical?: boolean }

/** Where a dragged block lands. */
type DropTarget =
  /** Between blocks (or appended inside a list/toggle/callout when nested). */
  | { kind: 'insert', pos: number, line: Line }
  /** Beside a block: wraps it into two columns. */
  | { kind: 'wrap', blockPos: number, side: 'left' | 'right', line: Line }
  /** Beside a column: adds a new column. */
  | { kind: 'column', pos: number, line: Line }

// Interaction thresholds (behavior, not visuals).
const SIDE_ZONE = 48 // px from a block's right edge that means "make columns"
// Left edge: narrower, and only after a clear sideways move. Dragging straight down from
// the handle keeps the pointer near blocks' left edges, which must not create columns.
const LEFT_ZONE = 24
const LEFT_INTENT = 60 // px of horizontal travel from the drag start
const NEST_INDENT = 32 // px right of a block's left edge that means "nest inside"
const SCROLL_ZONE = 64 // px from the viewport edge that starts auto-scroll
const SCROLL_SPEED = 18 // max px per frame

/** Blocks that can take children at their end when you drop with an indent. */
const NESTABLE = ['bulletList', 'orderedList', 'taskList', 'details', 'callout']

export const blockDropKey = new PluginKey('blockDrop')

/**
 * Notion-style drop for blocks dragged from the drag handle:
 * - between blocks (top level or in a column), never inside a list item by accident;
 * - beside a block (left/right edge) to create or extend columns;
 * - with an indent below a list/toggle/callout to nest inside it;
 * - auto-scrolls near the viewport edges.
 */
export const BlockDrop = Extension.create<BlockDropOptions, BlockDropStorage>({
  name: 'blockDrop',

  addOptions() {
    return { containers: ['doc', 'column'], indicatorClass: 'me-drop-indicator', maxColumns: 5 }
  },

  addStorage() {
    return { active: false }
  },

  addProseMirrorPlugins() {
    const { containers, indicatorClass, maxColumns } = this.options
    const storage = this.storage
    const editor = this.editor
    let indicator: HTMLElement | null = null

    const hide = () => {
      indicator?.remove()
      indicator = null
    }
    const show = (line: Line) => {
      if (!indicator) {
        indicator = document.createElement('div')
        // Lives in <body>, so copy the editor's theme scope (mode class + overrides id).
        const scope = editor.storage.meiConfig?.scope
        indicator.className = [...(scope?.class ?? ['me-scope']), indicatorClass].join(' ')
        if (scope?.['data-me-id']) indicator.dataset.meId = scope['data-me-id']
        document.body.appendChild(indicator)
      }
      indicator.classList.toggle('is-vertical', !!line.vertical)
      Object.assign(indicator.style, {
        left: `${line.left}px`,
        top: `${line.top}px`,
        width: line.vertical ? '' : `${line.width}px`,
        height: line.vertical ? `${line.height}px` : '',
      })
    }

    const rectOf = (view: EditorView, pos: number) => {
      const dom = view.nodeDOM(pos)
      return dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
    }

    /** True if the dragged slice contains columns (no columns inside columns). */
    const draggingColumns = (view: EditorView) => {
      let found = false
      view.dragging?.slice.content.descendants((n) => {
        if (n.type.name === 'columns') found = true
        return !found
      })
      return found
    }

    /**
     * Picks the drop target from geometry (posAtCoords fails over node views and gaps):
     * the container under the pointer (a column or the doc), the child block at the
     * pointer's height, then side/indent zones of that block.
     */
    let dragStartX: number | null = null
    const findDropTarget = (view: EditorView, x: number, y: number): DropTarget | null => {
      const { doc, selection } = view.state
      let container: PMNode = doc
      let containerPos = -1
      let start = 0

      doc.descendants((node, pos) => {
        if (containers.includes(node.type.name) && node.type.name !== 'doc') {
          const r = rectOf(view, pos)
          if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
            container = node
            containerPos = pos
            start = pos + 1
          }
          return false
        }
        // Only walk into wrappers that hold containers (e.g. `columns`).
        return node.type.name === 'columns'
      })

      // Child block at the pointer's height (or the last one).
      type Hit = { node: PMNode, pos: number, rect: DOMRect }
      let hit = null as Hit | null
      let last = null as Hit | null
      container.forEach((child, offset) => {
        if (hit) return
        const pos = start + offset
        const rect = rectOf(view, pos)
        if (!rect) return
        if (y < rect.bottom) hit = { node: child, pos, rect }
        last = { node: child, pos, rect }
      })
      const block = hit ?? last
      if (!block) return null
      const { rect } = block
      const isSelf = block.pos >= selection.from && block.pos < selection.to

      // Beside a block → columns.
      const rightZone = Math.min(SIDE_ZONE, rect.width * 0.2)
      const leftIntent = dragStartX !== null && Math.abs(x - dragStartX) >= LEFT_INTENT
      const side = x > rect.right - rightZone ? 'right' : leftIntent && x < rect.left + LEFT_ZONE ? 'left' : null
      if (side && !isSelf && !draggingColumns(view)) {
        const vertical = (edgeX: number, r: DOMRect): Line => ({ left: edgeX, top: r.top, width: 0, height: r.height, vertical: true })
        if (container.type.name === 'column') {
          // Add a column next to the hovered column.
          const columns = doc.resolve(containerPos).parent
          const colRect = rectOf(view, containerPos)
          if (columns.childCount < maxColumns && colRect) {
            return {
              kind: 'column',
              pos: side === 'left' ? containerPos : containerPos + container.nodeSize,
              line: vertical(side === 'left' ? colRect.left : colRect.right, colRect),
            }
          }
        }
        else if (block.node.type.name === 'columns') {
          if (block.node.childCount < maxColumns) {
            return { kind: 'column', pos: side === 'left' ? block.pos + 1 : block.pos + block.node.nodeSize - 1, line: vertical(side === 'left' ? rect.left : rect.right, rect) }
          }
        }
        else {
          return { kind: 'wrap', blockPos: block.pos, side, line: vertical(side === 'left' ? rect.left : rect.right, rect) }
        }
      }

      const before = !!hit && y < rect.top + rect.height / 2
      // Indented drop below a list/toggle/callout → nest at its end.
      if (!before && !isSelf && NESTABLE.includes(block.node.type.name) && x > rect.left + NEST_INDENT && !draggingColumns(view)) {
        const end = block.pos + block.node.nodeSize
        // Lists: inside the last item; toggle: inside its content; callout: inside it.
        const pos = block.node.type.name === 'callout' ? end - 1 : end - 2
        return { kind: 'insert', pos, line: { left: rect.left + NEST_INDENT, top: rect.bottom, width: rect.width - NEST_INDENT } }
      }

      return {
        kind: 'insert',
        pos: before ? block.pos : block.pos + block.node.nodeSize,
        line: { left: rect.left, top: before ? rect.top : rect.bottom, width: rect.width },
      }
    }

    /** Generous hit area around the editor, so drops in the gutter still count. */
    const isNearEditor = (view: EditorView, e: DragEvent) => {
      const r = view.dom.getBoundingClientRect()
      return e.clientY > r.top - 24 && e.clientY < r.bottom + 120 && e.clientX > r.left - 120 && e.clientX < r.right + 60
    }

    const moveBlock = (view: EditorView, target: DropTarget) => {
      const slice = view.dragging?.slice
      const { from, to } = view.state.selection
      view.dragging = null
      if (!slice || slice.size === 0) return
      if (target.kind === 'insert' && target.pos >= from && target.pos <= to) return

      const { schema } = view.state
      const tr = view.state.tr
      tr.delete(from, to)
      dissolveEmptyColumn(tr, tr.mapping.map(from))

      let insertAt: number
      if (target.kind === 'wrap') {
        const pos = tr.mapping.map(target.blockPos)
        const node = tr.doc.nodeAt(pos)
        if (!node) return
        const column = schema.nodes.column!
        const dragged = column.create(null, slice.content)
        const existing = column.create(null, node)
        tr.replaceWith(pos, pos + node.nodeSize, schema.nodes.columns!.create(null, target.side === 'left' ? [dragged, existing] : [existing, dragged]))
        insertAt = target.side === 'left' ? pos + 2 : pos + 2 + existing.nodeSize
      }
      else if (target.kind === 'column' && tr.doc.resolve(tr.mapping.map(target.pos)).parent.type.name === 'columns') {
        insertAt = tr.mapping.map(target.pos)
        tr.insert(insertAt, schema.nodes.column!.create(null, slice.content))
        insertAt += 1
      }
      else {
        // Plain insert (also the fallback if removing the block dissolved the target columns).
        insertAt = tr.mapping.map(target.pos)
        tr.replaceRange(insertAt, insertAt, slice as Slice)
      }

      // Select the moved block (atoms) or put the cursor in it, like Notion.
      const moved = tr.doc.resolve(insertAt).nodeAfter
      if (moved?.isAtom && NodeSelection.isSelectable(moved)) tr.setSelection(NodeSelection.create(tr.doc, insertAt))
      else tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(insertAt + 1, tr.doc.content.size))))

      view.dispatch(tr.scrollIntoView())
      view.focus()
    }

    // Auto-scroll the nearest scrollable ancestor (or the window) near the viewport edges.
    let scrollFrame = 0
    let scrollSpeed = 0
    const scroller = (view: EditorView): Element | Window => {
      for (let el = view.dom.parentElement; el; el = el.parentElement) {
        const { overflowY } = getComputedStyle(el)
        if (/(auto|scroll)/.test(overflowY) && el.scrollHeight > el.clientHeight) return el
      }
      return window
    }
    const stopScroll = () => {
      cancelAnimationFrame(scrollFrame)
      scrollFrame = 0
      scrollSpeed = 0
    }
    const updateScroll = (view: EditorView, y: number) => {
      const target = scroller(view)
      const bounds = target === window ? { top: 0, bottom: window.innerHeight } : (target as Element).getBoundingClientRect()
      const fromTop = y - bounds.top
      const fromBottom = bounds.bottom - y
      scrollSpeed = fromTop < SCROLL_ZONE
        ? -SCROLL_SPEED * (1 - fromTop / SCROLL_ZONE)
        : fromBottom < SCROLL_ZONE ? SCROLL_SPEED * (1 - fromBottom / SCROLL_ZONE) : 0
      if (!scrollSpeed) return stopScroll()
      if (scrollFrame) return
      const step = () => {
        if (!scrollSpeed) return
        target.scrollBy({ top: scrollSpeed })
        scrollFrame = requestAnimationFrame(step)
      }
      scrollFrame = requestAnimationFrame(step)
    }

    return [
      new Plugin({
        key: blockDropKey,
        // Listen on the document in the capture phase: ProseMirror ignores drag events
        // over node views (callout, image, columns...), and drops in the gutter should work too.
        view: (view) => {
          const onDragOver = (e: DragEvent) => {
            if (!storage.active || !view.dragging) return
            dragStartX ??= e.clientX
            updateScroll(view, e.clientY)
            if (!isNearEditor(view, e)) return hide()
            e.preventDefault()
            e.stopPropagation()
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
            const target = findDropTarget(view, e.clientX, e.clientY)
            if (target) show(target.line)
            else hide()
          }
          const onDrop = (e: DragEvent) => {
            if (!storage.active) return
            storage.active = false
            const target = isNearEditor(view, e) ? findDropTarget(view, e.clientX, e.clientY) : null
            dragStartX = null
            hide()
            stopScroll()
            if (!target) return
            e.preventDefault()
            e.stopPropagation()
            moveBlock(view, target)
          }
          const onDragEnd = () => {
            storage.active = false
            dragStartX = null
            hide()
            stopScroll()
          }
          document.addEventListener('dragover', onDragOver, true)
          document.addEventListener('drop', onDrop, true)
          document.addEventListener('dragend', onDragEnd, true)
          return {
            destroy() {
              document.removeEventListener('dragover', onDragOver, true)
              document.removeEventListener('drop', onDrop, true)
              document.removeEventListener('dragend', onDragEnd, true)
              hide()
              stopScroll()
            },
          }
        },
      }),
    ]
  },
})

