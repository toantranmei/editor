import type { JSONContent } from '@tiptap/core'
import type { BlockRenderers, RenderBlock } from '@toantranmei/editor/render'

export const SYNCED_NODE = 'syncedBlock'

/**
 * Static HTML for synced blocks (`renderHTML` from `@toantranmei/editor/render`). The content
 * lives in another document: pass it as `data.syncedBlocks[sourceId]` (editor JSON, e.g.
 * `documentToJSON(doc)` or the server's ProseMirror JSON). Missing content renders nothing.
 */
export function syncedBlockRenderers(): BlockRenderers {
  return {
    nodes: {
      [SYNCED_NODE]: (node, ctx) => {
        const sourceId = typeof node.attrs?.sourceId === 'string' ? node.attrs.sourceId : null
        const all = ctx.options.data?.syncedBlocks as Record<string, JSONContent | null | undefined> | undefined
        const content = sourceId ? all?.[sourceId] : null
        if (!content) return ''
        const inner = content.type === 'doc' ? ctx.children(content) : ctx.render(content)
        return `<div class="me-synced" data-type="synced-block"${ctx.attr('data-source-id', sourceId)}${ctx.blockAttrs(node)}><div class="me-synced-content">${inner}</div></div>`
      },
    },
  }
}

/** Render-only stand-in for `syncedBlock`, for servers that don't load Vue / Tiptap. */
export const syncedBlockRender: RenderBlock = { name: 'syncedBlock', render: syncedBlockRenderers() }
