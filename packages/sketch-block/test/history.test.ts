import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { History } from '../src/model/history'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE } from '../src/model/types'

const init = (over: Record<string, unknown> = {}) => ({
  type: 'rectangle' as const, x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false,
  ...DEFAULT_STYLE, ...over,
})

describe('History', () => {
  it('undo reverts local create', () => {
    const store = new BoardStore(new Y.Doc())
    const h = new History(store)
    store.create(init())
    expect(store.all()).toHaveLength(1)
    h.undo()
    expect(store.all()).toHaveLength(0)
    h.redo()
    expect(store.all()).toHaveLength(1)
    h.destroy()
  })

  it('undo does not revert remote changes', () => {
    const local = new Y.Doc()
    const remote = new Y.Doc()
    const store = new BoardStore(local)
    const h = new History(store)
    const a = store.create(init())
    const b = new BoardStore(remote).create(init({ x: 500 }))
    Y.applyUpdate(local, Y.encodeStateAsUpdate(remote))
    expect(store.all()).toHaveLength(2)
    h.undo()
    expect(store.all().map(e => e.id)).toEqual([b.id])
    expect(store.get(a.id)).toBeUndefined()
    h.undo()
    expect(store.get(b.id)).toBeDefined()
    h.destroy()
  })

  it('stopCapturing splits a drag from the next edit into separate undo steps', () => {
    const store = new BoardStore(new Y.Doc())
    const h = new History(store)
    const a = store.create(init())
    h.stopCapturing()
    store.update(a.id, { x: 10 })
    store.update(a.id, { x: 20 })
    h.stopCapturing()
    store.update(a.id, { x: 30 })
    h.undo()
    expect(store.get(a.id)!.x).toBe(20)
    h.undo()
    expect(store.get(a.id)!.x).toBe(0)
    h.undo()
    expect(store.get(a.id)).toBeUndefined()
    h.destroy()
  })

  it('canUndo/canRedo refs update', () => {
    const store = new BoardStore(new Y.Doc())
    const h = new History(store)
    expect(h.canUndo.value).toBe(false)
    expect(h.canRedo.value).toBe(false)
    store.create(init())
    expect(h.canUndo.value).toBe(true)
    expect(h.canRedo.value).toBe(false)
    h.undo()
    expect(h.canUndo.value).toBe(false)
    expect(h.canRedo.value).toBe(true)
    h.redo()
    expect(h.canUndo.value).toBe(true)
    expect(h.canRedo.value).toBe(false)
    h.destroy()
  })

  // yjs reads time via lib0's `getUnixTime = Date.now`, bound at import: fake timers cannot
  // move it, so these use real waits around the 300 ms capture timeout.
  describe('gestures', () => {
    const pause = (ms: number) => new Promise(r => setTimeout(r, ms))

    it('beginGesture merges edits regardless of pauses until endGesture', async () => {
      const store = new BoardStore(new Y.Doc())
      const h = new History(store)
      const a = store.create(init())
      h.beginGesture()
      store.update(a.id, { x: 10 })
      await pause(350)
      store.update(a.id, { x: 20 })
      h.endGesture()
      h.undo()
      expect(store.get(a.id)!.x).toBe(0)
      expect(store.all()).toHaveLength(1)
      h.destroy()
    })

    it('edits after endGesture are a separate step even within the capture timeout', () => {
      const store = new BoardStore(new Y.Doc())
      const h = new History(store)
      const a = store.create(init())
      h.beginGesture()
      store.update(a.id, { x: 10 })
      h.endGesture()
      store.update(a.id, { x: 20 })
      store.update(a.id, { x: 30 }) // merges with x: 20 (normal capture restored)
      h.undo()
      expect(store.get(a.id)!.x).toBe(10)
      h.undo()
      expect(store.get(a.id)!.x).toBe(0)
      h.destroy()
    })
  })
})
