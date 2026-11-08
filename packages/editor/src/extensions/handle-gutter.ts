import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

export interface HandleGutterOptions {
  /** DOM of the block the handle is shown for. */
  block: () => HTMLElement | null
  /** The drag handle element. */
  handle: () => HTMLElement | null
  /** The handle is pinned (a block menu is open): leave it alone. */
  locked: () => boolean
}

/**
 * Keeps the block handle while the pointer travels to it, like Notion. The drag handle plugin hides the handle as soon
 * as the pointer leaves the editor, so on a tall block (a table, an image, code) moving left from a lower line hid it:
 * the handle sits by the block's first line, not under the pointer. While the pointer is in the block's band (from the
 * handle's left edge to the block's right edge, over the block's height), the handle stays; leaving the band hides it.
 * The band also covers controls drawn over the block outside the editor DOM (the table's row grips).
 */
export const HandleGutter = Extension.create<HandleGutterOptions>({
  name: 'handleGutter',
  // Before the drag handle plugin, whose mouseleave hides the handle.
  priority: 1000,

  addOptions() {
    return { block: () => null, handle: () => null, locked: () => false }
  },

  addProseMirrorPlugins() {
    const { options, editor } = this

    function band() {
      const block = options.block()
      const handle = options.handle()
      if (!block?.isConnected || !handle || handle.style.visibility === 'hidden') return null
      const b = block.getBoundingClientRect()
      const h = handle.getBoundingClientRect()
      return { left: h.left, right: b.right, top: Math.min(b.top, h.top), bottom: Math.max(b.bottom, h.bottom) }
    }
    function inBand(e: MouseEvent) {
      const r = band()
      return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    }

    let watching = false
    function stop() {
      if (!watching) return
      watching = false
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseout', onOut, true)
    }
    function hide() {
      stop()
      if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta('hideDragHandle', true))
    }
    function onMove(e: MouseEvent) {
      // Back in the editor (the drag handle plugin takes over again), pinned by a menu, or already hidden.
      if (options.locked() || editor.isDestroyed || editor.view.dom.contains(e.target as Node) || !band()) return stop()
      if (!inBand(e)) hide()
    }
    function onOut(e: MouseEvent) {
      if (!e.relatedTarget) hide() // left the window
    }

    return [new Plugin({
      props: {
        handleDOMEvents: {
          mouseleave(_view, e) {
            if (options.locked() || !inBand(e)) return false
            if (!watching) {
              watching = true
              document.addEventListener('mousemove', onMove, true)
              document.addEventListener('mouseout', onOut, true)
            }
            return true // keep the handle
          },
        },
      },
      view: () => ({ destroy: stop }),
    })]
  },
})
