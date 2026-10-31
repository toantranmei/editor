import { Editor } from '@tiptap/vue-3'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SlashMenu from '../src/components/SlashMenu.vue'
import { createExtensions } from '../src/extensions'
import { defaultBlocks } from '../src/blocks'
import { text } from '../src/blocks/basic'
import type { SlashItem } from '../src/slash-items'

const editors: Editor[] = []
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy()
  document.body.innerHTML = ''
})

const item = (key: string): SlashItem => ({ key, title: key, group: 'g', icon: 'span', run: () => {} } as unknown as SlashItem)

function menu() {
  const editor = new Editor({ extensions: createExtensions({ blocks: [text, ...defaultBlocks] }) })
  editors.push(editor)
  const command = vi.fn()
  const wrapper = mount(SlashMenu, { props: { editor, items: ['first', 'second', 'third'].map(item), query: 'x', command }, attachTo: document.body })
  const row = (i: number) => wrapper.find(`[data-index="${i}"]`)
  const enter = () => (wrapper.vm as unknown as { onKeyDown: (e: KeyboardEvent) => boolean }).onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }))
  return { wrapper, row, enter, command }
}

describe('slash menu under a resting pointer (KS-BUG-3)', () => {
  it('a row appearing under the unmoved pointer does not become selected', async () => {
    const { row, enter, command } = menu()
    // What the browser sends when the menu opens under the pointer: enter + a synthetic move, same spot.
    await row(2).trigger('mouseenter', { screenX: 100, screenY: 200 })
    await row(2).trigger('mousemove', { screenX: 100, screenY: 200 })
    expect(row(0).classes()).toContain('is-active')
    enter()
    expect(command.mock.calls[0]![0].key).toBe('first')
  })

  it('a real pointer move selects the hovered row', async () => {
    const { row, enter, command } = menu()
    await row(2).trigger('mousemove', { screenX: 100, screenY: 200 })
    await row(1).trigger('mousemove', { screenX: 100, screenY: 180 })
    expect(row(1).classes()).toContain('is-active')
    enter()
    expect(command.mock.calls[0]![0].key).toBe('second')
  })
})
