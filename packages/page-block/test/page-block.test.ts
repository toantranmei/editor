import { Editor, EditorContent, type JSONContent } from '@tiptap/vue-3'
import { NodeSelection } from '@tiptap/pm/state'
import { createExtensions, text } from '@toantranmei/editor'
import { collaborationExtensions } from '@toantranmei/editor/collaboration'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, type Ref, ref } from 'vue'
import * as Y from 'yjs'
import { messages, PAGE_LINK_NODE, pageBlock, type PageBlockOptions, type PageInfo } from '../src'

const editors: Editor[] = []
const wrappers: VueWrapper[] = []
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
  for (const e of editors.splice(0)) e.destroy()
  document.body.innerHTML = ''
})

/** In-memory adapter, like the app's: one shared ref per page. */
function fakeAdapter() {
  const pages = new Map<string, Ref<PageInfo | null | undefined>>()
  const page = (id: string) => {
    if (!pages.has(id)) pages.set(id, ref<PageInfo | null | undefined>(undefined))
    return pages.get(id)!
  }
  let n = 0
  return {
    page,
    resolve: vi.fn((id: string) => page(id)),
    createPage: vi.fn(async () => {
      const id = `p${++n}`
      page(id).value = { title: '' }
      return id
    }),
    open: vi.fn(),
    href: (id: string) => `/notes/${id}`,
    search: vi.fn(async (q: string) => [
      { id: 'a', title: 'Alpha', icon: '🚀' },
      { id: 'b', title: '' },
    ].filter(p => p.title.toLowerCase().includes(q.toLowerCase()))),
  }
}

function setup(options: Partial<PageBlockOptions>, content?: JSONContent, extra: { locale?: 'vi' | 'en' | 'zh', collab?: Y.Doc } = {}) {
  const block = pageBlock.configure(options)
  const editor = new Editor({
    extensions: [
      ...createExtensions({ blocks: [text, block], locale: extra.locale ?? 'en', undoRedo: !extra.collab }),
      ...(extra.collab ? collaborationExtensions({ document: extra.collab }) : []),
    ],
    content: extra.collab ? undefined : content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
  })
  editors.push(editor)
  const wrapper = mount({ render: () => h(EditorContent, { editor }) }, { attachTo: document.body })
  wrappers.push(wrapper)
  return { editor, wrapper, block }
}

const linkDoc = (...ids: string[]): JSONContent => ({ type: 'doc', content: ids.map(pageId => ({ type: PAGE_LINK_NODE, attrs: { pageId } })) })
const links = (editor: Editor) => (editor.getJSON().content ?? []).filter(n => n.type === PAGE_LINK_NODE)

describe('schema', () => {
  it('round-trips JSON with pageLink (and gets a block id)', () => {
    const { editor } = setup({})
    editor.commands.setContent({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
        { type: PAGE_LINK_NODE, attrs: { pageId: 'abc' } },
      ],
    })
    const json = editor.getJSON()
    expect(json.content![1]).toMatchObject({ type: PAGE_LINK_NODE, attrs: { pageId: 'abc' } })
    expect(json.content![1]!.attrs!.id).toBeTruthy()

    // Loading the output again gives the same document.
    const again = setup({}, json).editor
    expect(again.getJSON()).toEqual(json)
  })

  it('round-trips HTML, with a real href', () => {
    const a = fakeAdapter()
    a.page('abc').value = { title: 'Plan' }
    const { editor } = setup(a, linkDoc('abc'))
    const html = editor.getHTML()
    expect(html).toContain('data-page-id="abc"')
    expect(html).toContain('href="/notes/abc"')
    expect(html).toContain('Plan')
    const parsed = setup(a, undefined).editor
    parsed.commands.setContent(html)
    expect(links(parsed)[0]!.attrs!.pageId).toBe('abc')
  })

  it('is a block definition with slash items and vi/en/zh strings', () => {
    const a = fakeAdapter()
    const block = pageBlock.configure(a)
    expect(block.nodes).toEqual([PAGE_LINK_NODE])
    expect(block.items.map(i => i.id)).toEqual(['page', 'linkToPage'])
    expect(block.items[0]!.keywords).toEqual(expect.arrayContaining(['page', 'trang con', '子页面']))
    expect(block.messages?.zh?.blocks?.page?.title).toBe('页面')
    expect(messages.zh.untitled).toBe('无标题')
    // Without createPage / search the items are hidden.
    expect(pageBlock.items).toEqual([])
  })
})

describe('rendering', () => {
  it('shows loading, missing, untitled and titled states from resolve', async () => {
    const a = fakeAdapter()
    const { wrapper } = setup(a, linkDoc('x'))
    await nextTick()
    const row = () => wrapper.find('.me-page-link')
    const title = () => wrapper.find('.me-page-link-title')
    expect(a.resolve).toHaveBeenCalledWith('x')

    expect(row().classes()).toContain('is-loading')
    expect(title().text()).toBe(messages.en.loading)

    a.page('x').value = null
    await nextTick()
    expect(row().classes()).toContain('is-missing')
    expect(title().text()).toBe('Page not found or no access')
    expect(wrapper.find('a').attributes('href')).toBeUndefined()

    a.page('x').value = { title: '  ' }
    await nextTick()
    expect(row().classes()).not.toContain('is-missing')
    expect(title().text()).toBe('Untitled')
    expect(title().classes()).toContain('is-muted')
    expect(wrapper.find('a').attributes('href')).toBe('/notes/x')

    a.page('x').value = { title: 'Roadmap', icon: '🗺️' }
    await nextTick()
    expect(title().text()).toBe('Roadmap')
    expect(title().classes()).not.toContain('is-muted')
    expect(wrapper.find('.me-page-link-emoji').text()).toBe('🗺️')
  })

  it('uses the editor locale', async () => {
    const a = fakeAdapter()
    a.page('x').value = { title: '' }
    const zh = setup(a, linkDoc('x'), { locale: 'zh' })
    await nextTick()
    expect(zh.wrapper.find('.me-page-link-title').text()).toBe('无标题')
    const vi = setup({ ...a, messages: { vi: { untitled: 'Trống' } } }, linkDoc('x'), { locale: 'vi' })
    await nextTick()
    expect(vi.wrapper.find('.me-page-link-title').text()).toBe('Trống')
  })

  it('click and Enter open the page; modified clicks are left to the browser', async () => {
    const a = fakeAdapter()
    a.page('x').value = { title: 'X' }
    const { editor, wrapper } = setup(a, linkDoc('x'))
    await nextTick()
    await wrapper.find('a').trigger('click')
    expect(a.open).toHaveBeenCalledWith('x', expect.any(MouseEvent))

    a.open.mockClear()
    await wrapper.find('a').trigger('click', { metaKey: true })
    expect(a.open).not.toHaveBeenCalled()

    editor.commands.setNodeSelection(0)
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    const enter = new KeyboardEvent('keydown', { key: 'Enter' })
    expect(editor.view.someProp('handleKeyDown', f => f(editor.view, enter))).toBe(true)
    expect(a.open).toHaveBeenCalledWith('x', enter)
  })
})

describe('slash items', () => {
  it('"Page" calls createPage, inserts the link on the empty line, then opens it', async () => {
    const a = fakeAdapter()
    let docAtOpen: JSONContent | null = null
    a.open.mockImplementation(() => {
      docAtOpen = editors[0]!.getJSON()
    })
    const { editor, block } = setup(a, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'intro' }] }, { type: 'paragraph' }] })
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    const item = block.items.find(i => i.id === 'page')!
    expect(item.insert(editor.chain().focus()).run()).toBe(true)
    expect(a.createPage).toHaveBeenCalledTimes(1)
    expect(a.open).not.toHaveBeenCalled()
    await flushPromises()

    const content = editor.getJSON().content!
    // (StarterKit's trailing node keeps an empty line after a last block.)
    expect(content.map(n => n.type)).toEqual(['paragraph', PAGE_LINK_NODE, 'paragraph'])
    expect(content[1]!.attrs!.pageId).toBe('p1')
    // The caret moves to the line below, so a following Enter doesn't reopen the page.
    expect(editor.state.selection).not.toBeInstanceOf(NodeSelection)
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph')
    expect(editor.state.selection.from).toBeGreaterThan(editor.state.doc.child(0).nodeSize + 1)
    expect(a.open).toHaveBeenCalledWith('p1')
    // open() runs after the link is in the document.
    expect(docAtOpen!.content!.some(n => n.type === PAGE_LINK_NODE)).toBe(true)
  })

  it('"Page" keeps its place when the document changes while createPage runs (collaboration)', async () => {
    const a = fakeAdapter()
    let release!: () => void
    a.createPage.mockImplementation(() => new Promise<string>(resolve => (release = () => resolve('late'))))
    const doc = new Y.Doc()
    const { editor, block } = setup(a, undefined, { collab: doc })
    editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }, { type: 'paragraph' }] })
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    block.items[0]!.insert(editor.chain().focus()).run()

    // A remote peer adds a block at the top meanwhile.
    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc))
    const peer = setup(a, undefined, { collab: remote }).editor
    remote.on('update', (u: Uint8Array) => Y.applyUpdate(doc, u))
    peer.commands.insertContentAt(0, { type: 'paragraph', content: [{ type: 'text', text: 'zero' }] })
    expect(editor.getText()).toContain('zero')

    release()
    await flushPromises()
    expect(editor.getJSON().content!.map(n => n.type)).toEqual(['paragraph', 'paragraph', PAGE_LINK_NODE, 'paragraph'])
    expect(a.open).toHaveBeenCalledWith('late')
  })

  it('"Page" reports createPage errors and leaves the doc alone', async () => {
    const onError = vi.fn()
    const { editor, block } = setup({ createPage: () => Promise.reject(new Error('nope')), onError })
    const before = editor.getJSON()
    block.items[0]!.insert(editor.chain().focus()).run()
    await flushPromises()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'nope' }))
    expect(editor.getJSON()).toEqual(before)
  })

  it('"Link to page" searches and inserts the picked page', async () => {
    const a = fakeAdapter()
    a.page('a').value = { title: 'Alpha', icon: '🚀' }
    const { editor, block } = setup({ ...a, searchDelay: 0 })
    block.items.find(i => i.id === 'linkToPage')!.insert(editor.chain().focus()).run()
    await flushPromises()
    const popover = () => document.querySelector('.me-page-link-popover')
    expect(popover()).toBeTruthy()
    expect(a.search).toHaveBeenCalledWith('')
    expect(document.querySelectorAll('.me-page-link-popover .me-menu-item')).toHaveLength(2)
    expect(document.querySelectorAll('.me-page-link-popover .me-menu-title')[1]!.textContent).toBe('Untitled')

    const input = popover()!.querySelector('input')!
    input.value = 'alp'
    input.dispatchEvent(new Event('input'))
    await new Promise(r => setTimeout(r, 5))
    await flushPromises()
    expect(a.search).toHaveBeenLastCalledWith('alp')
    expect(document.querySelectorAll('.me-page-link-popover .me-menu-item')).toHaveLength(1)

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()
    expect(popover()).toBeNull()
    expect(links(editor).map(n => n.attrs!.pageId)).toEqual(['a'])
    expect(a.open).not.toHaveBeenCalled()
  })
})
