import type { LocaleName } from '@toantranmei/editor'

export interface CommentsMessages {
  /** Bubble-menu action. */
  comment: string
  /** Panel title. */
  title: string
  open: string
  resolved: string
  resolve: string
  reopen: string
  reply: string
  replyPlaceholder: string
  placeholder: string
  send: string
  cancel: string
  edit: string
  delete: string
  save: string
  edited: string
  /** No open threads. */
  empty: string
  emptyResolved: string
  /** Gutter badge label: `{count}` is replaced. */
  threads: string
  /** Thread whose text was deleted from the page. */
  detached: string
  /** Comment on the whole page. */
  pageComment: string
  readOnly: string
  failed: string
  /** More actions on a comment. */
  more: string
}

export const messages: Record<LocaleName, CommentsMessages> = {
  vi: {
    comment: 'Bình luận',
    title: 'Bình luận',
    open: 'Đang mở',
    resolved: 'Đã giải quyết',
    resolve: 'Giải quyết',
    reopen: 'Mở lại',
    reply: 'Trả lời',
    replyPlaceholder: 'Trả lời…',
    placeholder: 'Thêm bình luận… (@ để nhắc tên)',
    send: 'Gửi',
    cancel: 'Huỷ',
    edit: 'Sửa',
    delete: 'Xoá',
    save: 'Lưu',
    edited: 'đã sửa',
    empty: 'Chưa có bình luận nào. Chọn một đoạn văn bản để bình luận.',
    emptyResolved: 'Chưa có bình luận nào được giải quyết.',
    threads: '{count} bình luận',
    detached: 'Đoạn văn bản này đã bị xoá khỏi trang',
    pageComment: 'Bình luận về trang',
    readOnly: 'Bạn chỉ có quyền xem bình luận',
    failed: 'Không gửi được, thử lại',
    more: 'Thêm',
  },
  en: {
    comment: 'Comment',
    title: 'Comments',
    open: 'Open',
    resolved: 'Resolved',
    resolve: 'Resolve',
    reopen: 'Re-open',
    reply: 'Reply',
    replyPlaceholder: 'Reply…',
    placeholder: 'Add a comment… (@ to mention)',
    send: 'Send',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    save: 'Save',
    edited: 'edited',
    empty: 'No comments yet. Select some text to comment.',
    emptyResolved: 'No resolved comments.',
    threads: '{count} comments',
    detached: 'This text was removed from the page',
    pageComment: 'Comment on the page',
    readOnly: 'You can only view comments',
    failed: 'Couldn’t send, try again',
    more: 'More',
  },
  zh: {
    comment: '评论',
    title: '评论',
    open: '未解决',
    resolved: '已解决',
    resolve: '解决',
    reopen: '重新打开',
    reply: '回复',
    replyPlaceholder: '回复…',
    placeholder: '添加评论…（输入 @ 提及成员）',
    send: '发送',
    cancel: '取消',
    edit: '编辑',
    delete: '删除',
    save: '保存',
    edited: '已编辑',
    empty: '暂无评论。选中文字即可评论。',
    emptyResolved: '暂无已解决的评论。',
    threads: '{count} 条评论',
    detached: '这段文字已从页面中删除',
    pageComment: '对页面的评论',
    readOnly: '你只能查看评论',
    failed: '发送失败，请重试',
    more: '更多',
  },
}

/** Strings for a locale with the app's overrides. */
export function commentsMessages(locale: string | undefined, overrides?: Partial<Record<LocaleName, Partial<CommentsMessages>>> | null): CommentsMessages {
  const key = (locale && locale in messages ? locale : 'vi') as LocaleName
  return { ...messages[key], ...overrides?.[key] }
}
