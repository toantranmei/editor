import type { JSONContent } from '@tiptap/core'

const BOARD_ID = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Whether `id` is a valid board id: 1–64 of `A–Z a–z 0–9 _ -`. Board ids come from documents (pasted HTML, JSON,
 * bundles) and end up in URLs and storage keys, so anything else is refused. Pure: safe for the main entry.
 */
export function isBoardId(id: unknown): id is string {
  return typeof id === 'string' && BOARD_ID.test(id)
}

/**
 * `code` of the error a board copy (clone on paste) rejects with when its source has nothing stored, e.g. a block
 * pasted from another document whose board lives in another browser. A custom `provider.clone` can throw it too.
 */
export const BOARD_MISSING = 'sketch-board-missing'

/** An Error with `code` BOARD_MISSING for board `id`. */
export function boardMissingError(id: string): Error & { code: string } {
  return Object.assign(new Error(`sketch-block: board ${id} has nothing to copy`), { code: BOARD_MISSING })
}

/** Whether `err` says a board copy's source has nothing stored (`BOARD_MISSING`). */
export const isBoardMissing = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === BOARD_MISSING

/** Throws unless `id` is a valid board id (`isBoardId`). */
export function assertBoardId(id: unknown): asserts id is string {
  if (!isBoardId(id)) throw new Error(`sketch-block: invalid board id ${JSON.stringify(String(id)).slice(0, 80)}`)
}

/**
 * Board ids of the `sketch` blocks in a document's JSON (`editor.getJSON()`), depth-first, each once; invalid ids
 * (`isBoardId`) are skipped. Pure (no yjs): safe for the main entry.
 */
export function collectBoardIds(doc: JSONContent): string[] {
  const seen = new Set<string>()
  // explicit stack (deeply nested documents must not overflow the call stack); children pushed in reverse
  const stack: JSONContent[] = [doc]
  while (stack.length) {
    const node = stack.pop()!
    const id = node.type === 'sketch' ? node.attrs?.boardId : null
    if (isBoardId(id)) seen.add(id)
    const children = node.content
    if (Array.isArray(children)) for (let i = children.length - 1; i >= 0; i--) if (children[i]) stack.push(children[i]!)
  }
  return [...seen]
}
