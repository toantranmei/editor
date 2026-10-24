import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { BoardStore, LOCAL_ORIGIN } from '../src/model/store'
import { DEFAULT_STYLE } from '../src/model/types'

const init = (over: Record<string, unknown> = {}) => ({
  type: 'rectangle' as const, x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false,
  ...DEFAULT_STYLE, ...over,
})

describe('BoardStore', () => {
  it('create assigns id, seed, version 1 and an index above existing elements', () => {
    const s = new BoardStore(new Y.Doc())
    const a = s.create(init())
    const b = s.create(init())
    expect(a.id).toHaveLength(10)
    expect(a.version).toBe(1)
    expect(typeof a.seed).toBe('number')
    expect(s.all().map(e => e.id)).toEqual([a.id, b.id])
    expect(b.index > a.index).toBe(true)
  })

  it('update merges patch and bumps version', () => {
    const s = new BoardStore(new Y.Doc())
    const a = s.create(init())
    s.update(a.id, { x: 10 })
    const got = s.get(a.id)!
    expect(got.x).toBe(10)
    expect(got.version).toBe(2)
    expect(got.w).toBe(100)
    s.update('missing', { x: 1 })
  })

  it('updateMany writes in one transaction', () => {
    const doc = new Y.Doc()
    const s = new BoardStore(doc)
    const a = s.create(init())
    const b = s.create(init())
    let n = 0
    doc.on('afterTransaction', () => n++)
    s.updateMany({ [a.id]: { x: 1 }, [b.id]: { x: 2 } })
    expect(n).toBe(1)
    expect(s.get(b.id)!.x).toBe(2)
  })

  it('remove deletes elements', () => {
    const s = new BoardStore(new Y.Doc())
    const a = s.create(init())
    const b = s.create(init())
    s.remove([a.id, 'nope'])
    expect(s.all().map(e => e.id)).toEqual([b.id])
    expect(s.get(a.id)).toBeUndefined()
  })

  it('reorder front/back changes index order', () => {
    const s = new BoardStore(new Y.Doc())
    const a = s.create(init())
    const b = s.create(init())
    const c = s.create(init())
    s.reorder(a.id, 'front')
    expect(s.all().map(e => e.id)).toEqual([b.id, c.id, a.id])
    s.reorder(c.id, 'back')
    expect(s.all().map(e => e.id)).toEqual([c.id, b.id, a.id])
    const before = s.get(a.id)!.index
    s.reorder(a.id, 'front')
    expect(s.get(a.id)!.index).toBe(before)
  })

  it('onChange reports only changed ids, including remote updates', () => {
    const d1 = new Y.Doc()
    const d2 = new Y.Doc()
    const s1 = new BoardStore(d1)
    const s2 = new BoardStore(d2)
    d1.on('update', u => Y.applyUpdate(d2, u))
    const a = s1.create(init())
    const b = s1.create(init())
    const seen: Set<string>[] = []
    const off = s2.onChange(ids => seen.push(ids))
    s1.update(a.id, { x: 5 })
    expect(seen).toHaveLength(1)
    expect([...seen[0]!]).toEqual([a.id])
    expect(s2.get(a.id)!.x).toBe(5)
    s1.remove([b.id])
    expect([...seen[1]!]).toEqual([b.id])
    off()
    s1.update(a.id, { x: 6 })
    expect(seen).toHaveLength(2)
  })

  it('writes use LOCAL_ORIGIN', () => {
    const doc = new Y.Doc()
    const s = new BoardStore(doc)
    const origins: unknown[] = []
    doc.on('afterTransaction', t => origins.push(t.origin))
    const a = s.create(init())
    s.update(a.id, { x: 1 })
    s.reorder(a.id, 'back')
    s.remove([a.id])
    expect(origins.length).toBeGreaterThan(0)
    expect(origins.every(o => o === LOCAL_ORIGIN)).toBe(true)
  })
})
