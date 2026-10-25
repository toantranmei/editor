import * as Y from 'yjs'
import type { BoardConnection, SketchProvider } from '../providers/types'
import { assertBoardId } from './board-ids'

/**
 * Board copies (clone on paste / duplicate) and bundle imports. Imports yjs: load it lazily from the block
 * (node.ts) so the main entry stays free of it.
 */

/** Origin of updates written by a copy or an import. Never the store's LOCAL_ORIGIN (not undoable). */
export const COPY_ORIGIN = Symbol('sketch-copy')

/** Longest wait for a networked provider to report its write as saved, ms (`destroy` still flushes after it). */
export const PERSIST_WAIT_MS = 10_000

/**
 * Resolves once the connection has nothing pending: at once without a status (memory, indexeddb), else when the
 * status leaves 'connecting' / 'saving', or after `maxMs`. Rejects when it settles on 'error' or 'offline' and the
 * connection has no offline cache (`conn.offline`): the write would be lost when the connection is destroyed.
 */
function whenPersisted(conn: BoardConnection, maxMs: number): Promise<void> {
  const status = conn.status
  const busy = (s: string) => s === 'connecting' || s === 'saving'
  const lost = (s: string) => !conn.offline && (s === 'error' || s === 'offline')
  const failure = (s: string) => new Error(`sketch-block: the board could not be saved (${s})`)
  // a debounced save may only be scheduled: give the provider one turn to report 'saving'
  return new Promise<void>(resolve => setTimeout(resolve, 0)).then(() => {
    if (!status) return
    const now = status.get()
    if (lost(now)) throw failure(now)
    if (!busy(now)) return
    return new Promise<void>((resolve, reject) => {
      let off: () => void = () => {}
      const timer = setTimeout(() => finish(null), maxMs)
      function finish(s: string | null) {
        clearTimeout(timer)
        off()
        if (s !== null && lost(s)) reject(failure(s))
        else resolve()
      }
      off = status.on((s) => {
        if (!busy(s)) finish(s)
      })
    })
  })
}

/** The whole Yjs state of board `id`, or null when the provider has nothing stored for it. */
export async function readBoardState(provider: SketchProvider, id: string): Promise<Uint8Array | null> {
  const conn = await provider.connect(id)
  try {
    return conn.existed || conn.doc.store.clients.size > 0 ? Y.encodeStateAsUpdate(conn.doc) : null
  } finally {
    conn.destroy()
  }
}

/**
 * Merges `update` into board `id` (connect, apply, wait for the provider to persist it, destroy). Yjs updates
 * merge: state already in the board is kept. Throws when the update is malformed (nothing is written then).
 */
export async function applyBoardUpdate(
  provider: SketchProvider, id: string, update: Uint8Array, maxWaitMs = PERSIST_WAIT_MS,
): Promise<void> {
  // validate before touching the target board: a malformed update must not leave a half-written board
  Y.decodeUpdate(update)
  const conn = await provider.connect(id)
  try {
    Y.applyUpdate(conn.doc, update, COPY_ORIGIN)
    await whenPersisted(conn, maxWaitMs)
  } finally {
    conn.destroy()
  }
}

/**
 * Copies board `from` into board `to` through `connect` alone: reads `from`'s state and merges it into `to`.
 * Shared by clone on paste and bundle import. Throws when `from` has nothing stored.
 */
export async function copyBoardState(provider: SketchProvider, from: string, to: string): Promise<void> {
  const state = await readBoardState(provider, from)
  if (!state) throw new Error(`sketch-block: board ${from} has nothing to copy`)
  await applyBoardUpdate(provider, to, state)
}

/** Clone on paste: the provider's own `clone` when it has one, else `copyBoardState`. */
export async function cloneBoard(provider: SketchProvider, from: string, to: string): Promise<void> {
  assertBoardId(from)
  assertBoardId(to)
  if (provider.clone) await provider.clone(from, to)
  else await copyBoardState(provider, from, to)
}
