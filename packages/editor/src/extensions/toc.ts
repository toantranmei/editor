import { Node } from '@tiptap/core'
import { blockNodeView } from '../nodeviews/renderer'
import TocView from '../nodeviews/TocView.vue'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableOfContents: { insertTableOfContents: () => ReturnType }
  }
}

/** Table of contents built live from the document's headings and toggle headings. */
export const TableOfContents = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  draggable: true,
  parseHTML: () => [{ tag: 'div[data-type="table-of-contents"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', { ...HTMLAttributes, 'data-type': 'table-of-contents' }],
  addCommands() {
    return { insertTableOfContents: () => ({ commands }) => commands.insertContent({ type: this.name }) }
  },
  addNodeView: () => blockNodeView(TocView),
})
