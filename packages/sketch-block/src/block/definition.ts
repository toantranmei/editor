import { PenTool } from '@lucide/vue'
import { defineBlock } from '@toantranmei/editor'
import { SketchNode, type SketchOptions } from './node'

/** Whiteboard block for `<MeiEditor :blocks>`: `sketch` or `sketch.configure({ provider })`. */
export const sketch = defineBlock<SketchOptions>({
  name: 'sketch',
  defaults: { provider: null, defaultHeight: 480 },
  nodes: ['sketch'],
  extensions: o => [SketchNode.configure(o)],
  items: () => [{
    id: 'sketch',
    icon: PenTool,
    group: 'media',
    keywords: ['sketch', 'whiteboard', 'draw', 'canvas', 've', 'bang trang'],
    insert: c => c.insertSketch(),
  }],
  messages: {
    vi: { blocks: { sketch: { title: 'Bảng vẽ', description: 'Vẽ sơ đồ, phác thảo tự do' } } },
    en: { blocks: { sketch: { title: 'Sketch', description: 'Whiteboard for diagrams and drawings' } } },
  },
})
