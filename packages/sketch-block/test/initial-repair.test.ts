import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { createBoardSession, REPAIR_ORIGIN } from '../src/engine'
import { followBindings, withFollowers } from '../src/geometry/binding'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE, type ElementInit, type LinearElement } from '../src/model/types'
import { http, indexeddb } from '../src/providers'
import { createRelay } from './helpers/relay'

vi.mock('../src/text/fonts', async orig => ({
  ...(await orig<typeof import('../src/text/fonts')>()),
  loadFonts: () => Promise.resolve(),
}))

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const f of cleanups.splice(0)) f()
})

const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise(r => setTimeout(r, 0))
}

const rect = (store: BoardStore, x: number, y: number) => store.create({
  ...DEFAULT_STYLE, type: 'rectangle', x, y, w: 100, h: 100, angle: 0, locked: false, label: '',
} as ElementInit)

/** Whether following the arrow's targets would change it: false = attached to both. */
function detached(store: BoardStore, arrowId: string, targets: string[]): boolean {
  const scene = new Scene(store)
  try {
    const follow = followBindings(store, scene, targets)[arrowId] ?? {}
    const cur = store.get(arrowId) as unknown as Record<string, unknown>
    return Object.entries(follow).some(([k, v]) => JSON.stringify(cur[k]) !== JSON.stringify(v)
      && !(typeof v === 'number' && Math.abs((cur[k] as number) - v) < 1e-6))
  } finally {
    scene.destroy()
  }
}

const move = (store: BoardStore, id: string, dx: number, dy: number) => {
  const scene = new Scene(store)
  const el = store.get(id)!
  store.updateMany(withFollowers(store, scene, { [id]: { x: el.x + dx, y: el.y + dy } }))
  scene.destroy()
}

/**
 * The server holds a peer's move of one arrow target; this browser's IndexedDB holds its own offline move of the
 * other target. Returns the http connection (both merged on connect: the arrow is attached to only one target).
 */
async function divergedConnection(boardId: string) {
  // two peers that share the base board (relay), then go apart
  const relay = createRelay()
  cleanups.push(() => relay.destroy())
  const server = new BoardStore(relay.a)
  const s1 = rect(server, 0, 0)
  const s2 = rect(server, 300, 0)
  const arrow = server.create({
    ...DEFAULT_STYLE, type: 'arrow', label: '', x: 100, y: 50, w: 200, h: 0, angle: 0, locked: false,
    points: [[0, 0], [200, 0]], routing: 'straight', startArrowhead: 'none', endArrowhead: 'arrow',
    startBinding: { id: s1.id, ax: 1, ay: 0.5 }, endBinding: { id: s2.id, ax: 0, ay: 0.5 },
  } as ElementInit)
  relay.setMode('manual')
  move(server, s2.id, 0, -200)
  move(new BoardStore(relay.b), s1.id, 0, 200)

  // b's state goes to this browser's offline cache, a's to the server
  const cache = await indexeddb().connect(boardId)
  Y.applyUpdate(cache.doc, Y.encodeStateAsUpdate(relay.b))
  await new Promise(r => setTimeout(r, 20))
  cache.destroy()
  const stored = Y.encodeStateAsUpdate(relay.a)
  const conn = await http({ load: async () => stored, save: async () => {}, debounceMs: 10 }).connect(boardId)
  cleanups.push(() => conn.destroy())
  return { conn, s1, s2, arrow }
}

describe('initial repair of a provider load', () => {
  it('an inconsistent arrow from offline edits merged on connect converges after session creation', async () => {
    const { conn, s1, s2, arrow } = await divergedConnection('bd_initial01')
    const store = new BoardStore(conn.doc)
    expect(store.get(s1.id)).toMatchObject({ y: 200 })
    expect(store.get(s2.id)).toMatchObject({ y: -200 })
    expect(detached(store, arrow.id, [s1.id, s2.id])).toBe(true)

    const origins: unknown[] = []
    conn.doc.on('afterTransaction', (tr: Y.Transaction) => origins.push(tr.origin))
    const session = createBoardSession(conn)
    cleanups.push(() => session.destroy())
    await settle()
    expect(detached(store, arrow.id, [s1.id, s2.id])).toBe(false)
    expect((store.get(arrow.id) as LinearElement).startBinding?.id).toBe(s1.id)
    expect(origins).toContain(REPAIR_ORIGIN)
    // not undoable
    expect(session.history.canUndo.value).toBe(false)
  })

  it('read-only defers the pass until the board can write', async () => {
    const { conn, s1, s2, arrow } = await divergedConnection('bd_initial02')
    const session = createBoardSession(conn)
    cleanups.push(() => session.destroy())
    session.canWrite.value = false // a read-only board, set before the first microtask
    await settle()
    expect(detached(session.store, arrow.id, [s1.id, s2.id])).toBe(true)
    session.canWrite.value = true
    await settle()
    expect(detached(session.store, arrow.id, [s1.id, s2.id])).toBe(false)
  })
})
