import { Image, Video } from '@lucide/vue'
import { isNode } from '../block-items'
import { defineBlock } from '../define-block'
import { Embed } from '../extensions/embed'
import { ImageBlock } from '../extensions/image-block'

/** Images: upload (see the `uploadImage` prop) or paste a link. */
export const image = defineBlock({
  name: 'image',
  nodes: ['image'],
  extensions: () => [ImageBlock],
  items: () => [{
    id: 'image',
    icon: Image,
    group: 'media',
    keywords: ['image', 'photo', 'picture', 'img', 'anh', 'hinh anh'],
    insert: c => c.insertContent({ type: 'image', attrs: { src: null } }),
    matches: isNode('image'),
  }],
})

export const embed = defineBlock({
  name: 'embed',
  nodes: ['embed'],
  extensions: () => [Embed],
  items: () => [{
    id: 'embed',
    icon: Video,
    group: 'media',
    keywords: ['video', 'youtube', 'embed', 'iframe', 'vimeo', 'nhung'],
    insert: c => c.setEmbed({ src: null }),
    matches: isNode('embed'),
  }],
})
