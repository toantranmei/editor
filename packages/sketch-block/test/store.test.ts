import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { BoardStore, LOCAL_ORIGIN } from '../src/model/store'
import { DEFAULT_STYLE, isRenderable } from '../src/model/types'

/** Writes a raw element map straight into the doc (as a newer client or a corrupt peer might). */
function putRaw(doc: Y.Doc, id: string, props: Record<string, unknown>): void {
  const m = new Y.Map<unknown>()
  for (const [k, v] of Object.entries(props)) m.set(k, v)
  ;(doc.getMap('elements') as Y.Map<Y.Map<unknown>>).set(id, m)
}

const init = (over: Record<string, unknown> = {}) => ({
  type: 'rectangle' as const, x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false,
  ...DEFAULT_STYLE, label: '', ...over,
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

  it('reorderMany keeps relative order in one transaction and keeps the top index current', () => {
    const doc = new Y.Doc()
    const s = new BoardStore(doc)
    const [a, b, c, d, e] = [0, 1, 2, 3, 4].map(() => s.create(init()))
    let n = 0
    doc.on('afterTransaction', () => n++)
    // ids passed out of z-order: the stored order wins
    s.reorderMany([d!.id, b!.id, 'nope'], 'front')
    expect(n).toBe(1)
    expect(s.all().map(x => x.id)).toEqual([a!.id, c!.id, e!.id, b!.id, d!.id])
    s.reorderMany([e!.id, d!.id], 'back')
    expect(n).toBe(2)
    expect(s.all().map(x => x.id)).toEqual([e!.id, d!.id, a!.id, c!.id, b!.id])
    // d was the top: the next create still lands above everything
    const f = s.create(init())
    expect(s.all().at(-1)!.id).toBe(f.id)
    // nothing to move / everything selected: no transaction
    s.reorderMany(['nope'], 'front')
    s.reorderMany(s.all().map(x => x.id), 'back')
    expect(n).toBe(3)
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

  it('unknown or malformed elements are skipped by get/all but left in Y', () => {
    const doc = new Y.Doc()
    const s = new BoardStore(doc)
    putRaw(doc, 'holo', { id: 'holo', type: 'hologram', x: 0, y: 0, w: 10, h: 10, angle: 0, index: 'zz' })
    putRaw(doc, 'nopts', { ...init(), type: 'freedraw', id: 'nopts', index: 'a1', seed: 1, version: 1 })
    putRaw(doc, 'nan', { ...init(), id: 'nan', index: 'a2', seed: 1, version: 1, x: Number.NaN })
    expect(s.all()).toEqual([])
    expect(s.get('holo')).toBeUndefined()
    expect(s.get('nopts')).toBeUndefined()
    expect(s.get('nan')).toBeUndefined()
    // createMany and the top index still work around them
    const [a, b] = s.createMany([init(), init()])
    expect(s.all().map(e => e.id)).toEqual([a!.id, b!.id])
    expect(b!.index > a!.index).toBe(true)
    s.reorderMany([a!.id], 'front')
    expect(s.all().map(e => e.id)).toEqual([b!.id, a!.id])
    // untouched in Y (forward compatible)
    const elements = doc.getMap('elements') as Y.Map<Y.Map<unknown>>
    expect(elements.get('holo')!.toJSON()).toMatchObject({ type: 'hologram', index: 'zz' })
    expect(elements.has('nopts')).toBe(true)
  })
})

describe('isRenderable', () => {
  it('requires a known type, finite numbers and points where needed', () => {
    const base = { ...init(), id: 'x', index: 'a0', seed: 1, version: 1 }
    expect(isRenderable(base)).toBe(true)
    expect(isRenderable({ ...base, type: 'hologram' })).toBe(false)
    expect(isRenderable({ ...base, type: undefined })).toBe(false)
    for (const k of ['x', 'y', 'w', 'h', 'angle']) {
      expect(isRenderable({ ...base, [k]: Number.POSITIVE_INFINITY }), k).toBe(false)
      expect(isRenderable({ ...base, [k]: '1' }), k).toBe(false)
    }
    expect(isRenderable({ ...base, index: 3 })).toBe(false)
    expect(isRenderable({ ...base, index: 'zz' })).toBe(false)
    expect(isRenderable({ ...base, index: 'a00' })).toBe(false)
    expect(isRenderable({ ...base, index: 'a0V' })).toBe(true)
    expect(isRenderable({ ...base, type: 'freedraw' })).toBe(false)
    expect(isRenderable({ ...base, type: 'freedraw', points: [[0, 0]] })).toBe(true)
    expect(isRenderable({ ...base, type: 'freedraw', points: [[0, 0]], pressures: 'x' })).toBe(false)
    expect(isRenderable({ ...base, type: 'line', points: 'nope' })).toBe(false)
    expect(isRenderable({ ...base, type: 'arrow', points: [[0, 0], [1, 1]] })).toBe(true)
    expect(isRenderable({ ...base, type: 'text' })).toBe(true)
  })
})
