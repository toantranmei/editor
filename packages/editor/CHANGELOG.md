# @toantranmei/editor

## 0.1.2

### Patch Changes

- bae80da: Callouts: "/text" on a line inside a callout (or column, toggle, table cell) keeps it in place instead of turning the whole callout into text; the icon now stays centered on the first line whatever block it is (heading, list, code…), with even top and left padding.
- 4182fea: Even spacing inside callouts, columns, toggles and quotes: their first and last blocks no longer keep an outer margin, so a heading or code block at the top/bottom doesn't leave more space on one side.
- f3783d0: Fix the "Type '/'…" placeholder staying on empty blocks the cursor had left (Tiptap's incremental placeholder was off by one); it now shows only on the cursor's block. Center the block handle (+ ⋮⋮) on each block's first text line, header bar, divider or top edge, and make it Notion-sized (24px buttons, 18px icons).
- 30d3c26: Read-only mode hides empty image, file, audio, video, embed, HTML and equation blocks (like Notion) instead of showing their upload/editing UI; the blocks stay in the document. The equation editor closes when switching to read-only, and clicking outside it closes it again.

## 0.1.1

### Patch Changes

- db6794b: Docs: how to match a shadcn/ui + Tailwind app with design tokens, and a note on Tailwind v3's unlayered preflight.
