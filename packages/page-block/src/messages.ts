import type { LocaleName } from '@toantranmei/editor'

export interface PageMessages {
  /** Title of a page whose title is empty. */
  untitled: string
  /** A link whose page doesn't exist or isn't visible to this user (`resolve` returned null). */
  notFound: string
  /** While `resolve` is still `undefined`. */
  loading: string
  /** Accessible label of a link row: `{title}` is replaced. */
  openPage: string
  /** "Link to page" popover. */
  searchPlaceholder: string
  searching: string
  noResults: string
}

export const messages: Record<LocaleName, PageMessages> = {
  vi: {
    untitled: 'Không có tiêu đề',
    notFound: 'Không tìm thấy trang hoặc bạn không có quyền truy cập',
    loading: 'Đang tải…',
    openPage: 'Mở trang {title}',
    searchPlaceholder: 'Tìm trang để liên kết…',
    searching: 'Đang tìm…',
    noResults: 'Không tìm thấy trang nào',
  },
  en: {
    untitled: 'Untitled',
    notFound: 'Page not found or no access',
    loading: 'Loading…',
    openPage: 'Open page {title}',
    searchPlaceholder: 'Search for a page to link…',
    searching: 'Searching…',
    noResults: 'No pages found',
  },
  zh: {
    untitled: '无标题',
    notFound: '页面不存在或无访问权限',
    loading: '加载中…',
    openPage: '打开页面 {title}',
    searchPlaceholder: '搜索要链接的页面…',
    searching: '搜索中…',
    noResults: '未找到页面',
  },
}

/** Strings for the editor's current locale, with the app's overrides. */
export function pageMessages(locale: string | undefined, overrides?: Partial<Record<LocaleName, Partial<PageMessages>>> | null): PageMessages {
  const key = (locale && locale in messages ? locale : 'vi') as LocaleName
  return { ...messages[key], ...(overrides?.[key] ?? {}) }
}
