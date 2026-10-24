# @toantranmei/editor

Notion-style block editor for **Vue 3** and **Nuxt**, built on [Tiptap](https://tiptap.dev).

- Slash menu (`/`) with recent blocks and color commands, drag handle, block menu with search
- Notion-style block selection and shortcuts, drag & drop with columns and nesting
- Bubble menu: bold, italic, underline, strike, code, link, text/background color
- Markdown shortcuts: `#`, `-`, `1.`, `[]`, `>`, ` ``` `, `---`
- Blocks: text, headings (H1–H4), lists, to-do, quote, divider, code, image, video/embed,
  callout, toggle, toggle headings, table, columns — plus opt-in table of contents, math (KaTeX),
  Mermaid diagrams, emoji picker, file/audio/video uploads and @mentions
- Pick the blocks each app loads; heavy libraries load only when a document needs them
- Vietnamese and English UI, themable with CSS variables, ships its own CSS (no Tailwind needed)

## Install

```bash
npm i @toantranmei/editor
# or: pnpm add @toantranmei/editor / yarn add @toantranmei/editor
```

Requires Vue `^3.5`. Works with any Vite-based app.

## Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@toantranmei/editor/nuxt'],
})
```

The module registers `<MeiEditor>` as a client-only component and adds the CSS.

```vue
<script setup lang="ts">
import type { JSONContent } from '@toantranmei/editor'

const doc = ref<JSONContent | null>(null)
</script>

<template>
  <MeiEditor v-model="doc" />
</template>
```

Module options (`meiEditor` key in `nuxt.config`):

| Option          | Default          | Description                                   |
| --------------- | ---------------- | --------------------------------------------- |
| `componentName` | `'MeiEditor'` | Name of the auto-registered component         |
| `css`           | `true`           | Add `@toantranmei/editor/style.css` automatically  |
| `prebundle`     | `true`           | Pre-bundle Tiptap deps in Vite dev            |
| `blocks`        | –                | Block names loaded app-wide (`'default'` = `defaultBlocks`) |
| `tokens`        | –                | Design token overrides for every editor       |

## Vue 3 + Vite

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { MeiEditor, type JSONContent } from '@toantranmei/editor'
import '@toantranmei/editor/style.css'

const doc = ref<JSONContent | null>(null)
</script>

<template>
  <MeiEditor v-model="doc" />
</template>
```

Or register it globally:

```ts
import { createApp } from 'vue'
import { MeiEditorPlugin } from '@toantranmei/editor'
import '@toantranmei/editor/style.css'

createApp(App).use(MeiEditorPlugin).mount('#app')
```

## Choosing blocks

Each block is a self-contained module (extensions + menu entries + UI). The editor loads
`defaultBlocks` unless you pass `blocks`:

```ts
import { defaultBlocks, emoji, file, math, mention, mermaid, toc } from '@toantranmei/editor'

const blocks = [
  ...defaultBlocks,
  toc,
  emoji,
  math,       // needs `npm i katex` + import 'katex/dist/katex.min.css'
  mermaid,    // needs `npm i mermaid`
  file.configure({ upload: async (f, kind) => uploadToS3(f), maxSize: 20 }),
  mention.configure({
    search: q => api.searchPeopleAndPages(q), // → [{ id, label, kind: 'user' | 'page', avatar?, href? }]
    onClick: item => router.push(`/u/${item.id}`),
  }),
]
```

```vue
<MeiEditor v-model="doc" :blocks="blocks" />
```

App-wide: `app.use(MeiEditorPlugin, { blocks })`, or in Nuxt `meiEditor: { blocks: ['default', 'toc', 'math'] }`
(only the listed blocks are imported; the module also adds KaTeX's CSS for `math`).

| Block | In `defaultBlocks` | Notes |
| --- | --- | --- |
| `heading` (H1–H4), `bulletList`, `orderedList`, `taskList`, `quote`, `divider` | ✓ | `heading.configure({ levels: [1, 2, 3] })` |
| `codeBlock` | ✓ | Grammars load per language on first use |
| `image`, `embed` | ✓ | Upload via the `uploadImage` prop |
| `callout`, `toggle`, `toggleHeading`, `table`, `columns` | ✓ | |
| `toc` | – | Table of contents from headings |
| `math` | – | Optional peer `katex` |
| `mermaid` | – | Optional peer `mermaid`; code blocks in `mermaid` show a live diagram |
| `emoji` | – | Type `:` + 2 letters; data loads on first use (vi/en search) |
| `file` | – | File, audio, video; `upload`, `maxSize` (MB, base64 when no `upload`) |
| `mention` | – | `@` people/pages via `search`; dates (today, 25/12…) built in. Click a date for a Notion-style picker (typed date/time, end date, date & time formats, reminders, clear); click a person/page to search and switch (read-only: `onClick` / page link). Reminders: `onRemind`, `getMentionReminders(doc)`, `reminderHelpUrl` |

### Custom blocks

```ts
import { defineBlock } from '@toantranmei/editor'
import { Receipt } from '@lucide/vue'

export const invoice = defineBlock({
  name: 'invoice',
  nodes: ['invoice'],
  extensions: () => [InvoiceNode], // your Tiptap node
  items: () => [{ id: 'invoice', icon: Receipt, group: 'advanced', keywords: ['bill'], insert: c => c.insertInvoice() }],
  messages: { vi: { blocks: { invoice: { title: 'Hoá đơn', description: 'Chèn hoá đơn' } } } },
})
```

### Documents with blocks that aren't loaded

Content using a block type this editor doesn't load (e.g. a doc written where `math` was enabled)
is kept intact: it shows as an "unsupported block" placeholder that can be moved or deleted, and
the original JSON comes back unchanged in `v-model`. (Unknown *marks* are dropped.)

## Props

| Prop           | Type                              | Default | Description                                              |
| -------------- | --------------------------------- | ------- | -------------------------------------------------------- |
| `modelValue`   | `JSONContent \| null`             | `null`  | Document as Tiptap JSON (`v-model`)                      |
| `editable`     | `boolean`                         | `true`  | Read-only when `false`                                   |
| `autofocus`    | `boolean \| 'start' \| 'end'`     | `false` | Focus on mount                                           |
| `locale`       | `'vi' \| 'en'`                    | `'vi'`  | UI language                                              |
| `messages`     | `PartialMessages`                 | –       | Override any UI string                                   |
| `blocks`       | `BlockDefinition[]`               | `defaultBlocks` | Blocks to load (read at mount), see "Choosing blocks" |
| `uploadImage`  | `(file: File) => Promise<string>` | –       | Upload an image and return its URL (default: base64)     |
| `maxImageSize` | `number`                          | `5`     | Max image size in MB                                     |
| `extensions`   | `AnyExtension[]`                  | –       | Extra Tiptap extensions                                  |
| `theme`        | `'auto' \| 'light' \| 'dark'`     | `'auto'`| Color mode; `auto` follows `<html class="dark">`         |
| `tokens`       | `ThemeTokens`                     | –       | Design token overrides for this editor (see Theming)     |
| `blockLink`    | `(id: string) => string`          | –       | URL for "Copy link to block" (default: page URL + `#id`) |
| `outline`      | `boolean \| { minHeadings }`      | `true`  | Floating outline on the right (shown from 2 headings)    |

Events: `update:modelValue`, `ready(editor)`, `content-error({ fatal, issues, error })`. The Tiptap editor is also exposed via a template ref (`ref.editor`).


## Keyboard & mouse

| Action | Shortcut |
| --- | --- |
| Select the current block / clear the selection | `Esc` |
| Select several blocks | `Shift`+click, or drag a text selection across blocks |
| Move / extend the block selection | `↑` `↓` / `Shift`+`↑` `↓` |
| Delete selected blocks | `Backspace` / `Delete` |
| Edit the selected block | `Enter` |
| Move block(s) up / down | `⌘⇧↑` / `⌘⇧↓` |
| Duplicate | `⌘D` |
| Turn into: text, H1–H3, to-do, bullet, numbered, toggle, code | `⌘⌥0` … `⌘⌥8` |
| Open the block menu | `⌘/` or click `⋮⋮` |

`Ctrl` replaces `⌘` on Windows/Linux. The block menu has a search box (actions, block types and
colors) and full keyboard navigation (`↑` `↓` `Enter`, `→` opens a submenu, `←`/`Esc` goes back).

Drag `⋮⋮` to move blocks. Drop **on the right edge** of a block to place them side by side in
columns (or on the left edge after a clear sideways move); dropping the last block out of a column
removes it. Drop **with an indent** below a list, toggle or callout to nest inside it. The page
auto-scrolls near the edges.

**Floating outline:** short bars fixed to the viewport's right edge mirror the page's headings (the
one in view is darker). It stays above full-width content and hides while the editor is off
screen. Hover for the full outline, click to jump. Tune with the `outline.*` tokens (`right`,
`top`…) and `heading.scrollMargin` (room for a sticky app header); hidden below 768px wide.

**Tables:** cells hold text only (like Notion's simple tables; no `/` menu inside cells). Hover a
table for row/column grips (insert, duplicate, move, clear, background color,
delete; header row/column on the first row/column) and "+" bars to add rows and columns.
Select several cells to merge, split, color or clear them. Columns resize by dragging borders.

Blocks get a stable `id` attribute, used by "Copy link to block"; opening a link with `#<id>`
scrolls to and selects that block.

### Image upload

```vue
<MeiEditor v-model="doc" :upload-image="upload" />

<script setup lang="ts">
async function upload(file: File) {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/upload', { method: 'POST', body })
  return (await res.json()).url
}
</script>
```

## Safe loading

Invalid content never blanks the editor (Tiptap's default, which the next save would persist):

- Blocks with fixable problems (e.g. empty text nodes) are repaired.
- Broken blocks are kept verbatim as an "invalid block" placeholder; their JSON comes back
  unchanged in `v-model`. Typing while one is selected adds text below instead of replacing it.
- Input that isn't a document at all makes the editor read-only, shows a notice and stops
  emitting `update:modelValue`, so saved data isn't overwritten.

Every case emits `content-error` so the app can log or report it.

## Performance

Measured on a production build (Chrome, Apple Silicon), mixed content with lists, code,
callouts and tables. Key latency includes two animation frames (~33ms floor).

| Blocks | Open | Typing (p50) |
| --- | --- | --- |
| 1,000 | ~0.1 s | 33 ms |
| 5,000 | ~0.3 s | 33 ms |
| 10,000 | ~0.5 s | ~44 ms |
| 20,000 | ~1 s | ~98 ms |

Up to ~10k blocks per page the editor stays smooth. For larger content, split it into
sub-pages (Notion's approach): keep each document small and link pages together, e.g. with
`mention` page links or your own "page" block. Run `pnpm bench` in the repo to measure.

## Theming

All visual values live in **one design-token file** (`src/theme/tokens.ts`) and are exposed as
CSS variables (`--me-*`). Stylesheets only reference tokens, so changing a token restyles
every place that uses it.

```
primitive  → raw values           --me-gray-800, --me-azure-500, --me-space-4, --me-rounded-md
semantic   → meaning (light/dark) --me-color-text, --me-color-accent, --me-radius-md, --me-palette-red-text
component  → per-part knobs       --me-menu-item-radius, --me-callout-padding, --me-code-bg
```

Usually you only override **semantic** tokens; reach for **component** tokens to fine-tune one part.

### Light / dark mode

`theme="auto"` (default) follows `<html class="dark">`, the convention used by Tailwind and
`@nuxtjs/color-mode`. Force a mode per editor with `theme="light"` or `theme="dark"`.

### Override tokens (typed, with autocomplete)

```ts
import { defineTokens } from '@toantranmei/editor'

const tokens = defineTokens({
  color: { accent: '#7c3aed' },          // both modes
  radius: { md: '10px' },
  font: { sans: 'Inter, sans-serif' },
  components: { menu: { itemRadius: '8px' }, callout: { padding: '20px' } },
  dark: { color: { accent: '#a78bfa' } }, // dark mode only
})
```

Apply them at the level you need:

```vue
<!-- one editor -->
<MeiEditor v-model="doc" :tokens="tokens" />
```

```ts
// every editor in a Nuxt app (compiled to a static stylesheet)
export default defineNuxtConfig({
  modules: ['@toantranmei/editor/nuxt'],
  meiEditor: { tokens: { color: { accent: '#7c3aed' } } },
})

// every editor in a Vue app
app.use(MeiEditorPlugin, { tokens: { color: { accent: '#7c3aed' } } })
```

Or with plain CSS, e.g. to map the editor onto your design system's variables:

```css
.me-scope {
  --me-color-accent: var(--ui-primary);
  --me-font-sans: var(--font-sans);
  --me-radius-md: var(--radius);
}
```

### Overriding styles directly

Library CSS sits in the `mei-editor` cascade layer, declared as
`@layer theme, base, mei-editor, components, utilities;`. Resets in `base` (such as Tailwind's
preflight) don't affect the editor, while your own CSS — unlayered, or in `components` /
`utilities` — overrides it without `!important`. Every part has a stable `me-*` class
(`.me-menu-item`, `.me-callout`, `.me-code-block`, …).

### Colors in documents

Text, highlight and callout colors are stored **by name** (`data-text-color="red"`), not as hex,
so documents follow your theme and dark mode. Change the palette with
`palette: { red: { text: '…', bg: '…' } }`.

## Advanced

Everything is exported for building your own UI on the same blocks:
`createExtensions`, `BLOCKS`, `filterBlocks`, `turnBlockInto`, the custom extensions
(`Callout`, `Columns`, `ImageBlock`, `Embed`, `CodeBlock`, `SlashCommand`, `BlockDrop`, `TextColor`, `BgColor`),
the token objects (`primitiveTokens`, `semanticLightTokens`, `semanticDarkTokens`, `componentTokens`) and locales (`vi`, `en`).

## License

MIT
