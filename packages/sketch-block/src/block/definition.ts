import { PenTool } from '@lucide/vue'
import { defineBlock } from '@toantranmei/editor'
import { SketchNode, type SketchOptions } from './node'

/** Whiteboard block for `<MeiEditor :blocks>`: `sketch` or `sketch.configure({ provider })`. */
export const sketch = defineBlock<SketchOptions>({
  name: 'sketch',
  defaults: { provider: null, defaultHeight: 480, user: null, onPasteClone: true },
  nodes: ['sketch'],
  extensions: o => [SketchNode.configure(o)],
  items: () => [{
    id: 'sketch',
    icon: PenTool,
    group: 'media',
    keywords: ['sketch', 'whiteboard', 'draw', 'canvas', 've', 'bang trang', '白板', '画图', '绘图'],
    insert: c => c.insertSketch(),
  }],
  messages: {
    vi: { blocks: { sketch: { title: 'Bảng vẽ', description: 'Vẽ sơ đồ, phác thảo tự do' } } },
    en: { blocks: { sketch: { title: 'Sketch', description: 'Whiteboard for diagrams and drawings' } } },
    zh: { blocks: { sketch: { title: '白板', description: '绘制图表和自由草图' } } },
  },
})
