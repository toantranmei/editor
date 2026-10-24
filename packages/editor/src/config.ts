import { Extension } from '@tiptap/core'
import { shallowReactive } from 'vue'
import type { BlockType } from './block-items'
import { type EditorMessages, type LocaleName, vi } from './locale'

/** Uploads an image file and resolves to its public URL. */
export type ImageUploader = (file: File) => Promise<string>

export interface MeiConfigStorage {
  messages: EditorMessages
  locale: LocaleName
  /** Menu entries of the loaded blocks (slash menu, "Turn into"). */
  items: BlockType[]
  /** Custom uploader. Without it, images are inlined as base64 data URLs. */
  uploadImage: ImageUploader | null
  /** Max image size in MB. */
  maxImageSize: number
  /**
   * Attributes for every element that carries theme tokens: the editor root and
   * popovers teleported to <body> (so they get the same mode and overrides).
   */
  scope: { class: string[], 'data-me-id': string }
}

declare module '@tiptap/core' {
  interface Storage {
    meiConfig: MeiConfigStorage
  }
}

/** Holds editor-wide settings that menus and node views read at runtime. */
export const MeiConfig = Extension.create<Partial<MeiConfigStorage>, MeiConfigStorage>({
  name: 'meiConfig',

  // Reactive so menus and node views re-render when the locale or options change.
  addStorage() {
    return shallowReactive({
      messages: this.options.messages ?? vi,
      locale: this.options.locale ?? 'vi',
      items: this.options.items ?? [],
      uploadImage: this.options.uploadImage ?? null,
      maxImageSize: this.options.maxImageSize ?? 5,
      scope: this.options.scope ?? { 'class': ['me-scope'], 'data-me-id': '' },
    })
  },
})
