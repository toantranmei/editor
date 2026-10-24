/**
 * Node view dom → "is the board live?" (interacting or fullscreen). SketchView registers
 * itself; the node view's stopEvent (node.ts) reads it. Tiptap drops `defineExpose` from
 * node view components, so they can't be asked directly.
 */
export const liveViews = new WeakMap<Element, () => boolean>()
