import { type Editor, Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { effectScope, isRef, watch } from 'vue'
import { COMMENT_MARK, indexDocument, threadRanges } from './anchor'
import { useCommentsState } from './store'
import type { CommentsLevel, CommentsOptions, Thread } from './types'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      /** Marks the selection (or `range`) as commented by `threadId`. */
      setComment: (threadId: string, range?: { from: number, to: number }) => ReturnType
      /** Removes a thread's marks from the whole document. */
      unsetComment: (threadId: string) => ReturnType
    }
  }
}

/**
 * `comment` mark: `threadId` on the commented text. Not inclusive (typing at its edges
 * isn't commented) and overlapping threads can share text. Works in collaboration mode
 * (marks are synced through the Yjs document).
 */
export const CommentMark = Mark.create({
  name: COMMENT_MARK,
  inclusive: false,
  excludes: '',
  spanning: true,

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: el => el.getAttribute('data-comment-thread'),
        renderHTML: attrs => (attrs.threadId ? { 'data-comment-thread': attrs.threadId } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-thread]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'me-comment-mark' }), 0]
  },

  addCommands() {
    return {
      setComment: (threadId, range) => ({ tr, state, dispatch }) => {
        const { from, to } = range ?? state.selection
        if (from === to) return false
        if (dispatch) tr.addMark(from, to, this.type.create({ threadId }))
        return true
      },
      unsetComment: threadId => ({ tr, state, dispatch }) => {
        const ranges: { from: number, to: number }[] = []
        state.doc.descendants((node, pos) => {
          if (node.isText && node.marks.some(m => m.type === this.type && m.attrs.threadId === threadId)) ranges.push({ from: pos, to: pos + node.nodeSize })
        })
        if (!ranges.length) return false
        if (dispatch) {
          for (const r of ranges) {
            const mark = state.doc.nodeAt(r.from)?.marks.find(m => m.type === this.type && m.attrs.threadId === threadId)
            if (mark) tr.removeMark(r.from, r.to, mark)
          }
        }
        return true
      },
    }
  },
})

export const commentsPluginKey = new PluginKey<HighlightState>('comments')

interface HighlightState {
  threads: Thread[]
  activeId: string | null
  draft: { from: number, to: number } | null
  decorations: DecorationSet
}

type Meta = Partial<Pick<HighlightState, 'threads' | 'activeId' | 'draft'>>

function decorate(doc: Parameters<typeof DecorationSet.create>[0], s: Omit<HighlightState, 'decorations'>): DecorationSet {
  const decos: Decoration[] = []
  if (s.threads.length) {
    const index = indexDocument(doc)
    for (const thread of s.threads) {
      for (const r of threadRanges(thread, index)) {
        decos.push(Decoration.inline(r.from, r.to, {
          'class': `me-comment-highlight${thread.id === s.activeId ? ' is-active' : ''}`,
          'data-thread-id': thread.id,
        }, { threadId: thread.id }))
      }
    }
  }
  if (s.draft && s.draft.from < s.draft.to && s.draft.to <= doc.content.size) {
    decos.push(Decoration.inline(s.draft.from, s.draft.to, { class: 'me-comment-highlight is-active is-draft' }))
  }
  return DecorationSet.create(doc, decos)
}

export const levelOf = (level: CommentsOptions['level']): CommentsLevel =>
  (typeof level === 'function' ? level() : isRef(level) ? level.value : level) ?? 'edit'

/** True when this level may add comments and replies. */
export const canComment = (level: CommentsLevel) => level !== 'view'

/**
 * Highlights open threads (their marks, or the quote of comment-only anchors), the active
 * thread and the draft; clicking a highlight opens its thread.
 */
export const CommentsExtension = CommentMark.extend<CommentsOptions>({
  addOptions: () => ({ source: null, level: 'edit', onCompose: null, onOpenThread: null, messages: null }),

  addProseMirrorPlugins() {
    const options = this.options
    const source = options.source
    const editor = this.editor as Editor
    const current = (): Omit<HighlightState, 'decorations'> => {
      if (!source) return { threads: [], activeId: null, draft: null }
      const state = useCommentsState(source)
      const draft = state.draft.value?.editor === editor ? state.draft.value : null
      return {
        threads: source.threads.value.filter(t => !t.resolved_at),
        activeId: state.activeId.value,
        draft: draft ? { from: draft.from, to: draft.to } : null,
      }
    }
    return [
      new Plugin<HighlightState>({
        key: commentsPluginKey,
        state: {
          init: (_, state) => {
            const s = current()
            return { ...s, decorations: decorate(state.doc, s) }
          },
          apply: (tr, value, _old, state) => {
            const meta = tr.getMeta(commentsPluginKey) as Meta | undefined
            if (!meta && !tr.docChanged) return value
            const next = { ...value, ...meta }
            if (!meta?.draft && next.draft && tr.docChanged) next.draft = { from: tr.mapping.map(next.draft.from, 1), to: tr.mapping.map(next.draft.to, -1) }
            return { ...next, decorations: decorate(state.doc, next) }
          },
        },
        props: {
          decorations: state => commentsPluginKey.getState(state)?.decorations,
          handleClick: (view, pos) => {
            const s = commentsPluginKey.getState(view.state)
            if (!s || !source) return false
            const id = s.decorations.find(pos, pos, spec => !!spec.threadId)[0]?.spec.threadId as string | undefined
            if (!id) return false
            useCommentsState(source).activeId.value = id
            options.onOpenThread?.(id)
            return false
          },
        },
        // Follow the source: threads, the active thread and this editor's draft.
        view: (view) => {
          if (!source) return {}
          const state = useCommentsState(source)
          const scope = effectScope(true)
          scope.run(() => {
            watch(
              // Signatures, so adapters may replace or mutate threads in place.
              [
                () => source.threads.value.map(t => `${t.id}:${t.resolved_at ? 1 : 0}:${t.anchor.kind === 'text' ? `${t.anchor.block_id}:${t.anchor.quote}` : ''}`).join('|'),
                state.activeId,
                () => (state.draft.value?.editor === editor ? state.draft.value : null),
              ],
              () => {
                if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(commentsPluginKey, current() satisfies Meta))
              },
            )
          })
          return { destroy: () => scope.stop() }
        },
      }),
    ]
  },

})
