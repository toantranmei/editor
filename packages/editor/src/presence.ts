import { type Editor, Extension } from '@tiptap/core'
import { type EditorState, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import {
  absolutePositionToRelativePosition, relativePositionToAbsolutePosition, setMeta, ySyncPluginKey,
} from '@tiptap/y-tiptap'
import type { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'

/** Who a remote caret belongs to. */
export interface PresenceUser {
  name: string
  /** CSS colour of the caret, selection and active block (e.g. `presenceColor(i)`). */
  color: string
  avatarUrl?: string | null
}

/** `MeiCollaboration.presence`: remote carets and selections over a `y-protocols` awareness. */
export interface MeiPresence {
  awareness: Awareness
  /** Server-trusted identity of a remote Yjs client id; null = do not draw. */
  resolveUser: (clientId: number) => PresenceUser | null
}

/**
 * 12 caret colours, each with a contrast ≥ 3:1 against white and against the dark editor background (#191919).
 * Name labels use white text on the colour darkened to ≥ 4.5:1 (`labelBackground`). Adjacent entries differ in hue.
 */
export const PRESENCE_COLORS: readonly string[] = Object.freeze([
  '#e5484d', '#3e7ee8', '#3d9a50', '#a855f7', '#c97a0a', '#0797b9',
  '#d6409f', '#5b8a00', '#7c66dc', '#cf5a1f', '#0f9a8a', '#a68a00',
])

/** `PRESENCE_COLORS[index % 12]` (negative and fractional indexes are folded in). */
export function presenceColor(index: number): string {
  const n = PRESENCE_COLORS.length
  const i = Number.isFinite(index) ? Math.trunc(index) : 0
  return PRESENCE_COLORS[((i % n) + n) % n]!
}

/** Awareness field written by the local editor (same shape as y-tiptap's cursor plugin). */
const CURSOR_FIELD = 'cursor'
/** Local cursor updates are sent at most this often. */
const THROTTLE_MS = 50
/** The name label shows this long after a peer's caret moves or they type, then fades (presence.css). */
const LABEL_MS = 3000
/** A page hidden this long stops publishing its caret (restored when visible again). */
const HIDDEN_MS = 60_000

/**
 * `activity` counts local edits: typing mid-text keeps the relative position, so without it the peer's label would
 * not re-show while they type. Extra field, ignored by y-tiptap's own cursor plugin.
 */
interface CursorState { anchor: unknown, head: unknown, activity?: number }
interface PeerState {
  decorations: DecorationSet
  /** Absolute head position of every drawn peer, for `scrollToPeer`. */
  heads: Map<number, number>
}

const presenceKey = new PluginKey<PeerState>('meiPresence')

// Colours only reach a `style` attribute: refuse anything that could close the declaration.
const SAFE_COLOR = /^[#\w\s(),.%-]+$/
const safeColor = (color: string) => (SAFE_COLOR.test(color) ? color : PRESENCE_COLORS[0]!)

const channel = (v: number) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]: number[]) => 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!)
const toHex = (rgb: number[]) => `#${rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/**
 * Background of a name label for caret `color`: the colour itself, darkened just enough for white text to reach
 * 4.5:1. Non-hex colours are returned unchanged.
 */
export function labelBackground(color: string): string {
  const m = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color.trim())
  if (!m) return color
  const hex = m[1]!.length === 3 ? [...m[1]!].map(c => c + c).join('') : m[1]!
  const rgb = [0, 2, 4].map(i => Number.parseInt(hex.slice(i, i + 2), 16))
  for (let f = 1; f > 0; f -= 0.02) {
    const next = rgb.map(v => v * f)
    if (1.05 / (luminance(next) + 0.05) >= 4.5) return toHex(next)
  }
  return '#000000'
}

function caret(user: PresenceUser, color: string): HTMLElement {
  const el = document.createElement('span')
  el.className = 'me-peer-caret'
  el.style.setProperty('--me-peer-color', color)
  el.style.setProperty('--me-peer-label-bg', labelBackground(color))
  el.setAttribute('aria-hidden', 'true')
  const label = document.createElement('span')
  label.className = 'me-peer-label'
  label.textContent = user.name
  // Word joiners keep the caret from breaking the line around it.
  el.append('⁠', label, '⁠')
  return el
}

/**
 * Remote carets (with name labels), selections and the active block of each peer; publishes the local selection,
 * throttled. Names and colours come only from `resolveUser`, never from the remote awareness state.
 */
export function presenceExtension(presence: MeiPresence) {
  const { awareness, resolveUser } = presence

  return Extension.create({
    name: 'meiPresence',

    addProseMirrorPlugins() {
      const editor = this.editor
      /** Last cursor seen per peer and a counter bumped when it moves (restarts the label's fade). */
      const seen = new Map<number, { cursor: string, version: number, at: number }>()

      const build = (state: EditorState): PeerState => {
        const ystate = ySyncPluginKey.getState(state)
        const heads = new Map<number, number>()
        if (!ystate?.doc || !ystate.binding || ystate.snapshot != null || ystate.prevSnapshot != null || ystate.binding.mapping.size === 0) {
          return { decorations: DecorationSet.empty, heads }
        }
        const y = ystate.doc as Y.Doc
        const decorations: Decoration[] = []
        const blocks = new Set<number>()
        const max = Math.max(state.doc.content.size - 1, 0)
        const now = Date.now()
        awareness.getStates().forEach((aw, clientId) => {
          if (clientId === y.clientID) return
          const cursor = (aw as { [CURSOR_FIELD]?: CursorState | null })[CURSOR_FIELD]
          if (!cursor?.anchor || !cursor.head) return
          const user = resolveUser(clientId)
          if (!user) return
          const toAbs = (json: unknown) => {
            try {
              return relativePositionToAbsolutePosition(y, ystate.type, Y.createRelativePositionFromJSON(json), ystate.binding.mapping)
            }
            catch {
              return null
            }
          }
          let anchor = toAbs(cursor.anchor)
          let head = toAbs(cursor.head)
          if (anchor === null || head === null) return
          anchor = Math.min(anchor, max)
          head = Math.min(head, max)
          heads.set(clientId, head)

          const key = JSON.stringify(cursor)
          const last = seen.get(clientId)
          const entry = !last || last.cursor !== key ? { cursor: key, version: (last?.version ?? 0) + 1, at: now } : last
          seen.set(clientId, entry)
          const color = safeColor(user.color)
          // Same key while the peer stays put: ProseMirror keeps the element and its label fade running.
          decorations.push(Decoration.widget(head, () => {
            const el = caret(user, color)
            // A caret re-created later (e.g. its paragraph re-rendered) keeps the original 3 s countdown.
            el.style.setProperty('--me-peer-label-delay', `${Math.max(0, LABEL_MS - (Date.now() - entry.at))}ms`)
            return el
          }, { key: `${clientId}:${entry.version}:${user.name}:${color}`, side: 10 }))
          if (anchor !== head) {
            decorations.push(Decoration.inline(Math.min(anchor, head), Math.max(anchor, head), {
              class: 'me-peer-selection',
              style: `--me-peer-color: ${color}`,
            }, { inclusiveEnd: true, inclusiveStart: false }))
          }
          // The top-level block holding the caret.
          const $head = state.doc.resolve(head)
          const start = $head.depth >= 1 ? $head.before(1) : head
          const block = state.doc.nodeAt(start)
          if (block && !block.isInline && !blocks.has(start)) {
            blocks.add(start)
            decorations.push(Decoration.node(start, start + block.nodeSize, { class: 'me-peer-block', style: `--me-peer-color: ${color}` }))
          }
        })
        for (const id of seen.keys()) if (!heads.has(id)) seen.delete(id)
        return { decorations: DecorationSet.create(state.doc, decorations), heads }
      }

      return [new Plugin<PeerState>({
        key: presenceKey,
        state: {
          init: (_, state) => build(state),
          apply(tr, prev, _old, state) {
            const ystate = ySyncPluginKey.getState(state)
            if (ystate?.isChangeOrigin || tr.getMeta(presenceKey)?.awarenessUpdated) return build(state)
            if (!tr.docChanged) return prev
            const heads = new Map<number, number>()
            prev.heads.forEach((pos, id) => heads.set(id, tr.mapping.map(pos)))
            return { decorations: prev.decorations.map(tr.mapping, tr.doc), heads }
          },
        },
        props: {
          decorations: state => presenceKey.getState(state)?.decorations ?? DecorationSet.empty,
        },
        view: (view) => {
          // --- Remote: redraw on awareness changes ---------------------------------
          const redraw = () => {
            if (!view.isDestroyed) setMeta(view, presenceKey, { awarenessUpdated: true })
          }
          const onChange = (changes: { added: number[], updated: number[], removed: number[] }, origin: unknown) => {
            // Our own cursor needs no redraw.
            if (origin === 'local' && changes.updated.length === 1 && changes.updated[0] === awareness.clientID && !changes.added.length && !changes.removed.length) return
            redraw()
          }
          awareness.on('change', onChange)

          // --- Local: publish the selection, throttled; read-only editors publish nothing ---
          // Kept on blur (focus in a comment composer / popover must keep you visible); cleared when read-only,
          // destroyed or hidden for HIDDEN_MS. Nothing is published before the editor was first focused.
          let pending: CursorState | null | undefined
          let timer: ReturnType<typeof setTimeout> | null = null
          let lastSent = 0
          const send = () => {
            timer = null
            if (pending === undefined) return
            lastSent = Date.now()
            const value = pending
            pending = undefined
            awareness.setLocalStateField(CURSOR_FIELD, value)
          }
          const publish = (value: CursorState | null) => {
            pending = value
            const wait = THROTTLE_MS - (Date.now() - lastSent)
            if (wait <= 0) send()
            else timer ??= setTimeout(send, wait)
          }
          const current = () => (awareness.getLocalState() as { [CURSOR_FIELD]?: CursorState | null } | null)?.[CURSOR_FIELD] ?? null
          let focused = view.hasFocus()
          let hidden = false
          let hiddenTimer: ReturnType<typeof setTimeout> | null = null
          let activity = 0
          const update = (v: EditorView, prevState?: EditorState) => {
            const ystate = ySyncPluginKey.getState(v.state)
            if (!ystate?.binding || ystate.binding.projectionError != null) return
            if (v.hasFocus()) focused = true
            if (!editor.isEditable || hidden || !focused) {
              // A queued value counts: a pending null must not be overtaken by a stale "already null".
              if ((pending === undefined ? current() : pending) != null) publish(null)
              return
            }
            if (prevState && prevState.doc !== v.state.doc && !ystate.isChangeOrigin) activity++
            const { anchor, head } = v.state.selection
            const next: CursorState = {
              anchor: absolutePositionToRelativePosition(anchor, ystate.type, ystate.binding.mapping),
              head: absolutePositionToRelativePosition(head, ystate.type, ystate.binding.mapping),
              activity,
            }
            const before = pending === undefined ? current() : pending
            if (before?.anchor && before.head && (before.activity ?? 0) === activity
              && Y.compareRelativePositions(Y.createRelativePositionFromJSON(before.anchor), next.anchor as Y.RelativePosition)
              && Y.compareRelativePositions(Y.createRelativePositionFromJSON(before.head), next.head as Y.RelativePosition)) return
            publish(next)
          }
          const onFocus = () => update(view)
          view.dom.addEventListener('focusin', onFocus)
          const onVisibility = () => {
            if (hiddenTimer) clearTimeout(hiddenTimer)
            hiddenTimer = null
            if (document.visibilityState === 'hidden') {
              hiddenTimer = setTimeout(() => {
                hiddenTimer = null
                hidden = true
                if (!view.isDestroyed) update(view)
              }, HIDDEN_MS)
            }
            else if (hidden) {
              hidden = false
              if (!view.isDestroyed) update(view)
            }
          }
          const doc = typeof document === 'undefined' ? null : document
          doc?.addEventListener('visibilitychange', onVisibility)

          return {
            update,
            destroy: () => {
              view.dom.removeEventListener('focusin', onFocus)
              doc?.removeEventListener('visibilitychange', onVisibility)
              if (hiddenTimer) clearTimeout(hiddenTimer)
              awareness.off('change', onChange)
              if (timer) clearTimeout(timer)
              awareness.setLocalStateField(CURSOR_FIELD, null)
            },
          }
        },
      })]
    },
  })
}

/**
 * Redraws remote carets, e.g. after `resolveUser` changed its answer (a peer's access was revoked, names arrived).
 * Awareness changes redraw on their own.
 */
export function refreshPresence(editor: Editor): void {
  if (!editor.isDestroyed && presenceKey.getState(editor.state)) setMeta(editor.view, presenceKey, { awarenessUpdated: true })
}

/** Scrolls the editor to a peer's caret (e.g. on avatar click). False when that peer has no caret here. */
export function scrollToPeer(editor: Editor, clientId: number): boolean {
  if (editor.isDestroyed) return false
  const pos = presenceKey.getState(editor.state)?.heads.get(clientId)
  if (pos == null) return false
  const { node } = editor.view.domAtPos(pos)
  const el = node instanceof HTMLElement ? node : node.parentElement
  if (!el) return false
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  return true
}
