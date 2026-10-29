import { Node } from '@tiptap/core'
import { blockNodeView } from '../nodeviews/renderer'
import HtmlView from '../nodeviews/HtmlView.vue'
import type { HtmlBlockOptions } from './html-document'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    htmlBlock: {
      insertHtmlBlock: (attrs?: { code?: string, fileName?: string | null }) => ReturnType
    }
  }
}

export { HTML_MAX_HEIGHT, HTML_MIN_HEIGHT, htmlBlockCsp, htmlBlockDocument, type HtmlBlockOptions } from './html-document'

/** Notion-style HTML block: your own HTML/CSS/JS, running in a sandboxed frame. */
export const HtmlBlock = Node.create<HtmlBlockOptions>({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions: () => ({ network: false, maxSize: 1024, defaultHeight: 400 }),

  addAttributes() {
    return {
      code: { default: '' },
      fileName: { default: null },
      height: { default: null },
    }
  },

  parseHTML() {
    return [{
      tag: 'div[data-type="html-block"]',
      getAttrs: el => ({
        code: el.getAttribute('data-code') ?? '',
        fileName: el.getAttribute('data-file-name'),
        height: Number(el.getAttribute('data-height')) || null,
      }),
    }]
  },

  // The code is kept in an attribute, so exported HTML never runs it.
  renderHTML({ node }) {
    return ['div', {
      'data-type': 'html-block',
      'data-code': node.attrs.code ?? '',
      ...(node.attrs.fileName ? { 'data-file-name': node.attrs.fileName } : {}),
      ...(node.attrs.height ? { 'data-height': node.attrs.height } : {}),
    }]
  },

  renderText: ({ node }) => node.attrs.code ?? '',

  addCommands() {
    return {
      insertHtmlBlock: attrs => ({ commands }) => commands.insertContent({ type: this.name, attrs: { height: this.options.defaultHeight, ...attrs } }),
    }
  },

  addNodeView() {
    return blockNodeView(HtmlView)
  },
})
