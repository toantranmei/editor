import { combineTransactionSteps, Extension, getChangedRanges, type JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, Selection } from '@tiptap/pm/state'

export interface BlockIdOptions {
  /** Node types that get an id. */
  types: string[]
  /** Attribute name (rendered as `data-<name>`). */
  attributeName: string
  generate: () => string
}

/** Above this many id changes, rebuild the doc in one step instead of one step per node. */
const BULK_THRESHOLD = 300

export const uuid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

/**
 * Gives every block in a JSON document a unique id before it's loaded — one O(n) pass,
 * so opening large documents doesn't need thousands of id-setting steps.
 */
export function assignIds(doc: JSONContent | null, types: string[], generate: () => string = uuid, attr = 'id'): JSONContent | null {
  if (!doc) return doc
  const typeSet = new Set(types)
  const seen = new Set<string>()
  const visit = (node: JSONContent): JSONContent => {
    let out = node
    if (node.type && typeSet.has(node.type)) {
      const id = node.attrs?.[attr]
      if (!id || seen.has(id)) out = { ...node, attrs: { ...node.attrs, [attr]: generate() } }
      seen.add(out.attrs![attr])
    }
    return out.content ? { ...out, content: out.content.map(visit) } : out
  }
  return visit(doc)
}

/** Rebuilds a node tree with new ids at the given positions (single-step bulk update). */
function rebuild(doc: PMNode, ids: Map<number, string>, attr: string): PMNode {
  const visit = (node: PMNode, pos: number): PMNode => {
    if (node.isText) return node
    const children: PMNode[] = []
    node.forEach((child, offset) => children.push(visit(child, pos + 1 + offset)))
    const id = ids.get(pos)
    const attrs = id ? { ...node.attrs, [attr]: id } : node.attrs
    return node.type.create(attrs, children.length ? children : node.content, node.marks)
  }
  // The doc node itself has no position; its children start at 0.
  const children: PMNode[] = []
  doc.forEach((child, offset) => children.push(visit(child, offset)))
  return doc.type.create(doc.attrs, children)
}

/**
 * Stable block ids, linear-time. Replaces Tiptap's UniqueID, which is O(n²) on large
 * documents (indexOf-based duplicate search over every id, and position-shifting
 * setNodeMarkup steps). Here: only nodes inserted by the transaction are checked,
 * duplicates use a Set, and ids are written with setNodeAttribute (no position shifts).
 */
export const BlockId = Extension.create<BlockIdOptions>({
  name: 'blockId',

  addOptions: () => ({ types: [], attributeName: 'id', generate: uuid }),

  addGlobalAttributes() {
    const name = this.options.attributeName
    return [{
      types: this.options.types,
      attributes: {
        [name]: {
          default: null,
          keepOnSplit: false,
          parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`),
          renderHTML: (attrs: Record<string, any>) => (attrs[name] ? { [`data-${name}`]: attrs[name] } : {}),
        },
      },
    }]
  },

  addProseMirrorPlugins() {
    const { types, attributeName: attr, generate } = this.options
    const typeSet = new Set(types)

    return [new Plugin({
      key: new PluginKey('blockId'),
      appendTransaction(transactions, oldState, newState) {
        if (!transactions.some(tr => tr.docChanged) || transactions.some(tr => tr.getMeta('blockId:skip'))) return null

        // Nodes that start inside a changed range were inserted or rebuilt by this change.
        const transform = combineTransactionSteps(oldState.doc, [...transactions])
        const candidates: { pos: number, id: string | null }[] = []
        for (const { newRange } of getChangedRanges(transform)) {
          newState.doc.nodesBetween(newRange.from, newRange.to, (node, pos) => {
            if (pos >= newRange.from && typeSet.has(node.type.name)) candidates.push({ pos, id: node.attrs[attr] ?? null })
          })
        }
        if (!candidates.length) return null

        // Ids already used outside the candidates (built only when a candidate has an id).
        const needsCheck = candidates.some(c => c.id)
        const counts = new Map<string, number>()
        if (needsCheck) {
          newState.doc.descendants((node) => {
            const id = node.attrs[attr]
            if (id && typeSet.has(node.type.name)) counts.set(id, (counts.get(id) ?? 0) + 1)
          })
        }

        const inCandidates = new Map<string, number>()
        for (const c of candidates) if (c.id) inCandidates.set(c.id, (inCandidates.get(c.id) ?? 0) + 1)

        const updates = new Map<number, string>()
        const kept = new Set<string>()
        for (const c of candidates) {
          // An id already used by an untouched node (e.g. the original of a paste or a
          // duplicate) is replaced; among inserted nodes the first occurrence keeps it.
          const usedElsewhere = !!c.id && (counts.get(c.id) ?? 0) > (inCandidates.get(c.id) ?? 0)
          const repeated = !!c.id && kept.has(c.id)
          if (!c.id || usedElsewhere || repeated) updates.set(c.pos, generate())
          else kept.add(c.id)
        }
        if (!updates.size) return null

        const tr = newState.tr
        if (updates.size > BULK_THRESHOLD) {
          // Each attribute step re-validates the parent's whole content, so thousands of
          // them on top-level blocks are O(n²). Rebuild once instead.
          const anchor = newState.selection.from
          tr.replaceWith(0, newState.doc.content.size, rebuild(newState.doc, updates, attr).content)
          tr.setSelection(Selection.near(tr.doc.resolve(Math.min(anchor, tr.doc.content.size))))
        }
        else {
          for (const [pos, id] of updates) tr.setNodeAttribute(pos, attr, id)
        }
        return tr.setMeta('addToHistory', false)
      },
    })]
  },
})
