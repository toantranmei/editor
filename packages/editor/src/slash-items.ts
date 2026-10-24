import type { Editor } from '@tiptap/core'
import type { Component } from 'vue'
import { type BlockType, blockTitle, enabledBlocks, groupLabel } from './block-items'
import { colorBlocks, currentRange } from './block-ops'
import { PALETTE_NAMES } from './theme/tokens'
import { pushRecentBlock, pushRecentColor, recent } from './recent'

/** One row of the slash menu: a block type or a color command. */
export interface SlashItem {
  key: string
  /** Section label shown above the row. */
  group: string
  title: string
  description?: string
  icon?: Component
  swatch?: { kind: 'text' | 'bg', color: string }
  shortcut?: string
  terms: string[]
  /** Runs after the `/query` text has been removed. */
  apply: (editor: Editor) => void
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase()

function blockItem(editor: Editor, block: BlockType, group: string, key = block.id): SlashItem {
  const m = editor.storage.meiConfig.messages
  return {
    key,
    group,
    title: blockTitle(m, block),
    description: m.blocks[block.id]?.description,
    icon: block.icon,
    shortcut: block.shortcut,
    terms: [blockTitle(m, block), block.id, ...block.keywords],
    apply: (ed) => {
      pushRecentBlock(block.id)
      block.insert(ed.chain().focus()).run()
    },
  }
}

function colorItems(editor: Editor): SlashItem[] {
  const m = editor.storage.meiConfig.messages
  return (['text', 'bg'] as const).flatMap(kind => PALETTE_NAMES.map((color): SlashItem => {
    const name = m.colors[color] ?? color
    const title = kind === 'text' ? m.slash.textColor(name) : m.slash.bgColor(name)
    return {
      key: `color-${kind}-${color}`,
      group: m.slash.colors,
      title,
      swatch: { kind, color },
      terms: [title, name, color, kind === 'text' ? 'color mau chu' : 'background highlight nen'],
      apply: (ed) => {
        pushRecentColor({ kind, color })
        const range = currentRange(ed.state)
        if (!range) return
        const caret = ed.state.selection.from
        colorBlocks(ed, range, kind, color)
        ed.commands.setTextSelection(caret)
      },
    }
  }))
}

/**
 * Items for the slash menu. Without a query: recently used blocks, all blocks by group,
 * then colors. With a query: everything ranked (exact term > word prefix > substring).
 */
export function slashItems(editor: Editor, query: string): SlashItem[] {
  const m = editor.storage.meiConfig.messages
  const blocks = enabledBlocks(editor)
  const all = [...blocks.map(b => blockItem(editor, b, groupLabel(m, b.group))), ...colorItems(editor)]

  const q = normalize(query.trim())
  if (!q) {
    const recentItems = recent.value.blocks
      .map(id => blocks.find(b => b.id === id))
      .filter((b): b is BlockType => !!b)
      .map(b => blockItem(editor, b, m.slash.recent, `recent-${b.id}`))
    return [...recentItems, ...all]
  }

  const score = (item: SlashItem) => {
    const terms = item.terms.map(normalize)
    if (terms.includes(q)) return 3
    if (terms.some(t => t.startsWith(q) || t.split(/\s+/).some(w => w.startsWith(q)))) return 2
    if (terms.some(t => t.includes(q))) return 1
    return 0
  }
  return all
    .map((item, i) => ({ item, i, s: score(item) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(x => x.item)
}
