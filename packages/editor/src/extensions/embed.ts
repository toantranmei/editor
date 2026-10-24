import { Node, mergeAttributes } from '@tiptap/core'
import { blockNodeView } from '../nodeviews/renderer'
import EmbedView from '../nodeviews/EmbedView.vue'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embed: {
      setEmbed: (attrs?: { src?: string | null }) => ReturnType
    }
  }
}

/** Turns a YouTube / Vimeo / Loom watch link into an embeddable URL. */
export function toEmbedUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  }
  catch {
    return null
  }
  if (!/^https?:$/.test(url.protocol)) return null

  const host = url.hostname.replace(/^www\./, '')
  if (host === 'youtu.be') return `https://www.youtube.com/embed/${url.pathname.slice(1)}`
  if (host.endsWith('youtube.com')) {
    const id = url.searchParams.get('v') ?? url.pathname.match(/\/(?:embed|shorts)\/([^/]+)/)?.[1]
    if (id) return `https://www.youtube.com/embed/${id}`
  }
  if (host === 'vimeo.com') {
    const id = url.pathname.match(/\/(\d+)/)?.[1]
    if (id) return `https://player.vimeo.com/video/${id}`
  }
  if (host === 'loom.com') {
    const id = url.pathname.match(/\/share\/([^/]+)/)?.[1]
    if (id) return `https://www.loom.com/embed/${id}`
  }
  return url.toString()
}

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
