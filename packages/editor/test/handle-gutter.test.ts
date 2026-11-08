import { Editor } from '@tiptap/vue-3'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions } from '../src/extensions'
import { HandleGutter } from '../src/extensions/handle-gutter'
import { defaultBlocks } from '../src/blocks'
import { text } from '../src/blocks/basic'

const editors: Editor[] = []
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy()
  document.body.innerHTML = ''
})

const rect = (left: number, top: number, width: number, height: number) => () => new DOMRect(left, top, width, height)

// A tall block (a table) at x 100–700, y 100–300; the handle by its first line at x 40–100, y 100–124.
function setup(locked = false) {
  const element = document.createElement('div')
  document.body.append(element)
  const block = document.createElement('div')
  block.getBoundingClientRect = rect(100, 100, 600, 200)
  document.body.append(block)
  const handle = document.createElement('div')
  handle.getBoundingClientRect = rect(40, 100, 60, 24)
  document.body.append(handle)
  const editor = new Editor({
    element,
    content: '<p>x</p>',
    extensions: [
      ...createExtensions({ blocks: [text, ...defaultBlocks] }),
      HandleGutter.configure({ block: () => block, handle: () => handle, locked: () => locked }),
    ],
  })
  editors.push(editor)
  const hides: number[] = []
  editor.on('transaction', ({ transaction }) => {
    if (transaction.getMeta('hideDragHandle')) hides.push(1)
  })
  const leave = (x: number, y: number) => editor.view.dom.dispatchEvent(new MouseEvent('mouseleave', { clientX: x, clientY: y, relatedTarget: document.body }))
  const move = (x: number, y: number) => document.body.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }))
  return { editor, handle, hides, leave, move }
}

describe('block handle on tall blocks (Notion)', () => {
  it('stays while the pointer moves left from a lower line toward it', () => {
    const { hides, leave, move } = setup()
    leave(99, 280) // last row of the table, into the left gutter
    move(80, 270)
    move(60, 140)
    expect(hides).toHaveLength(0)
  })

  it('hides once the pointer leaves the block band', () => {
    const { hides, leave, move } = setup()
    leave(99, 280)
    move(20, 280) // past the handle
    expect(hides).toHaveLength(1)
    move(10, 280) // watcher is gone: no repeat
    expect(hides).toHaveLength(1)
  })

  it('leaving below the block is left to the drag handle plugin', () => {
    const { hides, leave, move } = setup()
    leave(99, 320)
    move(20, 320)
    expect(hides).toHaveLength(0) // not watched; the drag handle plugin's own mouseleave hides it
  })

  it('does nothing while a block menu pins the handle', () => {
    const { hides, leave, move } = setup(true)
    leave(99, 280)
    move(20, 280)
    expect(hides).toHaveLength(0)
  })
})
