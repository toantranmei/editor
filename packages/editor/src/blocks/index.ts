/**
 * Built-in blocks. Pass the ones you want to `<MeiEditor :blocks>`:
 *   [...defaultBlocks, math, toc, file.configure({ upload })]
 * Heavy libraries (code grammars, KaTeX, Mermaid, emoji data) load on first use.
 */
import type { BlockDefinition } from '../define-block'
import { callout, codeBlock, columns, table, toggle, toggleHeading } from './advanced'
import { bulletList, divider, heading, orderedList, quote, taskList, text } from './basic'
import { embed, image } from './media'

export { callout, codeBlock, columns, table, toggle, toggleHeading } from './advanced'
export { bulletList, divider, heading, orderedList, quote, taskList, text } from './basic'
export { emoji, file, math, mention, mermaid, toc } from './extras'
export { embed, image } from './media'

/** What `<MeiEditor>` loads when `blocks` isn't given. */
export const defaultBlocks: BlockDefinition[] = [
  heading, bulletList, orderedList, taskList, quote, divider, codeBlock,
  image, embed, callout, toggle, toggleHeading, table, columns,
]

export { BLOCK_NAMES, type BlockName } from '../block-names'
