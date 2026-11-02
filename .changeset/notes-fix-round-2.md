---
"@toantranmei/editor": patch
"@toantranmei/database-block": patch
---

Duplicate-placeholder cleanup recognises any `y-sync$…` meta (y-tiptap loaded twice) and never runs on sync
transactions; presence raises `activity` at most once a second; FileDrop's fallback drop position uses BlockDrop's
configured containers; "interrupted" uploads count from when this tab first saw them (clock skew, `uploadStaleAt`);
the database chunk-loading placeholder carries a screen-reader "Loading…" in the editor's locale.
