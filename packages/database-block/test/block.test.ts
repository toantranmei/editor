import { Editor, EditorContent, type JSONContent } from '@tiptap/vue-3'
import { createExtensions, text } from '@toantranmei/editor'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import { DATABASE_NODE, databaseBlock, type DatabaseBlockOptions, messages } from '../src'
import { createMemorySource, sampleDatabase } from '../src/memory-source'

const editors: Editor[] = []
const wrappers: VueWrapper[] = []
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
  for (const e of editors.splice(0)) e.destroy()
  document.body.innerHTML = ''
})
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await flushPromises()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
  }
}

function setup(options: Partial<DatabaseBlockOptions>, content?: JSONContent, locale: 'vi' | 'en' | 'zh' = 'en') {
  const block = databaseBlock.configure(options)
  const editor = new Editor({
    extensions: createExtensions({ blocks: [text, block], locale }),
    content: content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
  })
  editors.push(editor)
  const wrapper = mount({ render: () => h(EditorContent, { editor }) }, { attachTo: document.body })
  wrappers.push(wrapper)
  return { editor, wrapper, block }
}
const dbDoc = (databaseId: string, extra: Record<string, unknown> = {}): JSONContent => ({ type: 'doc', content: [{ type: DATABASE_NODE, attrs: { databaseId, ...extra } }] })

describe('databaseView node', () => {
  it('round-trips JSON and HTML with databaseId / viewId / inline and a block id', () => {
    const { editor } = setup({})
    editor.commands.setContent(dbDoc('db1', { viewId: 'v2', inline: false }))
    const json = editor.getJSON()
    expect(json.content![0]).toMatchObject({ type: DATABASE_NODE, attrs: { databaseId: 'db1', viewId: 'v2', inline: false } })
    expect(json.content![0]!.attrs!.id).toBeTruthy()
    const html = editor.getHTML()
    expect(html).toContain('data-database-id="db1"')
    expect(html).toContain('data-view-id="v2"')
    const again = setup({}).editor
    again.commands.setContent(html)
    expect(again.getJSON().content![0]).toMatchObject({ type: DATABASE_NODE, attrs: { databaseId: 'db1', viewId: 'v2', inline: false } })
  })

  it('has slash items "Database – inline" / "Database – full page" in vi / en / zh', () => {
    const block = databaseBlock.configure({ source: () => createMemorySource(sampleDatabase(1)), createDatabase: async () => 'x' })
    expect(block.nodes).toEqual([DATABASE_NODE])
    expect(block.items.map(i => i.id)).toEqual(['databaseInline', 'databaseFullPage'])
    expect(block.items[0]!.keywords).toEqual(expect.arrayContaining(['database', 'co so du lieu', '数据库']))
    expect(block.messages?.vi?.blocks?.databaseInline?.title).toBe('Cơ sở dữ liệu – trong trang')
    expect(block.messages?.en?.blocks?.databaseFullPage?.title).toBe('Database – full page')
    expect(block.messages?.zh?.blocks?.databaseInline?.title).toBe('数据库 – 内嵌')
    expect(messages.zh.viewTypes.board).toBe('看板')
    expect(databaseBlock.items).toEqual([])
  })

  it('"Database – inline" creates a database and inserts it on the empty line; full page inserts a link and opens it', async () => {
    const createDatabase = vi.fn(async (kind: string) => (kind === 'inline' ? 'db-new' : 'db-page'))
    const open = vi.fn()
    const { editor, block } = setup({ source: () => createMemorySource(sampleDatabase(3)), createDatabase, open }, {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'intro' }] }, { type: 'paragraph' }],
    })
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    expect(block.items[0]!.insert(editor.chain().focus()).run()).toBe(true)
    await settle()
    expect(createDatabase).toHaveBeenCalledWith('inline')
    let content = editor.getJSON().content!
    expect(content.map(n => n.type)).toContain(DATABASE_NODE)
    expect(content.find(n => n.type === DATABASE_NODE)!.attrs).toMatchObject({ databaseId: 'db-new', inline: true })

    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    block.items[1]!.insert(editor.chain().focus()).run()
    await settle()
    content = editor.getJSON().content!
    expect(content.filter(n => n.type === DATABASE_NODE).map(n => n.attrs!.inline)).toEqual([true, false])
    expect(open).toHaveBeenCalledWith('db-page')
  })

  it('resolves the source (async, cached) and renders the database; switching tabs stores viewId', async () => {
    const source = createMemorySource(sampleDatabase(500, { databaseId: 'db1' }))
    const factory = vi.fn(async () => source)
    const { editor, wrapper } = setup({ source: factory }, dbDoc('db1'))
    await vi.waitFor(() => expect(wrapper.find('.me-db-title').exists()).toBe(true))
    await settle()
    expect(factory).toHaveBeenCalledWith('db1')
    expect(wrapper.find('.me-db-title').element).toBeInstanceOf(HTMLInputElement)
    expect((wrapper.find('.me-db-title').element as HTMLInputElement).value).toBe('Tasks')
    expect(wrapper.findAll('.me-db-tab[role="tab"]')).toHaveLength(8)
    expect(wrapper.findAll('.me-db-tr').length).toBeGreaterThan(5)

    await wrapper.find('[data-view-id="v-board"]').trigger('click')
    await settle()
    expect(editor.getJSON().content![0]!.attrs!.viewId).toBe('v-board')
    expect(wrapper.find('.me-db').attributes('data-view-type')).toBe('board')

    // Title edits go through setMeta.
    const title = wrapper.find('.me-db-title')
    await title.setValue('Sprint tasks')
    await title.trigger('blur')
    expect(source.meta.value!.title).toBe('Sprint tasks')
  })

  it('shows "not found" when the source fails, and a read-only editor hides edit controls', async () => {
    const { wrapper } = setup({ source: async () => { throw new Error('nope') }, onError: () => {} }, dbDoc('missing'))
    await settle()
    expect(wrapper.find('.me-db-empty.is-missing').text()).toBe('Database not found or no access')

    const source = createMemorySource(sampleDatabase(10, { databaseId: 'db2' }))
    const ro = setup({ source: () => source }, dbDoc('db2'))
    ro.editor.setEditable(false)
    await vi.waitFor(() => expect(ro.wrapper.find('.me-db-title').exists()).toBe(true))
    await settle()
    expect(ro.wrapper.find('[data-tool="new"]').exists()).toBe(false)
    expect(ro.wrapper.find('[data-add-view]').exists()).toBe(false)
  })
})
