---
"@toantranmei/editor": minor
---

Presence for collaborative editors: `MeiCollaboration.presence = { awareness, resolveUser }` draws remote carets
with name labels (shown 3 s after a move, and on hover), selections (25 % tint) and the peer's active block
(`me-peer-block`, 2px bar + 6 % tint). Names and colours come only from `resolveUser(clientId)`; the local caret is
published to the awareness (field `cursor`, throttled to 50 ms, never while read-only). New exports from
`@toantranmei/editor/collaboration`: `PRESENCE_COLORS` (12 colours, ≥ 3:1 on light and dark), `presenceColor(index)`,
`scrollToPeer(editor, clientId)`, `refreshPresence(editor)`, types `MeiPresence`, `PresenceUser`.
