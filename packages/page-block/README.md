# @toantranmei/page-block

Notion-style sub-pages for [`@toantranmei/editor`](https://www.npmjs.com/package/@toantranmei/editor).

- **Page** in the slash menu creates a child page (your `createPage`), inserts a link to it and opens it
- **Link to page** searches your pages (your `search`) and inserts a link to an existing one
- A link is a row with the page icon (emoji or a default page icon) and title, underlined on hover;
  click or `Enter` opens it, and with `href` it is a real `<a>` (middle-click, ⌘/Ctrl-click, copy link address)
- Titles are never stored in the document: a link keeps only `pageId`, and `resolve` gives the live
  title / icon, so renames show up everywhere at once. Loading, "Untitled" and "Page not found / no access" states
- Works in collaborative documents (`<MeiEditor :collaboration>`)
- Vietnamese, English and Simplified Chinese UI, styled with the editor's design tokens (light / dark)

## Install

```bash
npm i @toantranmei/page-block
```

Peers: `@toantranmei/editor` `^0.3.0`, `vue` `^3.5`, Tiptap `3.32.0` (`@tiptap/core`, `@tiptap/pm`,
`@tiptap/vue-3`) and `@lucide/vue`, all already installed with the editor. The build keeps them external, so
your app has one copy of each.

## Usage

```vue
<script setup lang="ts">
import { MeiEditor, defaultBlocks } from '@toantranmei/editor'
import { pageBlock } from '@toantranmei/page-block'
import '@toantranmei/editor/style.css'
import '@toantranmei/page-block/style.css'

const router = useRouter()
const props = defineProps<{ pageId: string }>()

const blocks = [
  ...defaultBlocks,
  pageBlock.configure({
    // Reactive info per page: undefined = loading, null = missing / no access. Cache it: one ref per page.
    resolve: id => pagesStore.infoRef(id),            // Ref<{ title, icon? } | null | undefined>
    createPage: () => api.createPage({ parent: props.pageId }).then(p => p.id),
    open: (id, event) => router.push(`/notes/${id}`),
    href: id => `/notes/${id}`,                       // optional: real links
    search: q => api.searchPages(q),                 // optional: enables "Link to page"
  }),
]
</script>

<template>
  <MeiEditor :key="pageId" :blocks="blocks" />
</template>
```

Type `/page` (vi: `/trang`, zh: `/页面`) or `/link to page` (vi: `/lien ket`, zh: `/链接`).

### Options

| Option        | Type | Description |
| ------------- | ---- | ----------- |
| `resolve`     | `(pageId) => Ref<PageInfo \| null \| undefined>` | Live title / icon of a page. `undefined`: loading, `null`: not found or no access. Called once per link view (and when its id changes) |
| `createPage`  | `() => Promise<string>` | Creates a child of the current page, returns its id. Without it "Page" is hidden |
| `open`        | `(pageId, event?) => void` | Opens a page: click / `Enter` on a link (with the event), and after "Page" (no event) |
| `href`        | `(pageId) => string` | Optional. Makes the row a real link; ⌘/Ctrl/Shift-click and middle-click are left to the browser |
| `search`      | `(query) => Promise<PageSearchResult[]>` | Optional. Enables "Link to page" (`{ id, title, icon? }[]`) |
| `onError`     | `(error) => void` | `createPage` / `search` failures. Default `console.error` |
| `defaultIcon` | `Component` | Icon for pages without an emoji. Default lucide `FileText` |
| `messages`    | `{ [locale]: Partial<PageMessages> }` | Override any string, e.g. `{ en: { untitled: 'No title' } }` |
| `searchDelay` | `number` | Debounce for `search`, ms (default 150) |

The slash-menu titles live in the editor messages: override them with the editor's `messages` prop
(`{ blocks: { page: { title, description }, linkToPage: { … } } }`).

### Document format

```json
{ "type": "pageLink", "attrs": { "pageId": "abc123", "id": "<block id>" } }
```

HTML: `<div data-type="page-link" data-page-id="abc123"><a href="…">Title</a></div>`.

To find a page's children, walk the document for `pageLink` nodes (e.g. when saving) and store the ids.

### Server-side HTML

`pageBlock` has a render hook for `renderHTML` (`@toantranmei/editor/render`): the row gets its title, icon
and URL from the render option `resolveLink(pageId)` (`null` renders "not found / no access" without a link;
without `resolveLink`, `href` gives the URL). Servers that shouldn't load Vue use the DOM-free entry:

```ts
import { renderHTML } from '@toantranmei/editor/render'
import { pageBlockRender } from '@toantranmei/page-block/render'

renderHTML(doc, { blocks: [pageBlockRender], resolveLink: id => ({ href: `/notes/p/${slug}/${id}`, title, icon }) })
```

### Commands

`editor.commands.insertPageLink(pageId)`, `createSubPage()` and `linkToPage()` (the slash items), plus
`insertPageLinkAt(editor, pos, pageId)` and `openLinkToPage(editor, options)` for your own UI.

### Styling

Only the editor's tokens, under `component.pageLink` (`color`, `hoverBg`, `radius`, `padding`, `gap`,
`fontWeight`, `iconSize`, `iconColor`, `underline`, `underlineHover`, `mutedColor`, `missingColor`,
`popoverWidth`):

```vue
<MeiEditor :tokens="{ components: { pageLink: { fontWeight: '600', underline: 'transparent' } } }" />
```

Classes: `.me-page-link` (`.is-loading`, `.is-missing`, `.is-selected`), `.me-page-link-row`,
`.me-page-link-icon`, `.me-page-link-title` (`.is-muted`), `.me-page-link-popover`.

## License

MIT
