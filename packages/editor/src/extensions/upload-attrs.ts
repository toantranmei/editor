/**
 * Transient attributes of an image / file block created by paste or drop (see `FileDrop`). Never rendered to HTML
 * nor parsed from it, so copies and exports never carry an upload in progress.
 */
export function uploadAttributes() {
  return {
    /** Key of the pending upload in `editor.storage.fileDrop.uploads` (this tab only). */
    uploadId: { default: null, rendered: false, parseHTML: () => null },
    uploading: { default: false, rendered: false, parseHTML: () => false },
    /** `'tooLarge' | 'badType' | 'failed'` when the upload could not finish. */
    error: { default: null, rendered: false, parseHTML: () => null },
  }
}
