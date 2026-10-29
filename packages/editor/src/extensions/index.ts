import type { AnyExtension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { MeiConfig, type MeiConfigStorage } from '../config'
import { collectExtensions, type BlockDefinition } from '../define-block'
import { BlockDrop } from './block-drop'
import { BlockId } from './block-id'
import { BlockSelection } from './block-selection'
import { Placeholder } from './placeholder'
import { BgColor, BlockColor, TextColor } from './color-marks'
import { SlashCommand } from './slash-command'
import { UnknownBlock, UnknownInline } from './unknown'

export interface MeiExtensionsOptions extends Partial<MeiConfigStorage> {
  /** Block definitions to load (their extensions and menu items). */
  blocks: BlockDefinition[]
  /**
   * Built-in undo / redo (StarterKit's `undoRedo`). Default true. Set false with
   * `collaborationExtensions()` (`@toantranmei/editor/collaboration`), which brings Yjs undo.
   */
  undoRedo?: boolean
}

/**
 * Editor core (always loaded) + the extensions of the given blocks.
 * Core: paragraphs, text marks, links, history, colors, slash menu, drag & drop,
 * block selection, block ids and the unknown-block fallback.
 */
export function createExtensions({ blocks, undoRedo = true, ...config }: MeiExtensionsOptions): AnyExtension[] {
  return [
    MeiConfig.configure({ ...config, items: blocks.flatMap(b => b.items), formatActions: blocks.flatMap(b => b.formatActions ?? []) }),
    StarterKit.configure({
      // Block types come from block definitions.
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      ...(undoRedo ? {} : { undoRedo: false as const }),
      dropcursor: { color: '#93c5fd', width: 3 },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    }),
    Placeholder.configure({
      placeholder: ({ editor, node }) => {
        const m = editor.storage.meiConfig.messages
        if (node.type.name === 'heading') return m.headingPlaceholder(node.attrs.level)
        if (node.type.name === 'detailsSummary') return m.togglePlaceholder
        return m.placeholder
      },
    }),
    TextColor,
    BgColor,
    BlockColor,
    SlashCommand,
    BlockDrop,
    BlockSelection,
    UnknownBlock,
    UnknownInline,
    ...collectExtensions(blocks),
    // Stable ids for block-level nodes (used by "Copy link to block").
    BlockId.configure({ types: ['paragraph', ...new Set(blocks.flatMap(b => b.nodes))] }),
  ]
}
