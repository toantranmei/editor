import { Extension, Node } from '@tiptap/core'
import { history, undo, undoDepth } from '@tiptap/pm/history'
import { Editor, EditorContent } from '@tiptap/vue-3'
import { MeiConfig } from '@toantranmei/editor'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'

import { messages, sketch, SKETCH_NODE, SketchNode, type SketchProvider } from '../src'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE } from '../src/model/types'
import { memory } from '../src/providers/memory'
import type { BoardConnection } from '../src/providers/types'
import { stubCanvas, stubFrames } from './helpers/canvas'

const Doc = Node.create({ name: 'doc', topNode: true, content: 'block+' })
const Paragraph = Node.create({ name: 'paragraph', group: 'block', content: 'inline*', parseHTML: () => [{ tag: 'p' }], renderHTML: () => ['p', 0] })
const Text = Node.create({ name: 'text', group: 'inline' })
const History = Extension.create({ name: 'testHistory', addProseMirrorPlugins: () => [history({ newGroupDelay: 1 })] })

const editors: Editor[] = []
const wrappers: VueWrapper[] = []

beforeEach(() => {
  stubCanvas()
  stubFrames()
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(480)
})
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
  for (const e of editors.splice(0)) e.destroy()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** A provider that records every connection it hands out. */
function recording(base: SketchProvider = memory()) {
  const connections: BoardConnection[] = []
  const provider: SketchProvider = {
    ...base,
    async connect(id) {
      const c = await base.connect(id)
      connections.push(c)
      return c
    },
  }
  return { provider, connections }
}

interface SetupOpts {
  provider?: SketchProvider
  attrs?: Record<string, unknown>
  editable?: boolean
  config?: Parameters<typeof MeiConfig.configure>[0]
  content?: Record<string, unknown>
}

async function setup(opts: SetupOpts = {}) {
  const block = sketch.configure({ provider: opts.provider ?? memory() })
  const editor = new Editor({
    extensions: [Doc, Paragraph, Text, History, MeiConfig.configure(opts.config ?? {}), ...block.extensions],
    editable: opts.editable ?? true,
    content: opts.content ?? (opts.attrs
      ? { type: 'doc', content: [{ type: 'sketch', attrs: opts.attrs }] }
      : { type: 'doc', content: [{ type: 'paragraph' }] }),
  })
  editors.push(editor)
  const wrapper = mount({ render: () => h(EditorContent, { editor }) }, { attachTo: document.body })
  wrappers.push(wrapper)
  await nextTick()
  return { editor, wrapper }
}

const sketchNode = (editor: Editor) => {
  let found: { attrs: Record<string, unknown> } | null = null
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'sketch') found = n as never
    return !found
  })
  return found as unknown as { attrs: Record<string, unknown> }
}

/** The ProseMirror node view object of the first sketch node. */
const nodeView = (editor: Editor) => {
  const desc = (editor.view as unknown as { docView: { children: Array<{ spec?: { stopEvent?: (e: Event) => boolean, ignoreMutation?: (m: unknown) => boolean } }> } }).docView.children[0]!
  return desc.spec!
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await flushPromises()
    await new Promise(r => setTimeout(r, 0))
  }
  await nextTick()
}

async function enter(wrapper: VueWrapper) {
  await wrapper.find('.me-sketch-cover button').trigger('click')
  await vi.waitFor(() => {
    if (!document.querySelector('.me-sketch-board')) throw new Error('board not mounted')
  }, { timeout: 5000 })
  await nextTick()
}

/** Click somewhere outside the block. */
async function clickOutside() {
  const outside = document.createElement('div')
  document.body.appendChild(outside)
  outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await settle()
}

/** All sketch nodes' attrs, in document order. */
const sketchNodes = (editor: Editor) => {
  const out: Array<Record<string, unknown>> = []
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'sketch') out.push(n.attrs)
  })
  return out
}

/** A savePreview whose calls resolve only when the test says so. */
function deferredSaves() {
  const pending: Array<{ id: string, resolve: (url: string) => void }> = []
  const savePreview = vi.fn((id: string) => new Promise<string>(resolve => pending.push({ id, resolve })))
  return { pending, savePreview }
}

const rect = () => ({
  type: 'rectangle' as const, x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false, ...DEFAULT_STYLE,
})

describe('sketch block', () => {
  it('is a block definition with a slash item and messages', () => {
    expect(sketch.name).toBe('sketch')
    expect(sketch.nodes).toEqual(['sketch'])
    expect(sketch.options.defaultHeight).toBe(480)
    expect(sketch.items[0]!.group).toBe('media')
    expect(sketch.items[0]!.keywords).toEqual(['sketch', 'whiteboard', 'draw', 'canvas', 've', 'bang trang'])
    expect(sketch.messages?.en?.blocks?.sketch?.title).toBe('Sketch')
    expect(sketch.messages?.vi?.blocks?.sketch?.title).toBe('Bảng vẽ')
    expect(SKETCH_NODE).toBe('sketch')
    expect(SketchNode.name).toBe('sketch')
    expect(messages.vi.title).toBeTruthy()
  })

  it('insertSketch creates a node with a bd_ id and default attrs', async () => {
    const { editor } = await setup()
    editor.commands.insertSketch()
    const node = sketchNode(editor)
    expect(node.attrs.boardId).toMatch(/^bd_[\w-]{10}$/)
    expect(node.attrs.preview).toBeNull()
    expect(node.attrs.height).toBeNull()
    expect(node.attrs.version).toBe(0)
  })

  it('getJSON round-trips attrs and contains no element data', async () => {
    const attrs = { boardId: 'bd_abcdefghij', preview: 'data:image/svg+xml;base64,AA', height: 600, version: 3 }
    const { editor } = await setup({ attrs })
    const json = editor.getJSON()
    expect(json.content![0]).toEqual({ type: 'sketch', attrs })
    expect(Object.keys(json.content![0]!.attrs!).sort()).toEqual(['boardId', 'height', 'preview', 'version'])

    // HTML round trip
    const html = editor.getHTML()
    expect(html).toContain('data-type="sketch"')
    expect(html).toContain('<img')
    const { editor: other } = await setup()
    other.commands.setContent(html)
    expect(sketchNode(other).attrs).toEqual(attrs)
  })

  it('renders the preview image with an Interact cover', async () => {
    const { wrapper } = await setup({ attrs: { boardId: 'bd_x', preview: 'data:image/svg+xml;base64,AA', height: null, version: 1 } })
    expect(wrapper.find('.me-sketch-preview').attributes('src')).toBe('data:image/svg+xml;base64,AA')
    expect(wrapper.find('.me-sketch-cover button').text()).toContain(messages.vi.interact)
    expect((wrapper.find('.me-sketch-body').element as HTMLElement).style.height).toBe('480px')
    expect(wrapper.find('.me-embed-resize').exists()).toBe(true)
  })

  it('node view stopEvent swallows keyboard and pointer events while interacting', async () => {
    const { editor, wrapper } = await setup({ attrs: { boardId: 'bd_x', preview: null, height: null, version: 0 } })
    const view = nodeView(editor)
    const key = () => new KeyboardEvent('keydown', { key: 'Backspace' })
    expect(view.stopEvent!(key())).toBe(false)
    expect(view.ignoreMutation!({ type: 'attributes' })).toBe(true)

    await enter(wrapper)
    expect(view.stopEvent!(key())).toBe(true)
    for (const e of [new PointerEvent('pointerdown'), new MouseEvent('mousedown'), new MouseEvent('mousemove'), new WheelEvent('wheel'), new Event('paste'), new Event('dragstart'), new InputEvent('beforeinput')]) {
      expect(view.stopEvent!(e)).toBe(true)
    }

    await clickOutside()
    expect(document.querySelector('.me-sketch-board')).toBeNull()
    expect(view.stopEvent!(key())).toBe(false)
  })

  it('does not overwrite preview when board is empty and was never edited', async () => {
    const { provider, connections } = recording()
    const attrs = { boardId: 'bd_x', preview: 'data:x', height: null, version: 2 }
    const { editor, wrapper } = await setup({ provider, attrs })
    await enter(wrapper)
    expect(connections).toHaveLength(1)
    expect(connections[0]!.existed).toBe(false)
    // the board is not on this device: notice shown, preview untouched
    expect(wrapper.find('.me-sketch-notice').text()).toBe(messages.vi.notOnDevice)
    await clickOutside()
    expect(sketchNode(editor).attrs).toEqual(attrs)
  })

  it('saves preview and bumps version after an edit', async () => {
    const { provider, connections } = recording()
    const { editor, wrapper } = await setup({ provider, attrs: { boardId: 'bd_x', preview: null, height: null, version: 0 } })
    await enter(wrapper)
    new BoardStore(connections[0]!.doc).create(rect())
    await clickOutside()
    await vi.waitFor(() => expect(sketchNode(editor).attrs.version).toBe(1))
    expect(String(sketchNode(editor).attrs.preview)).toMatch(/^data:image\/svg\+xml/)
    // connection stays open until unmount, then is destroyed
    const destroy = vi.spyOn(connections[0]!, 'destroy')
    editor.destroy()
    await settle()
    expect(destroy).toHaveBeenCalled()
  })

  it('uses provider.savePreview when available', async () => {
    const base = memory()
    const savePreview = vi.fn(async (id: string, blob: Blob) => `https://cdn/${id}.${blob.type === 'image/svg+xml' ? 'svg' : 'png'}`)
    const { provider, connections } = recording({ ...base, connect: base.connect, savePreview })
    const { editor, wrapper } = await setup({ provider, attrs: { boardId: 'bd_y', preview: null, height: null, version: 4 } })
    await enter(wrapper)
    new BoardStore(connections[0]!.doc).create(rect())
    await clickOutside()
    await vi.waitFor(() => expect(sketchNode(editor).attrs.version).toBe(5))
    expect(sketchNode(editor).attrs.preview).toBe('https://cdn/bd_y.svg')
  })

  it('saves 2 s after the last change while still interacting', async () => {
    const { provider, connections } = recording()
    const { editor, wrapper } = await setup({ provider, attrs: { boardId: 'bd_x', preview: null, height: null, version: 0 } })
    await enter(wrapper)
    vi.useFakeTimers()
    try {
      new BoardStore(connections[0]!.doc).create(rect())
      await vi.advanceTimersByTimeAsync(1500)
      expect(sketchNode(editor).attrs.version).toBe(0)
      await vi.advanceTimersByTimeAsync(600)
    } finally {
      vi.useRealTimers()
    }
    await vi.waitFor(() => expect(sketchNode(editor).attrs.version).toBe(1))
    expect(document.querySelector('.me-sketch-board')).not.toBeNull()
  })

  it('clearing the board saves a null preview', async () => {
    const { provider, connections } = recording()
    const { editor, wrapper } = await setup({ provider, attrs: { boardId: 'bd_x', preview: 'data:old', height: null, version: 1 } })
    await enter(wrapper)
    const store = new BoardStore(connections[0]!.doc)
    const el = store.create(rect())
    store.remove([el.id])
    await clickOutside()
    await vi.waitFor(() => expect(sketchNode(editor).attrs.version).toBe(2))
    expect(sketchNode(editor).attrs.preview).toBeNull()
  })

  it('keeps the old preview when savePreview fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const base = memory()
    const { provider, connections } = recording({ connect: base.connect, savePreview: async () => { throw new Error('offline') } })
    const { editor, wrapper } = await setup({ provider, attrs: { boardId: 'bd_x', preview: 'data:old', height: null, version: 1 } })
    await enter(wrapper)
    new BoardStore(connections[0]!.doc).create(rect())
    await clickOutside()
    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    expect(sketchNode(editor).attrs).toMatchObject({ preview: 'data:old', version: 1 })
  })

  it('read-only does not save preview', async () => {
    const base = memory()
    // seed the board so there is something a preview could be made of
    const seed = await base.connect('bd_x')
    new BoardStore(seed.doc).create(rect())
    const { provider, connections } = recording(base)
    const attrs = { boardId: 'bd_x', preview: 'data:old', height: null, version: 1 }
    const { editor, wrapper } = await setup({ provider, attrs, editable: false })
    expect(wrapper.find('.me-embed-resize').exists()).toBe(false)
    await enter(wrapper)
    expect(document.querySelector('.me-sketch-board')!.classList).toContain('is-readonly')
    // a change arriving on the connection (e.g. local tooling) must not produce a save
    new BoardStore(connections[0]!.doc).create(rect())
    await clickOutside()
    await settle()
    expect(sketchNode(editor).attrs).toEqual(attrs)
  })

  it('shows an error and stays on the preview when connect fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const provider: SketchProvider = { connect: async () => { throw new Error('nope') } }
    const { wrapper } = await setup({ provider, attrs: { boardId: 'bd_x', preview: null, height: null, version: 0 } })
    await wrapper.find('.me-sketch-cover button').trigger('click')
    await settle()
    expect(wrapper.find('.me-error').exists()).toBe(true)
    expect(wrapper.find('.me-sketch-cover').exists()).toBe(true)
    expect(document.querySelector('.me-sketch-board')).toBeNull()
  })

  it('fullscreen opens a modal sharing the connection; Esc closes it', async () => {
    const { provider, connections } = recording()
    const { wrapper } = await setup({ provider, attrs: { boardId: 'bd_x', preview: null, height: null, version: 0 } })
    await enter(wrapper)
    await wrapper.find('.me-sketch-expand').trigger('click')
    await settle()
    const modal = document.querySelector('.me-sketch-modal')!
    expect(modal).not.toBeNull()
    expect(modal.classList).toContain('me-scope')
    expect(document.querySelectorAll('.me-sketch-board')).toHaveLength(1)
    expect(modal.querySelector('.me-sketch-board')).not.toBeNull()
    expect(connections).toHaveLength(1)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await settle()
    expect(document.querySelector('.me-sketch-modal')).toBeNull()
    expect(document.querySelector('.me-sketch-board')).toBeNull()
  })

  it('passes theme and locale to the board', async () => {
    const { wrapper } = await setup({
      attrs: { boardId: 'bd_x', preview: null, height: null, version: 0 },
      config: { locale: 'en', scope: { 'class': ['me-scope', 'me-dark'], 'data-me-id': '' } },
    })
    await enter(wrapper)
    const board = document.querySelector('.me-sketch-board')!
    expect(board.getAttribute('data-theme')).toBe('dark')
    expect(board.querySelector('.me-sketch-toolbar button')!.getAttribute('title')).toBe(messages.en.tools.hand)
  })

  it('follows the app dark class unless the editor scope forces light', async () => {
    document.documentElement.classList.add('dark')
    try {
      const { wrapper } = await setup({ attrs: { boardId: 'bd_x', preview: null, height: null, version: 0 } })
      await enter(wrapper)
      expect(document.querySelector('.me-sketch-board')!.getAttribute('data-theme')).toBe('dark')
      wrapper.unmount()
      wrappers.splice(0)
      document.body.innerHTML = ''
      const light = await setup({
        attrs: { boardId: 'bd_x', preview: null, height: null, version: 0 },
        config: { scope: { 'class': ['me-scope', 'me-light'], 'data-me-id': '' } },
      })
      await enter(light.wrapper)
      expect(document.querySelector('.me-sketch-board')!.getAttribute('data-theme')).toBe('light')
    } finally {
      document.documentElement.classList.remove('dark')
    }
  })

  it('moves focus into the board when entering by double-click, and into the modal board', async () => {
    const { wrapper } = await setup({ attrs: { boardId: 'bd_x', preview: null, height: null, version: 0 } })
    await wrapper.find('.me-sketch-cover').trigger('dblclick')
    await vi.waitFor(() => {
      if (!document.querySelector('.me-sketch-board')) throw new Error('board not mounted')
    })
    await settle()
    expect(document.activeElement).toBe(document.querySelector('.me-sketch-board'))

    await wrapper.find('.me-sketch-expand').trigger('click')
    await settle()
    const modalBoard = document.querySelector('.me-sketch-modal .me-sketch-board')
    expect(modalBoard).not.toBeNull()
    expect(document.activeElement).toBe(modalBoard)
  })

  it('locks the document while a board is live', async () => {
    const { editor, wrapper } = await setup({ attrs: { boardId: 'bd_x', preview: null, height: null, version: 0 } })
    editor.commands.setNodeSelection(0)
    const backspace = () => new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
    // a key no keymap handles, so asking doesn't edit anything
    const blocked = () => !!editor.view.someProp('handleKeyDown', f => f(editor.view, new KeyboardEvent('keydown', { key: 'q' })))
    expect(blocked()).toBe(false)

    await enter(wrapper)
    expect(blocked()).toBe(true)
    expect(editor.view.someProp('handleTextInput', f => f(editor.view, 1, 1, 'x', () => editor.state.tr))).toBe(true)
    editor.view.dom.dispatchEvent(backspace())
    expect(sketchNode(editor)).not.toBeNull()

    await clickOutside()
    expect(blocked()).toBe(false)
    // and the lock is really gone: Backspace on the selected node deletes it again
    editor.commands.setNodeSelection(0)
    editor.view.dom.dispatchEvent(backspace())
    expect(sketchNode(editor)).toBeNull()
  })

  it('resize handle clamps and writes the height on pointerup', async () => {
    const { editor, wrapper } = await setup({ attrs: { boardId: 'bd_x', preview: null, height: null, version: 0 } })
    const handle = wrapper.find('.me-embed-resize')
    handle.element.dispatchEvent(new PointerEvent('pointerdown', { clientY: 100, bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 5000 }))
    await nextTick()
    expect(sketchNode(editor).attrs.height).toBeNull()
    window.dispatchEvent(new PointerEvent('pointerup', { clientY: 5000 }))
    expect(sketchNode(editor).attrs.height).toBe(1600)
    handle.element.dispatchEvent(new PointerEvent('pointerdown', { clientY: 100, bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: -5000 }))
    window.dispatchEvent(new PointerEvent('pointerup', { clientY: -5000 }))
    expect(sketchNode(editor).attrs.height).toBe(240)
  })

  it('preview saves are not document undo steps; inserting the block still is', async () => {
    const { provider, connections } = recording()
    const { editor, wrapper } = await setup({ provider })
    editor.commands.insertSketch()
    await settle()
    expect(undoDepth(editor.state)).toBe(1)
    await enter(wrapper)
    new BoardStore(connections[0]!.doc).create(rect())
    await clickOutside()
    await vi.waitFor(() => expect(sketchNode(editor).attrs.version).toBe(1))
    // only the insert is in the history
    expect(undoDepth(editor.state)).toBe(1)
    undo(editor.state, editor.view.dispatch)
    expect(sketchNode(editor)).toBeNull()
  })

  it('assigning a missing board id on open is not an undo step', async () => {
    const { editor, wrapper } = await setup({ attrs: { boardId: null, preview: null, height: null, version: 0 } })
    await enter(wrapper)
    expect(sketchNode(editor).attrs.boardId).toMatch(/^bd_/)
    expect(undoDepth(editor.state)).toBe(0)
  })

  it('a slow save finishing after a newer one does not overwrite the newer preview', async () => {
    const base = memory()
    const { pending, savePreview } = deferredSaves()
    const { provider, connections } = recording({ connect: base.connect, savePreview })
    const { editor, wrapper } = await setup({ provider, attrs: { boardId: 'bd_x', preview: null, height: null, version: 0 } })
    await enter(wrapper)
    const store = new BoardStore(connections[0]!.doc)
    vi.useFakeTimers()
    try {
      store.create(rect())
      await vi.advanceTimersByTimeAsync(2100) // debounced save #1 starts
    } finally {
      vi.useRealTimers()
    }
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    store.create(rect())
    await clickOutside() // save #2 on leave
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    pending[1]!.resolve('https://cdn/new')
    await settle()
    pending[0]!.resolve('https://cdn/old')
    await settle()
    expect(sketchNode(editor).attrs.preview).toBe('https://cdn/new')
    expect(sketchNode(editor).attrs.version).toBe(1)
  })

  it('a save finishing after the node changed board writes to the node that still has the old id', async () => {
    const base = memory()
    const { pending, savePreview } = deferredSaves()
    const { provider, connections } = recording({ connect: base.connect, savePreview })
    const { editor, wrapper } = await setup({ provider, attrs: { boardId: 'bd_a', preview: null, height: null, version: 0 } })
    await enter(wrapper)
    new BoardStore(connections[0]!.doc).create(rect())
    await clickOutside()
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    // the view now shows another board; the old board lives on in another node
    editor.commands.command(({ tr }) => {
      tr.setNodeMarkup(0, undefined, { boardId: 'bd_b', preview: null, height: null, version: 7 })
      tr.insert(tr.doc.content.size, editor.schema.nodes.sketch!.create({ boardId: 'bd_a', preview: null, height: null, version: 2 }))
      return true
    })
    await settle()
    pending[0]!.resolve('https://cdn/a')
    await settle()
    const [current, old] = sketchNodes(editor)
    expect(current).toMatchObject({ boardId: 'bd_b', preview: null, version: 7 })
    expect(old).toMatchObject({ boardId: 'bd_a', preview: 'https://cdn/a', version: 3 })
    expect(undoDepth(editor.state)).toBe(1) // only the test's own edit
  })

  it('a save finishing after the view unmounted still updates the node', async () => {
    const base = memory()
    const { pending, savePreview } = deferredSaves()
    const { provider, connections } = recording({ connect: base.connect, savePreview })
    const attrs = { boardId: 'bd_x', preview: null, height: null, version: 0 }
    const { editor, wrapper } = await setup({ provider, attrs })
    await enter(wrapper)
    new BoardStore(connections[0]!.doc).create(rect())
    await clickOutside()
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    // move the block: its view is destroyed and a new one made
    editor.commands.command(({ tr }) => {
      tr.delete(0, tr.doc.content.size)
      tr.insert(0, [editor.schema.nodes.paragraph!.create(), editor.schema.nodes.sketch!.create(attrs)])
      return true
    })
    await settle()
    pending[0]!.resolve('https://cdn/x')
    await settle()
    expect(sketchNode(editor).attrs).toMatchObject({ boardId: 'bd_x', preview: 'https://cdn/x', version: 1 })
  })
})
