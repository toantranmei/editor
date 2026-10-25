import type { JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { collectBoardIds as collectFromMain } from '../src'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE } from '../src/model/types'
import {
  BUNDLE_TYPE, collectBoardIds, exportBoards, importBoards, MAX_BUNDLE_BYTES, memory, type SketchProvider,
} from '../src/providers'
import { fromBase64, toBase64 } from '../src/providers/bundle'

const rect = (x = 0) => ({
  type: 'rectangle' as const, x, y: 0, w: 100, h: 50, angle: 0, locked: false, ...DEFAULT_STYLE, label: '',
})

const sketch = (boardId: string | null): JSONContent => ({ type: 'sketch', attrs: { boardId, preview: null, height: null, version: 1 } })

/** Writes `n` rectangles to board `id`; returns their element ids. */
async function seed(provider: SketchProvider, id: string, n: number, x = 0): Promise<string[]> {
  const conn = await provider.connect(id)
  const store = new BoardStore(conn.doc)
  const ids = Array.from({ length: n }, (_, i) => store.create(rect(x + i * 10)).id)
  conn.destroy()
  return ids
}

async function elementIds(provider: SketchProvider, id: string): Promise<string[]> {
  const conn = await provider.connect(id)
  const ids = [...conn.doc.getMap('elements').keys()].sort()
  conn.destroy()
  return ids
}

const parse = async (blob: Blob) => JSON.parse(await blob.text())

describe('board bundles', () => {
  it('collectBoardIds nested', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        sketch('bd_a'),
        { type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
        {
          type: 'columns',
          content: [
            { type: 'column', content: [sketch('bd_b'), { type: 'callout', content: [sketch('bd_c')] }] },
            { type: 'column', content: [sketch('bd_a'), sketch(null), sketch('')] },
          ],
        },
        { type: 'toggle', content: [sketch('bd_d')] },
        // not a sketch: ignored even with a boardId attr
        { type: 'image', attrs: { boardId: 'bd_nope' } },
      ],
    }
    expect(collectBoardIds(doc)).toEqual(['bd_a', 'bd_b', 'bd_c', 'bd_d'])
    expect(collectFromMain).toBe(collectBoardIds)
    expect(collectBoardIds({ type: 'doc' })).toEqual([])
  })

  it('export→import round trip into a fresh memory provider', async () => {
    const source = memory()
    const a = await seed(source, 'bd_a', 2)
    const b = await seed(source, 'bd_b', 1)
    const doc: JSONContent = { type: 'doc', content: [sketch('bd_a'), { type: 'column', content: [sketch('bd_b')] }, sketch('bd_gone')] }

    const blob = await exportBoards(doc, source)
    expect(blob.type).toBe('application/json')
    const json = await parse(blob)
    expect(json).toMatchObject({ type: BUNDLE_TYPE, version: 1, doc, missing: ['bd_gone'] })
    expect(Object.keys(json.boards).sort()).toEqual(['bd_a', 'bd_b'])
    expect(typeof json.boards.bd_a).toBe('string')

    const target = memory()
    const result = await importBoards(blob, target)
    expect(result.doc).toEqual(doc)
    expect(result.imported.sort()).toEqual(['bd_a', 'bd_b'])
    expect(result.skipped).toEqual([])
    expect(await elementIds(target, 'bd_a')).toEqual([...a].sort())
    expect(await elementIds(target, 'bd_b')).toEqual(b)

    // a string works too
    const again = await importBoards(await blob.text(), memory())
    expect(again.imported.sort()).toEqual(['bd_a', 'bd_b'])
  })

  it('base64 of a large array does not overflow the stack', () => {
    const big = new Uint8Array(3 * 1024 * 1024 + 7)
    for (let i = 0; i < big.length; i++) big[i] = (i * 31) & 0xff
    const b64 = toBase64(big)
    expect(b64.length).toBe(Math.ceil(big.length / 3) * 4)
    const back = fromBase64(b64)!
    expect(back.length).toBe(big.length)
    let same = true
    for (let i = 0; i < big.length; i++) if (back[i] !== big[i]) same = false
    expect(same).toBe(true)
    expect(fromBase64(toBase64(new Uint8Array([1, 2, 3, 250])))).toEqual(new Uint8Array([1, 2, 3, 250]))
    expect(fromBase64('not base64!')).toBeNull()
  })

  it('rejects wrong type/version and > 50 MB', async () => {
    const provider = memory()
    const ok = { type: BUNDLE_TYPE, version: 1, doc: { type: 'doc' }, boards: {} }
    await expect(importBoards(JSON.stringify({ ...ok, type: 'other' }), provider)).rejects.toThrow(/type/)
    await expect(importBoards(JSON.stringify({ ...ok, version: 2 }), provider)).rejects.toThrow(/version/)
    await expect(importBoards('{not json', provider)).rejects.toThrow()
    await expect(importBoards(JSON.stringify({ ...ok, doc: null }), provider)).rejects.toThrow()
    expect(MAX_BUNDLE_BYTES).toBe(50 * 1024 * 1024)
    const huge = new Blob([new Uint8Array(MAX_BUNDLE_BYTES + 1)])
    await expect(importBoards(huge, provider)).rejects.toThrow(/50 MB/)
    // a string is measured in UTF-8 bytes
    const wide = 'é'.repeat(MAX_BUNDLE_BYTES / 2 + 1)
    await expect(importBoards(wide, provider)).rejects.toThrow(/50 MB/)
    expect(await importBoards(JSON.stringify(ok), provider)).toEqual({ doc: { type: 'doc' }, imported: [], skipped: [] })
  })

  it('malformed base64 board skipped', async () => {
    const source = memory()
    await seed(source, 'bd_good', 1)
    const json = await parse(await exportBoards({ type: 'doc', content: [sketch('bd_good')] }, source))
    json.boards.bd_bad = '%%% not base64 %%%'
    json.boards.bd_junk = btoa('definitely not a yjs update')
    json.boards.bd_num = 42
    const target = memory()
    const result = await importBoards(JSON.stringify(json), target)
    expect(result.imported).toEqual(['bd_good'])
    expect(result.skipped.sort()).toEqual(['bd_bad', 'bd_junk', 'bd_num'])
    expect(await elementIds(target, 'bd_good')).toHaveLength(1)
    // nothing half-written for a skipped board
    expect(await elementIds(target, 'bd_junk')).toEqual([])
  })

  it('import does not overwrite existing board state but merges', async () => {
    const source = memory()
    const exported = await seed(source, 'bd_x', 2)
    const blob = await exportBoards({ type: 'doc', content: [sketch('bd_x')] }, source)

    const target = memory()
    const local = await seed(target, 'bd_x', 1, 500)
    const result = await importBoards(blob, target)
    expect(result.imported).toEqual(['bd_x'])
    expect(await elementIds(target, 'bd_x')).toEqual([...exported, ...local].sort())

    // importing twice is idempotent (Yjs updates merge)
    await importBoards(blob, target)
    expect(await elementIds(target, 'bd_x')).toHaveLength(3)
    const conn = await target.connect('bd_x')
    expect(Y.encodeStateAsUpdate(conn.doc).length).toBeGreaterThan(0)
    conn.destroy()
  })
})
