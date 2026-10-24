import type { Schema } from '@tiptap/pm/model'
import type { JSONContent } from '@tiptap/vue-3'

/** What happened while loading a document (see the `content-error` event). */
export interface ContentIssue {
  kind: 'unknown' | 'repaired' | 'invalid'
  /** Node type of the affected block. */
  type: string
  message?: string
}

export class ContentError extends Error {
  constructor(message: string, public content: unknown) {
    super(message)
    this.name = 'ContentError'
  }
}

/**
 * Wraps nodes the schema doesn't know into `unknownBlock` / `unknownInline` so the
 * editor can load documents written with other blocks enabled. Unknown marks are dropped.
 */
export function wrapUnknown(doc: JSONContent | null | undefined, schema: Schema, issues: ContentIssue[] = []): JSONContent | null {
  if (!doc) return null
  const visit = (node: JSONContent, inline: boolean): JSONContent => {
    const type = node.type && schema.nodes[node.type]
    if (!type) {
      issues.push({ kind: 'unknown', type: String(node.type) })
      return { type: inline ? 'unknownInline' : 'unknownBlock', attrs: { data: node } }
    }
    const out: JSONContent = { ...node }
    if (node.marks) out.marks = node.marks.filter(m => schema.marks[m.type])
    if (node.content) out.content = node.content.map(child => visit(child, type.inlineContent))
    return out
  }
  return visit(doc, false)
}

/** Light repairs for common invalid JSON: empty text nodes, missing text. */
function repair(node: JSONContent): JSONContent {
  if (!node.content) return node
  const content = node.content
    .filter(child => !(child.type === 'text' && !child.text))
    .map(repair)
  return { ...node, content }
}

/**
 * Validates a document block by block so one broken block never blanks the editor
 * (Tiptap shows an empty doc on invalid content, and the next save would overwrite it).
 * Fixable blocks are repaired; others are kept verbatim inside `unknownBlock`.
 * Throws {@link ContentError} only when the input isn't a document at all.
 */
export function sanitizeContent(doc: unknown, schema: Schema, issues: ContentIssue[] = []): JSONContent | null {
  if (doc == null || doc === '') return null
  if (typeof doc !== 'object' || (doc as JSONContent).type !== 'doc' || !Array.isArray((doc as JSONContent).content ?? [])) {
    throw new ContentError('Content is not a document ({ type: "doc", content: [...] })', doc)
  }

  const wrapped = wrapUnknown(doc as JSONContent, schema, issues)!
  const valid = (json: JSONContent) => {
    try {
      schema.nodeFromJSON(json).check()
      return true
    }
    catch {
      return false
    }
  }

  // Fast path: the whole document is valid (the normal case) — one parse, no per-block work.
  if (valid(wrapped)) return wrapped

  const blocks = (wrapped.content ?? []).map((block) => {
    if (valid(block)) return block
    const fixed = repair(block)
    if (valid(fixed)) {
      issues.push({ kind: 'repaired', type: String(block.type) })
      return fixed
    }
    issues.push({ kind: 'invalid', type: String(block.type) })
    return { type: 'unknownBlock', attrs: { data: block, invalid: true } }
  })
  return { ...wrapped, content: blocks }
}

/** Reverses {@link wrapUnknown}: puts the original JSON back. */
export function unwrapUnknown(doc: JSONContent): JSONContent {
  if (doc.type === 'unknownBlock' || doc.type === 'unknownInline') return doc.attrs?.data ?? { type: 'paragraph' }
  return doc.content ? { ...doc, content: doc.content.map(unwrapUnknown) } : doc
}
