import type { JSONContent } from '@toantranmei/editor'

export const DEFAULT_TITLE = 'Trang không có tiêu đề'

const p = (text?: string, marks?: JSONContent['marks']): JSONContent =>
  text ? { type: 'paragraph', content: [{ type: 'text', text, marks }] } : { type: 'paragraph' }

export const DEFAULT_CONTENT: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Chào mừng 👋' }] },
    { type: 'tableOfContents' },
    p('Đây là editor dạng block giống Notion. Một vài mẹo:'),
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Gõ ' }, { type: 'text', text: '/', marks: [{ type: 'code' }] }, { type: 'text', text: ' để chọn loại block.' }] }] },
        { type: 'listItem', content: [p('Rê chuột vào block, bấm ⋮⋮ để đổi loại, đổi màu, nhân bản, xoá — hoặc kéo để di chuyển.')] },
        { type: 'listItem', content: [p('Bôi đen chữ để hiện thanh định dạng.')] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Markdown: ' }, { type: 'text', text: '# ', marks: [{ type: 'code' }] }, { type: 'text', text: ' ' }, { type: 'text', text: '- ', marks: [{ type: 'code' }] }, { type: 'text', text: ' ' }, { type: 'text', text: '[] ', marks: [{ type: 'code' }] }, { type: 'text', text: ' ' }, { type: 'text', text: '> ', marks: [{ type: 'code' }] }, { type: 'text', text: ' ' }, { type: 'text', text: '```', marks: [{ type: 'code' }] }, { type: 'text', text: ' ' }, { type: 'text', text: '---', marks: [{ type: 'code' }] }] }] },
      ],
    },
    {
      type: 'callout',
      attrs: { icon: '💡', color: 'yellow' },
      content: [p('Nội dung được tự động lưu vào localStorage của trình duyệt.')],
    },
    {
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: true }, content: [p('Thử slash menu')] },
        { type: 'taskItem', attrs: { checked: false }, content: [p('Thử kéo thả block')] },
      ],
    },
    {
      type: 'details',
      attrs: { open: false },
      content: [
        { type: 'detailsSummary', content: [{ type: 'text', text: 'Bấm mũi tên để mở toggle' }] },
        { type: 'detailsContent', content: [p('Nội dung ẩn bên trong toggle.')] },
      ],
    },
    {
      type: 'columns',
      content: [
        { type: 'column', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Cột trái' }] }, p('Mỗi cột chứa được nhiều block.')] },
        { type: 'column', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Cột phải' }] }, p('Kéo block vào/ra khỏi cột.')] },
      ],
    },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Công thức & sơ đồ' }] },
    { type: 'mathBlock', attrs: { latex: 'e^{i\\pi} + 1 = 0' } },
    { type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: 'flowchart LR\n  A[Soạn thảo] --> B{Duyệt?}\n  B -- Có --> C[Xuất bản]\n  B -- Không --> A' }] },
    {
      type: 'details',
      attrs: { level: 2, open: true },
      content: [
        { type: 'detailsSummary', content: [{ type: 'text', text: 'Toggle tiêu đề' }] },
        { type: 'detailsContent', content: [p('Nội dung thu gọn dưới tiêu đề.')] },
      ],
    },
    { type: 'codeBlock', attrs: { language: 'javascript' }, content: [{ type: 'text', text: 'const hello = (name) => `Xin chào, ${name}!`\nconsole.log(hello(\'Notion\'))' }] },
    p(),
  ],
}
