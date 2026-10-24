import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      setColumns: (count: number) => ReturnType
    }
  }
}

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column', class: 'me-column' }), 0]
  },
})

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,5}',
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'columns',
      class: 'me-columns',
      style: `--cols:${node.childCount}`,
    }), 0]
  },

  addCommands() {
    return {
      setColumns: count => ({ commands }) => commands.insertContent({
        type: this.name,
        content: Array.from({ length: count }, () => ({
          type: 'column',
          content: [{ type: 'paragraph' }],
        })),
      }),
    }
  },
})
