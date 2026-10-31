import { renderHTML } from '@toantranmei/editor/render'
import { describe, expect, it } from 'vitest'
import { databaseBlock } from '../src'
import { sampleDatabase } from '../src/memory-source'
import { databaseBlockRender, type StaticDatabase } from '../src/render-entry'

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
