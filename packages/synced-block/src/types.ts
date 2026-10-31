import type { BlockDefinition, LocaleName } from '@toantranmei/editor'
import type * as Y from 'yjs'
import type { SyncedMessages } from './messages'

/** The shared document behind a synced block, from your app (cache it: one Y.Doc per source). */
export interface SyncedSource {
  doc: Y.Doc
  /** Whether this user may edit the source (read-only otherwise). */
  editable: boolean
  /** `Y.XmlFragment` name in `doc`. Default `'default'`. */
  field?: string
}

export interface SyncedBlockOptions {
  /** Shared document for a source id (contract 3.4: doc id = `sourceId`). `null`: missing / no access. */
  doc: ((sourceId: string) => SyncedSource | null | Promise<SyncedSource | null>) | null
  /** Creates a new source (resource type `synced_block`, parent = this page) and returns its id. */
  create: (() => Promise<string>) | null
  /** Link to the page that owns the source ("Edit original"). */
  originHref: ((sourceId: string) => string | null) | null
  /**
   * Blocks of the nested editor. Use the page editor's list (synced blocks themselves are
   * left out, so a source can't embed itself). Default: the editor's `defaultBlocks`.
   */
  blocks: BlockDefinition[] | null
  onError: ((error: unknown) => void) | null
  messages: Partial<Record<LocaleName, Partial<SyncedMessages>>> | null
}
