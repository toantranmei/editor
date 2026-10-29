import { type Editor, mergeAttributes, Node } from '@tiptap/core'
import { blockNodeView, currentRange, type JSONContent } from '@toantranmei/editor'
import { SYNCED_NODE } from './render'
import type { SyncedBlockOptions } from './types'
import SyncedBlockView from './SyncedBlockView.vue'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    syncedBlock: {
      /** Inserts a synced block showing an existing source (e.g. "Paste and sync"). */
      insertSyncedBlock: (sourceId: string) => ReturnType
      /**
       * "Synced block": creates a source (`create`), moves the selected blocks into it (an
       * empty line gives an empty source) and puts a synced block in their place.
       */
      createSyncedBlock: () => ReturnType
    }
  }
}

const defaults: SyncedBlockOptions = { doc: null, create: null, originHref: null, blocks: null, onError: null, messages: null }

export const reportError = (options: SyncedBlockOptions, error: unknown) => (options.onError ? options.onError(error) : console.error('[synced-block]', error))

/** A position that follows the document (Yjs-aware through the editor's mappable positions). */
function track(editor: Editor, pos: number) {
  let position = editor.utils.createMappablePosition(pos)
  const onTransaction = ({ transaction }: { transaction: Parameters<Editor['utils']['getUpdatedPosition']>[1] }) => {
    position = editor.utils.getUpdatedPosition(position, transaction).position
  }
  editor.on('transaction', onTransaction)
  return { get: () => position.position, stop: () => editor.off('transaction', onTransaction) }
}

const isEmptyLine = (blocks: JSONContent[]) => blocks.length === 1 && blocks[0]!.type === 'paragraph' && !blocks[0]!.content?.length

/**
 * Synced block: shows (and edits) a separate Yjs document, so the same content appears on
 * many pages. The node stores only `sourceId`.
 */
export const SyncedBlockNode = Node.create<SyncedBlockOptions>({
  name: SYNCED_NODE,
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  isolating: true,

  addOptions: () => ({ ...defaults }),

  addAttributes() {
    return {
      sourceId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-source-id'),
        renderHTML: (attrs: Record<string, any>) => (attrs.sourceId ? { 'data-source-id': attrs.sourceId } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="synced-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'synced-block', 'class': 'me-synced' }, HTMLAttributes)]
  },

  addNodeView() {
    const render = blockNodeView(SyncedBlockView)
    return (props) => {
      const view = render(props)
      // The nested editor handles its own events, DOM changes and selection.
      const stop = view.stopEvent?.bind(view)
      view.stopEvent = (event: Event) => {
        const target = event.target as Element | null
        if (target?.closest?.('.me-synced-content')) return true
        return stop ? stop(event) : false
      }
      view.ignoreMutation = () => true
      return view
    }
  },

  addCommands() {
    return {
      insertSyncedBlock: sourceId => ({ commands }) => commands.insertContent({ type: this.name, attrs: { sourceId } }),

      createSyncedBlock: () => ({ editor }) => {
        const { create, doc } = this.options
        if (!create || !doc) return false
        const range = currentRange(editor.state)
        if (!range) return false
        const blocks = (editor.state.doc.slice(range.from, range.to).content.toJSON() ?? []) as JSONContent[]
        const content: JSONContent = { type: 'doc', content: blocks.length && !isEmptyLine(blocks) ? blocks : [{ type: 'paragraph' }] }
        const from = track(editor, range.from)
        const to = track(editor, range.to)
        const stop = () => {
          from.stop()
          to.stop()
        }
        ;(async () => {
          const sourceId = await create()
          const source = await doc(sourceId)
          if (!source) throw new Error(`synced-block: no document for new source ${sourceId}`)
          const { fillDocument } = await import('@toantranmei/editor/collaboration')
          fillDocument(source.doc, content, editor.schema, source.field)
          stop()
          if (editor.isDestroyed) return
          const node = editor.schema.nodes[SYNCED_NODE]!.create({ sourceId })
          const a = from.get()
          const b = to.get()
          const tr = editor.state.tr
          if (a < b && b <= tr.doc.content.size) tr.replaceWith(a, b, node)
          else tr.insert(Math.min(a, tr.doc.content.size), node)
          editor.view.dispatch(tr.scrollIntoView())
        })().catch((error) => {
          stop()
          reportError(this.options, error)
        })
        return true
      },
    }
  },
})
