import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MermaidDiagram from '../src/components/MermaidDiagram.vue'
import { resolveMessages } from '../src/locale'

// A stand-in for Mermaid with the same DOM behaviour: it renders into a temporary element in
// <body> and returns an SVG carrying the given id; on a syntax error it throws (and leaves the
// temporary element behind).
vi.mock('../src/lazy', () => ({
  loadMermaid: async () => ({
    initialize: () => {},
    render: async (id: string, code: string) => {
      await new Promise(r => setTimeout(r, 5))
      document.getElementById(`d${id}`)?.remove()
      const temp = document.createElement('div')
      temp.id = `d${id}`
      document.body.appendChild(temp)
      if (code.includes('???')) throw new Error('Parse error on line 2')
      temp.remove()
      return { svg: `<svg id="${id}"><text>${code}</text></svg>` }
    },
  }),
}))

afterEach(() => {
  document.body.innerHTML = ''
})

const messages = resolveMessages('en')

describe('<MermaidDiagram> (KS-BUG-8)', () => {
  it('diagrams rendered together are independent: an invalid one does not blank the valid ones', async () => {
    const codes = ['flowchart LR\n  V --> W', 'flowchart LR\n  A --> \n  ??? broken [[[', 'flowchart LR\n  X --> Y']
    // Each node view is its own render root, like here.
    const wrappers = codes.map(code => mount(MermaidDiagram, { props: { code, messages, dark: false }, attachTo: document.body }))
    await vi.waitFor(() => expect(document.querySelectorAll('.me-mermaid svg, .me-mermaid .me-error')).toHaveLength(3), { timeout: 2000 })
    await flushPromises()
    await new Promise(r => setTimeout(r, 50))

    const [valid, invalid, other] = wrappers
    expect(valid!.find('svg').exists()).toBe(true)
    expect(valid!.text()).toContain('V --> W')
    expect(invalid!.find('.me-error').exists()).toBe(true)
    expect(other!.find('svg').exists()).toBe(true)
    const ids = wrappers.map(w => w.find('svg').exists() ? w.find('svg').attributes('id') : null).filter(Boolean)
    expect(new Set(ids).size).toBe(ids.length)
    // No temporary element left in <body>.
    expect([...document.body.children].filter(el => el.id.startsWith('dme-mermaid'))).toHaveLength(0)
    for (const w of wrappers) w.unmount()
  })
})
