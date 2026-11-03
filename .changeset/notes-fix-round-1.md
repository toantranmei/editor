---
"@toantranmei/editor": minor
"@toantranmei/database-block": minor
---

Presence: the caret stays while focus is elsewhere on the page (cleared on read-only, unmount, or a tab hidden for
over a minute, restored when visible); typing re-shows the label (`cursor.activity`); labels darken their colour
for 4.5:1 white text (`labelBackground`). Uploads: new attr `uploadStartedAt`; only the uploading tab shows progress
and Delete / Retry, others "Uploading…", and after 2 minutes without an owner "Upload interrupted" with Delete
(`uploadState`, `UPLOAD_STALE_MS`, message `uploadInterrupted`); a duplicated placeholder gets its own state; Word's
`file:` images are uploaded from the clipboard in place; drops over gaps use the block geometry (`blockAtPoint`,
`blockGapAtPoint`). `renderTokensStyle` also drops values with comments or backslashes. Database: the row link sits on
the title property (or a leading cell without one); loading keeps the view's last height or `database.loadingHeight`.
