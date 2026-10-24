import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

vi.mock('../src/geometry/hit', async (orig) => {
  const real = await orig<typeof import('../src/geometry/hit')>()
  return { ...real, hitElement: vi.fn(real.hitElement) }
})

import { hitElement } from '../src/geometry/hit'
import { BoardStore } from '../src/model/store'
import { Scene } from '../src/model/scene'
import { DEFAULT_STYLE } from '../src/model/types'

const init = (over: Record<string, unknown> = {}) => ({
  type: 'rectangle' as const, x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false,
  ...DEFAULT_STYLE, label: '', ...over,
})

describe('Scene', () => {
  it('queryBox returns only intersecting elements in z-order', () => {
    const store = new BoardStore(new Y.Doc())
    const a = store.create(init({ x: 0, y: 0 }))
    const far = store.create(init({ x: 1000, y: 1000 }))
    const b = store.create(init({ x: 50, y: 10 }))
    const scene = new Scene(store)
    const ids = scene.queryBox({ minX: 40, minY: 0, maxX: 60, maxY: 20 }).map(e => e.id)
    expect(ids).toEqual([a.id, b.id])
    expect(ids).not.toContain(far.id)
  })

  it('hitTest returns topmost', () => {
    const store = new BoardStore(new Y.Doc())
    store.create(init({ fill: '#f00', fillStyle: 'solid' }))
    const top = store.create(init({ fill: '#0f0', fillStyle: 'solid' }))
    const scene = new Scene(store)
    expect(scene.hitTest({ x: 50, y: 25 }, 2)?.id).toBe(top.id)
    expect(scene.hitTest({ x: 500, y: 500 }, 2)).toBeUndefined()
  })

  it('unchanged elements keep identity after another element updates', () => {
    const store = new BoardStore(new Y.Doc())
    const a = store.create(init())
    const b = store.create(init({ x: 300 }))
    const scene = new Scene(store)
    const before = scene.elements
    const aObj = scene.get(a.id)
    const bObj = scene.get(b.id)
    store.update(b.id, { x: 400 })
    expect(scene.get(a.id)).toBe(aObj)
    expect(scene.get(b.id)).not.toBe(bObj)
    expect(scene.get(b.id)!.x).toBe(400)
    expect(scene.elements).not.toBe(before)
    expect(scene.elements[0]).toBe(aObj)
  })

  it('remote change updates index', () => {
    const d1 = new Y.Doc()
    const d2 = new Y.Doc()
    const s1 = new BoardStore(d1)
    const s2 = new BoardStore(d2)
    const a = s1.create(init())
    const b = s1.create(init({ x: 200 }))
    Y.applyUpdate(d2, Y.encodeStateAsUpdate(d1))
    const scene = new Scene(s2)
    expect(scene.elements.map(e => e.id)).toEqual([a.id, b.id])
    const cb = vi.fn()
    scene.onChange(cb)
    d2.on('update', u => Y.applyUpdate(d1, u))
    d1.on('update', u => Y.applyUpdate(d2, u))
    s1.reorder(a.id, 'front')
    expect(scene.elements.map(e => e.id)).toEqual([b.id, a.id])
    expect(cb).toHaveBeenCalledWith(new Set([a.id]))
    s1.update(b.id, { x: 999 })
    expect(scene.queryBox({ minX: 990, minY: 0, maxX: 1010, maxY: 10 }).map(e => e.id)).toEqual([b.id])
    expect(scene.queryBox({ minX: 200, minY: 0, maxX: 210, maxY: 10 })).toEqual([])
    s1.remove([a.id])
    expect(scene.elements.map(e => e.id)).toEqual([b.id])
    expect(scene.get(a.id)).toBeUndefined()
  })

  it('contentBounds unions elements; null when empty', () => {
    const store = new BoardStore(new Y.Doc())
    const scene = new Scene(store)
    expect(scene.contentBounds()).toBeNull()
    store.create(init({ x: 0, y: 0 }))
    store.create(init({ x: 200, y: 100 }))
    expect(scene.contentBounds()).toEqual({ minX: -1, minY: -1, maxX: 301, maxY: 151 })
  })

  it('1000 elements: hitTest of a small box touches far fewer than all', () => {
    const store = new BoardStore(new Y.Doc())
    store.doc.transact(() => {
      for (let i = 0; i < 1000; i++) store.create(init({ x: (i % 40) * 150, y: Math.floor(i / 40) * 100, w: 100, h: 50 }))
    })
    const scene = new Scene(store)
    expect(scene.elements).toHaveLength(1000)
    const spy = vi.mocked(hitElement)
    spy.mockClear()
    scene.hitTest({ x: 50, y: 25 }, 2)
    expect(spy).toHaveBeenCalled()
    expect(spy.mock.calls.length).toBeLessThanOrEqual(50)
  })
})
