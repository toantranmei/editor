import { Database, FileStack } from '@lucide/vue'
import { type BlockType, defineBlock } from '@toantranmei/editor'
import { messages } from './messages'
import { DATABASE_NODE, DatabaseViewNode } from './node'
import type { DatabaseBlockOptions } from './types'

const desc = {
  vi: { inline: 'Bảng, bảng Kanban, lịch… ngay trong trang này.', fullPage: 'Tạo cơ sở dữ liệu như một trang con.' },
  en: { inline: 'Table, board, calendar… right inside this page.', fullPage: 'Create a database as a sub-page.' },
  zh: { inline: '在此页面中直接嵌入表格、看板、日历等。', fullPage: '以子页面的形式创建数据库。' },
}

/**
 * Notion-style databases for `<MeiEditor :blocks>`:
 * `databaseBlock.configure({ source, createDatabase, open? })`.
 * Slash menu: "Database – inline" and "Database – full page" (need `createDatabase`).
 */
export const databaseBlock = defineBlock<DatabaseBlockOptions>({
  name: 'database',
  defaults: {
    source: null,
    createDatabase: null,
    open: null,
    onError: null,
    messages: null,
    pageSize: 50,
    rangeLimit: 2000,
  },
  nodes: [DATABASE_NODE],
  extensions: o => [DatabaseViewNode.configure(o)],
  items: (o) => {
    if (!o.createDatabase) return []
    const keywords = ['database', 'db', 'table', 'board', 'kanban', 'calendar', 'co so du lieu', 'csdl', 'bang', '数据库', '表格', '看板']
    const items: BlockType[] = [
      { id: 'databaseInline', icon: Database, group: 'advanced', keywords: [...keywords, 'inline', 'trong trang', '内嵌'], insert: c => c.createDatabase('inline') },
      { id: 'databaseFullPage', icon: FileStack, group: 'advanced', keywords: [...keywords, 'full page', 'page', 'toan trang', '整页'], insert: c => c.createDatabase('full_page') },
    ]
    return items
  },
  messages: {
    vi: { blocks: { databaseInline: { title: messages.vi.inline, description: desc.vi.inline }, databaseFullPage: { title: messages.vi.fullPage, description: desc.vi.fullPage } } },
    en: { blocks: { databaseInline: { title: messages.en.inline, description: desc.en.inline }, databaseFullPage: { title: messages.en.fullPage, description: desc.en.fullPage } } },
    zh: { blocks: { databaseInline: { title: messages.zh.inline, description: desc.zh.inline }, databaseFullPage: { title: messages.zh.fullPage, description: desc.zh.fullPage } } },
  },
})
