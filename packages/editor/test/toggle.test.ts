import { Editor, type JSONContent } from '@tiptap/vue-3'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { collaborationExtensions } from '../src/collaboration'
import { createExtensions } from '../src/extensions'
import { defaultBlocks } from '../src/blocks'
import { text } from '../src/blocks/basic'

const editors: Editor[] = []
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy()
  document.body.innerHTML = ''
})

const blocks = [text, ...defaultBlocks]
const p = (t: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })
const toggle = (summary: string, open: boolean, ...content: JSONContent[]): JSONContent => ({
  type: 'details',
  attrs: { open },
  content: [{ type: 'detailsSummary', content: [{ type: 'text', text: summary }] }, { type: 'detailsContent', content }],
})
/** An open toggle inside an open toggle, plus a closed one inside it. */
const NESTED: JSONContent = {
  type: 'doc',
  content: [toggle('outer', true, p('a'), toggle('inner', true, p('b'), toggle('closed', false, p('c'))))],
}

/** Lets the node views' deferred (setTimeout) work run. */
const settle = () => new Promise(r => setTimeout(r, 10))

function mountEditor(opts: { content?: JSONContent, ydoc?: Y.Doc } = {}) {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({
    element,
    content: opts.content,
    extensions: [...createExtensions({ blocks, undoRedo: !opts.ydoc }), ...(opts.ydoc ? collaborationExtensions({ document: opts.ydoc }) : [])],
  })
  editors.push(editor)
  return editor
}

const toggles = (editor: Editor) => [...editor.view.dom.querySelectorAll<HTMLElement>('[data-type="details"]')]
/** What the user sees for each toggle: open class, content visibility and aria state. */
const shown = (editor: Editor) => toggles(editor).map(el => ({
  open: el.classList.contains('is-open'),
  contentHidden: el.querySelector(':scope > div > [data-type="detailsContent"]')!.hasAttribute('hidden'),
}))
const attrs = (editor: Editor) => {
  const out: boolean[] = []
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'details') out.push(n.attrs.open)
  })
  return out
}
const OPEN = { open: true, contentHidden: false }
const CLOSED = { open: false, contentHidden: true }

/** Types into the innermost open toggle's paragraph, before the deferred open has run. */
function typeInInner(editor: Editor) {
  let pos = -1
  editor.state.doc.descendants((n, at) => {
    if (n.isText && n.text === 'b') pos = at + 1
  })
  editor.chain().setTextSelection(pos).insertContent('x').run()
}

describe('toggle (details) open state', () => {
  it('nested open toggles render open when re-created from saved JSON', async () => {
    const editor = mountEditor({ content: NESTED })
    await settle()
    expect(shown(editor)).toEqual([OPEN, OPEN, CLOSED])
  })

  it('nested open toggles stay open when a transaction touches them right after render', async () => {
    const saved = mountEditor({ content: NESTED }).getJSON()
    const editor = mountEditor({ content: saved })
    typeInInner(editor) // update() runs on both open toggles before the deferred open
    await settle()
    expect(attrs(editor)).toEqual([true, true, false])
    expect(shown(editor)).toEqual([OPEN, OPEN, CLOSED])
  })

  it('nested open toggles stay open when re-created from a saved Yjs document', async () => {
    const source = new Y.Doc()
    mountEditor({ ydoc: source }).commands.setContent(NESTED)
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(source))
    const editor = mountEditor({ ydoc })
    typeInInner(editor)
    await settle()
    expect(attrs(editor)).toEqual([true, true, false])
    expect(shown(editor)).toEqual([OPEN, OPEN, CLOSED])
  })

  it('an attribute change before the deferred open still wins', async () => {
    const editor = mountEditor({ content: NESTED })
    editor.commands.command(({ tr }) => {
      tr.setNodeMarkup(0, undefined, { ...tr.doc.nodeAt(0)!.attrs, open: false })
      return true
    })
    await settle()
    expect(shown(editor)).toEqual([CLOSED, OPEN, CLOSED])
  })

  it('clicking the button still toggles and persists the attribute', async () => {
    const editor = mountEditor({ content: NESTED })
    await settle()
    const button = () => toggles(editor)[1]!.querySelector<HTMLButtonElement>(':scope > button')!

    button().click()
    expect(attrs(editor)).toEqual([true, false, false])
    expect(shown(editor)).toEqual([OPEN, CLOSED, CLOSED])

    button().click()
    expect(attrs(editor)).toEqual([true, true, false])
    expect(shown(editor)).toEqual([OPEN, OPEN, CLOSED])

    toggles(editor)[2]!.querySelector<HTMLButtonElement>(':scope > button')!.click()
    expect(attrs(editor)).toEqual([true, true, true])
    expect(shown(editor)).toEqual([OPEN, OPEN, OPEN])
  })
})
