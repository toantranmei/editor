---
"@toantranmei/editor": minor
---

Paste or drop images and files anywhere in the editor (new core extension `FileDrop`, registered by default). Each
image becomes an image block with an instant preview and a progress bar, other files a file block (audio / video /
file from the mime type), several files in order; a text selection is replaced. Pastes with text or web images keep
the regular paste. Oversize, unsupported or failed uploads stay on the block (`error: 'tooLarge' | 'badType' |
'failed'`) with Retry / Delete. `ImageUploader` and `fileBlock`'s `upload` take an optional `onProgress(fraction)`.
