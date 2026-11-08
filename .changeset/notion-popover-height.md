---
"@toantranmei/database-block": patch
---

Database menus and popovers show all their items, as Notion's: no fixed height. Only when the window is too short does the popover shrink to the room below its anchor (or above, whichever is larger) and scroll, with its scrollbar at its edge instead of inside the padding.

While a database menu or popover is open the page no longer scrolls under it (as in Notion): the wheel only scrolls a popover that can scroll that way, and if the page scrolls anyway (its scrollbar dragged) the popover follows its column. The wheel over an inline table scrolls the page again (the table scrolls sideways only).
