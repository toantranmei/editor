import type { ChainedCommands, Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { Component } from 'vue'
import type { BlockGroup, EditorMessages } from './locale'

/** A menu entry (slash menu, "Turn into") contributed by a block definition. */
export interface BlockType {
  /** Stable id, also the key in `messages.blocks`. */
  id: string
  icon: Component
  /** Menu section: a built-in group or any custom label key. */
  group: BlockGroup | (string & {})
  /** Extra search terms (any language). Title and id are searched too. */
  keywords: string[]
  /** Markdown shortcut hint shown on the right of the menu row. */
  shortcut?: string
  /** Applies the block to the current (empty) line — used by the slash menu. */
  insert: (chain: ChainedCommands) => ChainedCommands
  /**
   * Converts a block (already cleared to paragraphs) into this type — used by "Turn into".
   * Blocks without it are not offered as a turn-into target.
   */
  turnInto?: (chain: ChainedCommands) => ChainedCommands
  /** Whether `node` is this block type, to mark the current type in menus. */
  matches?: (node: PMNode) => boolean
}

/** Menu items of the blocks loaded in this editor (see the `blocks` prop). */
export function enabledBlocks(editor: Editor): BlockType[] {
  return editor.storage.meiConfig?.items ?? []
}

/** Helper for `matches`: true when the node has this type name. */
export const isNode = (name: string) => (node: PMNode) => node.type.name === name

export function turnIntoBlocks(editor: Editor): BlockType[] {
  return enabledBlocks(editor).filter(b => b.turnInto)
}

export const blockTitle = (messages: EditorMessages, block: BlockType) => messages.blocks[block.id]?.title ?? block.id

/** Label of a menu section (custom groups fall back to their key). */
export const groupLabel = (messages: EditorMessages, group: string) => (messages.groups as Record<string, string>)[group] ?? group

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase()

/**
 * Filters blocks by query, best matches first:
 * exact term > a word starting with the query > substring anywhere.
 */
export function filterBlocks(blocks: BlockType[], query: string, messages: EditorMessages): BlockType[] {
  const q = normalize(query.trim())
  if (!q) return blocks

  const score = (b: BlockType) => {
    const terms = [blockTitle(messages, b), b.id, ...b.keywords].map(normalize)
    if (terms.includes(q)) return 3
    if (terms.some(t => t.split(/\s+/).some(w => w.startsWith(q)))) return 2
    if (terms.some(t => t.includes(q))) return 1
    return 0
  }

  return blocks
    .map((b, i) => ({ b, i, s: score(b) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(x => x.b)
}
