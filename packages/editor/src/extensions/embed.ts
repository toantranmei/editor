import { Node, mergeAttributes } from '@tiptap/core'
import { blockNodeView } from '../nodeviews/renderer'
import EmbedView from '../nodeviews/EmbedView.vue'
import { toEmbedUrl } from './embed-url'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embed: {
      setEmbed: (attrs?: { src?: string | null }) => ReturnType
    }
  }
}

export { toEmbedUrl }

export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      height: { default: 400 },
    }
  },

  parseHTML() {
    return [{
      tag: 'div[data-type="embed"]',
      getAttrs: el => ({
        src: toEmbedUrl(el.querySelector('iframe')?.getAttribute('src') ?? ''),
        height: Number(el.querySelector('iframe')?.getAttribute('height')) || 400,
      }),
    }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return ['div', { 'data-type': 'embed' }, ['iframe', mergeAttributes(HTMLAttributes, {
      src: node.attrs.src,
      height: node.attrs.height,
      allowfullscreen: 'true',
      sandbox: 'allow-scripts allow-same-origin allow-popups allow-presentation',
    })]]
  },

  addCommands() {
    return {
      setEmbed: attrs => ({ commands }) => commands.insertContent({ type: this.name, attrs }),
    }
  },

  addNodeView() {
    return blockNodeView(EmbedView)
  },
})
