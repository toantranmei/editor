import type { JSONContent } from '@tiptap/core'
import { applyBoardUpdate, readBoardState } from '../block/clone'
import { collectBoardIds } from '../block/board-ids'
import type { SketchProvider } from './types'

export { collectBoardIds }

/** `type` of a board bundle file. */
export const BUNDLE_TYPE = 'mei-sketch/bundle'
export const BUNDLE_VERSION = 1
/** Largest bundle `importBoards` reads, bytes (50 MB). */
export const MAX_BUNDLE_BYTES = 50 * 1024 * 1024

/** A document plus the Yjs state of its boards, as one JSON file. */
export interface BoardBundle {
  type: typeof BUNDLE_TYPE
  version: typeof BUNDLE_VERSION
  doc: JSONContent
  /** board id → base64 of its Yjs state (`Y.encodeStateAsUpdate`). */
  boards: Record<string, string>
  /** Boards the document references that the provider had nothing stored for (not in `boards`). */
  missing: string[]
}

export interface ImportResult {
  /** The bundled document, unchanged (its board ids are the imported ones). */
  doc: JSONContent
  /** Boards merged into the provider. */
  imported: string[]
  /**
   * Boards not imported: ones the bundled document does not reference, malformed ones (bad base64 or Yjs data)
   * and ones the provider failed to write.
   */
  skipped: string[]
}

/** Characters per `String.fromCharCode` call: well under engines' argument limits. */
const CHUNK = 0x8000

/** Base64 of `bytes`, built in chunks (a large array spread into one call would overflow the stack). */
export function toBase64(bytes: Uint8Array): string {
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]))
  }
  return btoa(parts.join(''))
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

/** The bytes of a base64 string, or null when it is not valid base64. */
export function fromBase64(b64: string): Uint8Array | null {
  const s = b64.replace(/\s+/g, '')
  if (s.length % 4 !== 0 || !BASE64.test(s)) return null
  let bin: string
  try {
    bin = atob(s)
  } catch {
    return null
  }
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * Bundles `doc` with the boards it references (`collectBoardIds`) as a JSON Blob in the `mei-sketch/bundle`
 * format. Boards the provider has nothing for (or fails to open) are left out and listed in `missing`.
 */
export async function exportBoards(doc: JSONContent, provider: SketchProvider): Promise<Blob> {
  const boards: Record<string, string> = {}
  const missing: string[] = []
  for (const id of collectBoardIds(doc)) {
    let state: Uint8Array | null = null
    try {
      state = await readBoardState(provider, id)
    } catch (err) {
      console.warn(`[sketch] could not export board ${id}`, err)
    }
    if (state) boards[id] = toBase64(state)
    else missing.push(id)
  }
  const bundle: BoardBundle = { type: BUNDLE_TYPE, version: BUNDLE_VERSION, doc, boards, missing }
  return new Blob([JSON.stringify(bundle)], { type: 'application/json' })
}

/** UTF-8 byte length of `s`, stopping once it is over `max`. */
function utf8Length(s: string, max: number): number {
  if (s.length > max) return s.length
  let n = 0
  for (let i = 0; i < s.length && n <= max; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4
      i++
    } else n += 3
  }
  return n
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Reads a bundle (a Blob / File, or its text) and merges each board the bundled document references
 * (`collectBoardIds`) into `provider` (connect, `Y.applyUpdate`, wait for it to persist, destroy); other board ids
 * are skipped. Yjs updates merge: state a board already has is kept. Throws when the file is
 * over 50 MB, not JSON, or not a `mei-sketch/bundle` version 1; never for a single board: malformed ones are
 * skipped and reported.
 */
export async function importBoards(input: Blob | string, provider: SketchProvider): Promise<ImportResult> {
  const size = typeof input === 'string' ? utf8Length(input, MAX_BUNDLE_BYTES) : input.size
  if (size > MAX_BUNDLE_BYTES) throw new Error('sketch-block: bundle is larger than 50 MB')
  const text = typeof input === 'string' ? input : await input.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    throw new Error('sketch-block: bundle is not valid JSON', { cause: err })
  }
  if (!isRecord(data) || data.type !== BUNDLE_TYPE) throw new Error('sketch-block: not a mei-sketch/bundle (wrong type)')
  if (data.version !== BUNDLE_VERSION) throw new Error(`sketch-block: unsupported bundle version ${String(data.version)}`)
  if (!isRecord(data.doc)) throw new Error('sketch-block: bundle has no document')
  const boards = isRecord(data.boards) ? data.boards : {}

  const imported: string[] = []
  const skipped: string[] = []
  // only boards the bundled document shows: a crafted bundle must not write to other boards of the provider
  const referenced = new Set(collectBoardIds(data.doc as JSONContent))
  for (const [id, b64] of Object.entries(boards)) {
    if (!referenced.has(id)) {
      skipped.push(id)
      continue
    }
    const bytes = typeof b64 === 'string' && id ? fromBase64(b64) : null
    if (!bytes) {
      skipped.push(id)
      continue
    }
    try {
      await applyBoardUpdate(provider, id, bytes)
      imported.push(id)
    } catch (err) {
      console.warn(`[sketch] skipped board ${id} while importing`, err)
      skipped.push(id)
    }
  }
  return { doc: data.doc as JSONContent, imported, skipped }
}
