import { Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { Mapping } from '@tiptap/pm/transform'
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
  /**
   * When a paste, drop or duplicate creates a block whose board is already used elsewhere in the document, give
   * the copy a new board id and copy the board into it (`provider.clone`, else connect + copy). Default true;
   * false: copies share the board.
   */
  onPasteClone?: boolean
}

export interface SketchStorage {
  /** The board provider, resolved once per editor (the IndexedDB default is loaded lazily). */
  provider: () => Promise<SketchProvider>
  /** Sketch views of this editor whose board is live (interacting or fullscreen). */
  live: Set<object>
  /** Boards waiting to be (or being) copied: new id → source id and the running copy. */
  clones: Map<string, { from: string; promise: Promise<void> | null }>
  /**
   * Starts (once) the copy into board `id` when it is a pending clone and returns it; null when `id` is not
   * being cloned. A failure is logged; the board then stays empty (the preview is kept).
   */
  ensureClone: (id: string) => Promise<void> | null
}

/** Board heights users can drag between, in px. */
export const SKETCH_MIN_HEIGHT = 240
export const SKETCH_MAX_HEIGHT = 1600

export const newBoardId = () => `bd_${nanoid(10)}`

/** Transaction meta of the id rewrite: the copies to make, `{ from, to }` board ids. */
export const SKETCH_CLONE_META = 'sketchClones'

interface Rewrite { pos: number; from: string; to: string }

/** Sketch nodes of `doc` with a board id: [pos, id], in document order. */
function boardNodes(doc: PMNode): Array<[number, string]> {
  const out: Array<[number, string]> = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'sketch' && typeof node.attrs.boardId === 'string' && node.attrs.boardId) {
      out.push([pos, node.attrs.boardId])
    }
  })
  return out
}

/**
 * Sketch nodes the change from `oldDoc` to `newDoc` added whose board id was already in use: each gets a new id.
 * A node is "kept" when an old node with the same id maps onto it. For a paste / drop, as many added nodes keep
 * the id as old nodes went away (a paste replacing the original), at least one (duplicates within the slice get
 * new ids). For other changes (duplicate commands, moves, `setContent`), added nodes get new ids only while an
 * old node of the board is kept; a change that removed them all (a move, or loading a document whose blocks
 * already share a board) keeps the ids.
 */
export function findDuplicateBoards(oldDoc: PMNode, newDoc: PMNode, mapping: Mapping, pasteLike: boolean): Rewrite[] {
  const oldCount = new Map<string, number>()
  const kept = new Set<number>()
  for (const [pos, id] of boardNodes(oldDoc)) {
    oldCount.set(id, (oldCount.get(id) ?? 0) + 1)
    const r = mapping.mapResult(pos, 1)
    if (!r.deleted && newDoc.nodeAt(r.pos)?.attrs.boardId === id) kept.add(r.pos)
  }
  const keptCount = new Map<string, number>()
  const added: Array<[number, string]> = []
  for (const [pos, id] of boardNodes(newDoc)) {
    if (kept.has(pos)) keptCount.set(id, (keptCount.get(id) ?? 0) + 1)
    else added.push([pos, id])
  }
  const allowed = new Map<string, number>()
  const out: Rewrite[] = []
  for (const [pos, id] of added) {
    let left = allowed.get(id)
    if (left === undefined) {
      const old = oldCount.get(id) ?? 0
      const stay = keptCount.get(id) ?? 0
      // a paste brings in content that may already be on the page; any other change that drops every old node
      // of the board (a move, setContent) is not a copy
      left = pasteLike ? Math.max(old, 1) - stay : stay === 0 ? Infinity : old - stay
    }
    if (left > 0) allowed.set(id, left - 1)
    else {
      allowed.set(id, 0)
      out.push({ pos, from: id, to: newBoardId() })
    }
  }
  return out
}

const isPasteLike = (tr: Transaction) => !!tr.getMeta('paste') || tr.getMeta('uiEvent') === 'paste' || tr.getMeta('uiEvent') === 'drop'
/** A change that came from a collaborator (y-prosemirror): their editor already gave copies their own ids. */
const isRemote = (tr: Transaction) => !!(tr.getMeta('y-sync$') as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin

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

  addOptions: () => ({ provider: null, defaultHeight: 480, user: null, onPasteClone: true }),

  addStorage() {
    let provider: Promise<SketchProvider> | null = null
    const options = this.options
    const clones: SketchStorage['clones'] = new Map()
    const getProvider = () => (provider ??= options.provider
      ? Promise.resolve(options.provider)
      : import('../providers/indexeddb').then(m => m.indexeddb()))
    const ensureClone = (id: string): Promise<void> | null => {
      const entry = clones.get(id)
      if (!entry) return null
      if (!entry.promise) {
        // a copy of a copy still in progress: wait for its source first
        const upstream = ensureClone(entry.from)
        const run = async () => {
          await upstream?.catch(() => {})
          const [prov, mod] = await Promise.all([getProvider(), import('./clone')])
          await mod.cloneBoard(prov, entry.from, id)
        }
        entry.promise = run().finally(() => clones.delete(id))
        entry.promise.catch(err => console.warn(`[sketch] could not copy board ${entry.from} into ${id}`, err))
      }
      return entry.promise
    }
    return { provider: getProvider, live: new Set<object>(), clones, ensureClone }
  },

  // While a board is live the document behind it is locked: keys, typing, paste and drop
  // that reach ProseMirror (e.g. focus still in the text) must not edit it.
  addProseMirrorPlugins() {
    const { live, clones, ensureClone } = this.storage
    const locked = () => live.size > 0
    const lock = new Plugin({
      key: new PluginKey('sketchLiveLock'),
      props: {
        handleKeyDown: locked,
        handleKeyPress: locked,
        handleTextInput: locked,
        handlePaste: locked,
        handleDrop: locked,
      },
    })
    if (this.options.onPasteClone === false) return [lock]

    // Clone on paste / drop / duplicate. Detected in appendTransaction (not transformPasted: that also runs for
    // a drag that moves the block, before ProseMirror knows it is a move). The id rewrite is appended to the
    // change, so it joins the same history event: undo removes the copy, redo brings it back with the same new
    // id (already copied). The copies themselves run async (ensureClone); the block shows "Copying board…".
    const clonePlugin = new Plugin({
      key: new PluginKey('sketchClone'),
      appendTransaction(trs, oldState, newState) {
        const changed = trs.filter(tr => tr.docChanged)
        if (!changed.length || changed.some(isRemote) || changed.some(tr => tr.getMeta(SKETCH_CLONE_META))) return null
        const mapping = new Mapping()
        for (const tr of changed) mapping.appendMapping(tr.mapping)
        const rewrites = findDuplicateBoards(oldState.doc, newState.doc, mapping, changed.some(isPasteLike))
        if (!rewrites.length) return null
        const tr = newState.tr
        for (const r of rewrites) {
          const node = tr.doc.nodeAt(r.pos)
          if (node) tr.setNodeMarkup(r.pos, undefined, { ...node.attrs, boardId: r.to })
        }
        return tr.setMeta(SKETCH_CLONE_META, rewrites.map(({ from, to }) => ({ from, to })))
      },
      state: {
        init: () => null,
        apply(tr, value) {
          const list = tr.getMeta(SKETCH_CLONE_META) as Array<{ from: string; to: string }> | undefined
          for (const { from, to } of list ?? []) if (!clones.has(to)) clones.set(to, { from, promise: null })
          return value
        },
      },
      // start the copies once the state is in (also when no view of the block mounts)
      view: () => ({
        update() {
          for (const [id, entry] of clones) if (!entry.promise) ensureClone(id)?.catch(() => {})
        },
      }),
    })
    return [lock, clonePlugin]
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
