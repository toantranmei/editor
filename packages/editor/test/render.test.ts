// @vitest-environment node
import type { JSONContent } from '@tiptap/core'
import katex from 'katex'
import { describe, expect, it } from 'vitest'
import { hasMath, renderHTML, renderHTMLAsync, renderTokensStyle, safeUrl } from '../src/render'

const p = (text: string, attrs?: Record<string, unknown>): JSONContent => ({ type: 'paragraph', attrs, content: text ? [{ type: 'text', text }] : undefined })
const t = (text: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text, marks })

/** One of every built-in block (default + opt-in). */
export const everyBlock: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { id: 'h-intro', level: 1 }, content: [t('Intro')] },
    { type: 'tableOfContents', attrs: { id: 'toc1' } },
    {
      type: 'paragraph',
      attrs: { id: 'p1', blockColor: 'red', blockBg: null },
      content: [
        t('Bold', [{ type: 'bold' }]), t(' '), t('italic', [{ type: 'italic' }]), t(' '), t('under', [{ type: 'underline' }]), t(' '),
        t('strike', [{ type: 'strike' }]), t(' '), t('code', [{ type: 'code' }]), t(' '),
        t('link', [{ type: 'link', attrs: { href: 'https://example.com' } }]), t(' '),
        t('local', [{ type: 'link', attrs: { href: '/notes/abc' } }]), t(' '),
        t('red', [{ type: 'textColor', attrs: { color: 'red' } }]), t(' '),
        t('hl', [{ type: 'bgColor', attrs: { color: 'yellow' } }]),
        { type: 'hardBreak' },
        t('line 2 '),
        { type: 'mention', attrs: { id: 'u1', label: 'An', kind: 'user', href: '/u/u1', avatar: 'https://cdn.example.com/a.png' } },
        t(' '),
        { type: 'mention', attrs: { id: 'pg1', label: 'Roadmap', kind: 'page', href: '/notes/pg1' } },
        t(' '),
        { type: 'mention', attrs: { id: '2026-12-25', label: '25 Dec 2026', kind: 'date', format: 'iso' } },
        t(' '),
        { type: 'mathInline', attrs: { latex: 'x^2' } },
        t(' 🎉'),
      ],
    },
    { type: 'heading', attrs: { id: 'h2', level: 2 }, content: [t('Lists')] },
    { type: 'bulletList', attrs: { id: 'ul1' }, content: [{ type: 'listItem', content: [p('One', { id: 'li1' }), { type: 'bulletList', content: [{ type: 'listItem', content: [p('Nested')] }] }] }] },
    { type: 'orderedList', attrs: { id: 'ol1', start: 3 }, content: [{ type: 'listItem', content: [p('Three')] }] },
    { type: 'taskList', attrs: { id: 'tl1' }, content: [{ type: 'taskItem', attrs: { checked: true }, content: [p('Done')] }, { type: 'taskItem', attrs: { checked: false }, content: [p('Todo')] }] },
    { type: 'blockquote', attrs: { id: 'q1' }, content: [p('Quote')] },
    { type: 'horizontalRule', attrs: { id: 'hr1' } },
    { type: 'codeBlock', attrs: { id: 'c1', language: 'ts' }, content: [t('const a: number = 1 // <tag>')] },
    { type: 'codeBlock', attrs: { id: 'c2', language: 'mermaid' }, content: [t('graph TD\n  A-->B')] },
    { type: 'image', attrs: { id: 'img1', src: 'https://cdn.example.com/cat.png', alt: 'Cat', width: 50, align: 'left', caption: 'A cat', showCaption: true } },
    { type: 'image', attrs: { id: 'img2', src: 'data:image/png;base64,iVBORw0KGgo=', width: 100, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5, ratio: 1.5 } } },
    { type: 'embed', attrs: { id: 'e1', src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', height: 360 } },
    { type: 'callout', attrs: { id: 'co1', icon: '⚠️', color: 'yellow' }, content: [p('Careful')] },
    { type: 'details', attrs: { id: 'd1', open: true }, content: [{ type: 'detailsSummary', content: [t('Toggle')] }, { type: 'detailsContent', content: [p('Hidden')] }] },
    { type: 'details', attrs: { id: 'd2', level: 2 }, content: [{ type: 'detailsSummary', content: [t('Toggle heading')] }, { type: 'detailsContent', content: [p('Body')] }] },
    {
      type: 'table',
      attrs: { id: 'tb1' },
      content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', attrs: { colwidth: [120] }, content: [p('Name')] }, { type: 'tableHeader', content: [p('Score')] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', attrs: { color: 'green' }, content: [p('An')] }, { type: 'tableCell', content: [p('9')] }] },
      ],
    },
    { type: 'columns', attrs: { id: 'cols1' }, content: [{ type: 'column', content: [p('Left')] }, { type: 'column', content: [p('Right')] }] },
    { type: 'mathBlock', attrs: { id: 'm1', latex: '\\frac{a}{b}' } },
    { type: 'fileBlock', attrs: { id: 'f1', src: 'https://cdn.example.com/r.pdf', name: 'report.pdf', size: 2048, kind: 'file' } },
    { type: 'fileBlock', attrs: { id: 'f2', src: 'https://cdn.example.com/a.mp3', name: 'a.mp3', kind: 'audio' } },
    { type: 'fileBlock', attrs: { id: 'f3', src: 'https://cdn.example.com/v.mp4', name: 'v.mp4', kind: 'video' } },
    { type: 'htmlBlock', attrs: { id: 'hb1', code: '<b>hi</b><script>alert(1)</script>', height: 200 } },
    { type: 'unknownBlock', attrs: { data: { type: 'paragraph', content: [t('kept')] } } },
    { type: 'someFutureBlock', attrs: { id: 'x1' }, content: [p('Inside unknown')] },
    p(''),
  ],
}

describe('renderHTML', () => {
  it('renders every built-in block (snapshot)', () => {
    expect(renderHTML(everyBlock, { locale: 'en', katex })).toMatchSnapshot()
  })

  it('runs without a DOM', () => {
    expect(typeof document).toBe('undefined')
    expect(renderHTML({ type: 'doc', content: [p('Hi')] })).toBe('<div class="me-scope me-root me-render"><div class="me-content"><p>Hi</p></div></div>')
  })

  it('anchors headings by block id, slugs without one, and links them from the TOC', () => {
    const html = renderHTML({
      type: 'doc',
      content: [
        { type: 'tableOfContents' },
        { type: 'heading', attrs: { level: 1 }, content: [t('Kế hoạch Q4')] },
        { type: 'heading', attrs: { level: 2 }, content: [t('Kế hoạch Q4')] },
        { type: 'heading', attrs: { level: 2, id: 'abc' }, content: [t('Other')] },
      ],
    }, { wrap: false })
    expect(html).toContain('<h1 id="ke-hoach-q4">')
    expect(html).toContain('<h2 id="ke-hoach-q4-2">')
    expect(html).toContain('<h2 id="abc" data-id="abc">')
    expect(html).toContain('href="#ke-hoach-q4-2"')
    expect(html).toContain('data-depth="1" href="#abc"')
  })

  it('highlights code on the server', () => {
    const html = renderHTML({ type: 'doc', content: [{ type: 'codeBlock', attrs: { language: 'python' }, content: [t('def f(): return "x"')] }] })
    expect(html).toContain('<span class="hljs-keyword">def</span>')
    expect(html).toContain('<span class="hljs-string">&quot;x&quot;</span>')
  })

  it('renders math with KaTeX when given, TeX source otherwise', () => {
    const doc: JSONContent = { type: 'doc', content: [{ type: 'mathBlock', attrs: { latex: 'a<b' } }] }
    expect(renderHTML(doc, { katex })).toContain('class="katex-display"')
    expect(renderHTML(doc)).toContain('<code class="me-math-source">a&lt;b</code>')
    expect(hasMath(doc)).toBe(true)
  })

  it('renderHTMLAsync loads KaTeX when the document has math', async () => {
    const html = await renderHTMLAsync({ type: 'doc', content: [p('x'), { type: 'mathBlock', attrs: { latex: 'x^2' } }] })
    expect(html).toContain('class="katex')
  })

  it('uses block render hooks and their messages', () => {
    const html = renderHTML({ type: 'doc', content: [{ type: 'invoice', attrs: { total: 5 } }, p('a', { id: 'x' })] }, {
      blocks: [{ name: 'invoice', render: { nodes: { invoice: (node, ctx) => `<div class="inv"${ctx.attr('data-total', node.attrs?.total)}></div>` }, marks: {} } }],
      wrap: false,
    })
    expect(html).toBe('<div class="inv" data-total="5"></div><p data-id="x">a</p>')
  })

  it('wraps with theme and class', () => {
    expect(renderHTML({ type: 'doc', content: [] }, { theme: 'dark', className: 'page "x"' })).toBe('<div class="me-scope me-root me-render me-dark page &quot;x&quot;"><div class="me-content"></div></div>')
  })

  it('tokens style', () => {
    const style = renderTokensStyle({ color: { accent: '#7c3aed' } })
    expect(style.startsWith('<style id="mei-editor-tokens">')).toBe(true)
    expect(style).toContain('--me-color-accent:#7c3aed')
  })
})

describe('XSS', () => {
  const render = (content: JSONContent[]) => renderHTML({ type: 'doc', content }, { wrap: false })

  it('escapes text and attributes', () => {
    const html = render([
      p('<img src=x onerror=alert(1)>'),
      { type: 'callout', attrs: { icon: '"><script>alert(1)</script>', color: 'red" onclick="x' }, content: [p('a')] },
      { type: 'image', attrs: { src: 'https://x.test/a.png', alt: '" onerror="alert(1)', caption: '<b>c</b>', showCaption: true } },
      { type: 'paragraph', attrs: { id: '"><script>' }, content: [t('x')] },
      { type: 'codeBlock', attrs: { language: '"><script>' }, content: [t('</code><script>alert(1)</script>')] },
      { type: 'mathBlock', attrs: { latex: '</code><script>' } },
    ])
    expect(html).not.toMatch(/<script|<img src=x|onerror="alert|onclick="/)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('data-color="gray"') // invalid color dropped
    expect(html).toContain('class="hljs language-plaintext"')
  })

  it('allow-lists URL schemes', () => {
    const bad = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' java\tscript:alert(1)', 'vbscript:x', 'data:text/html,<script>alert(1)</script>', '\\\\evil.com']
    for (const href of bad) {
      const html = render([{ type: 'paragraph', content: [t('x', [{ type: 'link', attrs: { href } }])] }])
      expect(html, href).toBe('<p>x</p>')
    }
    expect(safeUrl('mailto:a@b.c')).toBe('mailto:a@b.c')
    expect(safeUrl('/relative?q=1#h')).toBe('/relative?q=1#h')
    expect(safeUrl('https://ok.test')).toBe('https://ok.test')
    expect(safeUrl('data:image/png;base64,AAAA', 'media')).toBe('data:image/png;base64,AAAA')
    expect(safeUrl('data:image/png;base64,AAAA', 'link')).toBeNull()
    expect(safeUrl('data:text/html,x', 'download')).toBeNull()
    expect(safeUrl('/same-origin', 'frame')).toBeNull()
  })

  it('drops unsafe media, embeds and mentions', () => {
    const html = render([
      { type: 'image', attrs: { src: 'javascript:alert(1)' } },
      { type: 'embed', attrs: { src: 'javascript:alert(1)' } },
      { type: 'embed', attrs: { src: '/same-origin-page' } },
      { type: 'fileBlock', attrs: { src: 'javascript:alert(1)', kind: 'video', name: 'v' } },
      { type: 'paragraph', content: [{ type: 'mention', attrs: { id: 'u', label: 'x', kind: 'user', href: 'javascript:alert(1)', avatar: 'javascript:x' } }] },
    ])
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<video')
    expect(html).toContain('<span class="me-mention me-mention--user"')
  })

  it('sandboxes HTML blocks without same-origin and keeps their code in srcdoc', () => {
    const html = render([{ type: 'htmlBlock', attrs: { code: '"><script>top.x=1</script>' } }])
    expect(html).toContain('sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock allow-downloads"')
    expect(html).not.toContain('allow-same-origin')
    expect(html).not.toMatch(/srcdoc="[^"]*"[^>]*><script/)
    expect(html).toContain('&lt;script&gt;top.x=1')
  })
})

describe('speed', () => {
  it('renders a 1000-block document in under 50 ms', () => {
    const kinds: ((i: number) => JSONContent)[] = [
      i => p(`Paragraph ${i} with some text, a little longer to be realistic.`, { id: `p${i}` }),
      i => ({ type: 'heading', attrs: { id: `h${i}`, level: 2 }, content: [t(`Heading ${i}`)] }),
      i => ({ type: 'bulletList', content: [{ type: 'listItem', content: [p(`Item ${i}`)] }, { type: 'listItem', content: [p('Second', { id: `li${i}` })] }] }),
      i => ({ type: 'paragraph', content: [t('Bold ', [{ type: 'bold' }]), t('link', [{ type: 'link', attrs: { href: `https://e.com/${i}` } }]), t(' and more')] }),
      i => ({ type: 'callout', content: [p(`Callout ${i}`)] }),
      i => ({ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: i % 2 === 0 }, content: [p(`Task ${i}`)] }] }),
      i => ({ type: 'codeBlock', attrs: { language: 'javascript' }, content: [t(`const x${i} = ${i} // comment`)] }),
      i => ({ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [p('a')] }, { type: 'tableCell', content: [p(`${i}`)] }] }] }),
      i => ({ type: 'blockquote', content: [p(`Quote ${i}`)] }),
      () => ({ type: 'horizontalRule' }),
    ]
    const doc: JSONContent = { type: 'doc', content: Array.from({ length: 1000 }, (_, i) => kinds[i % kinds.length]!(i)) }
    renderHTML(doc) // warm up (JIT, grammar init)
    const times: number[] = []
    for (let i = 0; i < 5; i++) {
      const start = performance.now()
      renderHTML(doc)
      times.push(performance.now() - start)
    }
    times.sort((a, b) => a - b)
    const median = times[2]!
    console.log(`render 1000 blocks: median ${median.toFixed(1)} ms`)
    expect(median).toBeLessThan(50)
  })
})
