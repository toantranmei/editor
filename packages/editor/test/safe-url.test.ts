import { Editor, type JSONContent } from '@tiptap/vue-3'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MeiEditor from '../src/components/MeiEditor.vue'
import { createExtensions } from '../src/extensions'
import { defaultBlocks, file } from '../src/blocks'
import { text } from '../src/blocks/basic'
import { isSameOrigin, isWebUrl, safeUrl } from '../src/safe-url'

const editors: Editor[] = []
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy()
  document.body.innerHTML = ''
})

/** A full <MeiEditor> (node views render through its EditorContent). */
async function mountEditor(content: JSONContent) {
  const wrapper = mount(MeiEditor, { props: { modelValue: content, outline: false, blocks: [...defaultBlocks, file] }, attachTo: document.body })
  await flushPromises()
  await vi.waitFor(() => expect(wrapper.emitted('ready')).toBeTruthy())
  await flushPromises()
  return { wrapper, element: wrapper.element as HTMLElement }
}

function editor(content: string) {
  const e = new Editor({ extensions: createExtensions({ blocks: [text, ...defaultBlocks, file] }), content })
  editors.push(e)
  return e
}

describe('safeUrl', () => {
  it('keeps web, blob and relative / same-origin URLs', () => {
    for (const url of ['https://a.example/x.png', 'http://a.example/x', 'blob:https://a.example/uuid', '/api/v1/files/0193', 'files/a.png', '//cdn.example/a.png', '?v=1', '#top'])
      expect(safeUrl(url), url).toBe(url)
  })

  it('refuses script and HTML URLs, however they are spelled', () => {
    for (const url of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', 'vbscript:x', 'data:text/html,<script>alert(1)</script>', 'DATA:text/html;base64,PHNjcmlwdD4=', 'file:///etc/passwd', '', null, 42])
      expect(safeUrl(url, 'image'), String(url)).toBeNull()
  })

  it('data: URLs depend on the policy', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    expect(safeUrl(png)).toBeNull()
    expect(safeUrl(png, 'image')).toBe(png)
    expect(safeUrl('data:image/svg+xml,<svg/>', 'image')).toBe('data:image/svg+xml,<svg/>')
    expect(safeUrl('data:audio/wav;base64,UklGRg==', 'image')).toBeNull()
    expect(safeUrl('data:audio/wav;base64,UklGRg==', 'any')).toBe('data:audio/wav;base64,UklGRg==')
  })
})

describe('isSameOrigin / isWebUrl', () => {
  const base = 'https://app.example/notes/1'
  it('paths are same-origin; protocol-relative and backslash hosts are not', () => {
    for (const url of ['/api/v1/files/1', 'a.png', '?v=1', 'https://app.example/x'])
      expect(isSameOrigin(url, base), url).toBe(true)
    for (const url of ['//evil.com/a.png', '\\\\evil.com/a.png', '/\\evil.com/a.png', 'https://evil.com/', 'data:image/png;base64,AA=='])
      expect(isSameOrigin(url, base), url).toBe(false)
  })
  it('web URLs', () => {
    expect(isWebUrl('//evil.com/a', base)).toBe(true)
    expect(isWebUrl('/x', base)).toBe(true)
    expect(isWebUrl('data:image/png;base64,AA==', base)).toBe(false)
  })
})

describe('image block (KS-BUG-7)', () => {
  it('never renders a javascript: / data:text/html source in the editor', async () => {
    const { element, wrapper } = await mountEditor({ type: 'doc', content: [
      { type: 'image', attrs: { src: 'javascript:alert(1)', width: 100 } },
      { type: 'image', attrs: { src: 'data:text/html,<script>alert(1)</script>', width: 100 } },
      { type: 'image', attrs: { src: '/api/v1/files/0193', width: 100 } },
    ] })
    const srcs = [...element.querySelectorAll('img[src]')].map(img => img.getAttribute('src'))
    expect(srcs).toEqual(['/api/v1/files/0193'])
    expect(element.querySelectorAll('.me-image-blocked')).toHaveLength(2)
    wrapper.unmount()
  })

  it('pasted / parsed HTML drops unsafe sources, and getHTML never outputs them', async () => {
    const e = editor('<img src="javascript:alert(1)"><img src="data:image/png;base64,iVBORw0KGgo=">')
    const images = e.getJSON().content!.filter(n => n.type === 'image')
    expect(images.map(n => n.attrs!.src)).toEqual([null, 'data:image/png;base64,iVBORw0KGgo='])
    e.commands.setContent({ type: 'doc', content: [{ type: 'image', attrs: { src: 'javascript:alert(1)' } }] })
    expect(e.getHTML()).not.toContain('javascript')
  })
})
