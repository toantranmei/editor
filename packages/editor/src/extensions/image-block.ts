import Image from '@tiptap/extension-image'
import { blockNodeView } from '../nodeviews/renderer'
import ImageView from '../nodeviews/ImageView.vue'
import { safeUrl } from '../safe-url'

export const ImageBlock = Image.extend({
  draggable: true,

  addAttributes() {
    const parent: Record<string, object> = this.parent?.() ?? {}
    return {
      ...parent,
      // Pasted / exported HTML never carries a `javascript:` or `data:text/html` source (KS-BUG-7).
      src: {
        ...parent.src,
        parseHTML: (el: HTMLElement) => safeUrl(el.getAttribute('src'), 'image'),
        renderHTML: (attrs: Record<string, unknown>) => ({ src: safeUrl(attrs.src, 'image') }),
      },
      width: {
        default: 100,
        parseHTML: el => Number(el.getAttribute('data-width')) || 100,
        renderHTML: attrs => ({ 'data-width': attrs.width }),
      },
      caption: {
        default: '',
        parseHTML: el => el.getAttribute('data-caption') || '',
        renderHTML: attrs => (attrs.caption ? { 'data-caption': attrs.caption } : {}),
      },
      /** Caption row shown (Notion hides it until "Caption" is clicked). Older docs: shown when there's text. */
      showCaption: {
        default: null,
        parseHTML: el => (el.hasAttribute('data-show-caption') ? el.getAttribute('data-show-caption') === 'true' : null),
        renderHTML: attrs => (attrs.showCaption === null ? {} : { 'data-show-caption': String(attrs.showCaption) }),
      },
      align: {
        default: 'center',
        parseHTML: el => el.getAttribute('data-align') || 'center',
        renderHTML: attrs => (attrs.align && attrs.align !== 'center' ? { 'data-align': attrs.align } : {}),
      },
      /** Non-destructive crop, see ImageCrop. */
      crop: {
        default: null,
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute('data-crop') ?? 'null')
          }
          catch {
            return null
          }
        },
        renderHTML: attrs => (attrs.crop ? { 'data-crop': JSON.stringify(attrs.crop) } : {}),
      },
    }
  },

  addNodeView() {
    return blockNodeView(ImageView)
  },
}).configure({ inline: false, allowBase64: true })
