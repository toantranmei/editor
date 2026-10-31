import type { JSONContent } from '@tiptap/core'
import type { EditorMessages, LocaleName, PartialMessages } from '../locale'

/** A mark as stored in the document JSON. */
export interface JSONMark {
  type: string
  attrs?: Record<string, any>
}

/** Where a page link points, from `resolveLink`. `null`: not found / no access. */
export interface ResolvedLink {
  href: string
  title?: string | null
  /** Emoji (or short text) shown before the title. */
  icon?: string | null
}

/** URL contexts for `safeUrl`. */
export type UrlKind =
  /** `<a href>`: http(s), mailto, relative. */
  | 'link'
  /** `<img src>` / `<audio src>` / `<video src>`: link + `data:image|audio|video/*`. */
  | 'media'
  /** `<a href download>` for attachments: link + inert `data:` files. */
  | 'download'
  /** `<iframe src>`: absolute http(s) only. */
  | 'frame'

/** Minimal KaTeX surface used by the renderer (`import katex from 'katex'`). */
export interface KatexLike {
  renderToString: (tex: string, options?: Record<string, unknown>) => string
}

/** Helpers handed to block render hooks. */
export interface RenderContext {
  locale: LocaleName
  /** Editor messages for `locale` (with block messages and overrides merged). */
  messages: EditorMessages
  options: RenderOptions
  /** Renders the node's children (blocks or inline content). */
  children: (node: JSONContent) => string
  /** Renders any node (or a whole `doc`), e.g. content loaded from elsewhere. */
  render: (node: JSONContent) => string
  /** ` data-id="…" data-text-color="…" data-bg-color="…"` for a block (leading space, escaped). */
  blockAttrs: (node: JSONContent) => string
  /** Escapes text / attribute values (`& < > " '`). */
  escape: (value: unknown) => string
  /** ` name="value"` (escaped), or '' when value is null / undefined / false. */
  attr: (name: string, value: unknown) => string
  /** The URL when its scheme is allowed for `kind`, else null. */
  safeUrl: (url: unknown, kind?: UrlKind) => string | null
  /** Plain text content of a node. */
  text: (node: JSONContent) => string
  /** Inline SVG for a built-in icon name (`file`, `fileText`, `audio`, `video`, `download`). */
  icon: (name: string) => string
}

export type NodeRenderer = (node: JSONContent, ctx: RenderContext) => string
export type MarkRenderer = (mark: JSONMark, inner: string, ctx: RenderContext) => string

/** What a block contributes to `renderHTML` (BlockDefinition `render`). */
export interface BlockRenderers {
  nodes?: Record<string, NodeRenderer>
  marks?: Record<string, MarkRenderer>
}

/** Anything with render hooks: a BlockDefinition or a light `{ name, render }` object. */
export interface RenderBlock {
  name?: string
  options?: any
  render?: BlockRenderers
}

export interface MentionTarget {
  id: string
  label?: string | null
  kind: 'user' | 'page' | 'date'
  href?: string | null
}

export interface RenderOptions {
  /**
   * Blocks whose render hooks are used (BlockDefinitions, e.g. the editor's block list, or
   * `{ name, render }`). Built-in blocks always render; options of `html` are read from here.
   */
  blocks?: RenderBlock[]
  /** UI strings (TOC title, "Untitled"…) and date formats. Default `'vi'`. */
  locale?: LocaleName
  messages?: PartialMessages
  /** Resolves a page id (page links, `@toantranmei/page-block`). `null`: missing / no access. */
  resolveLink?: (pageId: string) => ResolvedLink | null
  /** Link for a person / page mention. Default: the mention's stored `href`. */
  mentionHref?: (mention: MentionTarget) => string | null
  /**
   * KaTeX for math blocks (`import katex from 'katex'`). Without it equations render as
   * escaped TeX source. `renderHTMLAsync` loads it automatically when a document has math.
   */
  katex?: KatexLike | null
  /**
   * Wrap the HTML in the editor's scope (`.me-scope.me-root.me-render > .me-content`) so
   * `@toantranmei/editor/style.css` styles it. Default true.
   */
  wrap?: boolean
  /** Color mode of the wrapper: `auto` follows `<html class="dark">`. */
  theme?: 'auto' | 'light' | 'dark'
  /** Extra classes on the wrapper. */
  className?: string
  /** Open external links in a new tab (`target="_blank" rel="noopener noreferrer"`). Default true. */
  externalLinksInNewTab?: boolean
  /** Extra data for custom block renderers (e.g. database rows, synced block content). */
  data?: Record<string, unknown>
}
