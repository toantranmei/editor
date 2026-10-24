import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { NodeRangeSelection } from '@tiptap/extension-node-range'
import { enabledBlocks } from '../block-items'
import {
  blockAt, type BlockRange, blocksIn, currentRange, deleteBlocks, duplicateBlocks,
  moveBlocks, rangeBetween, selectBlocks, turnBlocksInto,
} from '../block-ops'

export interface BlockSelectionStorage {
  /** Set by the editor UI: opens the ⋮⋮ menu for a range (⌘/). */
  openMenu: ((range: BlockRange) => void) | null
}

declare module '@tiptap/core' {
  interface Storage {
    blockSelection: BlockSelectionStorage
  }
}

/** ⌘⌥0–8 → block type, like Notion. */
export const TURN_INTO_SHORTCUTS: Record<string, string> = {
  0: 'paragraph',
  1: 'heading1',
  2: 'heading2',
  3: 'heading3',
  4: 'taskList',
  5: 'bulletList',
  6: 'orderedList',
  7: 'toggle',
  8: 'codeBlock',
}

export const blockSelectionKey = new PluginKey('blockSelection')

/**
 * Notion-style block selection and block shortcuts:
 * - Esc selects the current block; Esc again clears.
 * - Shift+click or dragging a text selection across blocks selects whole blocks.
 * - With blocks selected: ↑/↓ move the selection, Shift+↑/↓ extend it, Enter edits,
 *   Backspace/Delete removes them, typing is ignored; ⌘C/⌘X copy/cut blocks.
 * - Anywhere: ⌘⇧↑/↓ move, ⌘D duplicate, ⌘⌥0–8 turn into, ⌘/ open the block menu.
 */
export const BlockSelection = Extension.create<object, BlockSelectionStorage>({
  name: 'blockSelection',
  priority: 1000,

  addStorage() {
    return { openMenu: null }
  },

  addKeyboardShortcuts() {
    const editor = this.editor
    const range = () => currentRange(editor.state)
    // Any open suggestion popup (slash, emoji, mention…) gets Esc first.
    const suggestionOpen = () => editor.state.plugins.some((p) => {
      const st = p.getState(editor.state) as { active?: boolean, query?: unknown } | undefined
      return !!st && typeof st === 'object' && st.active === true && 'query' in st
    })
    const withRange = (fn: (r: BlockRange) => unknown) => () => {
      const r = range()
      if (!r) return false
      fn(r)
      return true
    }

    const shortcuts: Record<string, () => boolean> = {
      'Escape': () => {
        if (suggestionOpen()) return false
        const sel = editor.state.selection
        if (sel instanceof NodeRangeSelection) {
          // Second Esc: leave block mode.
          editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(sel.to - 1), -1)))
          editor.view.dom.blur()
          return true
        }
        const r = range()
        if (!r) return false
        selectBlocks(editor, r)
        return true
      },
      'Mod-Shift-ArrowUp': () => !!range() && moveBlocks(editor, range()!, 'up'),
      'Mod-Shift-ArrowDown': () => !!range() && moveBlocks(editor, range()!, 'down'),
      'Mod-d': withRange(r => duplicateBlocks(editor, r)),
      'Mod-/': withRange(r => this.storage.openMenu?.(r)),
    }
    for (const [key, id] of Object.entries(TURN_INTO_SHORTCUTS)) {
      shortcuts[`Mod-Alt-${key}`] = withRange((r) => {
        const block = enabledBlocks(editor).find(b => b.id === id)
        if (block) turnBlocksInto(editor, r, block)
      })
    }
    return shortcuts
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    let dragging = false

    return [
      new Plugin({
        key: blockSelectionKey,
        props: {
          attributes: (state): Record<string, string> =>
            state.selection instanceof NodeRangeSelection ? { class: 'me-has-block-selection' } : {},

          decorations(state) {
            const sel = state.selection
            if (!(sel instanceof NodeRangeSelection)) return null
            const range = { from: sel.from, to: sel.to, depth: sel.depth ?? 0 }
            return DecorationSet.create(state.doc, blocksIn(state.doc, range).map(({ node, pos }) =>
              Decoration.node(pos, pos + node.nodeSize, { class: 'me-block-selected' })))
          },

          // Keys while blocks are selected.
          handleKeyDown(view, event) {
            const sel = view.state.selection
            if (!(sel instanceof NodeRangeSelection) || event.metaKey || event.ctrlKey || event.altKey) return false
            const range: BlockRange = { from: sel.from, to: sel.to, depth: sel.depth ?? 0 }
            const { doc } = view.state

            if (event.key === 'Backspace' || event.key === 'Delete') {
              deleteBlocks(editor, range)
              return true
            }
            if (event.key === 'Enter') {
              view.dispatch(view.state.tr.setSelection(TextSelection.near(doc.resolve(range.to - 1), -1)))
              return true
            }
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              const up = event.key === 'ArrowUp'
              // Shift moves the "head" block and keeps the anchor; plain arrows move a single block.
              const head = blockAt(doc.resolve(event.shiftKey ? sel.head : up ? sel.from + 1 : sel.to - 1))
              if (!head) return true
              const $edge = doc.resolve(up ? head.pos : head.pos + head.node.nodeSize)
              const sibling = up ? $edge.nodeBefore : $edge.nodeAfter
              if (!sibling) return true
              const siblingPos = up ? head.pos - sibling.nodeSize : head.pos + head.node.nodeSize
              if (!event.shiftKey) {
                selectBlocks(editor, { from: siblingPos, to: siblingPos + sibling.nodeSize, depth: range.depth })
              }
              else {
                view.dispatch(view.state.tr.setSelection(NodeRangeSelection.create(doc, sel.anchor, siblingPos + 1, range.depth)))
              }
              return true
            }
            // Printable keys would replace the blocks; Notion ignores them.
            return event.key.length === 1
          },

          handleTextInput: view => view.state.selection instanceof NodeRangeSelection,

          handleDOMEvents: {
            // Shift+click extends a block selection (or the cursor's block) to the clicked block.
            mousedown(view, event) {
              dragging = !event.shiftKey
              if (!event.shiftKey) return false
              const hit = view.posAtCoords({ left: event.clientX, top: event.clientY })
              if (!hit) return false
              const sel = view.state.selection
              const range = rangeBetween(view.state.doc, sel instanceof NodeRangeSelection ? sel.from + 1 : sel.anchor, hit.pos)
              if (!range || blocksIn(view.state.doc, range).length < 2) return false
              event.preventDefault()
              selectBlocks(editor, range)
              return true
            },
          },
        },

        // A text selection dragged across blocks becomes a block selection on mouseup.
        view: () => {
          const onMouseUp = () => {
            if (!dragging) return
            dragging = false
            const { state } = editor
            const sel = state.selection
            if (!(sel instanceof TextSelection) || sel.empty) return
            const a = blockAt(sel.$from)
            const b = blockAt(sel.$to)
            if (!a || !b || a.pos === b.pos) return
            const range = rangeBetween(state.doc, sel.anchor, sel.head)
            if (range) selectBlocks(editor, range)
          }
          document.addEventListener('mouseup', onMouseUp)
          return { destroy: () => document.removeEventListener('mouseup', onMouseUp) }
        },
      }),
    ]
  },
})

