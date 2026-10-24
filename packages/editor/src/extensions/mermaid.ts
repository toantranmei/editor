import { Extension } from '@tiptap/core'

/** Marker: when loaded, code blocks in the `mermaid` language show a live diagram. */
export const MermaidPreview = Extension.create({ name: 'mermaidPreview' })

export const SAMPLE_MERMAID = 'flowchart LR\n  A[Ý tưởng] --> B{Duyệt?}\n  B -- Có --> C[Làm]\n  B -- Không --> A'
