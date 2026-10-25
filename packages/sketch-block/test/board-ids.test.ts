import { Editor, Node } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'

import { collectBoardIds, isBoardId, SketchNode } from '../src'
import { cloneBoard } from '../src/block/clone'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE } from '../src/model/types'
import { exportBoards, http, importBoards, indexeddb, memory } from '../src/providers'

const BAD = '../x?y='

const rect = () => ({
  type: 'rectangle' as const, x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false, ...DEFAULT_STYLE, label: '',
})

describe('board ids', () => {
  it('isBoardId accepts url- and key-safe ids only', () => {
    expect(isBoardId('bd_abcDEF-123')).toBe(true)
    expect(isBoardId('a'.repeat(64))).toBe(true)
    for (const bad of [BAD, '', 'a'.repeat(65), 'a b', 'a/b', 'a:b', 'é', null, undefined, 42]) {
      expect(isBoardId(bad)).toBe(false)
    }
  })

  it('parseHTML drops an invalid id; renderHTML never writes one', () => {
    const Doc = Node.create({ name: 'doc', topNode: true, content: 'block+' })
    const Paragraph = Node.create({ name: 'paragraph', group: 'block', content: 'inline*', parseHTML: () => [{ tag: 'p' }], renderHTML: () => ['p', 0] })
    const Text = Node.create({ name: 'text', group: 'inline' })
    const editor = new Editor({
      extensions: [Doc, Paragraph, Text, SketchNode.configure({ provider: memory() })],
      content: `<div data-type="sketch" data-board-id="${BAD}"></div><div data-type="sketch" data-board-id="bd_ok"></div>`,
    })
    const ids: unknown[] = []
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'sketch') ids.push(n.attrs.boardId)
    })
    expect(ids).toEqual([null, 'bd_ok'])

    // an invalid id set through JSON is not rendered into the HTML
    editor.commands.setContent({ type: 'doc', content: [{ type: 'sketch', attrs: { boardId: BAD } }] })
    expect(editor.getHTML()).not.toContain('data-board-id')
    editor.destroy()
  })

  it('collectBoardIds skips invalid ids', () => {
    const doc = { type: 'doc', content: [
      { type: 'sketch', attrs: { boardId: BAD } },
      { type: 'sketch', attrs: { boardId: 'bd_ok' } },
    ] }
    expect(collectBoardIds(doc)).toEqual(['bd_ok'])
  })

  it('every provider rejects an invalid id on connect', async () => {
    const load = vi.fn(async () => null)
    const save = vi.fn(async () => {})
    for (const p of [memory(), indexeddb(), http({ load, save, offline: false })]) {
      await expect(p.connect(BAD)).rejects.toThrow('invalid board id')
    }
    expect(load).not.toHaveBeenCalled()
    await expect(memory().clone!(BAD, 'bd_ok')).rejects.toThrow('invalid board id')
    await expect(memory().clone!('bd_ok', BAD)).rejects.toThrow('invalid board id')
  })

  it('clone rejects an invalid source or target before touching the provider', async () => {
    const connect = vi.fn(memory().connect)
    const clone = vi.fn(async () => {})
    await expect(cloneBoard({ connect }, BAD, 'bd_ok')).rejects.toThrow('invalid board id')
    await expect(cloneBoard({ connect, clone }, 'bd_ok', BAD)).rejects.toThrow('invalid board id')
    expect(connect).not.toHaveBeenCalled()
    expect(clone).not.toHaveBeenCalled()
  })

  it('import skips (and reports) an invalid id', async () => {
    const source = memory()
    const conn = await source.connect('bd_ok')
    new BoardStore(conn.doc).create(rect())
    conn.destroy()
    const json = JSON.parse(await (await exportBoards({ type: 'doc', content: [{ type: 'sketch', attrs: { boardId: 'bd_ok' } }] }, source)).text())
    // a crafted bundle: an invalid id, referenced by its document
    json.doc.content.push({ type: 'sketch', attrs: { boardId: BAD } })
    json.boards[BAD] = json.boards.bd_ok
    const target = memory()
    const connect = vi.spyOn(target, 'connect')
    const result = await importBoards(JSON.stringify(json), target)
    expect(result.imported).toEqual(['bd_ok'])
    expect(result.skipped).toEqual([BAD])
    expect(connect.mock.calls.map(c => c[0])).not.toContain(BAD)
  })
})
