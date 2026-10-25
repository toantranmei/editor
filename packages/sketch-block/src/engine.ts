// Heavy part of the package (roughjs, rbush, board UI). Loaded lazily by the node view.
import { type Ref, ref, toRaw, watch } from 'vue'
import { PresencePublisher, type PresenceUser } from './collab/presence'
import { installRepair, repair } from './collab/repair'
import { History } from './model/history'
import { Scene } from './model/scene'
import { BoardStore } from './model/store'
import type { ShapeType } from './model/types'
import type { BoardConnection } from './providers/types'

export { default as SketchBoard } from './ui/SketchBoard.vue'
export { makePreview } from './io/svg'
export { loadFonts, onFontsLoaded } from './text/fonts'
export { installRepair, REPAIR_ORIGIN } from './collab/repair'

/**
 * State that outlives one board mount: the inline board and the fullscreen board share it, so the undo stack and
 * the local view settings (zen, view mode, snapping, the shapes button's last shape) survive switching between
 * them. None of it is persisted. Boards given a session never destroy it.
 */
export interface BoardSession {
  readonly store: BoardStore
  /** Scene (spatial index) of the store, shared by the boards mounted on this session. */
  readonly scene: Scene
  readonly history: History
  /**
   * Whether the derived-data repair observer (one per session) may write; a read-only board turns it off, leaving
   * repairs to the peers that can write.
   */
  readonly canWrite: Ref<boolean>
  /** Zen mode: tool bars hidden. */
  readonly zen: Ref<boolean>
  /** View mode: read-only, hand tool only. */
  readonly viewMode: Ref<boolean>
  /** Grid shown and snapped to (off by default). */
  readonly grid: Ref<boolean>
  /** Object snap (on by default). */
  readonly objectSnap: Ref<boolean>
  /** Shape last chosen from the shapes popover (null = none yet). */
  readonly lastShape: Ref<ShapeType | null>
  /**
   * The publisher of our presence on the connection's awareness (null without one), created on first use with
   * `user`. Owned by the session: boards borrow it, so a remount (inline ↔ fullscreen) never clears our awareness
   * state (peers following us keep following). Destroyed with the session.
   */
  presence(user: PresenceUser): PresencePublisher | null
  destroy(): void
}

export function createBoardSession(connection: BoardConnection): BoardSession {
  // toRaw: Vue proxies around Yjs types break Yjs identity checks (UndoManager scope, origins)
  const doc = toRaw(toRaw(connection).doc)
  const store = new BoardStore(doc)
  const scene = new Scene(store)
  const history = new History(store)
  const canWrite = ref(true)
  const awareness = toRaw(toRaw(connection).awareness) ?? null
  let publisher: PresencePublisher | null = null
  // one repair observer per session (the inline and fullscreen boards share it)
  const uninstallRepair = installRepair(store, scene, { canWrite: () => canWrite.value })
  let destroyed = false
  // The provider's load (server state merged with an offline cache) came in before the observer: one full pass on
  // the next microtask, and again whenever the board becomes writable (changes seen while read-only were dropped).
  const repairAll = () => {
    if (!destroyed && canWrite.value) repair(store, scene, store.all().map(el => el.id))
  }
  queueMicrotask(repairAll)
  const stopWritable = watch(canWrite, (now, before) => {
    if (now && !before) queueMicrotask(repairAll)
  }, { flush: 'sync' })
  return {
    store,
    scene,
    history,
    canWrite,
    zen: ref(false),
    viewMode: ref(false),
    grid: ref(false),
    objectSnap: ref(true),
    lastShape: ref<ShapeType | null>(null),
    presence(user) {
      if (!awareness || destroyed) return null
      return (publisher ??= new PresencePublisher(awareness, user))
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      publisher?.destroy()
      publisher = null
      stopWritable()
      uninstallRepair()
      history.destroy()
      scene.destroy()
    },
  }
}
