---
"@toantranmei/editor": minor
---

Paste or drop images and files anywhere in the editor (new core extension `FileDrop`, registered by default). Each
image becomes an image block with an instant preview and a progress bar, other files a file block (audio / video /
file from the mime type), several files in order; a text selection is replaced. Pastes with text or web images keep
the regular paste. Oversize, unsupported or failed uploads stay on the block (`error: 'tooLarge' | 'badType' |
'failed'`) with Retry / Delete. `ImageUploader` and `fileBlock`'s `upload` take an optional `onProgress(fraction)`.

**Breaking:** `FileDrop` is on by default and handles pastes and drops that carry files before other paste handlers
(priority 110): an app that handled file pastes or drops itself now gets image / file blocks instead (filter
`FileDrop` out of `createExtensions` to keep the old behaviour).

**Breaking (TypeScript):** `EditorMessages` has new required keys `image.badType`, `image.retry`,
`image.uploadInterrupted`, `file.retry`, `file.uploadInterrupted` and `file.delete`. Callers passing a full
`messages` object to `createExtensions` must add them; `<MeiEditor :messages>` takes a partial object and is not
affected.
