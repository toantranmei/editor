import { type Editor, mergeAttributes, Node } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import { blockNodeView } from '@toantranmei/editor'
import { pageMessages } from './messages'
import type { PageBlockOptions } from './types'
import PageLinkView from './PageLinkView.vue'
import { caretBlockPos, insertPageLinkAt, PAGE_LINK_NODE, reportError, trackPosition } from './insert'
import { openLinkToPage } from './popover'

export { PAGE_LINK_NODE }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageLink: {
      /** Inserts a link to an existing page (replaces the current line when it's empty). */
      insertPageLink: (pageId: string) => ReturnType
      /** "Page": `createPage()`, then inserts the link where the caret was, then `open()`s the new page. */
      createSubPage: () => ReturnType
      /** "Link to page": opens the page search popover at the caret. */
      linkToPage: () => ReturnType
    }
  }
}

const defaults: PageBlockOptions = {
  resolve: null,
  createPage: null,
  open: null,
  href: null,
  search: null,
  onError: null,
  defaultIcon: null,
  messages: null,
  searchDelay: 150,
}

/** Sub-page / link-to-page block. Stores only `pageId`; titles and icons come from `resolve`. */
export const PageLinkNode = Node.create<PageBlockOptions>({
  name: PAGE_LINK_NODE,
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addOptions: () => ({ ...defaults }),

  addAttributes() {
    return {
      pageId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-page-id'),
        renderHTML: (attrs: Record<string, any>) => (attrs.pageId ? { 'data-page-id': attrs.pageId } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="page-link"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const pageId = node.attrs.pageId as string | null
    const href = pageId ? this.options.href?.(pageId) : null
    const title = titleOf(this.options, this.editor, pageId)
    return ['div', mergeAttributes({ 'data-type': 'page-link', 'class': 'me-page-link' }, HTMLAttributes), href ? ['a', { href }, title] : title]
  },

  renderText({ node }) {
    return titleOf(this.options, this.editor, node.attrs.pageId)
  },

  addNodeView() {
    return blockNodeView(PageLinkView)
  },

  addCommands() {
    return {
      insertPageLink: pageId => ({ editor }) => insertPageLinkAt(editor, caretBlockPos(editor), pageId),

      createSubPage: () => ({ editor }) => {
        const { createPage, open } = this.options
        if (!createPage) return false
        const at = caretBlockPos(editor)
        const tracked = at === null ? null : trackPosition(editor, at)
        createPage()
          .then((pageId) => {
            tracked?.stop()
            if (editor.isDestroyed) return
            insertPageLinkAt(editor, tracked ? tracked.get() : null, pageId)
            open?.(pageId)
          })
          .catch((error) => {
            tracked?.stop()
            reportError(this.options, error)
          })
        return true
      },

      linkToPage: () => ({ editor }) => {
        if (!this.options.search) return false
        openLinkToPage(editor, this.options)
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    const options = this.options
    return [new Plugin({
      key: new PluginKey('pageLinkKeys'),
      props: {
        // Enter on a selected link opens it (the keyboard twin of a click).
        handleKeyDown(view, event) {
          if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return false
          const sel = view.state.selection
          if (!(sel instanceof NodeSelection) || sel.node.type.name !== PAGE_LINK_NODE || !sel.node.attrs.pageId) return false
          if (!options.open) return false
          event.preventDefault()
          options.open(sel.node.attrs.pageId, event)
          return true
        },
      },
    })]
  },
})

function titleOf(options: PageBlockOptions, editor: Editor | undefined, pageId: string | null): string {
  const m = pageMessages(editor?.storage.meiConfig?.locale, options.messages)
  if (!pageId) return m.notFound
  const info = options.resolve?.(pageId).value
  if (info === null) return m.notFound
  return info?.title?.trim() || m.untitled
}
