import { Editor, type JSONContent } from '@tiptap/vue-3'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { collaborationExtensions } from '../src/collaboration'
import { createExtensions } from '../src/extensions'
import { defaultBlocks } from '../src/blocks'
import { text } from '../src/blocks/basic'
import { CODE_INDENT } from '../src/extensions/code-block'

const blocks = [text, ...defaultBlocks]
const editors: Editor[] = []
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy()
})

function editor(content?: JSONContent, doc?: Y.Doc) {
  const e = doc
    ? new Editor({ extensions: [...createExtensions({ blocks, undoRedo: false }), ...collaborationExtensions({ document: doc })] })
    : new Editor({ extensions: createExtensions({ blocks }), content })
  editors.push(e)
  return e
}

const code = (t: string, language: string | null = null): JSONContent => ({ type: 'codeBlock', attrs: { language }, content: t ? [{ type: 'text', text: t }] : [] })
/** Text of the first code block. */
const codeText = (e: Editor) => e.$node('codeBlock')!.textContent
const firstCode = (e: Editor) => e.getJSON().content!.find(n => n.type === 'codeBlock')!

function press(e: Editor, key: string, shift = false) {
  const event = new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true })
  return e.view.someProp('handleKeyDown', f => f(e.view, event)) ?? false
}

describe('code block language (KS-BUG-4)', () => {
  it('a code block without a language stays null after a round trip through Yjs, and opening it writes nothing', () => {
    const doc = new Y.Doc()
    editor(undefined, doc).commands.setContent({ type: 'doc', content: [code('plain'), code('const a = 1', 'typescript')] })

    const copy = new Y.Doc()
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc))
    let writes = 0
    copy.on('update', () => writes++)
    const reopened = editor(undefined, copy)
    const blocksJSON = reopened.getJSON().content!.filter(n => n.type === 'codeBlock')
    expect(blocksJSON.map(n => n.attrs!.language)).toEqual([null, 'typescript'])
    expect(writes).toBe(0)
  })

  it('parsed <pre> without a class has no language; the picker still shows plaintext', () => {
    const e = new Editor({ extensions: createExtensions({ blocks }), content: '<pre><code>x</code></pre>' })
    editors.push(e)
    expect(firstCode(e).attrs!.language).toBeNull()
  })
})

describe('Tab in a code block (KS-BUG-5)', () => {
  it('Tab inserts an indent at the cursor and is handled (focus stays)', () => {
    const e = editor({ type: 'doc', content: [code('if (x) {\n}')] })
    e.commands.setTextSelection(1 + 'if (x) {\n'.length)
    expect(press(e, 'Tab')).toBe(true)
    e.commands.insertContent('y()')
    expect(codeText(e)).toBe(`if (x) {\n${CODE_INDENT}y()}`)
  })

  it('Tab / Shift-Tab indent and outdent every selected line', () => {
    const e = editor({ type: 'doc', content: [code('a\nb\nc')] })
    e.commands.setTextSelection({ from: 1, to: 4 }) // "a\nb"
    expect(press(e, 'Tab')).toBe(true)
    expect(codeText(e)).toBe(`${CODE_INDENT}a\n${CODE_INDENT}b\nc`)
    expect(press(e, 'Tab', true)).toBe(true)
    expect(codeText(e)).toBe('a\nb\nc')
    // Nothing to outdent: still handled.
    expect(press(e, 'Tab', true)).toBe(true)
    expect(codeText(e)).toBe('a\nb\nc')
  })

  it('Shift-Tab with a cursor outdents its line; tabs count as one indent', () => {
    const e = editor({ type: 'doc', content: [code('x\n\tdeep')] })
    e.commands.setTextSelection(1 + 'x\n\tde'.length)
    expect(press(e, 'Tab', true)).toBe(true)
    expect(codeText(e)).toBe('x\ndeep')
  })

  it('Tab outside a code block is not taken', () => {
    const e = editor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'p' }] }] })
    e.commands.setTextSelection(2)
    expect(press(e, 'Tab')).toBe(false)
  })
})
