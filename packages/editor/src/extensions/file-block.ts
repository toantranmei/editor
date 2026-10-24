import { mergeAttributes, Node } from '@tiptap/core'
import { blockNodeView } from '../nodeviews/renderer'
import FileView from '../nodeviews/FileView.vue'

export type FileKind = 'file' | 'audio' | 'video'

export interface FileBlockOptions {
  /** Uploads a file and resolves to its URL. Without it files are inlined as base64. */
  upload: ((file: File, kind: FileKind) => Promise<string>) | null
  /** Max size in MB. */
  maxSize: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fileBlock: { insertFileBlock: (kind?: FileKind) => ReturnType }
  }
}

/** Attachment, audio player or video player, uploaded or linked. */
export const FileBlock = Node.create<FileBlockOptions>({
  name: 'fileBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions: () => ({ upload: null, maxSize: 10 }),

  addAttributes() {
    const attr = (name: string, fallback: unknown = null) => ({
      default: fallback,
      parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? fallback,
      renderHTML: (attrs: Record<string, any>) => (attrs[name] == null ? {} : { [`data-${name}`]: attrs[name] }),
    })
    return { src: attr('src'), name: attr('name'), size: attr('size'), mime: attr('mime'), kind: attr('kind', 'file') }
  },

  parseHTML: () => [{ tag: 'div[data-type="file"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'file' })],

  addCommands() {
    return { insertFileBlock: (kind = 'file') => ({ commands }) => commands.insertContent({ type: this.name, attrs: { kind } }) }
  },

  addNodeView: () => blockNodeView(FileView),
})
