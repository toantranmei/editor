import { NodeSelection } from '@tiptap/pm/state'
import { defaultBlocks, type Editor, MeiEditor } from '@toantranmei/editor'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import { DATABASE_NODE, databaseBlock } from '../src'
import { createMemorySource, sampleDatabase } from '../src/memory-source'

const wrappers: VueWrapper[] = []
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
  document.body.innerHTML = ''
})
const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await flushPromises()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
  }
}

async function setup(writeDelay = 0) {
  const source = createMemorySource({ ...sampleDatabase(5, { databaseId: 'db1' }), writeDelay })
  const blocks = [...defaultBlocks, databaseBlock.configure({ source: () => source })]
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
      { type: DATABASE_NODE, attrs: { databaseId: 'db1', viewId: 'v-table' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
    ],
  }
  let editor: Editor | null = null
  const wrapper = mount({ render: () => h(MeiEditor, { modelValue: doc, blocks, locale: 'en', onReady: (e: Editor) => (editor = e) }) }, { attachTo: document.body })
  wrappers.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('.me-db-new-row.is-static').exists()).toBe(true), { timeout: 3000 })
  await settle()
  return { source, wrapper, editor: editor! }
}

const pageText = (editor: Editor) => (editor.getJSON().content ?? []).filter(n => n.type === 'paragraph').map(n => n.content?.map(c => (c as { text?: string }).text ?? '').join('') ?? '')
const titles = (source: ReturnType<typeof createMemorySource>) => source.all().map(r => r.values.name)

async function newRowTypeEnter(writeDelay: number) {
  const { source, wrapper, editor } = await setup(writeDelay)
  const before = pageText(editor)
  const button = wrapper.find('.me-db-new-row.is-static').element as HTMLElement

  // The editor must not take events / DOM selection from inside the database UI.
  const desc = (editor.view as unknown as { docView: { children: Array<{ node: { type: { name: string } }, stopEvent: (e: Event) => boolean, ignoreMutation: (m: unknown) => boolean }> } })
    .docView.children.find(d => d.node.type.name === DATABASE_NODE)!
  const key = new KeyboardEvent('keydown', { key: 'a' })
  Object.defineProperty(key, 'target', { value: button })
  expect(desc.stopEvent(key)).toBe(true)
  expect(desc.ignoreMutation({ type: 'selection', target: button })).toBe(true)

  const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })
  button.dispatchEvent(down)
  expect(down.defaultPrevented).toBe(true)
  button.click()
  // The row appears after the (async) write; then the title editor opens with focus.
  await vi.waitFor(() => expect(document.body.querySelector('.me-db-cell-textarea')).not.toBeNull(), { timeout: 3000 })
  const ta = document.body.querySelector<HTMLTextAreaElement>('.me-db-cell-textarea')!
  expect(document.activeElement).toBe(ta)
  ta.value = 'Typed title'
  ta.dispatchEvent(new Event('input'))
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await vi.waitFor(() => expect(titles(source)).toContain('Typed title'), { timeout: 3000 })
  await settle()

  const json = editor.getJSON().content!
  expect(json.map(n => n.type)).toContain(DATABASE_NODE)
  expect(pageText(editor)).toEqual(before)
  expect(editor.state.selection instanceof NodeSelection && editor.state.selection.node.type.name === DATABASE_NODE).toBe(false)
  expect(source.all()[5]!.values.name).toBe('Typed title')
  // Enter on the last row added the next row and opened its title editor, focused.
  await vi.waitFor(() => expect(source.all()).toHaveLength(7), { timeout: 3000 })
  await vi.waitFor(() => expect(document.activeElement?.classList.contains('me-db-cell-textarea')).toBe(true), { timeout: 3000 })
  expect(pageText(editor)).toEqual(before)
}

describe('inline database inside MeiEditor', () => {
  it('"+ New", type, Enter: sets the cell, keeps the block and the page text (sync source)', () => newRowTypeEnter(0))
  it('same with a source that applies writes asynchronously (30 ms)', () => newRowTypeEnter(30))
})
