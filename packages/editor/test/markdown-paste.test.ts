import { Editor } from '@tiptap/vue-3'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions } from '../src/extensions'
import { defaultBlocks } from '../src/blocks'
import { text } from '../src/blocks/basic'
import { looksLikeMarkdown, markdownToBlocks, parseInline } from '../src/extensions/markdown-paste'

const editors: Editor[] = []
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy()
})

function editor(blocks = [text, ...defaultBlocks]) {
  const e = new Editor({ extensions: createExtensions({ blocks }), content: '<p></p>' })
  editors.push(e)
  return e
}

/** A real paste event through ProseMirror's handlePaste props. */
function paste(e: Editor, plain: string, html = '') {
  const event = new Event('paste') as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => (type === 'text/plain' ? plain : type === 'text/html' ? html : '') } })
  return e.view.someProp('handlePaste', f => f(e.view, event, e.state.doc.slice(0, 0))) ?? false
}

const SAMPLE = '# Pasted md heading\n\n- md bullet one\n- md bullet two\n\n**md bold** and `md code`\n\n```js\nconst md = 1\n```'

describe('markdown paste (KS-BUG-11)', () => {
  it('the kitchen-sink sample becomes heading, list, marked paragraph and code block', () => {
    const e = editor()
    expect(paste(e, SAMPLE)).toBe(true)
    // (The editor keeps an empty paragraph after a trailing code block.)
    const json = e.getJSON().content!.filter(n => n.type !== 'paragraph' || n.content).map(({ attrs, ...n }) => ({ ...n, ...(attrs?.level ? { level: attrs.level } : {}), ...(attrs?.language ? { language: attrs.language } : {}) }))
    expect(json.map(n => n.type)).toEqual(['heading', 'bulletList', 'paragraph', 'codeBlock'])
    expect(json[0]).toMatchObject({ level: 1, content: [{ text: 'Pasted md heading' }] })
    expect(e.state.doc.child(1).textContent).toBe('md bullet onemd bullet two')
    expect(json[2]!.content).toEqual([
      { type: 'text', text: 'md bold', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' and ' },
      { type: 'text', text: 'md code', marks: [{ type: 'code' }] },
    ])
    expect(json[3]).toMatchObject({ language: 'js', content: [{ text: 'const md = 1' }] })
  })

  it('nested, numbered and task lists, quotes, dividers, links', () => {
    const blocks = markdownToBlocks('1. one\n2. two\n   - nested\n\n5) five\n\n- [x] done\n- [ ] todo\n\n> quoted **b**\n\n---\n\n[site](https://example.com) and [bad](javascript:alert(1))')
    expect(blocks.map(b => b.type)).toEqual(['orderedList', 'orderedList', 'taskList', 'blockquote', 'horizontalRule', 'paragraph'])
    expect(blocks[0]!.content![1]!.content![1]).toMatchObject({ type: 'bulletList', content: [{ type: 'listItem' }] })
    expect(blocks[1]!.attrs).toEqual({ start: 5 })
    expect(blocks[2]!.content!.map(i => i.attrs!.checked)).toEqual([true, false])
    expect(blocks[3]!.content![0]!.content![1]).toEqual({ type: 'text', text: 'b', marks: [{ type: 'bold' }] })
    const links = blocks[5]!.content!
    expect(links[0]).toEqual({ type: 'text', text: 'site', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] })
    expect(links.some(n => JSON.stringify(n).includes('javascript'))).toBe(false)
  })

  it('inline: italic, strike, escapes; snake_case stays text', () => {
    expect(parseInline('*a* ~~s~~ \\*not\\* snake_case_name')).toEqual([
      { type: 'text', text: 'a', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 's', marks: [{ type: 'strike' }] },
      { type: 'text', text: ' *not* snake_case_name' },
    ])
  })

  it('leaves plain text, HTML pastes and code blocks alone', () => {
    expect(looksLikeMarkdown('plain line one\nplain line two\n\nplain line four')).toBe(false)
    const e = editor()
    expect(paste(e, 'plain line one\nplain line two')).toBe(false)
    expect(paste(e, SAMPLE, '<h1>x</h1>')).toBe(false)
    e.commands.setContent({ type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }] })
    e.commands.setTextSelection(2)
    expect(paste(e, SAMPLE)).toBe(false)
  })

  it('falls back to plain blocks when a block type is not loaded', () => {
    const e = editor([text])
    expect(paste(e, '# Title\n\n- a\n- [ ] b')).toBe(true)
    expect(e.getJSON().content!.every(n => n.type === 'paragraph')).toBe(true)
    expect(e.getText()).toContain('Title')
  })
})
