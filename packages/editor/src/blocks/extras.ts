import { AudioLines, AtSign, File, Film, Radical, Sigma, TableOfContents, Workflow } from '@lucide/vue'
import { type BlockType, isNode } from '../block-items'
import { defineBlock } from '../define-block'
import { CodeBlock } from '../extensions/code-block'
import { EmojiSuggestion } from '../extensions/emoji'
import { FileBlock, type FileBlockOptions, type FileKind } from '../extensions/file-block'
import { MathBlock, MathInline } from '../extensions/math'
import { MentionNode, type MentionOptions } from '../extensions/mention'
import { MermaidPreview, SAMPLE_MERMAID } from '../extensions/mermaid'
import { TableOfContents as TocNode } from '../extensions/toc'

/** Table of contents from the document's headings. */
export const toc = defineBlock({
  name: 'toc',
  nodes: ['tableOfContents'],
  extensions: () => [TocNode],
  items: () => [{
    id: 'toc',
    icon: TableOfContents,
    group: 'advanced',
    keywords: ['toc', 'table of contents', 'outline', 'muc luc'],
    insert: c => c.insertTableOfContents(),
    matches: isNode('tableOfContents'),
  }],
})

/**
 * Equations with KaTeX (peer dependency `katex`, loaded on first use). `$$ ` → block, `$$x$$` → inline.
 * Vue apps also import 'katex/dist/katex.min.css' (the Nuxt module adds it automatically).
 */
export const math = defineBlock({
  name: 'math',
  nodes: ['mathBlock'],
  extensions: () => [MathBlock, MathInline],
  items: () => [
    { id: 'mathBlock', icon: Sigma, group: 'advanced', keywords: ['math', 'equation', 'latex', 'katex', 'cong thuc', 'toan'], shortcut: '$$', insert: c => c.insertMathBlock(), matches: isNode('mathBlock') },
    { id: 'mathInline', icon: Radical, group: 'advanced', keywords: ['inline math', 'equation', 'latex', 'cong thuc'], insert: c => c.insertMathInline() },
  ],
})

/** Mermaid diagrams: code blocks in `mermaid` with a live preview (peer dependency `mermaid`). */
export const mermaid = defineBlock({
  name: 'mermaid',
  nodes: ['codeBlock'],
  extensions: () => [CodeBlock, MermaidPreview],
  items: () => [{
    id: 'mermaid',
    icon: Workflow,
    group: 'advanced',
    keywords: ['mermaid', 'diagram', 'flowchart', 'chart', 'so do'],
    insert: c => c.setCodeBlock({ language: 'mermaid' }).insertContent(SAMPLE_MERMAID),
    matches: n => n.type.name === 'codeBlock' && n.attrs.language === 'mermaid',
  }],
})

/** `:` emoji picker (inserts unicode text). */
export const emoji = defineBlock({
  name: 'emoji',
  extensions: () => [EmojiSuggestion],
})

const FILE_ICONS = { file: File, audio: AudioLines, video: Film } as const

/** File attachments, audio and video. `file.configure({ upload, maxSize })`. */
export const file = defineBlock<FileBlockOptions>({
  name: 'file',
  defaults: { upload: null, maxSize: 10 },
  nodes: ['fileBlock'],
  extensions: o => [FileBlock.configure(o)],
  items: () => (['file', 'audio', 'video'] as FileKind[]).map((kind): BlockType => ({
    id: `file-${kind}`,
    icon: FILE_ICONS[kind],
    group: 'media',
    keywords: kind === 'file' ? ['file', 'attachment', 'upload', 'tep', 'dinh kem'] : kind === 'audio' ? ['audio', 'sound', 'music', 'am thanh'] : ['video', 'upload', 'mp4', 'tai len'],
    insert: c => c.insertFileBlock(kind),
    matches: n => n.type.name === 'fileBlock' && n.attrs.kind === kind,
  })),
})

/** `@` mentions: dates built in; people/pages via `mention.configure({ search })`. */
export const mention = defineBlock<MentionOptions>({
  name: 'mention',
  defaults: { search: null, onClick: null, onRemind: null, reminderHelpUrl: null },
  extensions: o => [MentionNode.configure(o)],
  items: () => [{
    id: 'mention',
    icon: AtSign,
    group: 'basic',
    keywords: ['mention', 'person', 'page', 'date', 'nhac', 'ngay'],
    insert: c => c.insertContent('@'),
  }],
})

