// @vitest-environment node
import { renderHTML } from '@toantranmei/editor/render'
import { describe, expect, it } from 'vitest'
import { pageBlockRender } from '../src/render-entry'
import { pageBlock } from '../src/definition'

const doc = { type: 'doc', content: [{ type: 'pageLink', attrs: { id: 'b1', pageId: 'p1' } }, { type: 'pageLink', attrs: { pageId: 'gone' } }] }
const resolveLink = (id: string) => (id === 'p1' ? { href: `/notes/p/slug/${id}`, title: 'Kế hoạch <Q4>', icon: '🚀' } : null)

describe('pageLink render hook', () => {
  it('renders links via resolveLink (DOM-free entry)', () => {
    const html = renderHTML(doc, { blocks: [pageBlockRender], resolveLink, locale: 'en', wrap: false })
    expect(html).toBe(
      '<div class="me-page-link" data-type="page-link" data-page-id="p1" data-id="b1"><a class="me-page-link-row" href="/notes/p/slug/p1" aria-label="Open page Kế hoạch &lt;Q4&gt;"><span class="me-page-link-icon" aria-hidden="true"><span class="me-page-link-emoji">🚀</span></span><span class="me-page-link-title">Kế hoạch &lt;Q4&gt;</span></a></div>'
      + '<div class="me-page-link is-missing" data-type="page-link" data-page-id="gone"><a class="me-page-link-row" aria-disabled="true" aria-label="Open page Page not found or no access"><span class="me-page-link-icon" aria-hidden="true">'
      + html.split('aria-label="Open page Page not found or no access"><span class="me-page-link-icon" aria-hidden="true">')[1]!.split('</span><span')[0]
      + '</span><span class="me-page-link-title is-muted">Page not found or no access</span></a></div>',
    )
  })

  it('works from the configured block definition, falling back to its href option', () => {
    const block = pageBlock.configure({ href: id => `/x/${id}` })
    const html = renderHTML({ type: 'doc', content: [{ type: 'pageLink', attrs: { pageId: 'a' } }] }, { blocks: [block], locale: 'vi', wrap: false })
    expect(html).toContain('href="/x/a"')
    expect(html).toContain('Không có tiêu đề')
  })

  it('drops unsafe hrefs', () => {
    const html = renderHTML(doc, { blocks: [pageBlockRender], resolveLink: () => ({ href: 'javascript:alert(1)', title: 'x' }), wrap: false })
    expect(html).not.toContain('javascript:')
  })
})
