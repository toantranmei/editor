import type { AnyExtension } from '@tiptap/core'
import type { BlockType } from './block-items'
import type { LocaleName, PartialMessages } from './locale'

export interface BlockSpec<O extends object = Record<string, never>> {
  /** Unique name, e.g. `'heading'`, `'math'`. */
  name: string
  /** Default options, overridable with `.configure()`. */
  defaults?: O
  /** Tiptap extensions the block needs. Extensions shared by blocks are de-duplicated by name. */
  extensions?: (options: O) => AnyExtension[]
  /** Slash menu / "Turn into" entries. */
  items?: (options: O) => BlockType[]
  /** ProseMirror node types this block creates (they get stable ids). */
  nodes?: string[]
  /** UI strings per locale, merged into the editor messages (for custom blocks). */
  messages?: Partial<Record<LocaleName, PartialMessages>>
}

/** A block ready to pass to `<MeiEditor :blocks>`. */
export interface BlockDefinition<O extends object = any> {
  name: string
  options: O
  extensions: AnyExtension[]
  items: BlockType[]
  nodes: string[]
  messages?: Partial<Record<LocaleName, PartialMessages>>
  /** Returns a copy with different options: `file.configure({ upload })`. */
  configure: (options: Partial<O>) => BlockDefinition<O>
}

/**
 * Declares a block: its Tiptap extensions, menu entries and strings, in one place.
 *
 * @example
 * export const invoice = defineBlock({
 *   name: 'invoice',
 *   nodes: ['invoice'],
 *   extensions: () => [InvoiceNode],
 *   items: () => [{ id: 'invoice', icon: Receipt, group: 'advanced', keywords: ['bill'], insert: c => c.insertInvoice() }],
 *   messages: { vi: { blocks: { invoice: { title: 'Hoá đơn', description: 'Chèn hoá đơn' } } } },
 * })
 */
export function defineBlock<O extends object = Record<string, never>>(spec: BlockSpec<O>): BlockDefinition<O> {
  const build = (options: O): BlockDefinition<O> => ({
    name: spec.name,
    options,
    extensions: spec.extensions?.(options) ?? [],
    items: spec.items?.(options) ?? [],
    nodes: spec.nodes ?? [],
    messages: spec.messages,
    configure: overrides => build({ ...options, ...overrides }),
  })
  return build({ ...(spec.defaults ?? {}) } as O)
}

/** Flattens block definitions into one extension list (first extension per name wins). */
export function collectExtensions(blocks: BlockDefinition[]): AnyExtension[] {
  const seen = new Set<string>()
  return blocks.flatMap(b => b.extensions).filter((ext) => {
    if (seen.has(ext.name)) return false
    seen.add(ext.name)
    return true
  })
}
