import type { LocaleName } from '@toantranmei/editor'
import type { Component, Ref } from 'vue'
import type { PageMessages } from './messages'

/** What a page link shows. */
export interface PageInfo {
  title: string
  /** Emoji (or any short text). `null` / empty: the default page icon. */
  icon?: string | null
}

/** A search result for "Link to page". */
export interface PageSearchResult extends PageInfo {
  id: string
}

/**
 * `pageBlock.configure(options)`. Every function comes from the app: the editor never stores
 * titles, it only keeps `pageId` in the document and asks `resolve` for the rest.
 */
export interface PageBlockOptions {
  /**
   * Reactive page info for a link. `undefined`: still loading. `null`: the page doesn't exist
   * or the user can't see it. Called once per node view (and again when its `pageId` changes),
   * so return a cached / shared ref when many links point to the same page.
   */
  resolve: ((pageId: string) => Ref<PageInfo | null | undefined>) | null
  /** Creates a child page of the current page and resolves to its id ("Page" in the slash menu). */
  createPage: (() => Promise<string>) | null
  /**
   * Opens a page: click or Enter on a link, and right after "Page" creates one (no event then).
   * With `href`, ⌘/Ctrl/Shift-click and middle-click are left to the browser (new tab / window).
   */
  open: ((pageId: string, event?: MouseEvent | KeyboardEvent) => void) | null
  /** Real link for middle-click, "copy link address" and read-only HTML. */
  href?: ((pageId: string) => string) | null
  /** Finds pages for "Link to page". Without it the item is hidden from the slash menu. */
  search?: ((query: string) => Promise<PageSearchResult[]>) | null
  /** Called when `createPage` (or `search`) fails. Default: `console.error`. */
  onError?: ((error: unknown) => void) | null
  /** Icon component for pages without an emoji. Default: lucide `FileText`. */
  defaultIcon?: Component | null
  /** Override any string, per locale: `{ en: { untitled: 'No title' } }`. */
  messages?: Partial<Record<LocaleName, Partial<PageMessages>>> | null
  /** Debounce for `search` while typing, ms. Default 150. */
  searchDelay?: number
}
