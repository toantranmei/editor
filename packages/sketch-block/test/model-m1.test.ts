import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { BoardStore } from '../src/model/store'
import {
  DEFAULT_STYLE,
  type ElementInit,
  isFreedraw,
  isLinear,
  isShape,
  isText,
  normalizeElement,
} from '../src/model/types'

const rect = (over: Record<string, unknown> = {}): ElementInit => ({
  type: 'rectangle', x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false,
  ...DEFAULT_STYLE, label: '', ...over,
} as ElementInit)

const M0_RECT = {
  id: 'm0rect0001', type: 'rectangle', x: 10, y: 20, w: 100, h: 50, angle: 0.5, index: 'a0',
  stroke: '#e03131', fill: '#a5d8ff', fillStyle: 'solid', strokeWidth: 4, strokeStyle: 'dashed',
  roughness: 2, roundness: 'sharp', opacity: 0.5, seed: 42, version: 3, locked: true,
}

describe('normalizeElement', () => {
  it('normalizes M0 elements with defaults', () => {
    const el = normalizeElement({ ...M0_RECT })
    expect(el).toMatchObject(M0_RECT)
    expect(isShape(el)).toBe(true)
    if (!isShape(el)) throw new Error('not a shape')
    expect(el.label).toBe('')
    expect(el.fontFamily).toBe('hand')
    expect(el.fontSize).toBe(20)
    expect(el.textAlign).toBe('center')
  })

  it('normalizes M0 elements stored in a Y.Doc via the store', () => {
    const doc = new Y.Doc()
    const m = new Y.Map<unknown>()
    for (const [k, v] of Object.entries(M0_RECT)) m.set(k, v)
    ;(doc.getMap('elements') as Y.Map<Y.Map<unknown>>).set(M0_RECT.id, m)
    const s = new BoardStore(doc)
    const el = s.get(M0_RECT.id)!
    expect(el).toMatchObject({ ...M0_RECT, label: '', fontFamily: 'hand', fontSize: 20, textAlign: 'center' })
    expect(s.all()[0]).toEqual(el)
  })

  it('normalizes arrow defaults', () => {
    const el = normalizeElement({ id: 'a', type: 'arrow', x: 0, y: 0, w: 10, h: 0, index: 'a0', points: [[0, 0], [10, 0]] })
    expect(isLinear(el)).toBe(true)
    if (!isLinear(el)) throw new Error('not linear')
    expect(el.endArrowhead).toBe('arrow')
    expect(el.startArrowhead).toBe('none')
    expect(el.routing).toBe('straight')
    expect(el.points).toEqual([[0, 0], [10, 0]])
    expect(el.stroke).toBe(DEFAULT_STYLE.stroke)
  })

  it('normalizes line, freedraw and text defaults', () => {
    const line = normalizeElement({ id: 'l', type: 'line', index: 'a0' })
    expect(isLinear(line) && line.endArrowhead).toBe('none')
    const fd = normalizeElement({ id: 'f', type: 'freedraw', index: 'a1' })
    expect(isFreedraw(fd)).toBe(true)
    if (!isFreedraw(fd)) throw new Error('not freedraw')
    expect(fd.pressures).toEqual([])
    expect(fd.highlighter).toBe(false)
    const tx = normalizeElement({ id: 't', type: 'text', index: 'a2' })
    expect(isText(tx)).toBe(true)
    if (!isText(tx)) throw new Error('not text')
    expect(tx.text).toBe('')
    expect(tx.autoSize).toBe(true)
    expect(tx.fontSize).toBe(20)
  })
})

describe('BoardStore M1', () => {
  it('create uses the given seed', () => {
    const s = new BoardStore(new Y.Doc())
    const a = s.create({ ...rect(), seed: 1234 })
    expect(a.seed).toBe(1234)
    expect(s.get(a.id)!.seed).toBe(1234)
  })

  it('createMany creates in one transaction with ascending indices above existing', () => {
    const doc = new Y.Doc()
    const s = new BoardStore(doc)
    const first = s.create(rect())
    let n = 0
    doc.on('afterTransaction', () => n++)
    const made = s.createMany([rect(), rect({ seed: 7 }), rect()])
    expect(n).toBe(1)
    expect(made).toHaveLength(3)
    expect(made[1]!.seed).toBe(7)
    expect(s.all().map(e => e.id)).toEqual([first.id, ...made.map(e => e.id)])
    expect(made[0]!.index > first.index).toBe(true)
    expect(made[1]!.index > made[0]!.index).toBe(true)
    expect(made[2]!.index > made[1]!.index).toBe(true)
  })

  it('create does not call all()', () => {
    const s = new BoardStore(new Y.Doc())
    s.create(rect())
    const spy = vi.spyOn(s, 'all')
    s.create(rect())
    s.createMany([rect(), rect()])
    expect(spy).not.toHaveBeenCalled()
  })

  it('top index stays correct after a remote create', () => {
    const d1 = new Y.Doc()
    const d2 = new Y.Doc()
    d1.on('update', u => Y.applyUpdate(d2, u))
    d2.on('update', u => Y.applyUpdate(d1, u))
    const s1 = new BoardStore(d1)
    const s2 = new BoardStore(d2)
    s1.create(rect())
    const remote = s2.create(rect())
    const remoteTop = s2.create(rect())
    expect(remote.index < remoteTop.index).toBe(true)
    const local = s1.create(rect())
    expect(local.index > remoteTop.index).toBe(true)
    expect(s1.all().at(-1)!.id).toBe(local.id)
  })

  it('top index stays correct after a remote reorder', () => {
    const d1 = new Y.Doc()
    const d2 = new Y.Doc()
    d1.on('update', u => Y.applyUpdate(d2, u))
    d2.on('update', u => Y.applyUpdate(d1, u))
    const s1 = new BoardStore(d1)
    const s2 = new BoardStore(d2)
    const a = s1.create(rect())
    s1.create(rect())
    s2.reorder(a.id, 'front')
    const c = s1.create(rect())
    expect(s1.all().map(e => e.id).at(-1)).toBe(c.id)
    expect(c.index > s1.get(a.id)!.index).toBe(true)
  })

  it('top index stays correct after a local reorder', () => {
    const s = new BoardStore(new Y.Doc())
    const a = s.create(rect())
    s.create(rect())
    s.reorder(a.id, 'front')
    const c = s.create(rect())
    expect(s.all().at(-1)!.id).toBe(c.id)
  })
})
