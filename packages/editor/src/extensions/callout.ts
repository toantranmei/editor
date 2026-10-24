import { Node, mergeAttributes } from '@tiptap/core'
import { blockNodeView } from '../nodeviews/renderer'
import CalloutView from '../nodeviews/CalloutView.vue'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs?: { icon?: string, color?: string }) => ReturnType
    }
  }
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      icon: {
        default: '💡',
        parseHTML: el => el.getAttribute('data-icon') || '💡',
        renderHTML: attrs => ({ 'data-icon': attrs.icon }),
      },
      color: {
        default: 'gray',
        parseHTML: el => el.getAttribute('data-color') || 'gray',
        renderHTML: attrs => ({ 'data-color': attrs.color }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0]
  },

  addCommands() {
    return {
      setCallout: attrs => ({ commands }) => commands.wrapIn(this.name, attrs),
    }
  },

  addNodeView() {
    return blockNodeView(CalloutView)
  },
})
