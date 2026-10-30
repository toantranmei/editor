import { Extension, type JSONContent } from '@tiptap/core'
import type { Schema } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { safeUrl } from '../safe-url'

/**
 * Pasting Markdown as plain text (from a chat, a README, an LLM answer…) gives blocks instead of
 * one paragraph per line (KS-BUG-11): headings, bullet / numbered / task lists (nested by
 * indentation), quotes, fenced code, dividers, and inline bold, italic, strike, code and links.
 *
 * Converted only when the text clearly is Markdown (`looksLikeMarkdown`), at most
 * `MARKDOWN_PASTE_MAX` characters, never inside a code block, never for "paste as plain text"
 * (Shift+Mod+V) and never when the clipboard also has HTML. The parsers are linear in the input
 * (no backtracking regexes, bounded nesting), so a pasted text can't freeze the tab.
 */

/** Longer plain-text pastes are never converted. */
export const MARKDOWN_PASTE_MAX = 256 * 1024
/** Deeper quote / list nesting is flattened to this depth. */
const MAX_DEPTH = 8

// ---------------------------------------------------------------------------------------------
// Lines

interface ListLine { indent: number, ordered: boolean, start: number, task: boolean | null, text: string }

type Line =
  | { kind: 'blank' }
  | { kind: 'fence', marker: string, info: string }
  | { kind: 'heading', level: number, text: string }
  | { kind: 'hr' }
  | { kind: 'quote' }
  | { kind: 'list', item: ListLine }
  | { kind: 'text' }

const isSpace = (c: string | undefined) => c === ' ' || c === '\t'
const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'

/** Indentation width (tab = 4) and the index of the first other character. */
function indentOf(line: string): [indent: number, at: number] {
  let indent = 0
  let at = 0
  while (at < line.length && isSpace(line[at])) indent += line[at++] === '\t' ? 4 : 1
  return [indent, at]
}

/** Heading text without the optional closing `#`s (`## Title ##`). */
function headingText(rest: string): string {
  let end = rest.length
  while (end > 0 && isSpace(rest[end - 1])) end--
  let hashes = end
  while (hashes > 0 && rest[hashes - 1] === '#') hashes--
  if (hashes < end && (hashes === 0 || isSpace(rest[hashes - 1]))) {
    end = hashes
    while (end > 0 && isSpace(rest[end - 1])) end--
  }
  return rest.slice(0, end)
}

function listItem(line: string, indent: number, at: number): ListLine | null {
  let i = at
  let ordered = false
  let start = 1
  if (line[i] === '-' || line[i] === '*' || line[i] === '+') {
    i++
  }
  else {
    const digits = i
    while (i - digits < 4 && isDigit(line[i])) i++
    // At most 3 digits: "2024. A great year" stays a sentence.
    if (i === digits || i - digits > 3 || (line[i] !== '.' && line[i] !== ')')) return null
    ordered = true
    start = Number(line.slice(digits, i))
    i++
  }
  if (!isSpace(line[i])) return null
  while (isSpace(line[i])) i++
  let task: boolean | null = null
  if (!ordered && line[i] === '[' && line[i + 2] === ']' && isSpace(line[i + 3]) && ' xX'.includes(line[i + 1] ?? '-')) {
    task = line[i + 1] !== ' '
    i += 4
    while (isSpace(line[i])) i++
  }
  const text = line.slice(i)
  return text.trim() ? { indent, ordered, start, task, text } : null
}

function classify(line: string): Line {
  const [indent, at] = indentOf(line)
  if (at === line.length) return { kind: 'blank' }
  const c = line[at]!
  if (indent < 4) {
    if ((c === '`' || c === '~') && line.startsWith(c.repeat(3), at)) {
      let end = at
      while (line[end] === c) end++
      const info = line.slice(end).trim()
      const space = info.search(/[ \t]/)
      return { kind: 'fence', marker: line.slice(at, end), info: space === -1 ? info : info.slice(0, space) }
    }
    if (c === '#') {
      let end = at
      while (line[end] === '#' && end - at < 7) end++
      const level = end - at
      if (level <= 6 && isSpace(line[end])) {
        const text = headingText(line.slice(end + 1))
        if (text.trim()) return { kind: 'heading', level, text: text.trim() }
      }
    }
    if (c === '-' || c === '*' || c === '_') {
      let n = 0
      let only = true
      for (let i = at; i < line.length && only; i++) {
        if (line[i] === c) n++
        else if (!isSpace(line[i])) only = false
      }
      if (only && n >= 3) return { kind: 'hr' }
    }
    if (c === '>') return { kind: 'quote' }
  }
  const item = listItem(line, indent, at)
  return item ? { kind: 'list', item } : { kind: 'text' }
}

const splitLines = (text: string) => text.replace(/\r\n?/g, '\n').split('\n')

const closesFence = (line: Line, open: string) => line.kind === 'fence' && !line.info && line.marker[0] === open[0] && line.marker.length >= open.length

/**
 * True when `text` clearly is Markdown: a heading, a closed code fence, a task item, or two list
 * items of the same kind in a row. A lone "- Alice" signature or "1) apples" is not enough.
 */
export function looksLikeMarkdown(text: string): boolean {
  if (text.length > MARKDOWN_PASTE_MAX) return false
  let openFence: string | null = null
  let previousList: boolean | null = null // previous non-blank line was a list item: ordered?
  for (const raw of splitLines(text)) {
    const line = classify(raw)
    if (openFence !== null) {
      if (closesFence(line, openFence)) return true
      continue
    }
    if (line.kind === 'blank') continue
    if (line.kind === 'heading') return true
    if (line.kind === 'fence') {
      openFence = line.marker
      continue
    }
    if (line.kind === 'list') {
      if (line.item.task !== null || previousList === line.item.ordered) return true
      previousList = line.item.ordered
      continue
    }
    previousList = null
  }
  return false
}

// ---------------------------------------------------------------------------------------------
// Inline

type Mark = { type: string, attrs?: Record<string, unknown> }
const OPEN_AFTER = '([{\'"'
const CLOSE_BEFORE = '.,;:!?)]}\'"'
const ESCAPABLE = '\\`*_~[]()#>!-'
const isWs = (c: string | undefined) => c === undefined || c === ' ' || c === '\t' || c === '\n' || c === ' '
const isWord = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}_]/u.test(c)
const EMPHASIS: [delimiter: string, mark: string][] = [['**', 'bold'], ['__', 'bold'], ['~~', 'strike'], ['*', 'italic'], ['_', 'italic']]

/**
 * Next match of `needle` at or after `from`, optionally passing `valid`. Queries for one key come
 * in increasing `from` order, so the last answer is reused: the whole scan stays linear even
 * with thousands of unmatched `[`, `` ` `` or `*`.
 */
function finder(text: string) {
  const last = new Map<string, number>()
  return (key: string, needle: string, from: number, valid?: (i: number) => boolean): number => {
    const cached = last.get(key)
    if (cached !== undefined && (cached === -1 || cached >= from)) return cached
    let i = text.indexOf(needle, from)
    while (i !== -1 && valid && !valid(i)) i = text.indexOf(needle, i + 1)
    last.set(key, i)
    return i
  }
}

/** Inline Markdown → text nodes with marks (bold, italic, strike, code, link). Linear time. */
export function parseInline(text: string, marks: Mark[] = [], inLink = false): JSONContent[] {
  const out: JSONContent[] = []
  let buf = ''
  const flush = () => {
    if (!buf) return
    const last = out.at(-1)
    if (last?.text !== undefined && JSON.stringify(last.marks ?? []) === JSON.stringify(marks)) last.text += buf
    else out.push(marks.length ? { type: 'text', text: buf, marks } : { type: 'text', text: buf })
    buf = ''
  }
  const next = finder(text)
  // An emphasis closer follows a non-space and ends a word: `__init__.py`, `2*3*4` and
  // `snake_case` stay text.
  const closer = (len: number) => (i: number) => !isWs(text[i - 1]) && text[i - 1] !== text[i]
    && (isWs(text[i + len]) || (CLOSE_BEFORE.includes(text[i + len]!) && !isWord(text[i + len + 1])))

  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (c === '\\' && ESCAPABLE.includes(text[i + 1] ?? '\0')) {
      buf += text[i + 1]
      i += 2
      continue
    }
    if (c === '`') {
      const end = next('`', '`', i + 1)
      if (end > i + 1) {
        flush()
        out.push({ type: 'text', text: text.slice(i + 1, end), marks: [...marks, { type: 'code' }] })
        i = end + 1
        continue
      }
    }
    if (c === '[' && !inLink) {
      const close = next(']', ']', i + 1)
      if (close > i + 1 && text[close + 1] === '(') {
        const paren = next(')', ')', close + 2)
        if (paren !== -1) {
          const inside = text.slice(close + 2, paren).trim()
          const space = inside.search(/\s/)
          const url = space === -1 ? inside : inside.slice(0, space)
          const title = space === -1 ? '' : inside.slice(space).trim()
          if (url && (!title || (title.length > 1 && title[0] === '"' && title.at(-1) === '"' && !title.slice(1, -1).includes('"')))) {
            flush()
            const href = safeUrl(url)
            out.push(...parseInline(text.slice(i + 1, close), href ? [...marks, { type: 'link', attrs: { href } }] : marks, true))
            i = paren + 1
            continue
          }
        }
      }
    }
    if (c === '*' || c === '_' || c === '~') {
      const delimiter = EMPHASIS.find(([d]) => text.startsWith(d, i))
      // Opens at a word start, before a non-space.
      if (delimiter && (i === 0 || isWs(text[i - 1]) || OPEN_AFTER.includes(text[i - 1]!)) && !isWs(text[i + delimiter[0].length])) {
        const [d, type] = delimiter
        const end = next(`em${d}`, d, i + d.length + 1, closer(d.length))
        if (end !== -1) {
          flush()
          out.push(...parseInline(text.slice(i + d.length, end), [...marks, { type }], inLink))
          i = end + d.length
          continue
        }
      }
      // Not a delimiter here: keep the whole run as text.
      let j = i
      while (text[j] === c) j++
      buf += text.slice(i, j)
      i = j
      continue
    }
    buf += c
    i++
  }
  flush()
  return out
}

// ---------------------------------------------------------------------------------------------
// Blocks

const paragraph = (text: string): JSONContent => {
  const content = parseInline(text)
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
}

/** Nested lists from consecutive list items, without recursion (nesting capped at MAX_DEPTH). */
function buildList(items: ListLine[]): JSONContent[] {
  const root: JSONContent[] = []
  const stack: { indent: number, container: JSONContent[], list: JSONContent }[] = []
  for (const line of items) {
    while (stack.length && line.indent < stack.at(-1)!.indent) stack.pop()
    const type = line.task !== null ? 'taskList' : line.ordered ? 'orderedList' : 'bulletList'
    let top = stack.at(-1)
    if (top && line.indent > top.indent && stack.length < MAX_DEPTH) {
      const parent = top.list.content!.at(-1)!
      const list: JSONContent = { type, content: [] }
      parent.content!.push(list)
      top = { indent: line.indent, container: parent.content!, list }
      stack.push(top)
    }
    if (!top) {
      const list: JSONContent = { type, content: [] }
      root.push(list)
      top = { indent: line.indent, container: root, list }
      stack.push(top)
    }
    if (top.list.type !== type) {
      top.list = { type, content: [] }
      top.container.push(top.list)
    }
    if (type === 'orderedList' && !top.list.content!.length && line.start !== 1) top.list.attrs = { start: line.start }
    const item: JSONContent = { type: type === 'taskList' ? 'taskItem' : 'listItem', content: [paragraph(line.text)] }
    if (type === 'taskList') item.attrs = { checked: !!line.task }
    top.list.content!.push(item)
  }
  return root
}

/** Removes one quote marker (`> `), or all of them (`>>> x` → `x`). */
function unquote(line: string, all: boolean): string {
  let at = indentOf(line)[1]
  do {
    at++ // the '>'
    if (line[at] === ' ') at++
    if (!all) break
    while (isSpace(line[at])) at++
  } while (line[at] === '>')
  return line.slice(at)
}

/** Block Markdown → Tiptap JSON blocks (types are mapped to the schema by `fitToSchema`). */
export function markdownToBlocks(markdown: string, depth = 0): JSONContent[] {
  const lines = splitLines(markdown)
  const kinds = lines.map(classify)
  const blocks: JSONContent[] = []
  for (let i = 0; i < lines.length;) {
    const kind = kinds[i]!
    if (kind.kind === 'fence') {
      const body: string[] = []
      i++
      while (i < lines.length && !closesFence(kinds[i]!, kind.marker)) body.push(lines[i++]!)
      i++ // closing fence
      const text = body.join('\n')
      blocks.push({ type: 'codeBlock', attrs: { language: /^[\w+#.-]{1,32}$/.test(kind.info) ? kind.info : null }, content: text ? [{ type: 'text', text }] : [] })
      continue
    }
    if (kind.kind === 'heading') {
      const content = parseInline(kind.text)
      blocks.push({ type: 'heading', attrs: { level: Math.min(3, kind.level) }, ...(content.length ? { content } : {}) })
      i++
      continue
    }
    if (kind.kind === 'hr') {
      blocks.push({ type: 'horizontalRule' })
      i++
      continue
    }
    if (kind.kind === 'quote') {
      const quoted: string[] = []
      const flatten = depth + 1 >= MAX_DEPTH
      while (i < lines.length && kinds[i]!.kind === 'quote') quoted.push(unquote(lines[i++]!, flatten))
      const content = flatten ? quoted.filter(l => l.trim()).map(l => paragraph(l.trim())) : markdownToBlocks(quoted.join('\n'), depth + 1)
      blocks.push({ type: 'blockquote', content: content.length ? content : [{ type: 'paragraph' }] })
      continue
    }
    if (kind.kind === 'list') {
      // A lone numbered line not starting at 1 ("7) and so on") stays a paragraph.
      const following = kinds[i + 1]
      const lone = kind.item.ordered && kind.item.start !== 1 && !(following?.kind === 'list' && following.item.ordered)
      if (!lone) {
        const items: ListLine[] = []
        while (i < lines.length) {
          const k = kinds[i]!
          if (k.kind === 'list') items.push(k.item)
          else if (k.kind === 'blank' && items.length && kinds[i + 1]?.kind === 'list') { /* loose list */ }
          else if (k.kind === 'text' && items.length && isSpace(lines[i]![0])) items.at(-1)!.text += ` ${lines[i]!.trim()}`
          else break
          i++
        }
        blocks.push(...buildList(items))
        continue
      }
    }
    // Text: one paragraph per line, like a plain-text paste (line breaks are kept).
    if (kind.kind !== 'blank') blocks.push(paragraph(lines[i]!.trim()))
    i++
  }
  return blocks
}

/** Replaces node / mark types the editor doesn't have (e.g. no task lists loaded) with plain ones. */
export function fitToSchema(node: JSONContent, schema: Schema): JSONContent {
  const map: Record<string, string> = { taskList: 'bulletList', taskItem: 'listItem' }
  let type = node.type!
  if (type !== 'text' && !schema.nodes[type]) type = schema.nodes[map[type] ?? ''] ? map[type]! : 'paragraph'
  const out: JSONContent = { ...node, type }
  if (type !== node.type) delete out.attrs
  if (type === 'paragraph' && node.type !== 'paragraph' && node.content?.some(c => c.type !== 'text')) {
    // A block we can't represent: keep its text.
    out.content = [{ type: 'text', text: textOf(node) }].filter(t => t.text)
    return out
  }
  if (node.marks) out.marks = node.marks.filter(m => schema.marks[m.type])
  if (node.content) out.content = node.content.map(c => fitToSchema(c, schema))
  return out
}

/** All text in a node, without recursion. */
function textOf(node: JSONContent): string {
  const parts: string[] = []
  const stack: JSONContent[] = [node]
  while (stack.length) {
    const n = stack.pop()!
    if (n.text) parts.push(n.text)
    if (n.content) for (let i = n.content.length - 1; i >= 0; i--) stack.push(n.content[i]!)
  }
  return parts.join(' ')
}

export const MarkdownPaste = Extension.create({
  name: 'markdownPaste',
  addProseMirrorPlugins() {
    const editor = this.editor
    return [new Plugin({
      key: new PluginKey('markdownPaste'),
      props: {
        handlePaste: (view, event) => {
          const data = event.clipboardData
          const text = data?.getData('text/plain')
          if (!text || data!.getData('text/html')) return false
          // Shift+Mod+V, "paste as plain text": ProseMirror tracks Shift for its own plain paste.
          if ((view as unknown as { input?: { shiftKey?: boolean } }).input?.shiftKey) return false
          if (view.state.selection.$from.parent.type.spec.code) return false
          if (!looksLikeMarkdown(text)) return false
          const blocks = markdownToBlocks(text).map(b => fitToSchema(b, view.state.schema))
          if (!blocks.length) return false
          // Marked as a paste so paste rules run like on a normal paste (bare URLs become links).
          return editor.chain().command(({ tr }) => {
            tr.setMeta('uiEvent', 'paste')
            return true
          }).insertContent(blocks).run()
        },
      },
    })]
  },
})
