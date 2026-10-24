import Image from '@tiptap/extension-image'
import { blockNodeView } from '../nodeviews/renderer'
import ImageView from '../nodeviews/ImageView.vue'

export const ImageBlock = Image.extend({
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
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
    }
  },

  addNodeView() {
    return blockNodeView(ImageView)
  },
}).configure({ inline: false, allowBase64: true })
