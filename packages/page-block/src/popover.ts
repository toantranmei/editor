import type { Editor } from '@tiptap/core'
import { VueRenderer } from '@tiptap/vue-3'
import LinkToPageMenu from './LinkToPageMenu.vue'
import type { PageBlockOptions, PageSearchResult } from './types'
import { caretBlockPos, insertPageLinkAt, trackPosition } from './insert'

/** The open popover per editor (one at a time). */
const open = new WeakMap<Editor, () => void>()

/** Opens the "Link to page" search under the caret; picking a page inserts a link where the caret was. */
export function openLinkToPage(editor: Editor, options: PageBlockOptions): void {
  open.get(editor)?.()
  const at = caretBlockPos(editor)
  const tracked = at === null ? null : trackPosition(editor, at)
  const caret = editor.view.coordsAtPos(editor.state.selection.from)

  let renderer: VueRenderer | null = null
  const close = () => {
    if (!renderer) return
    tracked?.stop()
    renderer.element?.remove()
    renderer.destroy()
    renderer = null
    open.delete(editor)
    editor.off('destroy', close)
    if (!editor.isDestroyed) editor.commands.focus()
  }
  const onSelect = (page: PageSearchResult) => {
    const pos = tracked ? tracked.get() : null
    close()
    insertPageLinkAt(editor, pos, page.id)
  }

  renderer = new VueRenderer(LinkToPageMenu, { editor, props: { editor, options, onSelect, onClose: close } })
  const el = renderer.element as HTMLElement
  Object.assign(el.style, { position: 'fixed', zIndex: '50', left: `${caret.left}px`, top: `${caret.bottom}px` })
  document.body.appendChild(el)
  // Focus once attached (the component mounts before the element is in the document).
  el.querySelector<HTMLInputElement>('input')?.focus()
  open.set(editor, close)
  editor.on('destroy', close)
}
