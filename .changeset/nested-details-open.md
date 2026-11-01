---
"@toantranmei/editor": patch
---

Fix open toggles (including toggles nested in an open toggle) showing closed after a reload although the document says `open: true`. The upstream Details node view opens a toggle created open with a deferred flip; if any transaction touched the toggle before that timer fired, the toggle was opened by `update()` and then flipped back to closed. The toggle node view now waits for the deferred open and then sets the state from the node's `open` attribute instead of flipping it. Clicking, persisting the attribute, keyboard and aria behaviour are unchanged.
