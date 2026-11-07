---
"@toantranmei/database-block": patch
---

Every call to the `DatabaseSource` gets plain data (no Vue proxies). A host that posts writes to a worker (`postMessage`) failed with `DataCloneError` on a new select / multi-select / status property, so the column was never added.

Option picker: the "…" of an option sits at the right edge (also when the option isn't selected), the rename field of an option's menu has its full height, and the color list is titled "Color" (it said "Default").
