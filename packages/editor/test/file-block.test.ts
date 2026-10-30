import type { JSONContent } from '@tiptap/vue-3'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MeiEditor from '../src/components/MeiEditor.vue'
import { defaultBlocks, file } from '../src/blocks'

afterEach(() => {
  document.body.innerHTML = ''
})

async function mountEditor(content: JSONContent) {
  const wrapper = mount(MeiEditor, { props: { modelValue: content, outline: false, blocks: [...defaultBlocks, file] }, attachTo: document.body })
  await flushPromises()
  await vi.waitFor(() => expect(wrapper.emitted('ready')).toBeTruthy())
  await flushPromises()
  return { wrapper, element: wrapper.element as HTMLElement }
}

const fileBlock = (kind: string, src: string, name = 'f') => ({ type: 'fileBlock', attrs: { kind, src, name } })

describe('file block sources (KS-BUG-15)', () => {
  it('uploads stored as same-origin paths get a player and a download button', async () => {
    const { element, wrapper } = await mountEditor({ type: 'doc', content: [
      fileBlock('audio', '/api/v1/files/0193-a', 'a.wav'),
      fileBlock('video', '/api/v1/files/0193-v', 'v.mp4'),
      fileBlock('file', '/api/v1/files/0193-f', 'f.pdf'),
    ] })
    expect(element.querySelector('.me-file--audio audio')?.getAttribute('src')).toBe('/api/v1/files/0193-a')
    expect(element.querySelector('.me-file--video video')?.getAttribute('src')).toBe('/api/v1/files/0193-v')
    for (const kind of ['audio', 'video', 'file'])
      expect(element.querySelector(`.me-file--${kind} a[download]`)?.getAttribute('href'), kind).toMatch(/^\/api\/v1\/files\/0193-/)
    wrapper.unmount()
  })

  it('still refuses javascript: sources', async () => {
    const { element, wrapper } = await mountEditor({ type: 'doc', content: [fileBlock('audio', 'javascript:alert(1)'), fileBlock('file', ' javascript:alert(1)')] })
    expect(element.querySelector('audio')).toBeNull()
    expect(element.querySelector('a[download]')).toBeNull()
    wrapper.unmount()
  })
})
