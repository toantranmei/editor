import { Editor, type JSONContent } from '@tiptap/vue-3'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions } from '../src/extensions'
import { defaultBlocks } from '../src/blocks'
import { text } from '../src/blocks/basic'
import { looksLikeMarkdown, MARKDOWN_PASTE_MAX, markdownToBlocks, parseInline } from '../src/extensions/markdown-paste'

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
function paste(e: Editor, plain: string, html = '', shift = false, lastKeyCode: number | null = null) {
  const input = (e.view as unknown as { input: { shiftKey: boolean, lastKeyCode: number | null } }).input
  input.shiftKey = shift
  input.lastKeyCode = lastKeyCode
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
    const blocks = markdownToBlocks('1. one\n2. two\n   - nested\n\nbetween\n\n5) five\n6) six\n\n- [x] done\n- [ ] todo\n\n> quoted **b**\n\n---\n\n[site](https://example.com) and [bad](javascript:alert(1))')
    expect(blocks.map(b => b.type)).toEqual(['orderedList', 'paragraph', 'orderedList', 'taskList', 'blockquote', 'horizontalRule', 'paragraph'])
    expect(blocks[0]!.content![1]!.content![1]).toMatchObject({ type: 'bulletList', content: [{ type: 'listItem' }] })
    expect(blocks[2]!.attrs).toEqual({ start: 5 })
    expect(blocks[3]!.content!.map(i => i.attrs!.checked)).toEqual([true, false])
    expect(blocks[4]!.content![0]!.content![1]).toEqual({ type: 'text', text: 'b', marks: [{ type: 'bold' }] })
    const links = blocks[6]!.content!
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

  it('needs clear Markdown: a lone list line or a numbered sentence keeps the plain paste', () => {
    for (const plain of ['Dear Bob,\nthanks.\n- Alice', '2024. A great year\nWe did - things', 'Totals:\n1) apples', '#hashtag is fun', '> just one quoted line', '---'])
      expect(looksLikeMarkdown(plain), plain).toBe(false)
    for (const md of ['# Title', '- a\n- b', '1. a\n2. b', '- [ ] todo', '```\ncode\n```'])
      expect(looksLikeMarkdown(md), md).toBe(true)
    // An unclosed fence or an indented "#" isn't enough either.
    expect(looksLikeMarkdown('```\nnot closed')).toBe(false)
    expect(looksLikeMarkdown('    # code')).toBe(false)
  })

  it('keeps line breaks of text lines and does not turn "2024." into a list', () => {
    const blocks = markdownToBlocks('# T\nDear Bob,\nthanks.\n2024. A great year\n7) and so on')
    expect(blocks.map(b => b.type)).toEqual(['heading', 'paragraph', 'paragraph', 'paragraph', 'paragraph'])
    expect(blocks.slice(1).map(b => b.content![0]!.text)).toEqual(['Dear Bob,', 'thanks.', '2024. A great year', '7) and so on'])
  })

  it('no emphasis inside words', () => {
    for (const plain of ['__init__.py', '2*3*4', 'snake_case_name', 'a_b_', 'file__name__x'])
      expect(parseInline(plain), plain).toEqual([{ type: 'text', text: plain }])
    expect(parseInline('(**b**), _i_.')).toEqual([
      { type: 'text', text: '(' },
      { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
      { type: 'text', text: '), ' },
      { type: 'text', text: 'i', marks: [{ type: 'italic' }] },
      { type: 'text', text: '.' },
    ])
  })

  it('Shift+Mod+V (paste as plain text) is never converted', () => {
    const e = editor()
    expect(paste(e, SAMPLE, '', true)).toBe(false)
  })

  it('bare URLs become links, without running paste rules over escapes and words', () => {
    const e = editor()
    expect(paste(e, '- see https://example.com/a_(b), then.\n- see __init__.py and \\*lit\\* and \\_x\\_')).toBe(true)
    const list: JSONContent = e.getJSON().content![0]!
    const items = list.content!.map(li => li.content![0]!.content!)
    expect(items[0]).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'text', text: 'https://example.com/a_(b)', marks: [{ type: 'link', attrs: expect.objectContaining({ href: 'https://example.com/a_(b)' }) }] },
      { type: 'text', text: ', then.' },
    ])
    expect(items[1]).toEqual([{ type: 'text', text: 'see __init__.py and *lit* and _x_' }])
  })

  it('Shift+Insert converts like a normal paste (only Shift+Mod+V is plain)', () => {
    const e = editor()
    expect(paste(e, SAMPLE, '', true, 45)).toBe(true)
  })

  it('deeply nested emphasis does not overflow; deeper delimiters stay text', () => {
    const deep = `${'*_'.repeat(2000)}x${'_*'.repeat(2000)}`
    expect(() => parseInline(deep)).not.toThrow()
    const e = editor()
    expect(paste(e, `- ${deep}\n- b`)).toBe(true)
    expect(e.getText()).toContain('x')
  })

  it('stays fast on adversarial input (linear parsers, bounded nesting)', () => {
    const size = 200_000
    const inputs = {
      'heading spaces': `# a${' '.repeat(size)}b`,
      'heading hashes': `# a${' #'.repeat(size / 2)}b`,
      'open brackets': `${'['.repeat(size)}]`,
      'link starts': '[a]('.repeat(size / 4),
      'link titles': '[x](a "'.repeat(size / 7),
      'stars': '*x '.repeat(size / 3),
      'underscores': '__a '.repeat(size / 4),
      'tildes': '~~a '.repeat(size / 4),
      'backticks': '`a '.repeat(size / 3),
      'deep quote': `${'>'.repeat(size)} x`,
      'deep list': Array.from({ length: 2000 }, (_, i) => `${' '.repeat(i)}- x`).join('\n'),
      'list spaces': `${' '.repeat(size / 2)}-${' '.repeat(size / 2)}x`,
      'prose': (`${'lorem ipsum dolor sit amet '.repeat(3)}\n`).repeat(size / 82),
    }
    for (const [name, input] of Object.entries(inputs)) {
      const start = performance.now()
      looksLikeMarkdown(input)
      markdownToBlocks(input)
      expect(performance.now() - start, name).toBeLessThan(200)
    }
  })

  it('a paste near the size cap converts in reasonable time', () => {
    const e = editor()
    const md = '# Title\n\n- item with **bold** and `code`\n- [link](https://example.com)\n\n'
    const text = md.repeat(Math.floor(MARKDOWN_PASTE_MAX / md.length))
    const start = performance.now()
    expect(paste(e, text)).toBe(true)
    expect(performance.now() - start).toBeLessThan(1500)
  })

  it('very long pastes stay plain', () => {
    expect(looksLikeMarkdown(`# big\n${'x'.repeat(MARKDOWN_PASTE_MAX)}`)).toBe(false)
  })
})
