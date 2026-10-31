import { Code, Columns2, Columns3, Columns4, Heading1, Heading2, Heading3, Lightbulb, ListCollapse, Table } from '@lucide/vue'
import type { ChainedCommands } from '@tiptap/core'
import { type BlockType, isNode } from '../block-items'
import { defineBlock } from '../define-block'
import { Callout } from '../extensions/callout'
import { CodeBlock } from '../extensions/code-block'
import { Column, Columns } from '../extensions/columns'
import { tableExtensions } from '../extensions/table'
import { toggleExtensions } from '../extensions/toggle'

export const codeBlock = defineBlock({
  name: 'codeBlock',
  nodes: ['codeBlock'],
  extensions: () => [CodeBlock],
  items: () => [{
    id: 'codeBlock',
    icon: Code,
    group: 'basic',
    keywords: ['code', 'snippet', 'pre', '代码', '代码块'],
    shortcut: '```',
    insert: c => c.setCodeBlock(),
    turnInto: c => c.setCodeBlock(),
    matches: n => n.type.name === 'codeBlock' && n.attrs.language !== 'mermaid',
  }],
})

export const callout = defineBlock({
  name: 'callout',
  nodes: ['callout'],
  extensions: () => [Callout],
  items: () => [{
    id: 'callout',
    icon: Lightbulb,
    group: 'advanced',
    keywords: ['callout', 'note', 'info', 'warning', 'ghi chu', '标注', '提示'],
    insert: c => c.setCallout(),
    turnInto: c => c.setCallout(),
    matches: isNode('callout'),
  }],
})

export const toggle = defineBlock({
  name: 'toggle',
  nodes: ['details'],
  extensions: () => toggleExtensions,
  items: () => [{
    id: 'toggle',
    icon: ListCollapse,
    group: 'advanced',
    keywords: ['toggle', 'details', 'collapse', 'thu gon', '折叠', '折叠列表'],
    insert: c => c.setDetails(),
    turnInto: c => c.setDetails(),
    matches: n => n.type.name === 'details' && !n.attrs.level,
  }],
})

/** Sets `level` on the toggle that holds the selection (after setDetails). */
const setToggleLevel = (level: number) => (c: ChainedCommands) => c.command(({ tr }) => {
  const { $from } = tr.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'details') {
      tr.setNodeMarkup($from.before(d), undefined, { ...$from.node(d).attrs, level })
      return true
    }
  }
  return false
})

const TOGGLE_HEADING_ICONS = { 1: Heading1, 2: Heading2, 3: Heading3 } as const

/** Notion's toggle headings: a heading whose content folds under it. */
export const toggleHeading = defineBlock({
  name: 'toggleHeading',
  nodes: ['details'],
  extensions: () => toggleExtensions,
  items: () => ([1, 2, 3] as const).map((level): BlockType => ({
    id: `toggleHeading${level}`,
    icon: TOGGLE_HEADING_ICONS[level],
    group: 'advanced',
    keywords: ['toggle heading', `toggle h${level}`, 'tieu de thu gon', 'collapse', '折叠标题'],
    insert: c => setToggleLevel(level)(c.setDetails()),
    turnInto: c => setToggleLevel(level)(c.setDetails()),
    matches: n => n.type.name === 'details' && n.attrs.level === level,
  })),
})

export const table = defineBlock({
  name: 'table',
  nodes: ['table'],
  extensions: () => tableExtensions,
  items: () => [{
    id: 'table',
    icon: Table,
    group: 'advanced',
    keywords: ['table', 'grid', 'bang', '表格'],
    insert: c => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
    matches: isNode('table'),
  }],
})

const COLUMN_ICONS = { 2: Columns2, 3: Columns3, 4: Columns4 } as const

export const columns = defineBlock({
  name: 'columns',
  nodes: ['columns'],
  extensions: () => [Columns, Column],
  items: () => ([2, 3, 4] as const).map((n): BlockType => ({
    id: `columns${n}`,
    icon: COLUMN_ICONS[n],
    group: 'layout',
    keywords: ['columns', 'column', 'cot', 'layout', `${n}`, '分栏', '栏', '布局'],
    insert: c => c.setColumns(n),
    matches: node => node.type.name === 'columns' && node.childCount === n,
  })),
})
