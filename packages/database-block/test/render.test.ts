import { renderHTML } from '@toantranmei/editor/render'
import { describe, expect, it } from 'vitest'
import { databaseBlock } from '../src'
import { sampleDatabase } from '../src/memory-source'
import { visibleProps } from '../src/util'
import { databaseBlockRender, databaseBlockRenderWith, type StaticDatabase } from '../src/render-entry'

const sample = sampleDatabase(300, { databaseId: 'db1' })
const db: StaticDatabase = { meta: sample.meta, props: sample.props, views: sample.views, rows: sample.rows!.slice(0, 200), total: 300, people: { u1: 'Trần Minh Anh' } }
const doc = (attrs: Record<string, unknown>) => ({ type: 'doc', content: [{ type: 'databaseView', attrs: { id: 'b1', ...attrs } }] })

describe('static render', () => {
  it('renders a read-only table of the first rows from data.databases', () => {
    const html = renderHTML(doc({ databaseId: 'db1', viewId: 'v-table' }), { blocks: [databaseBlockRender], data: { databases: { db1: db } }, locale: 'en', wrap: false })
    expect(html).toContain('data-database-id="db1"')
    expect(html).toContain('<table class="me-db-static-table">')
    expect(html.match(/<tr data-row-id=/g)).toHaveLength(200)
    expect(html).toContain('Tasks')
    expect(html).toContain(String(sample.rows![0]!.values.name))
    expect(html).toMatch(/<span class="me-db-tag" data-color="\w+">(Not started|In progress|Done)<\/span>/)
    expect(html).toContain('+100 More')
    expect(html).not.toContain('<script')
  })

  it('escapes values, shows "not found" without data and a link row for full-page databases', () => {
    const evil: StaticDatabase = { ...db, rows: [{ id: 'x', position: 'a', values: { name: '<img src=x onerror=alert(1)>', link: 'javascript:alert(1)' } }] }
    const html = renderHTML(doc({ databaseId: 'db1' }), { blocks: [databaseBlockRender], data: { databases: { db1: evil } }, wrap: false })
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('href="javascript:')
    expect(renderHTML(doc({ databaseId: 'nope' }), { blocks: [databaseBlockRender], locale: 'en', wrap: false })).toContain('Database not found')
    const link = renderHTML(doc({ databaseId: 'db1', inline: false }), { blocks: [databaseBlock], resolveLink: id => ({ href: `/db/${id}`, title: 'Tasks' }), wrap: false })
    expect(link).toContain('href="/db/db1"')
    expect(link).toContain('me-db-link-row')
  })
})

describe('static render: rowHref', () => {
  const render = (rowHref: (db: string, row: string) => string | null, data = db) =>
    renderHTML(doc({ databaseId: 'db1', viewId: 'v-table' }), { blocks: [databaseBlockRenderWith({ rowHref })], data: { databases: { db1: data } }, locale: 'en', wrap: false })

  it('links the title cell of every row, with the row id in the href', () => {
    const html = render((d, r) => `/notes/p/slug/${d}/${r}`)
    const first = db.rows[0]!
    expect(html).toContain(`href="/notes/p/slug/db1/${first.id}"`)
    expect(html.match(/class="me-db-row-link"/g)).toHaveLength(200)
    expect(html).toContain('<th scope="row"><a class="me-db-row-link"')
  })

  it('never nests an <a> inside another <a> (url/email columns stay plain links beside the title link)', () => {
    const html = render((_, r) => `/r/${r}`)
    expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>).)*<a\b/s)
  })

  it('null hrefs leave the row unlinked; the constant renderer has no links', () => {
    expect(render(() => null)).not.toContain('me-db-row-link')
    const plain = renderHTML(doc({ databaseId: 'db1' }), { blocks: [databaseBlockRender], data: { databases: { db1: db } }, locale: 'en', wrap: false })
    expect(plain).not.toContain('me-db-row-link')
  })

  it('goes through safeUrl: javascript: is dropped, attribute-breaking characters are escaped', () => {
    expect(render(() => 'javascript:alert(1)')).not.toContain('me-db-row-link')
    const html = render(() => '/p?a="><script>alert(1)</script>&b=1')
    expect(html).not.toContain('<script>')
    expect(html).toContain('me-db-row-link')
    expect(html).not.toMatch(/href="[^"]*"[^>]*><script/)
  })

  it('without a title column, a leading link cell holds the link', () => {
    // The title always shows when it exists, so the database has none.
    const noTitle: StaticDatabase = { ...db, props: db.props.filter(p => p.type !== 'title') }
    expect(visibleProps(noTitle.views.find(v => v.id === 'v-table'), noTitle.props).some(p => p.type === 'title')).toBe(false)
    const html = render((_, r) => `/r/${r}`, noTitle)
    expect(html).toContain('<th scope="col" class="me-db-row-open"')
    expect(html).toContain('<td class="me-db-row-open"><a class="me-db-row-link" href="/r/')
    expect(html.match(/<td class="me-db-row-open">/g)).toHaveLength(200)
    expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>).)*<a\b/s)
  })
})
