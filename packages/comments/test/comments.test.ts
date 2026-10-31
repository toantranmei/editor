import { Editor, EditorContent, type JSONContent } from '@tiptap/vue-3'
import { TextSelection } from '@tiptap/pm/state'
import { createExtensions, text } from '@toantranmei/editor'
import { collaborationExtensions } from '@toantranmei/editor/collaboration'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, ref } from 'vue'
import * as Y from 'yjs'
import {
  type Anchor, comments, CommentsGutter, CommentsPanel, commentsPluginKey, type CommentsLevel, type CommentsSource, indexDocument,
  bodyHtml, selectionAnchor, type Thread, threadRanges, useCommentsState,
} from '../src'

const editors: Editor[] = []
const wrappers: VueWrapper[] = []
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
  for (const e of editors.splice(0)) e.destroy()
  document.body.innerHTML = ''
})

const body = (s: string): JSONContent => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: s }] }] })

/** In-memory adapter (what an app implements against the API). */
function fakeSource(initial: Thread[] = []) {
  const me = ref<{ id: string, name: string } | null>({ id: 'u1', name: 'An' })
  const threads = ref<Thread[]>(initial)
  let n = 0
  const now = () => new Date(Date.UTC(2026, 9, 30, 8, n)).toISOString()
  const source: CommentsSource = {
    me,
    threads,
    create: vi.fn(async (anchor: Anchor, b: JSONContent) => {
      const t: Thread = { id: `t${++n}`, anchor, resolved_at: null, comments: [{ id: `c${n}`, author: { id: me.value!.id, name: me.value!.name }, body: b, created_at: now() }] }
      threads.value = [...threads.value, t]
      return t
    }),
    reply: vi.fn(async (threadId: string, b: JSONContent) => {
      const c = { id: `c${++n}`, author: { id: me.value!.id, name: me.value!.name }, body: b, created_at: now() }
      threads.value = threads.value.map(t => (t.id === threadId ? { ...t, comments: [...t.comments, c] } : t))
      return c
    }),
    edit: vi.fn(async (commentId: string, b: JSONContent) => {
      threads.value = threads.value.map(t => ({ ...t, comments: t.comments.map(c => (c.id === commentId ? { ...c, body: b, edited_at: now() } : c)) }))
    }),
    remove: vi.fn(async (commentId: string) => {
      threads.value = threads.value.map(t => ({ ...t, comments: t.comments.filter(c => c.id !== commentId) })).filter(t => t.comments.length)
    }),
    resolve: vi.fn(async (threadId: string, resolved: boolean) => {
      threads.value = threads.value.map(t => (t.id === threadId ? { ...t, resolved_at: resolved ? now() : null } : t))
    }),
    people: vi.fn(async (q: string) => [{ id: 'u2', name: 'Bình' }].filter(p => p.name.toLowerCase().includes(q.toLowerCase()))),
  }
  return source
}

const doc: JSONContent = {
  type: 'doc',
  content: [
    { type: 'paragraph', attrs: { id: 'b1' }, content: [{ type: 'text', text: 'Hello brave new world' }] },
    { type: 'paragraph', attrs: { id: 'b2' }, content: [{ type: 'text', text: 'Second block here' }] },
  ],
}

function setup(source: CommentsSource | null, opts: { level?: CommentsLevel, editable?: boolean, collab?: Y.Doc, content?: JSONContent } = {}) {
  const block = comments.configure({ source, level: opts.level ?? 'edit' })
  const editor = new Editor({
    extensions: [
      ...createExtensions({ blocks: [text, block], locale: 'en', undoRedo: !opts.collab }),
      ...(opts.collab ? collaborationExtensions({ document: opts.collab }) : []),
    ],
    content: opts.collab ? undefined : opts.content ?? doc,
    editable: opts.editable ?? true,
  })
  editors.push(editor)
  const wrapper = mount({ render: () => h('div', { class: 'me-root' }, [h(EditorContent, { editor })]) }, { attachTo: document.body })
  wrappers.push(wrapper)
  return { editor, block }
}

/** Selects `needle` inside the block with `blockId`. */
function select(editor: Editor, needle: string) {
  let from = -1
  editor.state.doc.descendants((node, pos) => {
    if (from < 0 && node.isText && node.text!.includes(needle)) from = pos + node.text!.indexOf(needle)
  })
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, from + needle.length)))
  return { from, to: from + needle.length }
}

const highlights = (editor: Editor) => commentsPluginKey.getState(editor.state)!.decorations.find().map(d => ({ from: d.from, to: d.to, id: d.spec.threadId as string | undefined }))

describe('comment mark', () => {
  it('marks text, is not inclusive, and lets threads overlap', () => {
    const { editor } = setup(null)
    const r = select(editor, 'brave new')
    editor.commands.setComment('t1')
    editor.commands.setComment('t2', { from: r.from + 6, to: r.to + 6 })
    const index = indexDocument(editor.state.doc)
    expect(index.marks.get('t1')).toEqual([{ from: r.from, to: r.to }])
    expect(index.marks.get('t2')).toEqual([{ from: r.from + 6, to: r.to + 6 }])
    // Typing right after the commented text isn't commented.
    editor.chain().setTextSelection(r.to).insertContent('X').run()
    expect(indexDocument(editor.state.doc).marks.get('t1')).toEqual([{ from: r.from, to: r.to }])
    editor.commands.unsetComment('t1')
    expect(indexDocument(editor.state.doc).marks.has('t1')).toBe(false)
  })

  it('syncs through Yjs in collaboration mode', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    a.on('update', u => Y.applyUpdate(b, u))
    b.on('update', u => Y.applyUpdate(a, u))
    const { editor: ea } = setup(null, { collab: a })
    const { editor: eb } = setup(null, { collab: b })
    ea.commands.setContent(doc)
    expect(eb.getText()).toContain('brave new')
    select(ea, 'brave')
    ea.commands.setComment('t9')
    expect(indexDocument(eb.state.doc).marks.get('t9')?.length).toBe(1)
    expect(JSON.stringify(eb.getJSON())).toContain('"threadId":"t9"')
  })
})

describe('anchors and highlights', () => {
  it('anchors a selection by block id + quote', () => {
    const { editor } = setup(null)
    select(editor, 'Second block')
    expect(selectionAnchor(editor.state)?.anchor).toEqual({ kind: 'text', block_id: 'b2', quote: 'Second block' })
  })

  it('highlights marked threads, quote-only threads, the active one; not resolved ones', async () => {
    const source = fakeSource([
      { id: 'q1', anchor: { kind: 'text', block_id: 'b2', quote: 'block' }, resolved_at: null, comments: [] },
      { id: 'q2', anchor: { kind: 'text', block_id: 'b1', quote: 'Hello' }, resolved_at: '2026-10-30T00:00:00Z', comments: [] },
      { id: 'm1', anchor: { kind: 'text', block_id: 'b1', quote: 'world' }, resolved_at: null, comments: [] },
    ])
    const { editor } = setup(source)
    const r = select(editor, 'world')
    editor.commands.setComment('m1')
    await nextTick()
    const list = highlights(editor)
    expect(list.map(d => d.id).sort()).toEqual(['m1', 'q1'])
    expect(list.find(d => d.id === 'm1')).toMatchObject(r)
    expect(threadRanges(source.threads.value[0]!, indexDocument(editor.state.doc))[0]).toBeTruthy()
    useCommentsState(source).activeId.value = 'q1'
    await nextTick()
    expect(editor.view.dom.querySelector('.me-comment-highlight.is-active')?.textContent).toBe('block')
  })
})

describe('creating comments', () => {
  it('editors: creates the thread and marks the text', async () => {
    const source = fakeSource()
    const { editor, block } = setup(source)
    select(editor, 'brave')
    const action = block.formatActions![0]!
    expect(action.isVisible!(editor)).toBe(true)
    action.run(editor)
    const state = useCommentsState(source)
    expect(state.draft.value?.anchor).toEqual({ kind: 'text', block_id: 'b1', quote: 'brave' })
    // Edits before sending keep the range.
    editor.chain().setTextSelection(1).insertContent('Oh, ').run()
    const thread = await state.submitDraft(body('Nice'))
    expect(source.create).toHaveBeenCalledWith({ kind: 'text', block_id: 'b1', quote: 'brave' }, body('Nice'))
    const range = indexDocument(editor.state.doc).marks.get(thread!.id)![0]!
    expect(editor.state.doc.textBetween(range.from, range.to)).toBe('brave')
    expect(state.draft.value).toBeNull()
    expect(state.activeId.value).toBe(thread!.id)
  })

  it('comment-only (read-only editor): the action shows, no mark is added, the quote is highlighted', async () => {
    const source = fakeSource()
    const { editor, block } = setup(source, { level: 'comment', editable: false })
    select(editor, 'Second')
    expect(editor.storage.meiConfig.formatActions.map(a => a.id)).toEqual(['comment'])
    expect(block.formatActions![0]!.isVisible!(editor)).toBe(true)
    block.formatActions![0]!.run(editor)
    const thread = await useCommentsState(source).submitDraft(body('Hi'))
    expect(JSON.stringify(editor.getJSON())).not.toContain('threadId')
    await nextTick()
    expect(highlights(editor).map(h => h.id)).toEqual([thread!.id])
  })

  it('view level or signed out: no action', () => {
    const source = fakeSource()
    const { editor, block } = setup(source, { level: 'view', editable: false })
    select(editor, 'Second')
    expect(block.formatActions![0]!.isVisible!(editor)).toBe(false)
    const other = comments.configure({ source, level: 'comment' })
    source.me.value = null
    expect(other.formatActions![0]!.isVisible!(editor)).toBe(false)
  })

  it('renders as plain text on public pages', async () => {
    const { renderHTML } = await import('@toantranmei/editor/render')
    const html = renderHTML({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'comment', attrs: { threadId: 't' } }] }] }] }, { blocks: [comments], wrap: false })
    expect(html).toBe('<p>x</p>')
  })
})

describe('bodyHtml', () => {
  it('escapes text, keeps safe links and mentions, drops unsafe links', () => {
    const html = bodyHtml({ type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: '<b>x</b> ', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'ok', marks: [{ type: 'link', attrs: { href: 'https://a.test/?q="1"' } }] },
      { type: 'text', text: 'bad', marks: [{ type: 'link', attrs: { href: ' java\tscript:alert(1)' } }] },
      { type: 'mention', attrs: { id: 'u"2', label: '<Bình>', kind: 'user' } },
    ] }] })
    expect(html).toBe('<p><strong>&lt;b&gt;x&lt;/b&gt; </strong><a href="https://a.test/?q=&quot;1&quot;" target="_blank" rel="noopener noreferrer nofollow">ok</a>bad'
      + '<span class="me-mention me-mention--user" data-type="mention" data-id="u&quot;2"><span>@&lt;Bình&gt;</span></span></p>')
  })
})

describe('<CommentsPanel>', () => {
  const thread = (id: string, quote: string, authorId: string, extra: Partial<Thread> = {}): Thread => ({
    id,
    anchor: { kind: 'text', block_id: 'b1', quote },
    resolved_at: null,
    comments: [{ id: `${id}-c`, author: { id: authorId, name: authorId === 'u1' ? 'An' : 'Bình' }, body: body(`about ${quote} <script>alert(1)</script>`), created_at: '2026-10-30T08:00:00Z' }],
    ...extra,
  })

  it('lists open / resolved threads, replies, resolves, edits own comments only', async () => {
    const source = fakeSource([thread('a', 'world', 'u1'), thread('b', 'Hello', 'u2'), thread('c', 'brave', 'u2', { resolved_at: '2026-10-30T09:00:00Z' })])
    const { editor } = setup(source)
    const panel = mount(CommentsPanel, { props: { source, editor, locale: 'en' }, attachTo: document.body })
    wrappers.push(panel)
    await flushPromises()
    const cards = () => panel.findAll('.me-comment-thread')
    // Open threads in document order: "Hello" (b) before "world" (a).
    expect(cards().map(c => c.attributes('data-thread-id'))).toEqual(['b', 'a'])
    expect(panel.html()).not.toContain('<script>')
    expect(panel.html()).toContain('&lt;script&gt;')
    // Only my comment has the ⋯ menu.
    expect(cards()[1]!.find('.me-comment-more').exists()).toBe(true)
    expect(cards()[0]!.find('.me-comment-more').exists()).toBe(false)

    await cards()[1]!.trigger('click')
    expect(useCommentsState(source).activeId.value).toBe('a')
    expect(cards()[1]!.find('.me-comment-composer').exists()).toBe(true)

    await cards()[1]!.find('.me-comment-resolve').trigger('click')
    await flushPromises()
    expect(source.resolve).toHaveBeenCalledWith('a', true)
    expect(cards().map(c => c.attributes('data-thread-id'))).toEqual(['b'])

    const tabs = panel.findAll('.me-tab')
    await tabs[1]!.trigger('click')
    expect(cards().map(c => c.attributes('data-thread-id')).sort()).toEqual(['a', 'c'])
  })

  it('view level: no composer or resolve', async () => {
    const source = fakeSource([thread('a', 'world', 'u1')])
    const panel = mount(CommentsPanel, { props: { source, level: 'view', locale: 'vi' }, attachTo: document.body })
    wrappers.push(panel)
    await panel.find('.me-comment-thread').trigger('click')
    expect(panel.find('.me-comment-resolve').exists()).toBe(false)
    expect(panel.find('.me-comment-composer').exists()).toBe(false)
    expect(panel.text()).toContain('Bạn chỉ có quyền xem bình luận')
  })

  it('shows the draft composer and sends with the composer', async () => {
    const source = fakeSource()
    const { editor, block } = setup(source)
    select(editor, 'world')
    block.formatActions![0]!.run(editor)
    const panel = mount(CommentsPanel, { props: { source, editor, locale: 'zh' }, attachTo: document.body })
    wrappers.push(panel)
    await nextTick()
    expect(panel.find('.me-comment-thread.is-draft .me-comment-quote').text()).toBe('world')
    const composer = panel.findComponent({ name: 'CommentComposer' })
    ;(composer.vm as unknown as { editor: Editor }).editor.commands.setContent(body('看起来不错'))
    await (composer.vm as unknown as { submit: () => Promise<void> }).submit()
    await flushPromises()
    expect(source.create).toHaveBeenCalledOnce()
    expect(source.threads.value[0]!.comments[0]!.body).toEqual(body('看起来不错'))
    expect(panel.find('.is-draft').exists()).toBe(false)
  })
})

describe('<CommentsGutter>', () => {
  it('shows one badge per block with open threads', async () => {
    const source = fakeSource([
      { id: 'a', anchor: { kind: 'text', block_id: 'b1', quote: 'Hello' }, resolved_at: null, comments: [] },
      { id: 'b', anchor: { kind: 'block', block_id: 'b1' }, resolved_at: null, comments: [] },
      { id: 'c', anchor: { kind: 'text', block_id: 'b2', quote: 'Second' }, resolved_at: null, comments: [] },
      { id: 'd', anchor: { kind: 'text', block_id: 'b2', quote: 'here' }, resolved_at: '2026-10-30T00:00:00Z', comments: [] },
    ])
    const { editor } = setup(source)
    const onOpen = vi.fn()
    const gutter = mount(CommentsGutter, { props: { editor, source, locale: 'en', onOpen }, attachTo: document.body })
    wrappers.push(gutter)
    const find = () => [...document.querySelectorAll<HTMLElement>('.me-root .me-comments-badge')]
    await vi.waitFor(() => expect(find()).toHaveLength(2))
    const badges = find()
    expect(badges.map(b => [b.dataset.blockId, b.textContent!.trim()])).toEqual([['b1', '2'], ['b2', '1']])
    badges[0]!.click()
    expect(onOpen).toHaveBeenCalledWith(['a', 'b'])
    expect(useCommentsState(source).activeId.value).toBe('a')
  })
})
