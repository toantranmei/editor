import { Editor, type JSONContent } from '@tiptap/vue-3'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { collaborationExtensions } from '../src/collaboration'
import MeiEditor from '../src/components/MeiEditor.vue'
import { createExtensions } from '../src/extensions'
import { defaultBlocks, mention, toc } from '../src/blocks'
import { text } from '../src/blocks/basic'

const editors: Editor[] = []
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy()
  document.body.innerHTML = ''
})

/** Two Y.Docs that forward every update to each other, like a provider would. */
function syncedDocs() {
  const a = new Y.Doc()
  const b = new Y.Doc()
  a.on('update', (u: Uint8Array, origin: unknown) => origin !== 'remote' && Y.applyUpdate(b, u, 'remote'))
  b.on('update', (u: Uint8Array, origin: unknown) => origin !== 'remote' && Y.applyUpdate(a, u, 'remote'))
  return [a, b] as const
}

const blocks = [text, ...defaultBlocks, mention, toc]
const types = ['paragraph', ...new Set(blocks.flatMap(b => b.nodes))]

function collabEditor(doc: Y.Doc, field?: string) {
  const editor = new Editor({
    extensions: [...createExtensions({ blocks, undoRedo: false }), ...collaborationExtensions({ document: doc, field })],
  })
  editors.push(editor)
  return editor
}

const p = (t: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })

const RICH: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
    { type: 'tableOfContents' },
    p('Hello'),
    { type: 'bulletList', content: [{ type: 'listItem', content: [p('one')] }, { type: 'listItem', content: [p('two')] }] },
    { type: 'orderedList', content: [{ type: 'listItem', content: [p('first')] }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p('done')] }] },
    { type: 'blockquote', content: [p('quote')] },
    { type: 'horizontalRule' },
    { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const a = 1' }] },
    { type: 'callout', attrs: { icon: '💡', color: 'yellow' }, content: [p('note')] },
    { type: 'details', attrs: { open: true }, content: [{ type: 'detailsSummary', content: [{ type: 'text', text: 'toggle' }] }, { type: 'detailsContent', content: [p('inside')] }] },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [p('h')] }, { type: 'tableHeader', content: [p('h2')] }] }, { type: 'tableRow', content: [{ type: 'tableCell', content: [p('c')] }, { type: 'tableCell', content: [p('c2')] }] }] },
    { type: 'columns', content: [{ type: 'column', content: [p('left')] }, { type: 'column', content: [p('right')] }] },
    { type: 'paragraph', content: [{ type: 'mention', attrs: { id: 'u1', label: 'Minh', kind: 'user' } }, { type: 'text', text: ' hi' }] },
  ],
}

/** Every block id in the document, in order. */
function ids(editor: Editor): (string | null)[] {
  const out: (string | null)[] = []
  editor.state.doc.descendants((node) => {
    if (types.includes(node.type.name)) out.push(node.attrs.id ?? null)
  })
  return out
}

describe('collaboration', () => {
  it('two editors on synced Y.Docs converge, with stable block ids', () => {
    const [docA, docB] = syncedDocs()
    const a = collabEditor(docA)
    const b = collabEditor(docB)

    a.commands.setContent(RICH)
    expect(b.getJSON()).toEqual(a.getJSON())

    const idsA = ids(a)
    expect(idsA.length).toBeGreaterThan(20)
    expect(idsA.every(Boolean)).toBe(true)
    expect(new Set(idsA).size).toBe(idsA.length)
    expect(ids(b)).toEqual(idsA)

    // Edits on both sides keep existing ids and give new blocks ids, everywhere.
    b.chain().setTextSelection(b.state.doc.content.size - 1).insertContent(' from b').run()
    a.chain().focus('start').insertContent('A: ').run()
    a.commands.insertContentAt(a.state.doc.content.size, p('appended'))
    expect(b.getJSON()).toEqual(a.getJSON())
    const after = ids(a)
    expect(after.slice(0, idsA.length)).toEqual(idsA)
    expect(after.length).toBe(idsA.length + 1)
    expect(after.every(Boolean)).toBe(true)
    expect(ids(b)).toEqual(after)
  })

  it('a late joiner gets the content and the same ids', () => {
    const docA = new Y.Doc()
    const a = collabEditor(docA)
    a.commands.setContent(RICH)
    const docC = new Y.Doc()
    Y.applyUpdate(docC, Y.encodeStateAsUpdate(docA))
    const c = collabEditor(docC)
    expect(c.getJSON()).toEqual(a.getJSON())
    expect(ids(c)).toEqual(ids(a))
  })

  it('uses the given field', () => {
    const doc = new Y.Doc()
    const a = collabEditor(doc, 'body')
    a.commands.setContent({ type: 'doc', content: [p('in body')] })
    expect(doc.getXmlFragment('body').length).toBe(1)
    expect(doc.getXmlFragment('default').length).toBe(0)
  })

  it('undo / redo with Mod-z and Mod-Shift-z (Yjs undo, no built-in history)', () => {
    const a = collabEditor(new Y.Doc())
    expect(a.extensionManager.extensions.some(e => e.name === 'undoRedo')).toBe(false)
    a.commands.insertContent('hello')
    expect(a.getText()).toContain('hello')

    const mac = /Mac|iP(hone|[oa]d)/.test(navigator.platform)
    const press = (key: string, shift = false) => {
      const event = new KeyboardEvent('keydown', { key, shiftKey: shift, metaKey: mac, ctrlKey: !mac, bubbles: true })
      return a.view.someProp('handleKeyDown', f => f(a.view, event))
    }
    expect(press('z')).toBe(true)
    expect(a.getText()).not.toContain('hello')
    expect(press('z', true)).toBe(true)
    expect(a.getText()).toContain('hello')
  })
})

describe('<MeiEditor :collaboration>', () => {
  // Regression: menus register plugins after creation; the Yjs binding lost its node mapping
  // and reverted the first local edit.
  it('keeps the first edit after mount (plugins registered by menus)', async () => {
    const doc = new Y.Doc()
    const wrapper = mount(MeiEditor, { props: { collaboration: { document: doc }, outline: false }, attachTo: document.body })
    await vi.waitFor(() => expect(wrapper.emitted('ready')).toBeTruthy())
    await new Promise(r => setTimeout(r, 20))
    const editor = (wrapper.vm as unknown as { editor: Editor }).editor
    editor.commands.insertContent('hello')
    expect(editor.getText()).toBe('hello')
    expect(doc.getXmlFragment('default').toString()).toContain('hello')
    editor.chain().setTextSelection(1).insertContent('X').run()
    expect(doc.getXmlFragment('default').toString()).toContain('Xhello')
    wrapper.unmount()
  })

  it('never loads modelValue, emits change instead of update:modelValue', async () => {
    const doc = new Y.Doc()
    // Content already in the Y.Doc wins over modelValue.
    const seed = collabEditor(doc)
    seed.commands.setContent({ type: 'doc', content: [p('from yjs')] })

    const getJSON = vi.spyOn(Editor.prototype, 'getJSON')
    const wrapper = mount(MeiEditor, {
      props: { collaboration: { document: doc }, modelValue: { type: 'doc', content: [p('from v-model')] }, outline: false },
      attachTo: document.body,
    })
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.emitted('ready')).toBeTruthy())
    const editor = (wrapper.vm as unknown as { editor: Editor }).editor
    expect(editor.getText()).toBe('from yjs')
    getJSON.mockClear()

    editor.commands.insertContent('!')
    seed.commands.insertContentAt(1, '>')
    expect(wrapper.emitted('change')!.length).toBeGreaterThanOrEqual(2)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(getJSON).not.toHaveBeenCalled()

    // A new modelValue is ignored too.
    await wrapper.setProps({ modelValue: { type: 'doc', content: [p('other')] } })
    expect(editor.getText()).toContain('from yjs')
    getJSON.mockRestore()
    wrapper.unmount()
  })

  it('without collaboration, keeps v-model and also emits change', async () => {
    const wrapper = mount(MeiEditor, { props: { modelValue: { type: 'doc', content: [p('hi')] }, outline: false }, attachTo: document.body })
    await vi.waitFor(() => expect(wrapper.emitted('ready')).toBeTruthy())
    const editor = (wrapper.vm as unknown as { editor: Editor }).editor
    expect(editor.getText()).toBe('hi')
    editor.commands.insertContent('!')
    const updates = wrapper.emitted<[JSONContent]>('update:modelValue')!
    expect(updates.length).toBeGreaterThan(0)
    expect(updates.at(-1)![0]).toMatchObject({ content: [{ type: 'paragraph', content: [{ text: 'hi!' }] }] })
    expect(wrapper.emitted('change')).toHaveLength(updates.length)
    wrapper.unmount()
  })
})
