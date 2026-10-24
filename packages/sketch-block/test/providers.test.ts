import { describe, expect, it } from 'vitest'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE } from '../src/model/types'
import { indexeddb, memory } from '../src/providers'

const init = () => ({
  type: 'rectangle' as const, x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false, ...DEFAULT_STYLE, label: '',
})

describe('providers', () => {
  it('indexeddb persists a board across connections', async () => {
    const p = indexeddb()
    const a = await p.connect('persist-1')
    const el = new BoardStore(a.doc).create(init())
    a.destroy()
    const b = await p.connect('persist-1')
    expect(b.existed).toBe(true)
    expect(new BoardStore(b.doc).get(el.id)?.id).toBe(el.id)
    b.destroy()
  })

  it('new board reports existed false', async () => {
    const c = await indexeddb().connect('fresh-1')
    expect(c.existed).toBe(false)
    c.destroy()
  })

  it('prefix isolates databases', async () => {
    const a = await indexeddb({ prefix: 'one' }).connect('shared')
    new BoardStore(a.doc).create(init())
    a.destroy()
    const b = await indexeddb({ prefix: 'two' }).connect('shared')
    expect(b.existed).toBe(false)
    b.destroy()
  })

  it('memory provider round-trips', async () => {
    const p = memory()
    const a = await p.connect('m')
    expect(a.existed).toBe(false)
    const el = new BoardStore(a.doc).create(init())
    a.destroy()
    const b = await p.connect('m')
    expect(b.existed).toBe(true)
    expect(new BoardStore(b.doc).get(el.id)?.id).toBe(el.id)
    b.destroy()
  })
})
