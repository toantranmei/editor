import type { LocaleName } from '@toantranmei/editor'

export interface SyncedMessages {
  /** Frame label. */
  label: string
  /** Link to the source's page. */
  original: string
  loading: string
  /** `doc` returned null or failed. */
  unavailable: string
  readOnly: string
}

export const messages: Record<LocaleName, SyncedMessages> = {
  vi: { label: 'Khối đồng bộ', original: 'Mở bản gốc', loading: 'Đang tải khối đồng bộ…', unavailable: 'Không tìm thấy khối đồng bộ hoặc bạn không có quyền truy cập', readOnly: 'Chỉ xem' },
  en: { label: 'Synced block', original: 'Edit original', loading: 'Loading synced block…', unavailable: 'Synced block not found or no access', readOnly: 'View only' },
  zh: { label: '同步块', original: '编辑原始块', loading: '正在加载同步块…', unavailable: '同步块不存在或无访问权限', readOnly: '仅查看' },
}

export function syncedMessages(locale: string | undefined, overrides?: Partial<Record<LocaleName, Partial<SyncedMessages>>> | null): SyncedMessages {
  const key = (locale && locale in messages ? locale : 'vi') as LocaleName
  return { ...messages[key], ...overrides?.[key] }
}
