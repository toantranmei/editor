import type { Editor } from '@tiptap/core'
import { mergeAttributes, Node } from '@tiptap/core'
import { blockNodeView } from '@toantranmei/editor'
import DatabaseNodeView from './DatabaseNodeView.vue'
import type { DatabaseBlockOptions, DatabaseKind } from './types'

export const DATABASE_NODE = 'databaseView'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    databaseView: {
      /** Inserts a block for an existing database. */
      insertDatabaseView: (attrs: { databaseId: string, viewId?: string | null, inline?: boolean }) => ReturnType
      /** "Database – inline" / "Database – full page": `createDatabase(kind)`, then inserts the block where the caret was. */
      createDatabase: (kind: DatabaseKind) => ReturnType
    }
  }
}

const defaults: DatabaseBlockOptions = {
  source: null,
  createDatabase: null,
  open: null,
  onError: null,
  messages: null,
  pageSize: 50,
  rangeLimit: 2000,
}

/** Mappable position (Yjs-aware with the Collaboration extension) while `createDatabase` runs. */
function track(editor: Editor, pos: number) {
  let position = editor.utils.createMappablePosition(pos)
  const onTransaction = ({ transaction }: { transaction: Parameters<Editor['utils']['getUpdatedPosition']>[1] }) => {
    position = editor.utils.getUpdatedPosition(position, transaction).position
  }
  editor.on('transaction', onTransaction)
  return { get: () => position.position, stop: () => editor.off('transaction', onTransaction) }
}

/** Puts the block at `pos`: replaces an empty paragraph there, else goes after that block, else at the caret. */
export function insertDatabaseAt(editor: Editor, pos: number | null, attrs: { databaseId: string, viewId?: string | null, inline?: boolean }): boolean {
  const content = { type: DATABASE_NODE, attrs: { viewId: null, inline: true, ...attrs } }
  const { doc } = editor.state
  if (pos !== null && pos >= 0 && pos < doc.content.size) {
    const target = doc.nodeAt(pos)
    if (target?.type.name === 'paragraph' && target.content.size === 0) {
      return editor.chain().insertContentAt({ from: pos, to: pos + target.nodeSize }, content).run()
    }
    if (target && editor.can().insertContentAt(pos + target.nodeSize, content)) {
      return editor.chain().insertContentAt(pos + target.nodeSize, content).run()
    }
  }
  return editor.chain().focus().insertContent(content).run()
}

/**
 * Database block: stores `databaseId`, `viewId` (the open tab) and `inline` (false: a link to a full-page database).
 * Everything else comes from the app's `DatabaseSource`.
 */
export const DatabaseViewNode = Node.create<DatabaseBlockOptions>({
  name: DATABASE_NODE,
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  isolating: true,

  addOptions: () => ({ ...defaults }),

  addAttributes() {
    return {
      databaseId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-database-id'),
        renderHTML: (attrs: Record<string, any>) => (attrs.databaseId ? { 'data-database-id': attrs.databaseId } : {}),
      },
      viewId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-view-id'),
        renderHTML: (attrs: Record<string, any>) => (attrs.viewId ? { 'data-view-id': attrs.viewId } : {}),
      },
      inline: {
        default: true,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-inline') !== 'false',
        renderHTML: (attrs: Record<string, any>) => (attrs.inline === false ? { 'data-inline': 'false' } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="database-view"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'database-view', 'class': 'me-db-node' }, HTMLAttributes)]
  },

  addNodeView() {
    const base = blockNodeView(DatabaseNodeView)
    // Everything inside the database UI (keys, copy / paste, drags, clicks) is the block's own, not ProseMirror's.
    return ((props: Parameters<typeof base>[0]) => {
      const view = base(props) as ReturnType<typeof base> & { dom: HTMLElement, stopEvent: (e: Event) => boolean }
      view.stopEvent = (event: Event) => {
        if (event.type === 'mousemove') return false
        const target = event.target as Element | null
        return !!target && view.dom.contains(target) && !!target.closest?.('.me-db, .me-db-link-row')
      }
      return view
    }) as typeof base
  },

  addCommands() {
    return {
      insertDatabaseView: attrs => ({ editor }) => {
        const { $from } = editor.state.selection
        return insertDatabaseAt(editor, $from.depth > 0 ? $from.before($from.depth) : null, attrs)
      },
      createDatabase: kind => ({ editor }) => {
        const { createDatabase, open, onError } = this.options
        if (!createDatabase) return false
        const { $from } = editor.state.selection
        const at = $from.depth > 0 ? $from.before($from.depth) : null
        const tracked = at === null ? null : track(editor, at)
        createDatabase(kind)
          .then((databaseId) => {
            tracked?.stop()
            if (editor.isDestroyed) return
            insertDatabaseAt(editor, tracked ? tracked.get() : null, { databaseId, inline: kind === 'inline' })
            if (kind === 'full_page') open?.(databaseId)
          })
          .catch((error) => {
            tracked?.stop()
            if (onError) onError(error)
            else console.error('[database-block]', error)
          })
        return true
      },
    }
  },
})
