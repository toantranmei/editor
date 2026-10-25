import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE, type ElementInit, type ShapeElement } from '../src/model/types'
import { type PointerInput, ToolController } from '../src/tools/controller'
import { Viewport } from '../src/viewport'
import { createRelay, type Relay } from './helpers/relay'

// ---------- manual requestAnimationFrame ----------
let frames: FrameRequestCallback[] = []
const flushFrames = () => {
  const run = frames
  frames = []
  for (const cb of run) cb(0)
}

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => vi.unstubAllGlobals())

// ---------- harness: two peers over a relay; peer A has a tool controller ----------
interface Peer { store: BoardStore; scene: Scene; history: History }

function peer(doc: Y.Doc): Peer {
  const store = new BoardStore(doc)
  return { store, scene: new Scene(store), history: new History(store) }
}

function setup(mode: 'auto' | 'manual' = 'auto') {
  const relay: Relay = createRelay({ mode })
  const A = peer(relay.a)
  const B = peer(relay.b)
  const viewport = new Viewport()
  const c = new ToolController({ store: A.store, scene: A.scene, history: A.history, viewport, readonly: () => false, invalidate: () => {} })
  return { relay, A, B, c }
}

const ptr = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({
  screen: { x, y }, button: 0, shift: false, alt: false, mod: false, pressure: 0.5, ...extra,
})
const key = (k: string) => ({ key: k, mod: false, shift: false })

function rect(store: BoardStore, x: number, y: number, over: Partial<ShapeElement> = {}) {
  return store.create({
    ...DEFAULT_STYLE, type: 'rectangle', x, y, w: 100, h: 100, angle: 0, locked: false, label: '',
    fill: '#ffffff', fillStyle: 'solid', ...over,
  } as ElementInit)
}

const SRC = 'https://cdn.example/a.png'
const imageInit = (): ElementInit => ({
  ...DEFAULT_STYLE, type: 'image', x: 0, y: 0, w: 200, h: 100, angle: 0, locked: false,
  src: SRC, naturalW: 400, naturalH: 200, crop: null,
} as ElementInit)

describe('concurrent edits: local gestures stay robust (relay)', () => {
  it('remote delete during local drag', () => {
    const { A, B, c } = setup()
    const r1 = rect(A.store, 0, 0)
    const r2 = rect(A.store, 300, 0)
    A.history.stopCapturing()
    c.setSelection([r1.id, r2.id])
    c.pointerDown(ptr(50, 50))
    c.pointerMove(ptr(60, 60))
    flushFrames()
    expect(B.store.get(r1.id)).toMatchObject({ x: 10, y: 10 })
    // the peer deletes r1 mid-drag
    B.store.remove([r1.id])
    expect(A.store.get(r1.id)).toBeUndefined()
    c.pointerMove(ptr(80, 80))
    flushFrames()
    c.pointerUp(ptr(80, 80))
    // a local write never recreates it; the rest of the gesture still applies
    for (const s of [A.store, B.store]) {
      expect(s.get(r1.id)).toBeUndefined()
      expect(s.get(r2.id)).toMatchObject({ x: 330, y: 30 })
    }
    expect(A.store.doc.getMap('elements').has(r1.id)).toBe(false)
  })

  it('remote delete during local drag: the element leaves the gesture (later frames and revert skip it)', () => {
    const { A, B, c } = setup()
    const r1 = rect(A.store, 0, 0)
    const r2 = rect(A.store, 300, 0)
    A.history.stopCapturing()
    c.setSelection([r1.id, r2.id])
    c.pointerDown(ptr(50, 50))
    c.pointerMove(ptr(60, 60))
    flushFrames()
    // the peer deletes r1, then brings it back (its own undo) where it was before our drag
    B.store.remove([r1.id])
    B.history.undo()
    expect(A.store.get(r1.id)).toMatchObject({ x: 10, y: 10 })
    B.store.update(r1.id, { x: 1000, y: 1000 })
    // later frames leave it alone
    c.pointerMove(ptr(80, 80))
    flushFrames()
    expect(A.store.get(r1.id)).toMatchObject({ x: 1000, y: 1000 })
    expect(A.store.get(r2.id)).toMatchObject({ x: 330, y: 30 })
    // so does the revert (Escape)
    c.keyDown(key('Escape'))
    for (const s of [A.store, B.store]) {
      expect(s.get(r1.id)).toMatchObject({ x: 1000, y: 1000 })
      expect(s.get(r2.id)).toMatchObject({ x: 300, y: 0 })
    }
    expect(A.history.canUndo.value).toBe(true) // the creation only
  })

  it('remote delete during resize, rotate and point drag: later frames skip the target', () => {
    const { A, B, c } = setup()
    const r1 = rect(A.store, 0, 0)
    A.history.stopCapturing()
    c.setSelection([r1.id])
    // se resize handle at (100, 100)
    c.pointerDown(ptr(100, 100))
    c.pointerMove(ptr(120, 120))
    flushFrames()
    expect(A.store.get(r1.id)).toMatchObject({ w: 120, h: 120 })
    B.store.remove([r1.id])
    B.history.undo()
    B.store.update(r1.id, { w: 50, h: 50 })
    c.pointerMove(ptr(150, 150))
    flushFrames()
    c.pointerUp(ptr(150, 150))
    expect(A.store.get(r1.id)).toMatchObject({ w: 50, h: 50 })
    expect(B.store.get(r1.id)).toMatchObject({ w: 50, h: 50 })
  })

  it('remote delete during text edit', () => {
    const { A, B, c } = setup()
    const r1 = rect(A.store, 0, 0)
    A.history.stopCapturing()
    c.startEditing(r1.id, 'label')
    expect(c.editing.value).toMatchObject({ id: r1.id, kind: 'label' })
    B.store.remove([r1.id])
    // the editor closes without writing
    expect(c.editing.value).toBeNull()
    expect(c.isGestureActive()).toBe(false)
    c.commitEditing('typed')
    expect(A.store.doc.getMap('elements').has(r1.id)).toBe(false)
    expect(B.store.doc.getMap('elements').has(r1.id)).toBe(false)

    // a text element created for the edit, deleted remotely: nothing comes back and no step is left to undo
    c.editAt({ x: 500, y: 500 })
    const target = c.editing.value!
    expect(target.kind).toBe('text')
    B.store.remove([target.id])
    expect(c.editing.value).toBeNull()
    c.commitEditing('hello')
    expect(A.store.doc.getMap('elements').has(target.id)).toBe(false)
    // the only step left is r1's creation (the text's creation was dropped with the edit)
    A.history.undo()
    expect(A.history.canUndo.value).toBe(false)
  })

  it('remote delete during crop', () => {
    const { A, B, c } = setup()
    const img = A.store.create(imageInit())
    A.history.stopCapturing()
    expect(c.startCrop(img.id)).toBe(true)
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(50, 20))
    // the peer deletes the image mid-crop-drag
    B.store.remove([img.id])
    expect(c.cropping.value).toBeNull()
    expect(c.isGestureActive()).toBe(false)
    c.pointerMove(ptr(60, 30))
    c.pointerUp(ptr(60, 30))
    c.keyDown(key('Enter'))
    expect(A.store.doc.getMap('elements').has(img.id)).toBe(false)
    expect(B.store.doc.getMap('elements').has(img.id)).toBe(false)
    // only the creation is undoable
    A.history.undo()
    expect(A.history.canUndo.value).toBe(false)
  })

  it('remote move of other element during our drag survives', () => {
    const { A, B, c } = setup()
    const r1 = rect(A.store, 0, 0)
    const r2 = rect(A.store, 300, 0)
    A.history.stopCapturing()
    c.setSelection([r1.id])
    c.pointerDown(ptr(50, 50))
    c.pointerMove(ptr(60, 60))
    flushFrames()
    // the peer moves r2 and restyles r1 mid-drag
    B.store.update(r2.id, { x: 500, y: 400 })
    B.store.update(r1.id, { stroke: '#e03131' })
    c.pointerMove(ptr(80, 80))
    flushFrames()
    c.pointerUp(ptr(80, 80))
    for (const s of [A.store, B.store]) {
      expect(s.get(r2.id)).toMatchObject({ x: 500, y: 400 })
      expect(s.get(r1.id)).toMatchObject({ x: 30, y: 30, stroke: '#e03131' })
    }
    // a cancelled drag reverts only the keys it wrote, of its own elements
    c.pointerDown(ptr(50, 50))
    c.pointerMove(ptr(70, 70))
    flushFrames()
    B.store.update(r2.id, { x: 600 })
    B.store.update(r1.id, { fill: '#2f9e44' })
    c.keyDown(key('Escape'))
    for (const s of [A.store, B.store]) {
      expect(s.get(r2.id)).toMatchObject({ x: 600, y: 400 })
      expect(s.get(r1.id)).toMatchObject({ x: 30, y: 30, stroke: '#e03131', fill: '#2f9e44' })
    }
  })

  it('undo after remote edits only reverts ours', () => {
    const { A, B, c } = setup()
    const r1 = rect(A.store, 0, 0)
    const r2 = rect(A.store, 300, 0)
    A.history.stopCapturing()
    c.setSelection([r1.id])
    c.pointerDown(ptr(50, 50))
    c.pointerMove(ptr(100, 50))
    flushFrames()
    c.pointerUp(ptr(100, 50))
    expect(B.store.get(r1.id)).toMatchObject({ x: 50 })
    // remote edits after ours: another element moved, ours restyled, a new one created
    B.store.update(r2.id, { x: 700 })
    B.store.update(r1.id, { stroke: '#1971c2' })
    const r3 = rect(B.store, 0, 500)
    A.history.undo()
    for (const s of [A.store, B.store]) {
      expect(s.get(r1.id)).toMatchObject({ x: 0, y: 0, stroke: '#1971c2' })
      expect(s.get(r2.id)).toMatchObject({ x: 700 })
      expect(s.get(r3.id)).toBeDefined()
    }
    // the remaining local step is the creation of r1 / r2; the remote r3 is never undone
    A.history.undo()
    expect(A.store.get(r1.id)).toBeUndefined()
    expect(A.store.get(r3.id)).toBeDefined()
    expect(A.history.canUndo.value).toBe(false)
  })

  it('offline edits merged on reconnect then undo is local-only', () => {
    const { relay, A, B, c } = setup()
    const r1 = rect(A.store, 0, 0)
    const r2 = rect(A.store, 300, 0)
    A.history.stopCapturing()
    // both go offline and edit
    relay.setMode('manual')
    c.setSelection([r1.id])
    c.keyDown(key('ArrowRight'))
    A.history.stopCapturing()
    B.store.update(r2.id, { y: 250 })
    const r3 = rect(B.store, 0, 600)
    expect(relay.pending().ab).toBeGreaterThan(0)
    expect(relay.pending().ba).toBeGreaterThan(0)
    // reconnect
    relay.setMode('auto')
    for (const s of [A.store, B.store]) {
      expect(s.get(r1.id)).toMatchObject({ x: 1 })
      expect(s.get(r2.id)).toMatchObject({ y: 250 })
      expect(s.get(r3.id)).toBeDefined()
    }
    A.history.undo()
    for (const s of [A.store, B.store]) {
      expect(s.get(r1.id)).toMatchObject({ x: 0 })
      expect(s.get(r2.id)).toMatchObject({ y: 250 })
      expect(s.get(r3.id)).toBeDefined()
    }
    expect(Y.encodeStateVector(A.store.doc)).toEqual(Y.encodeStateVector(B.store.doc))
  })
})
