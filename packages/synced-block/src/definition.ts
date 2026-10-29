import { Repeat2 } from '@lucide/vue'
import { defineBlock } from '@toantranmei/editor'
import { SyncedBlockNode } from './node'
import { SYNCED_NODE, syncedBlockRenderers } from './render'
import type { SyncedBlockOptions } from './types'

/**
 * Synced blocks for `<MeiEditor :blocks>`: `syncedBlock.configure({ doc, create, originHref?, blocks? })`.
 * Slash item "Synced block" (needs `create`) moves the selected blocks into a new source.
 */
export const syncedBlock = defineBlock<SyncedBlockOptions>({
  name: 'syncedBlock',
  defaults: { doc: null, create: null, originHref: null, blocks: null, onError: null, messages: null },
  nodes: [SYNCED_NODE],
  extensions: o => [SyncedBlockNode.configure(o)],
  items: o => (o.create
    ? [{
        id: 'syncedBlock',
        icon: Repeat2,
        group: 'advanced',
        keywords: ['synced', 'sync', 'synced block', 'mirror', 'dong bo', 'khoi dong bo', '同步', '同步块'],
        insert: c => c.createSyncedBlock(),
      }]
    : []),
  render: () => syncedBlockRenderers(),
  messages: {
    vi: { blocks: { syncedBlock: { title: 'Khối đồng bộ', description: 'Nội dung giống nhau ở nhiều trang, sửa một nơi cập nhật mọi nơi.' } } },
    en: { blocks: { syncedBlock: { title: 'Synced block', description: 'Same content on many pages: edit once, updates everywhere.' } } },
    zh: { blocks: { syncedBlock: { title: '同步块', description: '多个页面共享同一内容，一处编辑处处更新。' } } },
  },
})
