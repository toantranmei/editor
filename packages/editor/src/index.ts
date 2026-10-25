// Extracted to dist/style.css on build; consumers import '@toantranmei/editor/style.css'.
import './styles/index.css'

export { default as MeiEditor } from './components/MeiEditor.vue'
export { MeiEditorPlugin, type MeiEditorPluginOptions } from './plugin'

export { createExtensions, type MeiExtensionsOptions } from './extensions'
export { MeiConfig, type ImageUploader, type MeiConfigStorage } from './config'
export { BlockDrop } from './extensions/block-drop'
export { Callout } from './extensions/callout'
export { Column, Columns } from './extensions/columns'
export { ImageBlock } from './extensions/image-block'
export { Embed, toEmbedUrl } from './extensions/embed'
export { CodeBlock, lowlight } from './extensions/code-block'
export { SlashCommand } from './extensions/slash-command'

export { filterBlocks, isNode, type BlockType } from './block-items'
export { collectExtensions, defineBlock, type BlockDefinition, type BlockSpec } from './define-block'
export * from './blocks'
export { ContentError, sanitizeContent, unwrapUnknown, wrapUnknown, type ContentIssue } from './content'
export { GLOBAL_BLOCKS_KEY, GLOBAL_TOKENS_KEY } from './plugin-key'
export { TableOfContents } from './extensions/toc'
export { MathBlock, MathInline } from './extensions/math'
export { FileBlock, type FileBlockOptions, type FileKind } from './extensions/file-block'
export { MentionNode, type MentionItem, type MentionKind, type MentionOptions } from './extensions/mention'
export { EmojiSuggestion } from './extensions/emoji'
export { MermaidPreview } from './extensions/mermaid'
export { HtmlBlock, htmlBlockCsp, type HtmlBlockOptions } from './extensions/html-block'
export { ToggleDetails } from './extensions/toggle'
export { UnknownBlock, UnknownInline } from './extensions/unknown'
export { CODE_LANGUAGES, loadLanguage } from './extensions/code-block'
export {
  blockAt, colorBlocks, currentRange, deleteBlocks, duplicateBlocks, moveBlocks, selectBlocks, turnBlocksInto, type BlockRange,
} from './block-ops'
export { BlockSelection, TURN_INTO_SHORTCUTS } from './extensions/block-selection'
export { COLORS, type ColorName } from './colors'
export { BgColor, BlockColor, COLORABLE_BLOCKS, TextColor } from './extensions/color-marks'
export {
  baseTokensCss,
  component as componentTokens,
  defineTokens,
  overridesCss,
  PALETTE_NAMES,
  primitive as primitiveTokens,
  semanticDark as semanticDarkTokens,
  semanticLight as semanticLightTokens,
  type PaletteName,
  type ThemeMode,
  type ThemeTokens,
} from './theme'
export { en, locales, resolveMessages, vi, type BlockGroup, type EditorMessages, type LocaleName, type PartialMessages } from './locale'

export { blockNodeView } from './nodeviews/renderer'
export { useClickOutside } from './composables/useClickOutside'
export { useEditable } from './composables/useEditable'
export { useScope } from './composables/useScope'

export type { Editor, JSONContent } from '@tiptap/vue-3'
