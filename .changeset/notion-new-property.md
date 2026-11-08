---
"@toantranmei/database-block": patch
"@toantranmei/editor": patch
---

"+" in the table header opens Notion's menu: "Type property name…" over the header row (focused), then "Select type" with the types in two columns, in three groups (basic, advanced, automatic), 404px wide. Picking a type creates the property and closes the menu (Enter in the name makes a text property; Escape creates nothing); it is set up from its column menu. A popover over its anchor stays there and scrolls when the window is short instead of jumping up. Lists that scroll inside a popover (block menu search, mention results, emoji grid, relation databases) share `.me-popover-scroll`: only vertical, scrollbar at the popover's edge. Editor tokens: `database.newPropWidth`, `database.propEditorWidth`.
