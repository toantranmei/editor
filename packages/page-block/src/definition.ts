import { FileText, Link2 } from '@lucide/vue'
import { type BlockType, defineBlock } from '@toantranmei/editor'
import { PageLinkNode } from './node'
import type { PageBlockOptions } from './types'

/**
 * Sub-pages for `<MeiEditor :blocks>`, Notion-style:
 * `pageBlock.configure({ resolve, createPage, open, href, search })`.
 * Slash menu: "Page" (needs `createPage`) and "Link to page" (needs `search`).
 */
export const pageBlock = defineBlock<PageBlockOptions>({
  name: 'page',
  defaults: {
    resolve: null,
    createPage: null,
    open: null,
    href: null,
    search: null,
    onError: null,
    defaultIcon: null,
    messages: null,
    searchDelay: 150,
  },
  nodes: ['pageLink'],
  extensions: o => [PageLinkNode.configure(o)],
  items: (o) => {
    const items: BlockType[] = []
    if (o.createPage) {
      items.push({
        id: 'page',
        icon: FileText,
        group: 'basic',
        keywords: ['page', 'subpage', 'sub page', 'new page', 'trang', 'trang con', 'trang moi', '页面', '子页面', '新页面'],
        insert: c => c.createSubPage(),
      })
    }
    if (o.search) {
      items.push({
        id: 'linkToPage',
        icon: Link2,
        group: 'basic',
        keywords: ['link', 'link to page', 'page link', 'lien ket', 'lien ket trang', 'trang', '链接', '链接到页面', '页面链接'],
        insert: c => c.linkToPage(),
      })
    }
    return items
  },
  messages: {
    vi: { blocks: { page: { title: 'Trang', description: 'Tạo trang con bên trong trang này.' }, linkToPage: { title: 'Liên kết tới trang', description: 'Liên kết tới một trang có sẵn.' } } },
    en: { blocks: { page: { title: 'Page', description: 'Embed a sub-page inside this page.' }, linkToPage: { title: 'Link to page', description: 'Link to an existing page.' } } },
    zh: { blocks: { page: { title: '页面', description: '在此页面中创建子页面。' }, linkToPage: { title: '链接到页面', description: '链接到已有页面。' } } },
  },
})
