import Mention from '@tiptap/extension-mention'
import { mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { SuggestionOptions } from '@tiptap/suggestion'
import MentionMenu from '../components/MentionMenu.vue'
import { suggestionRenderer } from './suggestion-renderer'

export type MentionKind = 'user' | 'page' | 'date'

export interface MentionItem {
  id: string
  label: string
  kind: MentionKind
  /** Avatar image URL (users) — optional. */
  avatar?: string
  /** Link for pages — opened on ⌘/Ctrl+click when no `onClick` is given. */
  href?: string
  /** Secondary text in the menu (email, path…). */
  description?: string
}

export interface MentionOptions {
  /** Finds people/pages for `@query`. Dates (today, tomorrow…) are built in. */
  search: ((query: string) => MentionItem[] | Promise<MentionItem[]>) | null
  /** Called when a mention is clicked. */
  onClick: ((item: MentionItem) => void) | null
}

export const mentionPluginKey = new PluginKey('mention')

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Date suggestions: today/tomorrow/yesterday, plus a typed date like 25/12 or 2026-12-25. */
function dateItems(query: string, labels: { today: string, tomorrow: string, yesterday: string }, locale: string): MentionItem[] {
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return d
  }
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const make = (d: Date, label: string): MentionItem => ({ id: iso(d), kind: 'date', label, description: fmt.format(d) })
  const items = [make(day(0), labels.today), make(day(1), labels.tomorrow), make(day(-1), labels.yesterday)]

  const typed = query.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/) ?? query.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (typed) {
    const [, a, b, c] = typed
    const d = query.includes('-') && a!.length === 4
      ? new Date(Number(a), Number(b) - 1, Number(c))
      : new Date(c ? Number(c.length === 2 ? `20${c}` : c) : new Date().getFullYear(), Number(b) - 1, Number(a))
    if (!Number.isNaN(d.getTime())) items.unshift(make(d, fmt.format(d)))
  }
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036F]/g, '').replace(/đ/g, 'd').toLowerCase()
  const q = norm(query)
  return typed ? items : items.filter(i => !q || norm(i.label).includes(q) || i.id.includes(q))
}

/** `@` mentions of people, pages and dates. */
export const MentionNode = Mention.extend<MentionOptions & Record<string, any>>({
  addOptions() {
    return { ...this.parent?.(), search: null, onClick: null }
  },

  addAttributes() {
    const attr = (name: string) => ({
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`),
      renderHTML: (attrs: Record<string, any>) => (attrs[name] ? { [`data-${name}`]: attrs[name] } : {}),
    })
    return { ...this.parent?.(), kind: attr('kind'), href: attr('href'), avatar: attr('avatar') }
  },

  renderHTML({ node, HTMLAttributes }) {
    const prefix = node.attrs.kind === 'page' ? '' : '@'
    return ['span', mergeAttributes({ 'data-type': 'mention', 'class': `me-mention me-mention--${node.attrs.kind ?? 'user'}` }, HTMLAttributes), `${prefix}${node.attrs.label ?? node.attrs.id}`]
  },

  renderText({ node }) {
    return `${node.attrs.kind === 'page' ? '' : '@'}${node.attrs.label ?? node.attrs.id}`
  },

  addProseMirrorPlugins() {
    const options = this.options
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: new PluginKey('mentionClick'),
        props: {
          handleClickOn(_view, _pos, node, _nodePos, event) {
            if (node.type.name !== 'mention') return false
            const item = node.attrs as MentionItem
            if (options.onClick) {
              options.onClick(item)
              return true
            }
            if (item.href && (event.metaKey || event.ctrlKey)) {
              window.open(item.href, '_blank', 'noopener')
              return true
            }
            return false
          },
        },
      }),
    ]
  },
}).configure({ suggestion: mentionSuggestion() })

function mentionSuggestion(): Omit<SuggestionOptions<MentionItem>, 'editor'> {
  return {
    char: '@',
    pluginKey: mentionPluginKey,
    allowSpaces: true,
    items: async ({ query, editor }) => {
      const ext = editor.extensionManager.extensions.find(e => e.name === 'mention')
      const search = ext?.options.search as MentionOptions['search']
      const { messages, locale } = editor.storage.meiConfig
      const people = search ? await search(query) : []
      return [...people, ...dateItems(query, messages.mention, locale)].slice(0, 12)
    },
    command: ({ editor, range, props: item }) => {
      editor.chain().focus().insertContentAt(range, [
        // Dates show the actual date, not "Today", which would be wrong tomorrow.
        { type: 'mention', attrs: { id: item.id, label: item.kind === 'date' ? item.description : item.label, kind: item.kind, href: item.href ?? null, avatar: item.avatar ?? null } },
        { type: 'text', text: ' ' },
      ]).run()
    },
    render: suggestionRenderer<MentionItem>(MentionMenu, mentionPluginKey, {
      // Close once the query clearly isn't a name anymore.
      onUpdate: props => (props.query.split(' ').length > 3 ? false : undefined),
    }),
  }
}
