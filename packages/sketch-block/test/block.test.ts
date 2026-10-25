import { Extension, Node } from '@tiptap/core'
import { history, redo, undo, undoDepth } from '@tiptap/pm/history'
import { Editor, EditorContent } from '@tiptap/vue-3'
import { MeiConfig } from '@toantranmei/editor'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'

import { messages, sketch, SKETCH_NODE, SketchNode, type SketchProvider } from '../src'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE } from '../src/model/types'
import { memory } from '../src/providers/memory'
import type { SketchOptions } from '../src/block/node'
import type { BoardConnection } from '../src/providers/types'
import { stubCanvas, stubFrames } from './helpers/canvas'

// the real loader warns (no FontFace in happy-dom)
vi.mock('../src/text/fonts', async orig => ({
  ...(await orig<typeof import('../src/text/fonts')>()),
  loadFonts: () => Promise.resolve(),
}))

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
  user?: SketchOptions['user']
  attrs?: Record<string, unknown>
  editable?: boolean
  config?: Parameters<typeof MeiConfig.configure>[0]
  content?: Record<string, unknown>
  onPasteClone?: boolean
}

async function setup(opts: SetupOpts = {}) {
  const block = sketch.configure({
    provider: opts.provider ?? memory(),
    ...(opts.user !== undefined ? { user: opts.user } : {}),
    ...(opts.onPasteClone !== undefined ? { onPasteClone: opts.onPasteClone } : {}),
  })
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
  type: 'rectangle' as const, x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false, ...DEFAULT_STYLE, label: '',
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
    expect(board.querySelector('[data-tool="hand"]')!.getAttribute('title')).toBe(messages.en.tools.hand)
  })

  it('passes the image uploader: provider.uploadImage, then meiConfig.uploadImage, then null', async () => {
    const attrs = { boardId: 'bd_x', preview: null, height: null, version: 0 }
    const fromConfig = vi.fn(async () => 'https://cdn/config.png')
    const fromProvider = vi.fn(async () => 'https://cdn/provider.png')
    // the node view renders in its own app: read the board's props off its root element (dev builds)
    const uploaderOf = (_wrapper: VueWrapper) => {
      const el = document.querySelector('.me-sketch-board') as unknown as { __vueParentComponent: { props: Record<string, unknown> } }
      return el.__vueParentComponent.props.uploadImage as ((f: File) => Promise<string>) | null
    }

    const a = await setup({ attrs, config: { uploadImage: fromConfig }, provider: { ...memory(), uploadImage: fromProvider } })
    await enter(a.wrapper)
    const f = new File(['x'], 'a.png', { type: 'image/png' })
    expect(await uploaderOf(a.wrapper)!(f)).toBe('https://cdn/provider.png')
    expect(fromProvider).toHaveBeenCalledWith(f)
    a.editor.destroy()
    await settle()

    const b = await setup({ attrs, config: { uploadImage: fromConfig } })
    await enter(b.wrapper)
    expect(uploaderOf(b.wrapper)).toBe(fromConfig)
    b.editor.destroy()
    await settle()

    const c = await setup({ attrs })
    await enter(c.wrapper)
    expect(uploaderOf(c.wrapper)).toBeNull()
  })

  it('passes the user option to the board', async () => {
    const attrs = { boardId: 'bd_x', preview: null, height: null, version: 0 }
    const userOf = () => (document.querySelector('.me-sketch-board') as unknown as { __vueParentComponent: { props: Record<string, unknown> } })
      .__vueParentComponent.props.user
    const user = () => ({ name: 'Ann', color: '#2f9e44' })
    const a = await setup({ attrs, user })
    await enter(a.wrapper)
    expect(userOf()).toBe(user)
    a.editor.destroy()
    await settle()
    const b = await setup({ attrs })
    await enter(b.wrapper)
    expect(userOf()).toBeNull()
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
  it('undo stack survives inline→fullscreen', async () => {
    const { provider, connections } = recording()
    const { wrapper } = await setup({ provider, attrs: { boardId: 'bd_x', preview: null, height: null, version: 0 } })
    await enter(wrapper)
    const board = document.querySelector('.me-sketch-board') as HTMLElement
    board.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }))
    const canvas = board.querySelectorAll('canvas')[1]!
    const pointer = (type: string, x: number, y: number) =>
      canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', bubbles: true }))
    pointer('pointerdown', 100, 100)
    pointer('pointermove', 200, 160)
    pointer('pointerup', 200, 160)
    const store = new BoardStore(connections[0]!.doc)
    expect(store.all()).toHaveLength(1)

    await wrapper.find('.me-sketch-expand').trigger('click')
    await settle()
    const undoBtn = document.querySelector('.me-sketch-modal [data-action="undo"]') as HTMLButtonElement
    expect(undoBtn).not.toBeNull()
    expect(undoBtn.disabled).toBe(false)
    undoBtn.click()
    expect(store.all()).toHaveLength(0)
    await nextTick()
    const redoBtn = document.querySelector('.me-sketch-modal [data-action="redo"]') as HTMLButtonElement
    expect(redoBtn.disabled).toBe(false)
  })

  it('one session per connection: destroyed with it on unmount and on board id change', async () => {
    const { History: BoardHistory } = await import('../src/model/history')
    // boards given a session never destroy its history: every call here is a session going away
    const destroy = vi.spyOn(BoardHistory.prototype, 'destroy')
    const { editor, wrapper } = await setup({ attrs: { boardId: 'bd_a', preview: null, height: null, version: 0 } })
    await enter(wrapper)
    await wrapper.find('.me-sketch-expand').trigger('click')
    await settle()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await settle()
    await enter(wrapper)
    expect(destroy).not.toHaveBeenCalled()
    // board id change: the session goes with the connection
    editor.commands.command(({ tr }) => {
      tr.setNodeMarkup(0, undefined, { boardId: 'bd_b', preview: null, height: null, version: 0 })
      return true
    })
    await settle()
    expect(destroy).toHaveBeenCalledTimes(1)
    await enter(wrapper)
    editor.destroy()
    await settle()
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it('focus returns to editor on leave', async () => {
    const { editor, wrapper } = await setup({
      content: { type: 'doc', content: [{ type: 'paragraph' }, { type: 'sketch', attrs: { boardId: 'bd_x', preview: null, height: null, version: 0 } }] },
    })
    await enter(wrapper)
    const board = document.querySelector('.me-sketch-board') as HTMLElement
    expect(document.activeElement).toBe(board)
    board.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await settle()
    expect(document.querySelector('.me-sketch-board')).toBeNull()
    const sel = editor.state.selection as unknown as { node?: { type: { name: string } }, from: number }
    expect(sel.node?.type.name).toBe('sketch')
    expect(sel.from).toBe(2)
    expect(document.activeElement).toBe(editor.view.dom)
  })

  it('backdrop mousedown closes the modal and keeps focus on the editor', async () => {
    const { editor, wrapper } = await setup({ attrs: { boardId: 'bd_x', preview: null, height: null, version: 0 } })
    await enter(wrapper)
    await wrapper.find('.me-sketch-expand').trigger('click')
    await settle()
    const modal = document.querySelector('.me-sketch-modal') as HTMLElement
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    modal.dispatchEvent(down)
    await settle()
    expect(document.querySelector('.me-sketch-modal')).toBeNull()
    // the browser would otherwise move focus to <body> after the handler focused the editor
    expect(down.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(editor.view.dom)
  })

  it('leave does not throw once the editor is destroyed', async () => {
    const { editor, wrapper } = await setup({ attrs: { boardId: 'bd_x', preview: null, height: null, version: 0 } })
    await enter(wrapper)
    const focus = vi.spyOn(editor.view, 'focus')
    const destroyed = vi.spyOn(editor, 'isDestroyed', 'get').mockReturnValue(true)
    const board = document.querySelector('.me-sketch-board') as HTMLElement
    expect(() => board.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))).not.toThrow()
    await settle()
    expect(focus).not.toHaveBeenCalled()
    destroyed.mockRestore()
  })
})

describe('clone on paste and duplicate', () => {
  const ORIGINAL = 'bd_original01'
  const PREVIEW = 'data:image/svg+xml;base64,AA'
  const attrs = { boardId: ORIGINAL, preview: PREVIEW, height: null, version: 2 }

  /** A memory provider whose board ORIGINAL holds `n` rectangles. */
  async function seeded(n = 1) {
    const base = memory()
    const conn = await base.connect(ORIGINAL)
    const store = new BoardStore(conn.doc)
    for (let i = 0; i < n; i++) store.create(rect())
    conn.destroy()
    return base
  }

  const count = async (provider: SketchProvider, id: string) => {
    const conn = await provider.connect(id)
    const size = conn.doc.getMap('elements').size
    conn.destroy()
    return size
  }

  /** Pastes `html` at the end of the document. */
  function pasteAtEnd(editor: Editor, html: string) {
    editor.commands.setTextSelection(editor.state.doc.content.size)
    editor.view.pasteHTML(html)
  }

  it('pasting a sketch whose boardId exists assigns a new id and clones state', async () => {
    const provider = await seeded(1)
    const { editor } = await setup({ provider, content: { type: 'doc', content: [{ type: 'sketch', attrs }, { type: 'paragraph' }] } })
    const html = editor.getHTML()
    const before = undoDepth(editor.state)
    pasteAtEnd(editor, html)
    const nodes = sketchNodes(editor)
    expect(nodes).toHaveLength(2)
    expect(nodes[0]!.boardId).toBe(ORIGINAL)
    expect(nodes[1]!.boardId).toMatch(/^bd_[\w-]{10}$/)
    expect(nodes[1]!.boardId).not.toBe(ORIGINAL)
    // the preview is kept
    expect(nodes[1]!.preview).toBe(PREVIEW)
    await vi.waitFor(async () => expect(await count(provider, nodes[1]!.boardId as string)).toBe(1))
    // the paste and the id rewrite are one undo step
    expect(undoDepth(editor.state)).toBe(before + 1)
    undo(editor.state, editor.view.dispatch)
    expect(sketchNodes(editor).map(n => n.boardId)).toEqual([ORIGINAL])
    // redo brings back the copy with the same new id (no second clone)
    redo(editor.state, editor.view.dispatch)
    expect(sketchNodes(editor).map(n => n.boardId)).toEqual([ORIGINAL, nodes[1]!.boardId])
  })

  it('redo of a paste does not clone again', async () => {
    const base = await seeded(1)
    const clone = vi.fn(async (_from: string, _to: string) => {})
    const provider: SketchProvider = { ...base, connect: id => base.connect(id), clone }
    const { editor } = await setup({ provider, content: { type: 'doc', content: [{ type: 'sketch', attrs }, { type: 'paragraph' }] } })
    pasteAtEnd(editor, editor.getHTML())
    const copyId = sketchNodes(editor)[1]!.boardId
    await vi.waitFor(() => expect(clone).toHaveBeenCalledWith(ORIGINAL, copyId))
    undo(editor.state, editor.view.dispatch)
    redo(editor.state, editor.view.dispatch)
    expect(sketchNodes(editor).map(n => n.boardId)).toEqual([ORIGINAL, copyId])
    await settle()
    expect(clone).toHaveBeenCalledTimes(1)
  })

  it('two pastes → two independent boards', async () => {
    const provider = await seeded(1)
    const { editor } = await setup({ provider, content: { type: 'doc', content: [{ type: 'sketch', attrs }, { type: 'paragraph' }] } })
    const html = editor.getHTML()
    pasteAtEnd(editor, html)
    pasteAtEnd(editor, html)
    const ids = sketchNodes(editor).map(n => n.boardId as string)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
    await vi.waitFor(async () => {
      expect(await count(provider, ids[1]!)).toBe(1)
      expect(await count(provider, ids[2]!)).toBe(1)
    })
    // editing one copy leaves the other and the original alone
    const conn = await provider.connect(ids[1]!)
    new BoardStore(conn.doc).create(rect())
    conn.destroy()
    expect(await count(provider, ids[1]!)).toBe(2)
    expect(await count(provider, ids[2]!)).toBe(1)
    expect(await count(provider, ORIGINAL)).toBe(1)

    // a pasted slice that holds the same board twice also gets distinct ids
    const { editor: other } = await setup({ provider })
    pasteAtEnd(other, html + html)
    const pasted = sketchNodes(other).map(n => n.boardId)
    expect(pasted).toHaveLength(2)
    expect(pasted[0]).toBe(ORIGINAL)
    expect(pasted[1]).not.toBe(ORIGINAL)
  })

  it('paste into an empty doc (no duplicate) keeps id', async () => {
    const base = await seeded(1)
    const clone = vi.fn(async () => {})
    const provider: SketchProvider = { ...base, connect: id => base.connect(id), clone }
    const { editor } = await setup({ provider, content: { type: 'doc', content: [{ type: 'sketch', attrs }] } })
    const html = editor.getHTML()
    const { editor: other } = await setup({ provider })
    pasteAtEnd(other, html)
    expect(sketchNodes(other).map(n => n.boardId)).toEqual([ORIGINAL])
    // moving the block (delete + insert in one transaction) keeps its id too
    const { state } = editor
    const node = state.doc.firstChild!
    editor.view.dispatch(state.tr.delete(0, node.nodeSize).insert(0, [state.schema.nodes.paragraph!.create(), node]))
    expect(sketchNodes(editor).map(n => n.boardId)).toEqual([ORIGINAL])
    // loading a document that already shares a board between two blocks (M2) does not rewrite it
    editor.commands.setContent({ type: 'doc', content: [{ type: 'sketch', attrs }, { type: 'sketch', attrs }] })
    expect(sketchNodes(editor).map(n => n.boardId)).toEqual([ORIGINAL, ORIGINAL])
    await settle()
    expect(clone).not.toHaveBeenCalled()
  })

  it('duplicating the block (a transaction, not a paste) assigns a new id in the same undo step', async () => {
    const base = await seeded(2)
    const clone = vi.fn((from: string, to: string) => {
      void from
      void to
      return Promise.resolve()
    })
    const provider: SketchProvider = { ...base, connect: id => base.connect(id), clone }
    const { editor } = await setup({ provider, content: { type: 'doc', content: [{ type: 'sketch', attrs }] } })
    const before = undoDepth(editor.state)
    // what the editor's duplicateBlocks does
    const { state } = editor
    const slice = state.doc.slice(0, state.doc.firstChild!.nodeSize)
    editor.view.dispatch(state.tr.insert(slice.content.size, slice.content))
    const ids = sketchNodes(editor).map(n => n.boardId)
    expect(ids[0]).toBe(ORIGINAL)
    expect(ids[1]).toMatch(/^bd_/)
    expect(ids[1]).not.toBe(ORIGINAL)
    await vi.waitFor(() => expect(clone).toHaveBeenCalledWith(ORIGINAL, ids[1]))
    expect(clone).toHaveBeenCalledTimes(1)
    expect(undoDepth(editor.state)).toBe(before + 1)
    undo(editor.state, editor.view.dispatch)
    expect(sketchNodes(editor).map(n => n.boardId)).toEqual([ORIGINAL])
  })

  it('shows "Copying board…" and disables Interact until the clone finishes', async () => {
    const base = await seeded(1)
    let finish!: () => void
    const clone = vi.fn(() => new Promise<void>(resolve => (finish = resolve)))
    const provider: SketchProvider = { ...base, connect: id => base.connect(id), clone }
    const { editor, wrapper } = await setup({ provider, content: { type: 'doc', content: [{ type: 'sketch', attrs }, { type: 'paragraph' }] } })
    pasteAtEnd(editor, editor.getHTML())
    await settle()
    const buttons = () => wrapper.findAll('.me-sketch-cover button')
    expect(buttons()).toHaveLength(2)
    expect(buttons()[1]!.text()).toBe(messages.vi.copying)
    expect(buttons()[1]!.attributes('disabled')).toBeDefined()
    expect(buttons()[0]!.attributes('disabled')).toBeUndefined()
    finish()
    await settle()
    expect(buttons()[1]!.text()).toBe(messages.vi.interact)
    expect(buttons()[1]!.attributes('disabled')).toBeUndefined()
  })

  it('clone failure shows error, no throw', async () => {
    const base = await seeded(1)
    const clone = vi.fn(async () => { throw new Error('backend down') })
    const provider: SketchProvider = { ...base, connect: id => base.connect(id), clone }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { editor, wrapper } = await setup({ provider, content: { type: 'doc', content: [{ type: 'sketch', attrs }, { type: 'paragraph' }] } })
    expect(() => pasteAtEnd(editor, editor.getHTML())).not.toThrow()
    await settle()
    const [, copy] = sketchNodes(editor)
    // the new id and the preview are kept
    expect(copy!.boardId).not.toBe(ORIGINAL)
    expect(copy!.preview).toBe(PREVIEW)
    expect(wrapper.find('.me-sketch-error').text()).toBe(messages.vi.cloneError)
    expect(warn).toHaveBeenCalled()
    // the (empty) board can still be opened
    expect(wrapper.findAll('.me-sketch-cover button')[1]!.attributes('disabled')).toBeUndefined()
  })

  it('generic clone copies through connect when the provider has no clone()', async () => {
    const { cloneBoard } = await import('../src/block/clone')
    const provider = await seeded(3)
    await cloneBoard({ connect: id => provider.connect(id) }, ORIGINAL, 'bd_copy000001')
    expect(await count(provider, 'bd_copy000001')).toBe(3)
    // memory() clones directly
    await cloneBoard(provider, ORIGINAL, 'bd_copy000002')
    expect(await count(provider, 'bd_copy000002')).toBe(3)
    // a networked connection: waits for the save before closing
    let status: 'saving' | 'saved' = 'saved'
    const listeners = new Set<(s: 'saving' | 'saved') => void>()
    const destroyed = vi.fn()
    const networked: SketchProvider = {
      async connect(id) {
        const conn = await provider.connect(id)
        conn.doc.on('update', () => {
          status = 'saving'
          setTimeout(() => {
            status = 'saved'
            for (const cb of listeners) cb('saved')
          }, 20)
        })
        return {
          ...conn,
          networked: true,
          status: { get: () => status, on: (cb) => { listeners.add(cb as never); return () => listeners.delete(cb as never) } },
          destroy: () => { destroyed(status); conn.destroy() },
        }
      },
    }
    await cloneBoard(networked, ORIGINAL, 'bd_copy000003')
    expect(destroyed).toHaveBeenLastCalledWith('saved')
    // a networked connection that ends up offline / in error loses the write unless it has an offline cache
    for (const final of ['error', 'offline'] as const) {
      for (const offline of [false, true]) {
        const lossy: SketchProvider = {
          async connect(id) {
            const conn = await provider.connect(id)
            let s: string = 'saved'
            const subs = new Set<(v: string) => void>()
            conn.doc.on('update', () => {
              s = 'saving'
              setTimeout(() => {
                s = final
                for (const cb of subs) cb(final)
              }, 10)
            })
            return {
              ...conn,
              networked: true,
              offline,
              status: { get: () => s as never, on: (cb) => { subs.add(cb as never); return () => subs.delete(cb as never) } },
            }
          },
        }
        const to = `bd_lossy_${final}_${offline}`
        if (offline) await expect(cloneBoard(lossy, ORIGINAL, to)).resolves.toBeUndefined()
        else await expect(cloneBoard(lossy, ORIGINAL, to)).rejects.toThrow(final)
      }
    }
    // an unknown source is an error (nothing to copy)
    const empty = memory()
    await expect(cloneBoard({ connect: id => empty.connect(id) }, 'bd_missing001', 'bd_x')).rejects.toThrow()
  })

  it('onPasteClone false keeps id', async () => {
    const provider = await seeded(1)
    const { editor } = await setup({ provider, onPasteClone: false, content: { type: 'doc', content: [{ type: 'sketch', attrs }, { type: 'paragraph' }] } })
    pasteAtEnd(editor, editor.getHTML())
    expect(sketchNodes(editor).map(n => n.boardId)).toEqual([ORIGINAL, ORIGINAL])
  })
})
