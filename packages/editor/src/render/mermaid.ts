export interface HydrateMermaidOptions {
  /** Dark diagrams. Default: `<html class="dark">`. */
  dark?: boolean
}

/**
 * Browser only: turns the `<pre class="mermaid">` blocks of a rendered page into diagrams.
 * Loads the optional peer `mermaid` on first use; does nothing when there are no diagrams.
 * Uses `securityLevel: 'strict'` (labels sanitized, no click handlers), like the editor.
 *
 * @example
 * onMounted(() => hydrateMermaid(articleEl.value))
 */
export async function hydrateMermaid(root?: ParentNode | null, options: HydrateMermaidOptions = {}): Promise<void> {
  if (typeof document === 'undefined') return
  const scope = root ?? document
  const nodes = [...scope.querySelectorAll<HTMLElement>('pre.mermaid:not([data-processed])')]
  if (!nodes.length) return
  const mermaid = (await import('mermaid')).default
  const dark = options.dark ?? document.documentElement.classList.contains('dark')
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' })
  await mermaid.run({ nodes, suppressErrors: true })
}
