import Mention from '@tiptap/extension-mention'
import { type JSONContent, mergeAttributes } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import type { SuggestionOptions } from '@tiptap/suggestion'
import MentionMenu from '../components/MentionMenu.vue'
import { blockNodeView } from '../nodeviews/renderer'
import MentionView from '../nodeviews/MentionView.vue'
import { type DateValue, isoDate, reminderTime } from '../date-utils'

export { formatDateValue, formatMentionDate, isoDate, parseIsoDate, reminderTime, type DateFormat, type DateValue, type TimeFormat } from '../date-utils'
import { suggestionRenderer } from './suggestion-renderer'
import { safeUrl } from '../safe-url'

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

export interface MentionReminder {
  /** Start date of the mention (`YYYY-MM-DD`). */
  date: string
  time: string | null
  /** Preset, e.g. `'1d'`, `'30m'`. */
  remind: string
  /** When to notify. */
  fireAt: Date
}

export interface MentionOptions {
  /** Finds people/pages for `@query`. Dates (today, tomorrow…) are built in. */
  search: ((query: string) => MentionItem[] | Promise<MentionItem[]>) | null
  /** Called when a mention is clicked (read-only editors). */
  onClick: ((item: MentionItem) => void) | null
  /**
   * Called when a date mention's reminder is set or cleared. The editor can't send
   * notifications itself — schedule them on your backend (see `getMentionReminders`).
   */
  onRemind: ((reminder: MentionReminder | null, value: DateValue) => void) | null
  /** "Learn about reminders" link in the date picker (hidden when not set). */
  reminderHelpUrl: string | null
}

/** All reminders in a document, for scheduling notifications server-side. */
export function getMentionReminders(doc: JSONContent): MentionReminder[] {
  const out: MentionReminder[] = []
  const visit = (node: JSONContent) => {
    const a = node.attrs ?? {}
    if (node.type === 'mention' && a.kind === 'date' && a.remind && a.remind !== 'none') {
      const fireAt = reminderTime({ start: a.id, time: a.time, remind: a.remind })
      if (fireAt) out.push({ date: a.id, time: a.time ?? null, remind: a.remind, fireAt })
    }
    node.content?.forEach(visit)
  }
  visit(doc)
  return out
}

export const mentionPluginKey = new PluginKey('mention')

const iso = isoDate

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
    return { ...this.parent?.(), search: null, onClick: null, onRemind: null, reminderHelpUrl: null }
  },

  addAttributes() {
    // `key` is the attribute name in JSON, `data` its `data-*` name in HTML.
    const attr = (key: string, data = key) => ({
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute(`data-${data}`),
      renderHTML: (attrs: Record<string, any>) => (attrs[key] ? { [`data-${data}`]: attrs[key] } : {}),
    })
    return {
      ...this.parent?.(),
      kind: attr('kind'),
      // Pasted HTML can carry any data-href / data-avatar: only web, blob and relative URLs.
      href: { ...attr('href'), parseHTML: (el: HTMLElement) => safeUrl(el.getAttribute('data-href')) },
      avatar: { ...attr('avatar'), parseHTML: (el: HTMLElement) => safeUrl(el.getAttribute('data-avatar'), 'image') },
      // Date mentions (id = start date): see DateValue.
      end: attr('end'),
      time: attr('time'),
      endTime: attr('endTime', 'end-time'),
      format: attr('format'),
      timeFormat: attr('timeFormat', 'time-format'),
      remind: attr('remind'),
    }
  },

  renderHTML({ node, HTMLAttributes }) {
    const prefix = node.attrs.kind === 'page' ? '' : '@'
    return ['span', mergeAttributes({ 'data-type': 'mention', 'class': `me-mention me-mention--${node.attrs.kind ?? 'user'}` }, HTMLAttributes), `${prefix}${node.attrs.label ?? node.attrs.id}`]
  },

  renderText({ node }) {
    return `${node.attrs.kind === 'page' ? '' : '@'}${node.attrs.label ?? node.attrs.id}`
  },

  // Clickable chip: date picker for dates, people/page picker otherwise (read-only: onClick/href).
  addNodeView() {
    return blockNodeView(MentionView)
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
