import type { Editor } from '@tiptap/core'
import type { ResolvedPos } from '@tiptap/pm/model'
import type { Component } from 'vue'
import { type BlockType, blockTitle, enabledBlocks, groupLabel } from './block-items'
import { type BlockRange, colorBlocks, currentRange } from './block-ops'
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

function listItemRange($pos: ResolvedPos): BlockRange | null {
  for (let d = $pos.depth; d > 0; d--) {
    const name = $pos.node(d).type.name
    if (name === 'listItem' || name === 'taskItem') return { from: $pos.before(d), to: $pos.after(d), depth: d - 1 }
  }
  return null
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
      terms: [title, name, color, kind === 'text' ? 'color mau chu 文字颜色' : 'background highlight nen 背景颜色'],
      apply: (ed) => {
        pushRecentColor({ kind, color })
        const caret = ed.state.selection.from
        // Inside a list, "/red" colors just that item (each item is its own block in Notion).
        const range = listItemRange(ed.state.selection.$from) ?? currentRange(ed.state)
        if (!range) return
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
    // The menu shows items grouped, and ↑/↓ follow this array — so keep each group
    // contiguous (blocks from later definitions, e.g. `file`, join their group).
    const rank = new Map<string, number>()
    for (const item of [...recentItems, ...all]) if (!rank.has(item.group)) rank.set(item.group, rank.size)
    return [...recentItems, ...all]
      .map((item, i) => ({ item, i }))
      .sort((a, b) => rank.get(a.item.group)! - rank.get(b.item.group)! || a.i - b.i)
      .map(x => x.item)
  }

  const score = (item: SlashItem) => {
    const terms = item.terms.map(normalize)
    // Title or id typed exactly beats a block that merely lists it as a keyword ("/page" → Page, not Mention).
    if (terms[0] === q || terms[1] === q) return 4
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
