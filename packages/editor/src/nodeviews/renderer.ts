import { TextSelection } from '@tiptap/pm/state'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import type { Component } from 'vue'

interface PatchedView {
  stopEvent?: (event: Event) => boolean
  handleSelectionUpdate?: () => void
  renderer?: { props?: { selected?: boolean } }
}

/**
 * VueNodeViewRenderer with two fixes for block node views (image, embed, callout, code…):
 *
 * 1. Lets `mousemove` through from the node view's own UI. Tiptap stops those events
 *    by default, which keeps the drag handle from appearing while hovering them.
 * 2. Skips the per-keystroke selection check while typing. Every node view listens to
 *    selection changes and calls getPos(), which scans sibling blocks — with thousands
 *    of node views that made each keystroke O(views × blocks). A plain caret can't
 *    select a node view, so it only needs checking when one is currently selected.
 */
export function blockNodeView(component: Component) {
  const render = VueNodeViewRenderer(component)
  return ((props: Parameters<typeof render>[0]) => {
    const view = render(props) as ReturnType<typeof render> & PatchedView

    const stop = view.stopEvent?.bind(view)
    if (stop) view.stopEvent = (event: Event) => (event.type === 'mousemove' ? false : stop(event))

    const original = view.handleSelectionUpdate
    if (original) {
      const { editor } = props
      const fast = () => {
        const sel = editor.state.selection
        if (sel.empty && sel instanceof TextSelection && !view.renderer?.props?.selected) return
        original()
      }
      editor.off('selectionUpdate', original)
      editor.on('selectionUpdate', fast)
      // destroy() unsubscribes `this.handleSelectionUpdate`, so point it at the new handler.
      view.handleSelectionUpdate = fast
    }
    return view
  }) as typeof render
}
