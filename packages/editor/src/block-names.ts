/** Names accepted by the Nuxt module's `meiEditor.blocks` option (kept free of runtime imports). */
export const BLOCK_NAMES = [
  'default', 'heading', 'bulletList', 'orderedList', 'taskList', 'quote', 'divider', 'codeBlock',
  'image', 'embed', 'callout', 'toggle', 'toggleHeading', 'table', 'columns',
  'toc', 'math', 'mermaid', 'emoji', 'file', 'mention',
] as const
export type BlockName = typeof BLOCK_NAMES[number]

/** Optional peer dependency each block needs at runtime. */
export const BLOCK_PEERS: Partial<Record<BlockName, string>> = { math: 'katex', mermaid: 'mermaid' }
