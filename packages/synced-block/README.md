# @toantranmei/synced-block

Notion-style synced blocks for [`@toantranmei/editor`](https://www.npmjs.com/package/@toantranmei/editor): the
same content on many pages, edited anywhere, updated everywhere.

- A `syncedBlock` node stores only `{ sourceId }`; its content is a separate Yjs document that your app provides
- Shown with a nested `<MeiEditor>` in collaboration mode, inside a frame that appears on hover / focus
  ("Synced block" label + "Edit original" link)
- Slash item **Synced block** moves the current block(s) into a new source (an empty line gives an empty one)
- Read-only when the page or the source isn't editable; "not found / no access" state
- Server-side HTML through `renderHTML`, with the source content you pass in
- Vietnamese, English and Simplified Chinese, styled with the editor's tokens (`component.synced.*`)

## Install

```bash
npm i @toantranmei/synced-block yjs
```

Peers: `@toantranmei/editor` `^0.3.0`, `yjs` `^13.6` (one copy in the app), `vue` `^3.5`, Tiptap `3.32.0`, `@lucide/vue`.

## Usage

```ts
import { defaultBlocks, mention } from '@toantranmei/editor'
import { syncedBlock } from '@toantranmei/synced-block'
import '@toantranmei/synced-block/style.css'

const base = [...defaultBlocks, mention]
const blocks = [
  ...base,
  syncedBlock.configure({
    // One cached Y.Doc per source (doc id = sourceId), connected to your sync provider.
    doc: async sourceId => ({ doc: await docs.open(sourceId), editable: await canEdit(sourceId) }), // null: missing / no access
    create: () => api.createResource({ type: 'synced_block', parent: pageId }).then(r => r.id),
    originHref: sourceId => `/notes/${ownerPageOf(sourceId)}`,
    blocks: base, // the nested editor's blocks (synced blocks can't nest)
  }),
]
```

Copying a synced block and pasting it on another page shows the same source there (the node only holds
`sourceId`); `editor.commands.insertSyncedBlock(sourceId)` does the same from your UI.
`createSyncedBlock()` is the slash item's command.

### Options

| Option | Description |
| --- | --- |
| `doc(sourceId)` | `{ doc: Y.Doc, editable: boolean, field?: string }` (or a promise), `null` when missing / no access |
| `create()` | Creates a source, resolves to its id. Without it the slash item is hidden |
| `originHref(sourceId)` | "Edit original" link (hidden when not given or `null`) |
| `blocks` | Blocks of the nested editor (default `defaultBlocks`) |
| `onError` | `create` / `doc` failures (default `console.error`) |
| `messages` | `{ en: { label: 'Synced' } }` |

### Server-side HTML

```ts
import { renderHTML } from '@toantranmei/editor/render'
import { syncedBlockRender } from '@toantranmei/synced-block/render' // DOM-free

renderHTML(doc, { blocks: [syncedBlockRender], data: { syncedBlocks: { [sourceId]: sourceJson } } })
```

Sources without content in `data.syncedBlocks` render nothing. `documentToJSON(ydoc)` from
`@toantranmei/editor/collaboration` gives a source's JSON on a Node server.

### Styling

Tokens under `component.synced` (`border`, `borderWidth`, `radius`, `padding`, `label*`, `hoverBorder`,
`emptyColor`, `gap`). Classes: `.me-synced` (`.is-selected`, `.is-readonly`, `.is-missing`), `.me-synced-bar`,
`.me-synced-content`.

## License

MIT
