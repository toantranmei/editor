import type { JSONContent } from '@tiptap/core'

/**
 * Board ids of the `sketch` blocks in a document's JSON (`editor.getJSON()`), depth-first, each once. Pure (no
 * yjs): safe for the main entry.
 */
export function collectBoardIds(doc: JSONContent): string[] {
  const seen = new Set<string>()
  // explicit stack (deeply nested documents must not overflow the call stack); children pushed in reverse
  const stack: JSONContent[] = [doc]
  while (stack.length) {
    const node = stack.pop()!
    const id = node.type === 'sketch' ? node.attrs?.boardId : null
    if (typeof id === 'string' && id) seen.add(id)
    const children = node.content
    if (Array.isArray(children)) for (let i = children.length - 1; i >= 0; i--) if (children[i]) stack.push(children[i]!)
  }
  return [...seen]
}
