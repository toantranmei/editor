import type { BlockRenderers, NodeRenderer, RenderBlock, RenderContext } from '@toantranmei/editor/render'
import { type DatabaseMessages, databaseMessages } from './messages'
import type { DatabaseBlockOptions, FileValue, Prop, Row, View } from './types'
import { byPosition, cellValue, isEmptyValue, visibleProps } from './util'
import { displayText, optionById } from './values'

/**
 * What the server passes for one database in `renderHTML(doc, { data: { databases: { [id]: … } } })`:
 * schema plus the first rows of the view (the public-page server sends ≤ 200).
 */
export interface StaticDatabase {
  meta?: { title?: string, icon?: string | null } | null
  props: Prop[]
  views: View[]
  /** Rows already filtered / sorted for the view being rendered. */
  rows: Row[]
  /** Total rows of the view, for the "… more" line. Default `rows.length`. */
  total?: number
  /** Names of people (person / created_by cells) and titles of related rows. */
  people?: Record<string, string>
  rowTitles?: Record<string, string>
}

type RenderOptions = Pick<DatabaseBlockOptions, 'messages'>

function cellHtml(prop: Prop, row: Row, ctx: RenderContext, db: StaticDatabase, locale: string): string {
  const v = cellValue(row, prop)
  if (isEmptyValue(v)) return ''
  const tag = (name: string, color?: string) => `<span class="me-db-tag"${color && color !== 'default' ? ctx.attr('data-color', color) : ''}>${ctx.escape(name)}</span>`
  switch (prop.type) {
    case 'select': case 'status': {
      const o = optionById(prop, v)
      return o ? tag(o.name, o.color) : ''
    }
    case 'multi_select':
      return (Array.isArray(v) ? v : []).map(id => optionById(prop, id)).filter(o => !!o).map(o => tag(o!.name, o!.color)).join('')
    case 'checkbox':
      return `<span class="me-db-checkbox${v ? ' is-checked' : ''}" role="img" aria-label="${v ? '✓' : '✗'}">${v ? '✓' : ''}</span>`
    case 'files':
      return (Array.isArray(v) ? v as FileValue[] : []).map((f) => {
        const href = ctx.safeUrl(f.url, 'link')
        return href ? `<a class="me-db-file"${ctx.attr('href', href)}>${ctx.escape(f.name)}</a>` : `<span class="me-db-file">${ctx.escape(f.name)}</span>`
      }).join(' ')
    case 'url': case 'email': case 'phone': {
      const s = String(v)
      const raw = prop.type === 'email' ? `mailto:${s}` : prop.type === 'phone' ? `tel:${s.replace(/[^\d+]/g, '')}` : /^https?:\/\//i.test(s) ? s : `https://${s}`
      const href = ctx.safeUrl(raw, 'link')
      return href ? `<a class="me-db-link"${ctx.attr('href', href)}>${ctx.escape(s)}</a>` : ctx.escape(s)
    }
    default: {
      const text = displayText(prop, v, { locale, personName: id => db.people?.[id], rowTitle: id => db.rowTitles?.[id] })
      return prop.type === 'number' ? `<span class="me-db-value is-number">${ctx.escape(text)}</span>` : ctx.escape(text)
    }
  }
}

/** A read-only HTML table of a database view (any view type renders as its table of rows). */
export function renderStaticDatabase(db: StaticDatabase, viewId: string | null | undefined, ctx: RenderContext, m: DatabaseMessages): string {
  const views = [...db.views].sort(byPosition)
  const view = views.find(v => v.id === viewId) ?? views[0]
  const props = visibleProps(view, db.props)
  const locale = ctx.locale
  const title = db.meta?.title?.trim() || m.untitled
  const icon = db.meta?.icon ? `<span class="me-db-icon" aria-hidden="true">${ctx.escape(db.meta.icon)}</span>` : ''
  const head = props.map(p => `<th scope="col"${ctx.attr('data-prop', p.id)}>${ctx.escape(p.name)}</th>`).join('')
  const body = db.rows.map(r => `<tr${ctx.attr('data-row-id', r.id)}>${props.map((p, i) => i === 0
    ? `<th scope="row">${cellHtml(p, r, ctx, db, locale) || `<span class="me-db-muted">${ctx.escape(m.untitled)}</span>`}</th>`
    : `<td${ctx.attr('data-type', p.type)}>${cellHtml(p, r, ctx, db, locale)}</td>`).join('')}</tr>`).join('')
  const total = db.total ?? db.rows.length
  const more = total > db.rows.length ? `<p class="me-db-static-more">+${total - db.rows.length} ${ctx.escape(m.more)}</p>` : ''
  const tabs = view ? `<div class="me-db-static-view">${ctx.escape(view.name || m.viewTypes[view.type])}</div>` : ''
  const empty = db.rows.length ? '' : `<p class="me-db-static-more">${ctx.escape(m.noData)}</p>`
  return `<div class="me-db-header">${icon}<span class="me-db-static-title">${ctx.escape(title)}</span></div>${tabs}`
    + `<div class="me-db-static-scroll"><table class="me-db-static-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${empty}${more}`
}

/**
 * Static HTML for `databaseView` (used by `renderHTML` from `@toantranmei/editor/render`). Data comes from the
 * render option `data.databases[databaseId]` (`StaticDatabase`); a full-page database (`inline: false`) renders as a
 * link row through `resolveLink(databaseId)`.
 */
export function databaseRenderers(options: Partial<RenderOptions> = {}): BlockRenderers {
  const databaseView: NodeRenderer = (node, ctx) => {
    const m = databaseMessages(ctx.locale, options.messages)
    const id = typeof node.attrs?.databaseId === 'string' ? node.attrs.databaseId : null
    const viewId = typeof node.attrs?.viewId === 'string' ? node.attrs.viewId : null
    const all = ctx.options.data?.databases as Record<string, StaticDatabase | null | undefined> | undefined
    const db = id ? all?.[id] : null
    const open = `<div class="me-db-node is-static${node.attrs?.inline === false ? ' is-link' : ''}" data-type="database-view"${ctx.attr('data-database-id', id)}${ctx.attr('data-view-id', viewId)}${ctx.blockAttrs(node)}>`
    if (node.attrs?.inline === false) {
      const link = id && ctx.options.resolveLink ? ctx.options.resolveLink(id) : null
      const title = link?.title?.trim() || db?.meta?.title?.trim() || m.untitled
      const href = link ? ctx.safeUrl(link.href, 'link') : null
      const icon = link?.icon || db?.meta?.icon
      const row = `<span class="me-db-link-icon" aria-hidden="true">${icon ? ctx.escape(icon) : ctx.icon('fileText')}</span><span class="me-db-link-title">${ctx.escape(title)}</span>`
      return `${open}${href ? `<a class="me-db-link-row"${ctx.attr('href', href)}>${row}</a>` : `<span class="me-db-link-row">${row}</span>`}</div>`
    }
    if (!db) return `${open}<div class="me-db-empty is-missing">${ctx.escape(m.notFound)}</div></div>`
    return `${open}<div class="me-db">${renderStaticDatabase(db, viewId, ctx, m)}</div></div>`
  }
  return { nodes: { databaseView } }
}

/**
 * Render-only stand-in for `databaseBlock`, for servers that don't load the Vue code:
 * `renderHTML(doc, { blocks: [databaseBlockRender], data: { databases } })`.
 */
export const databaseBlockRender: RenderBlock = { name: 'database', render: databaseRenderers() }
