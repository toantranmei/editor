import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { installRepair, REPAIR_ORIGIN } from '../src/collab/repair'
import { followBindings, withFollowers } from '../src/geometry/binding'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE, type ElementInit, type LinearElement, type SketchElement } from '../src/model/types'
import { createRelay, type Relay } from './helpers/relay'

interface Peer { store: BoardStore; scene: Scene; history: History; repairs: number; transactions: number }

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const f of cleanups.splice(0)) f()
})

function peer(doc: Y.Doc): Peer {
  const store = new BoardStore(doc)
  const scene = new Scene(store)
  const p: Peer = { store, scene, history: new History(store), repairs: 0, transactions: 0 }
  const onTr = (tr: Y.Transaction) => {
    p.transactions++
    if (tr.origin === REPAIR_ORIGIN) p.repairs++
  }
  doc.on('afterTransaction', onTr)
  const off = installRepair(store, scene)
  cleanups.push(() => {
    off()
    doc.off('afterTransaction', onTr)
    p.history.destroy()
    scene.destroy()
  })
  return p
}

function setup() {
  const relay: Relay = createRelay()
  cleanups.push(() => relay.destroy())
  return { relay, A: peer(relay.a), B: peer(relay.b) }
}

/** Lets queued repairs (microtasks) and the writes they trigger on the other peer run. */
const settle = () => new Promise(r => setTimeout(r, 0))

const rect = (store: BoardStore, x: number, y: number, over: Record<string, unknown> = {}) => store.create({
  ...DEFAULT_STYLE, type: 'rectangle', x, y, w: 100, h: 100, angle: 0, locked: false, label: '',
  fill: '#ffffff', fillStyle: 'solid', ...over,
} as ElementInit)

const frame = (store: BoardStore, x: number, y: number, w: number, h: number) => store.create({
  ...DEFAULT_STYLE, type: 'frame', name: 'F', x, y, w, h, angle: 0, locked: false,
} as ElementInit)

/** Two rects with an arrow from the right side of the first to the left side of the second, placed by follow. */
function arrowBetween(p: Peer) {
  const s1 = rect(p.store, 0, 0)
  const s2 = rect(p.store, 300, 0)
  const arrow = p.store.create({
    ...DEFAULT_STYLE, type: 'arrow', label: '', x: 100, y: 50, w: 200, h: 0, angle: 0, locked: false,
    points: [[0, 0], [200, 0]], routing: 'straight', startArrowhead: 'none', endArrowhead: 'arrow',
    startBinding: { id: s1.id, ax: 1, ay: 0.5 }, endBinding: { id: s2.id, ax: 0, ay: 0.5 },
  } as ElementInit)
  p.store.updateMany(followBindings(p.store, p.scene, [s1.id, s2.id]))
  p.history.stopCapturing()
  return { s1, s2, arrow }
}

/** A local move of `id` by (dx, dy), bound lines following (what a gesture writes). */
function moveLocal(p: Peer, id: string, dx: number, dy: number) {
  const el = p.store.get(id)!
  p.history.gesture(() => p.store.updateMany(withFollowers(p.store, p.scene, { [id]: { x: el.x + dx, y: el.y + dy } })))
  p.history.stopCapturing()
}

/** The arrow's ends sit on both targets: following them changes nothing (within float noise). */
function expectAttached(p: Peer, arrowId: string, targets: string[]) {
  const follow = followBindings(p.store, p.scene, targets)[arrowId] ?? {}
  const cur = p.store.get(arrowId) as LinearElement
  expect(cur.startBinding).not.toBeNull()
  expect(cur.endBinding).not.toBeNull()
  for (const [k, v] of Object.entries(follow)) {
    const c = (cur as unknown as Record<string, unknown>)[k]
    if (typeof v === 'number') expect(c as number).toBeCloseTo(v, 6)
    else expect(JSON.parse(JSON.stringify(c))).toEqual(JSON.parse(JSON.stringify(v)))
  }
}

const plain = (el: SketchElement | undefined) => el && { ...el, version: 0 }

describe('derived-data repair (relay)', () => {
  it('concurrent moves of both arrow targets converge to arrow attached to both', async () => {
    const { relay, A, B } = setup()
    const { s1, s2, arrow } = arrowBetween(A)
    await settle()
    expect(B.store.get(arrow.id)).toBeDefined()
    // offline, each peer moves one target (its arrow follows locally)
    relay.setMode('manual')
    moveLocal(A, s1.id, 0, 200)
    moveLocal(B, s2.id, 0, -200)
    relay.flush()
    await settle()
    relay.flush()
    await settle()
    for (const p of [A, B]) expectAttached(p, arrow.id, [s1.id, s2.id])
    expect(plain(A.store.get(arrow.id))).toEqual(plain(B.store.get(arrow.id)))
    expect(A.store.get(arrow.id)).toMatchObject({ startBinding: { id: s1.id }, endBinding: { id: s2.id } })
    // quiet afterwards: no further repair traffic
    const before = A.repairs + B.repairs
    relay.setMode('auto')
    await settle()
    expect(A.repairs + B.repairs).toBe(before)
    expect(relay.pending()).toEqual({ ab: 0, ba: 0 })
  })

  it('undo of local move re-follows bound arrows', async () => {
    const { A, B } = setup()
    const { s1, s2, arrow } = arrowBetween(A)
    await settle()
    moveLocal(A, s1.id, 0, 200)
    await settle()
    // the peer then moves the other target (its arrow write overwrites ours)
    moveLocal(B, s2.id, 400, 0)
    await settle()
    A.history.undo()
    await settle()
    expect(A.store.get(s1.id)).toMatchObject({ x: 0, y: 0 })
    expect(A.store.get(s2.id)).toMatchObject({ x: 700, y: 0 })
    for (const p of [A, B]) expectAttached(p, arrow.id, [s1.id, s2.id])
    expect(plain(A.store.get(arrow.id))).toEqual(plain(B.store.get(arrow.id)))
  })

  it('remote-deleted frame clears children frameId', async () => {
    const { relay, A, B } = setup()
    const f = frame(A.store, 0, 0, 400, 300)
    const r = rect(A.store, 600, 0)
    await settle()
    relay.setMode('manual')
    // A moves r into the frame while B deletes the frame (B does not know r is joining it)
    A.store.updateMany({ [r.id]: { x: 50, y: 50, frameId: f.id } })
    B.store.remove([f.id])
    relay.flush()
    await settle()
    relay.flush()
    await settle()
    for (const p of [A, B]) {
      expect(p.store.get(f.id)).toBeUndefined()
      expect(p.store.get(r.id)).toMatchObject({ x: 50, y: 50, frameId: null })
    }
  })

  it('a remote move into or out of a frame fixes frameId; locked elements are never written', async () => {
    const { relay, A, B } = setup()
    const f = frame(A.store, 0, 0, 400, 300)
    const r = rect(A.store, 600, 0)
    const lockedIn = rect(A.store, 20, 20, { frameId: f.id, locked: true })
    await settle()
    relay.setMode('manual')
    // concurrently: A moves r into the frame (frameId set), B moves the frame away; locked child stays stale
    A.store.updateMany({ [r.id]: { x: 50, y: 50, frameId: f.id } })
    B.store.updateMany({ [f.id]: { x: 1000 } })
    relay.flush()
    await settle()
    relay.flush()
    await settle()
    for (const p of [A, B]) {
      expect(p.store.get(r.id)).toMatchObject({ frameId: null })
      expect(p.store.get(lockedIn.id)).toMatchObject({ x: 20, frameId: f.id })
    }
  })

  it('no write when already consistent', async () => {
    const { A, B } = setup()
    const { s1, s2, arrow } = arrowBetween(A)
    const f = frame(A.store, -50, -50, 600, 400)
    A.store.updateMany({ [s1.id]: { frameId: f.id }, [s2.id]: { frameId: f.id }, [arrow.id]: { frameId: f.id } })
    await settle()
    expect(A.repairs + B.repairs).toBe(0)
    const before = B.transactions
    moveLocal(A, s1.id, 10, 0)
    moveLocal(A, s2.id, 0, 10)
    await settle()
    // B only applied A's updates: no repair write on either side
    expect(B.transactions - before).toBe(2)
    expect(A.repairs + B.repairs).toBe(0)
    // a local undo / redo of a consistent gesture is consistent too
    A.history.undo()
    await settle()
    A.history.redo()
    await settle()
    expect(A.repairs + B.repairs).toBe(0)
  })

  it('repair writes are not undoable', async () => {
    const A = peer(new Y.Doc())
    const { s1, arrow } = arrowBetween(A)
    const mine = rect(A.store, 0, 500)
    A.history.stopCapturing()
    // a peer moves s1 without its arrow (an older client, or a merge of concurrent edits)
    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(A.store.doc))
    new BoardStore(remote).update(s1.id, { y: 300 })
    Y.applyUpdate(A.store.doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(A.store.doc)), 'remote')
    await settle()
    expect(A.repairs).toBe(1)
    const repaired = plain(A.store.get(arrow.id))
    expectAttached(A, arrow.id, [s1.id])
    // undo takes back our own last step (the rect), never the repair
    A.history.undo()
    expect(A.store.get(mine.id)).toBeUndefined()
    expect(plain(A.store.get(arrow.id))).toEqual(repaired)
  })

  it('uninstall stops repairing', async () => {
    const doc = new Y.Doc()
    const store = new BoardStore(doc)
    const scene = new Scene(store)
    const { s1, arrow } = arrowBetween({ store, scene, history: new History(store), repairs: 0, transactions: 0 })
    const off = installRepair(store, scene)
    off()
    const before = store.get(arrow.id)
    doc.transact(() => (doc.getMap('elements') as Y.Map<Y.Map<unknown>>).get(s1.id)!.set('y', 400), 'remote')
    await settle()
    expect(store.get(arrow.id)).toEqual(before)
    scene.destroy()
  })
})
