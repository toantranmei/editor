---
"@toantranmei/editor": patch
"@toantranmei/database-block": patch
---

Fixes found by the ai-factory /notes kitchen-sink page.

- **editor:** redo in collaboration mode; code blocks without a language stay `null`; Tab / Shift-Tab indent and
  outdent the right lines in code blocks; unsafe image sources are never loaded or opened; the file block accepts
  same-origin upload paths; Mermaid diagrams render independently and keep the last good diagram while the code is
  invalid; menus at the caret ignore a resting pointer; mention links and avatars go through `safeUrl`; image link
  actions tell same-origin from other hosts.
- **editor, Markdown paste:** pasted Markdown text becomes blocks (linear parsers, no paste rules, bounded inline
  nesting, 100 KB cap).
- **editor, collaboration:** first render once per binding and view, no editing before sync, a sticky read-only
  fallback; `@tiptap/y-tiptap` pinned to 3.0.11.
- **database-block:** no chart / pivot query without axes; a pivot without rows or columns still shows its grand total.
