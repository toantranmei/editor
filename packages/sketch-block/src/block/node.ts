import { Node } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { blockNodeView } from '@toantranmei/editor'
import { nanoid } from 'nanoid'
import type { UserOption } from '../collab/presence'
import type { SketchProvider } from '../providers/types'
import { liveViews } from './live'
import SketchView from './SketchView.vue'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sketch: {
      /** Inserts an empty board with a fresh id. */
      insertSketch: () => ReturnType
    }
  }
  interface Storage {
    sketch: SketchStorage
  }
}

export interface SketchOptions {
  /** Where boards live. `null`: the browser's IndexedDB (`indexeddb()`), created on first use. */
  provider: SketchProvider | null
  /** Height of a board without a stored height, in px. */
  defaultHeight: number
  /**
   * Identity shown to others on a networked board (presence): `{ name, color }` or a function returning it,
   * called when a board opens. `null`: `Khách N` / `Guest N` with a color picked from the client id.
   */
  user?: UserOption | null
}

export interface SketchStorage {
  /** The board provider, resolved once per editor (the IndexedDB default is loaded lazily). */
  provider: () => Promise<SketchProvider>
  /** Sketch views of this editor whose board is live (interacting or fullscreen). */
  live: Set<object>
}

/** Board heights users can drag between, in px. */
export const SKETCH_MIN_HEIGHT = 240
export const SKETCH_MAX_HEIGHT = 1600

export const newBoardId = () => `bd_${nanoid(10)}`

/** What the node view tells ProseMirror about itself (exposed by SketchView). */
interface LiveView {
  dom?: HTMLElement
  stopEvent?: (event: Event) => boolean
  ignoreMutation?: (mutation: unknown) => boolean
}

/**
 * Whiteboard block. The document keeps only a board id, a preview image, the height and a
 * preview version; the drawing itself lives in the provider (IndexedDB by default).
 */
export const SketchNode = Node.create<SketchOptions, SketchStorage>({
  name: 'sketch',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions: () => ({ provider: null, defaultHeight: 480, user: null }),

  addStorage() {
    let provider: Promise<SketchProvider> | null = null
    const options = this.options
    return {
      provider: () => (provider ??= options.provider
        ? Promise.resolve(options.provider)
        : import('../providers/indexeddb').then(m => m.indexeddb())),
      live: new Set<object>(),
    }
  },

  // While a board is live the document behind it is locked: keys, typing, paste and drop
  // that reach ProseMirror (e.g. focus still in the text) must not edit it.
  addProseMirrorPlugins() {
    const live = this.storage.live
    const locked = () => live.size > 0
    return [new Plugin({
      key: new PluginKey('sketchLiveLock'),
      props: {
        handleKeyDown: locked,
        handleKeyPress: locked,
        handleTextInput: locked,
        handlePaste: locked,
        handleDrop: locked,
      },
    })]
  },

  addAttributes() {
    return {
      boardId: { default: null },
      preview: { default: null },
      height: { default: null },
      version: { default: 0 },
    }
  },

  parseHTML() {
    return [{
      tag: 'div[data-type="sketch"]',
      getAttrs: el => ({
        boardId: el.getAttribute('data-board-id'),
        preview: el.querySelector('img')?.getAttribute('src') || null,
        height: Number(el.getAttribute('data-height')) || null,
        version: Number(el.getAttribute('data-version')) || 0,
      }),
    }]
  },

  renderHTML({ node }) {
    const attrs = {
      'data-type': 'sketch',
      ...(node.attrs.boardId ? { 'data-board-id': node.attrs.boardId } : {}),
      ...(node.attrs.height ? { 'data-height': node.attrs.height } : {}),
      'data-version': node.attrs.version ?? 0,
    }
    return node.attrs.preview ? ['div', attrs, ['img', { src: node.attrs.preview, alt: '' }]] : ['div', attrs]
  },

  addCommands() {
    return {
      insertSketch: () => ({ commands }) => commands.insertContent({ type: this.name, attrs: { boardId: newBoardId() } }),
    }
  },

  addNodeView() {
    const render = blockNodeView(SketchView)
    return ((props: Parameters<typeof render>[0]) => {
      const view = render(props) as ReturnType<typeof render> & LiveView
      if (!('renderer' in view)) return view // no EditorContent mounted: Tiptap renders nothing
      // While the board is live, ProseMirror must not see any of its events (keys, pointer,
      // wheel, clipboard, drag, input): the board handles them all.
      const original = view.stopEvent?.bind(view)
      view.stopEvent = (event: Event) => !!liveViews.get(view.dom!)?.() || (original ? original(event) : false)
      // The view re-renders itself (preview, board); none of it is document content.
      view.ignoreMutation = () => true
      return view
    }) as typeof render
  },
})
