import { Heading1, Heading2, Heading3, Heading4, List, ListOrdered, ListTodo, Minus, Quote, Type } from '@lucide/vue'
import Heading from '@tiptap/extension-heading'
import Blockquote from '@tiptap/extension-blockquote'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import { BulletList, ListItem, ListKeymap, OrderedList, TaskItem, TaskList } from '@tiptap/extension-list'
import { type BlockType, isNode } from '../block-items'
import { defineBlock } from '../define-block'

/** Plain text. Always loaded: the paragraph is part of the editor core. */
export const text = defineBlock({
  name: 'text',
  items: () => [{
    id: 'paragraph',
    icon: Type,
    group: 'basic',
    keywords: ['text', 'paragraph', 'p', 'van ban'],
    // Already text: Tiptap's setParagraph would then lift the line out of its wrapper.
    // That's right for lists and quotes ("/text" drops the bullet, like Notion) but not
    // for callouts, columns, toggles or table cells, where the line should stay put.
    insert: c => c.command(({ state, commands }) => {
      const { $from } = state.selection
      if ($from.parent.type.name !== 'paragraph') return commands.setParagraph()
      const wrapper = $from.depth > 1 ? $from.node($from.depth - 1).type.name : 'doc'
      return ['listItem', 'taskItem', 'blockquote'].includes(wrapper) ? commands.setParagraph() : true
    }),
    turnInto: c => c.setParagraph(),
    matches: isNode('paragraph'),
  }],
})

const HEADING_ICONS = { 1: Heading1, 2: Heading2, 3: Heading3, 4: Heading4 } as const

export const heading = defineBlock<{ levels: (1 | 2 | 3 | 4)[] }>({
  name: 'heading',
  defaults: { levels: [1, 2, 3, 4] },
  nodes: ['heading'],
  extensions: o => [Heading.configure({ levels: o.levels })],
  items: o => o.levels.map((level): BlockType => ({
    id: `heading${level}`,
    icon: HEADING_ICONS[level],
    group: 'basic',
    keywords: [`h${level}`, 'heading', 'tieu de', 'title'],
    shortcut: '#'.repeat(level),
    insert: c => c.setHeading({ level }),
    turnInto: c => c.setHeading({ level }),
    matches: n => n.type.name === 'heading' && n.attrs.level === level,
  })),
})

export const bulletList = defineBlock({
  name: 'bulletList',
  nodes: ['bulletList'],
  extensions: () => [BulletList, ListItem, ListKeymap],
  items: () => [{
    id: 'bulletList',
    icon: List,
    group: 'basic',
    keywords: ['bullet', 'list', 'ul', 'danh sach'],
    shortcut: '-',
    insert: c => c.toggleBulletList(),
    turnInto: c => c.toggleBulletList(),
    matches: isNode('bulletList'),
  }],
})

export const orderedList = defineBlock({
  name: 'orderedList',
  nodes: ['orderedList'],
  extensions: () => [OrderedList, ListItem, ListKeymap],
  items: () => [{
    id: 'orderedList',
    icon: ListOrdered,
    group: 'basic',
    keywords: ['number', 'ordered', 'list', 'ol', 'danh sach so'],
    shortcut: '1.',
    insert: c => c.toggleOrderedList(),
    turnInto: c => c.toggleOrderedList(),
    matches: isNode('orderedList'),
  }],
})

export const taskList = defineBlock({
  name: 'taskList',
  nodes: ['taskList'],
  extensions: () => [TaskList, TaskItem.configure({ nested: true })],
  items: () => [{
    id: 'taskList',
    icon: ListTodo,
    group: 'basic',
    keywords: ['todo', 'task', 'checkbox', 'check', 'viec can lam'],
    shortcut: '[]',
    insert: c => c.toggleTaskList(),
    turnInto: c => c.toggleTaskList(),
    matches: isNode('taskList'),
  }],
})

export const quote = defineBlock({
  name: 'quote',
  nodes: ['blockquote'],
  extensions: () => [Blockquote],
  items: () => [{
    id: 'blockquote',
    icon: Quote,
    group: 'basic',
    keywords: ['quote', 'blockquote', 'trich dan'],
    shortcut: '>',
    insert: c => c.setBlockquote(),
    turnInto: c => c.setBlockquote(),
    matches: isNode('blockquote'),
  }],
})

export const divider = defineBlock({
  name: 'divider',
  nodes: ['horizontalRule'],
  extensions: () => [HorizontalRule],
  items: () => [{
    id: 'divider',
    icon: Minus,
    group: 'basic',
    keywords: ['divider', 'hr', 'line', 'separator', 'duong ke'],
    shortcut: '---',
    insert: c => c.setHorizontalRule(),
    matches: isNode('horizontalRule'),
  }],
})
