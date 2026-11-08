import { NodeSelection } from '@tiptap/pm/state'
import { Editor, type JSONContent } from '@tiptap/vue-3'
import { afterEach, describe, expect, it } from 'vitest'
import { blockDropKey } from '../src/extensions/block-drop'
import { createExtensions } from '../src/extensions'
import { defaultBlocks } from '../src/blocks'
import { text } from '../src/blocks/basic'

const editors: Editor[] = []
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy()
  document.body.innerHTML = ''
})

const p = (t: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })
const cell = (t: string): JSONContent => ({ type: 'tableCell', content: [p(t)] })
const DOC: JSONContent = {
  type: 'doc',
  content: [p('before'), { type: 'table', content: [{ type: 'tableRow', content: [cell('a'), cell('b')] }, { type: 'tableRow', content: [cell('c'), cell('d')] }] }, p('after')],
}

function mountEditor() {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({ element, content: DOC, extensions: createExtensions({ blocks: [text, ...defaultBlocks] }) })
  editors.push(editor)
  return editor
}
const tablePos = (e: Editor) => {
  let at = -1
  e.state.doc.forEach((n, off) => { if (n.type.name === 'table') at = off })
  return at
}
const types = (e: Editor) => e.state.doc.content.content.map(n => n.type.name)

describe('table block (drag handle, block selection)', () => {
  it('can be selected as a whole block (the drag handle and Delete use that selection)', () => {
    const editor = mountEditor()
    const pos = tablePos(editor)
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect((editor.state.selection as NodeSelection).node.type.name).toBe('table')
    // Delete removes the whole table, not just the cells' text.
    editor.view.dispatch(editor.state.tr.deleteSelection())
    expect(types(editor)).toEqual(['paragraph', 'paragraph'])
  })

  it('moves (not copies) when dragged from the handle', () => {
    const editor = mountEditor()
    const pos = tablePos(editor)
    const { view } = editor
    // What the drag handle does on dragstart: select the block, drag its slice.
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)))
    view.dragging = { slice: view.state.selection.content(), move: true }
    editor.storage.blockDrop.active = true
    const plugin = blockDropKey.get(view.state)
    expect(plugin).toBeTruthy()
    // Drop after the last paragraph: the same transaction moveBlock builds.
    const { from, to } = view.state.selection
    const slice = view.dragging.slice
    const tr = view.state.tr.delete(from, to)
    const end = tr.doc.content.size
    tr.replaceRange(end, end, slice)
    view.dispatch(tr)
    // One table, after both paragraphs (an empty paragraph may follow it: the doc always ends with one).
    expect(types(editor).filter(t => t === 'table')).toHaveLength(1)
    expect(types(editor).slice(0, 3)).toEqual(['paragraph', 'paragraph', 'table'])
  })
})
