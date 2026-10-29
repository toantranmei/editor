import { Editor, EditorContent, type JSONContent } from '@tiptap/vue-3'
import { TextSelection } from '@tiptap/pm/state'
import { createExtensions, defaultBlocks, text } from '@toantranmei/editor'
import { documentToJSON, fillDocument } from '@toantranmei/editor/collaboration'
import { renderHTML } from '@toantranmei/editor/render'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import * as Y from 'yjs'
import { SYNCED_NODE, syncedBlock, syncedBlockRender, type SyncedBlockOptions } from '../src'

const editors: Editor[] = []
const wrappers: VueWrapper[] = []
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
  for (const e of editors.splice(0)) e.destroy()
  document.body.innerHTML = ''
})

/** The app side: one Y.Doc per source (cached), ids from a counter. */
function fakeApp(editable = true) {
  const docs = new Map<string, Y.Doc>()
  let n = 0
  const docFor = (id: string) => {
    if (!docs.has(id)) docs.set(id, new Y.Doc())
    return docs.get(id)!
  }
  return {
    docs,
    docFor,
    doc: vi.fn(async (id: string) => ({ doc: docFor(id), editable })),
    create: vi.fn(async () => `s${++n}`),
    originHref: (id: string) => `/notes/source/${id}`,
  }
}

const p = (t: string, id?: string): JSONContent => ({ type: 'paragraph', attrs: id ? { id } : undefined, content: t ? [{ type: 'text', text: t }] : undefined })

function setup(options: Partial<SyncedBlockOptions>, content: JSONContent, extra: { editable?: boolean } = {}) {
  const block = syncedBlock.configure({ blocks: defaultBlocks, ...options })
  const editor = new Editor({
    extensions: createExtensions({ blocks: [text, ...defaultBlocks, block], locale: 'en' }),
    content,
    editable: extra.editable ?? true,
  })
  editors.push(editor)
  const wrapper = mount({ render: () => h(EditorContent, { editor }) }, { attachTo: document.body })
  wrappers.push(wrapper)
  return { editor, wrapper }
}

const nestedEditor = (root: Element) => (root.querySelector('.me-synced-content .ProseMirror') as (HTMLElement & { editor?: Editor }) | null)?.editor

describe('syncedBlock', () => {
  it('"Synced block" moves the selected blocks into a new source', async () => {
    const app = fakeApp()
    const { editor } = setup(app, { type: 'doc', content: [p('Keep', 'a'), p('Move one', 'b'), p('Move two', 'c'), p('After', 'd')] })
    // Text selection from "Move one" into "Move two".
    let from = 0
    let to = 0
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'Move one') from = pos + 1
      if (node.isText && node.text === 'Move two') to = pos + 3
    })
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)))
    expect(editor.commands.createSyncedBlock()).toBe(true)
    await vi.waitFor(() => expect(editor.getJSON().content?.map(n => n.type)).toEqual(['paragraph', SYNCED_NODE, 'paragraph']))
    expect(editor.getJSON().content?.[1]?.attrs?.sourceId).toBe('s1')
    expect(app.create).toHaveBeenCalledOnce()
    const moved = documentToJSON(app.docFor('s1'))
    expect(moved.content?.map(n => n.content?.[0]?.text)).toEqual(['Move one', 'Move two'])
  })

  it('an empty line gives an empty source', async () => {
    const app = fakeApp()
    const { editor } = setup(app, { type: 'doc', content: [p('Hello'), p('')] })
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.createSyncedBlock()
    await vi.waitFor(() => expect(editor.getJSON().content?.[1]?.type).toBe(SYNCED_NODE))
    expect(documentToJSON(app.docFor('s1'))).toEqual({ type: 'doc', content: [{ type: 'paragraph', attrs: expect.anything() }] })
  })

  it('shows the source in a nested editor; edits show on every page using it', async () => {
    const app = fakeApp()
    const seed = new Editor({ extensions: createExtensions({ blocks: [text, ...defaultBlocks] }) })
    fillDocument(app.docFor('shared'), { type: 'doc', content: [p('Shared text')] }, seed.schema)
    seed.destroy()
    const page = { type: 'doc', content: [{ type: SYNCED_NODE, attrs: { sourceId: 'shared' } }] }
    const a = setup(app, page)
    const b = setup(app, page)
    await vi.waitFor(() => {
      expect(nestedEditor(a.wrapper.element)?.getText()).toBe('Shared text')
      expect(nestedEditor(b.wrapper.element)?.getText()).toBe('Shared text')
    })
    const ea = nestedEditor(a.wrapper.element)!
    ea.chain().setTextSelection(1).insertContent('Edited: ').run()
    await vi.waitFor(() => expect(nestedEditor(b.wrapper.element)?.getText()).toBe('Edited: Shared text'))
    // The page documents only reference the source.
    expect(a.editor.getJSON().content).toEqual([{ type: SYNCED_NODE, attrs: expect.objectContaining({ sourceId: 'shared' }) }])
  })

  it('read-only sources and pages give a read-only nested editor; missing sources show a notice', async () => {
    const app = fakeApp(false)
    const { wrapper } = setup({ ...app, doc: async id => (id === 'gone' ? null : { doc: app.docFor(id), editable: false }) }, {
      type: 'doc',
      content: [{ type: SYNCED_NODE, attrs: { sourceId: 'x' } }, { type: SYNCED_NODE, attrs: { sourceId: 'gone' } }],
    })
    await vi.waitFor(() => expect(nestedEditor(wrapper.element)).toBeTruthy())
    expect(nestedEditor(wrapper.element)!.isEditable).toBe(false)
    expect(wrapper.text()).toContain('Synced block not found or no access')
    expect(wrapper.find('.me-synced.is-readonly').exists()).toBe(true)
  })

  it('links to the original', async () => {
    const app = fakeApp()
    const { wrapper } = setup(app, { type: 'doc', content: [{ type: SYNCED_NODE, attrs: { sourceId: 'x' } }] })
    await vi.waitFor(() => expect(wrapper.find('.me-synced-origin').exists()).toBe(true))
    expect(wrapper.find('.me-synced-origin').attributes('href')).toBe('/notes/source/x')
  })

  it('slash item only with `create`', () => {
    expect(syncedBlock.items).toEqual([])
    expect(syncedBlock.configure({ create: async () => 'x' }).items.map(i => i.id)).toEqual(['syncedBlock'])
  })

  it('renders server-side from data.syncedBlocks', () => {
    const doc = { type: 'doc', content: [{ type: SYNCED_NODE, attrs: { sourceId: 's1' } }, { type: SYNCED_NODE, attrs: { sourceId: 'nope' } }] }
    const html = renderHTML(doc, { blocks: [syncedBlockRender], data: { syncedBlocks: { s1: { type: 'doc', content: [p('Inside <b>')] } } }, wrap: false })
    expect(html).toBe('<div class="me-synced" data-type="synced-block" data-source-id="s1"><div class="me-synced-content"><p>Inside &lt;b&gt;</p></div></div>')
  })
})
