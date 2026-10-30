import { Extension, type JSONContent } from '@tiptap/core'
import type { Schema } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { safeUrl } from '../safe-url'

/**
 * Pasting Markdown as plain text (from a chat, a README, an LLM answer…) gives blocks instead of
 * one paragraph per line (KS-BUG-11): headings, bullet / numbered / task lists (nested by
 * indentation), quotes, fenced code, dividers, and inline bold, italic, strike, code and links.
 * Only plain-text pastes that contain a block-level Markdown construct are converted, never
 * inside a code block, and never when the clipboard also has HTML (that path keeps its format).
 */

const BLOCK_MARKERS = /^(?: {0,3}#{1,6} \S| {0,3}(?:[-*+]|\d{1,9}[.)]) \S| {0,3}> | {0,3}(?:```|~~~)| {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$)/m

/** True when `text` has at least one Markdown block (heading, list, quote, code fence, divider). */
export function looksLikeMarkdown(text: string): boolean {
  return BLOCK_MARKERS.test(text)
}

type Inline = JSONContent[]
type Mark = { type: string, attrs?: Record<string, unknown> }

/** Inline Markdown → text nodes with marks (bold, italic, strike, code, link). */
export function parseInline(text: string, marks: Mark[] = []): Inline {
  const out: Inline = []
  const push = (t: string, m: Mark[]) => {
    if (!t) return
    const last = out.at(-1)
    if (last && JSON.stringify(last.marks ?? []) === JSON.stringify(m)) last.text += t
    else out.push(m.length ? { type: 'text', text: t, marks: m } : { type: 'text', text: t })
  }
  const pattern = /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\*([^*\s][^*]*?)\*|(?<![\w])_([^_\s][^_]*?)_(?![\w])|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\\([\\`*_~[\]()#>!-])/g
  let at = 0
  for (const m of text.matchAll(pattern)) {
    push(text.slice(at, m.index), marks)
    at = m.index! + m[0].length
    if (m[1] !== undefined) push(m[1], [...marks, { type: 'code' }])
    else if (m[2] !== undefined || m[3] !== undefined) out.push(...parseInline(m[2] ?? m[3]!, [...marks, { type: 'bold' }]))
    else if (m[4] !== undefined) out.push(...parseInline(m[4], [...marks, { type: 'strike' }]))
    else if (m[5] !== undefined || m[6] !== undefined) out.push(...parseInline(m[5] ?? m[6]!, [...marks, { type: 'italic' }]))
    else if (m[7] !== undefined) {
      const href = safeUrl(m[8])
      out.push(...parseInline(m[7], href ? [...marks, { type: 'link', attrs: { href } }] : marks))
    }
    else if (m[9] !== undefined) push(m[9], marks)
  }
  push(text.slice(at), marks)
  return out
}

const paragraph = (text: string): JSONContent => {
  const content = parseInline(text)
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
}

interface ListLine { indent: number, ordered: boolean, start: number, task: boolean | null, text: string }
const LIST = /^(\s*)([-*+]|(\d{1,9})[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/

function listLine(line: string): ListLine | null {
  const m = LIST.exec(line)
  if (!m) return null
  return {
    indent: m[1]!.replace(/\t/g, '    ').length,
    ordered: m[3] !== undefined,
    start: m[3] ? Number(m[3]) : 1,
    task: m[4] === undefined ? null : m[4] !== ' ',
    text: m[5]!,
  }
}

/** Nested lists from consecutive list lines; deeper indentation nests under the previous item. */
function buildList(lines: ListLine[]): JSONContent[] {
  const lists: JSONContent[] = []
  let i = 0
  const level = (indent: number): JSONContent[] => {
    const result: JSONContent[] = []
    let list: JSONContent | null = null
    while (i < lines.length && lines[i]!.indent >= indent) {
      const line = lines[i]!
      if (line.indent > indent && list) {
        const last = list.content!.at(-1)!
        last.content!.push(...level(line.indent))
        continue
      }
      const type = line.task !== null ? 'taskList' : line.ordered ? 'orderedList' : 'bulletList'
      if (!list || list.type !== type) {
        list = { type, content: [] }
        if (type === 'orderedList' && line.start !== 1) list.attrs = { start: line.start }
        result.push(list)
      }
      const item: JSONContent = { type: type === 'taskList' ? 'taskItem' : 'listItem', content: [paragraph(line.text)] }
      if (type === 'taskList') item.attrs = { checked: !!line.task }
      list.content!.push(item)
      i++
    }
    return result
  }
  while (i < lines.length) lists.push(...level(lines[i]!.indent))
  return lists
}

/** Block Markdown → Tiptap JSON blocks (types are mapped to the schema by `fitToSchema`). */
export function markdownToBlocks(markdown: string): JSONContent[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: JSONContent[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push(paragraph(para.join(' ')))
    para = []
  }
  for (let i = 0; i < lines.length;) {
    const line = lines[i]!
    const fence = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/.exec(line)
    if (fence) {
      flush()
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i]!.trimStart().startsWith(fence[1]!)) body.push(lines[i++]!)
      i++ // closing fence
      const text = body.join('\n')
      blocks.push({ type: 'codeBlock', attrs: { language: fence[2] || null }, content: text ? [{ type: 'text', text }] : [] })
      continue
    }
    const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      flush()
      const content = parseInline(heading[2]!)
      blocks.push({ type: 'heading', attrs: { level: Math.min(3, heading[1]!.length) }, ...(content.length ? { content } : {}) })
      i++
      continue
    }
    if (/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush()
      blocks.push({ type: 'horizontalRule' })
      i++
      continue
    }
    if (/^ {0,3}>/.test(line)) {
      flush()
      const quoted: string[] = []
      while (i < lines.length && /^ {0,3}>/.test(lines[i]!)) quoted.push(lines[i++]!.replace(/^ {0,3}> ?/, ''))
      blocks.push({ type: 'blockquote', content: markdownToBlocks(quoted.join('\n')) })
      continue
    }
    if (listLine(line) && (/^\s{0,3}\S/.test(line) || !para.length)) {
      flush()
      const items: ListLine[] = []
      while (i < lines.length) {
        const item = listLine(lines[i]!)
        if (item) items.push(item)
        else if (lines[i]!.trim() && items.length && /^\s+\S/.test(lines[i]!)) items.at(-1)!.text += ` ${lines[i]!.trim()}`
        else break
        i++
      }
      blocks.push(...buildList(items))
      continue
    }
    if (!line.trim()) flush()
    else para.push(line.trim())
    i++
  }
  flush()
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

const textOf = (node: JSONContent): string => node.text ?? (node.content ?? []).map(textOf).join(' ')

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
          if (!text || data!.getData('text/html') || !looksLikeMarkdown(text)) return false
          const { $from } = view.state.selection
          if ($from.parent.type.spec.code) return false
          const blocks = markdownToBlocks(text).map(b => fitToSchema(b, view.state.schema))
          if (!blocks.length) return false
          return editor.commands.insertContent(blocks)
        },
      },
    })]
  },
})
