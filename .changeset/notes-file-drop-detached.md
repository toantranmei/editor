---
"@toantranmei/editor": minor
---

An upload still running when its editor is destroyed (the page was left) is no longer lost: a collaborative editor
writes the result (`src`, or `error: 'failed'`) straight into its Yjs document when the upload ends, so every editor
on that document, and anyone loading it later, gets the image or file. An editor opened again on the same document
meanwhile shows the upload as this tab's (preview, progress). New `uploadsSettled(editor)`: a promise once every
upload of the editor wrote its result (null when none runs). Keep the document open, saved and synced until then,
e.g. `uploadsSettled(editor)?.finally(() => provider.destroy())`. A plain `v-model` editor destroyed meanwhile still
cannot keep the result.
