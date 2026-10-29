/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE single source of every visual value in @toantranmei/editor.
 *  Stylesheets in src/styles only reference these tokens via var(--me-…);
 *  `pnpm check:styles` fails the build if a raw value sneaks in elsewhere.
 *
 *  Three tiers:
 *   1. primitive  – raw values (colors, scales). Only referenced by tiers 2–3.
 *   2. semantic   – meaning (text, surface, accent…). Has light + dark variants.
 *   3. component  – per-part knobs (menu item height, callout padding…).
 *
 *  CSS variable name = `--me-` + path in kebab-case, e.g. component.menu.itemHeight
 *  → --me-menu-item-height, semantic color.textMuted → --me-color-text-muted.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { ref as r } from './define'

// ── 1. Primitive ──────────────────────────────────────────────────────────────

/** Notion's content palette. Names are what documents store (`data-text-color="red"`). */
export const PALETTE_NAMES = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const
export type PaletteName = typeof PALETTE_NAMES[number]

export const primitive = {
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#f7f6f3',
    100: '#f1f1ef',
    200: '#e9e9e7',
    300: '#d4d4d4',
    400: '#9b9a97',
    500: '#787774',
    800: '#37352f',
    850: '#2f2f2f',
    900: '#252525',
    925: '#202020',
    950: '#191919',
  },
  azure: { 400: '#4a9ff5', 500: '#2383e2', 600: '#0077d4' },
  /** Content palette: `light`/`dark` × `text`/`bg`. */
  tint: {
    gray: { lightText: '#787774', lightBg: '#f1f1ef', darkText: '#9b9b9b', darkBg: '#2f2f2f' },
    brown: { lightText: '#9f6b53', lightBg: '#f4eeee', darkText: '#ba856f', darkBg: '#4a3228' },
    orange: { lightText: '#d9730d', lightBg: '#fbecdd', darkText: '#c77d48', darkBg: '#5c3b23' },
    yellow: { lightText: '#cb912f', lightBg: '#fbf3db', darkText: '#ca984d', darkBg: '#564328' },
    green: { lightText: '#448361', lightBg: '#edf3ec', darkText: '#529e72', darkBg: '#243d30' },
    blue: { lightText: '#337ea9', lightBg: '#e7f3f8', darkText: '#5e87c9', darkBg: '#143a4e' },
    purple: { lightText: '#9065b0', lightBg: '#f6f3f9', darkText: '#9d68d3', darkBg: '#3c2d49' },
    pink: { lightText: '#c14c8a', lightBg: '#faf1f5', darkText: '#d15796', darkBg: '#4e2c3c' },
    red: { lightText: '#d44c47', lightBg: '#fdebec', darkText: '#df5452', darkBg: '#522e2a' },
  } satisfies Record<PaletteName, Record<string, string>>,
  space: { 0: '0', 1: '2px', 2: '4px', 3: '6px', 4: '8px', 5: '12px', 6: '14px', 7: '16px', 8: '24px', 9: '32px' },
  rounded: { xs: '3px', sm: '4px', md: '6px', lg: '8px', full: '9999px' },
  fontSize: { xs: '12px', sm: '14px', md: '16px', lg: '20px' },
  fontWeight: { regular: '400', medium: '500', semibold: '600' },
  lineHeight: { tight: '1.2', snug: '1.3', normal: '1.5', relaxed: '1.6' },
  borderWidth: { thin: '1px', medium: '2px', thick: '3px', heavy: '4px' },
  duration: { fast: '120ms', normal: '150ms' },
  fontFamily: {
    sans: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji"',
    mono: '"SFMono-Regular", Menlo, Consolas, monospace',
  },
}

// ── 2. Semantic ───────────────────────────────────────────────────────────────

const palette = (mode: 'light' | 'dark') => Object.fromEntries(PALETTE_NAMES.map(name => [name, {
  text: r(`tint.${name}.${mode}Text`),
  bg: r(`tint.${name}.${mode}Bg`),
}])) as Record<PaletteName, { text: string, bg: string }>

/** Mode-independent semantic tokens. */
export const semanticBase = {
  font: {
    sans: r('fontFamily.sans'),
    mono: r('fontFamily.mono'),
    size: r('fontSize.md'),
    lineHeight: r('lineHeight.normal'),
  },
  radius: { sm: r('rounded.sm'), md: r('rounded.md'), lg: r('rounded.lg') },
}

export const semanticLight = {
  color: {
    text: r('gray.800'),
    textMuted: r('gray.500'),
    textFaint: r('gray.400'),
    bg: r('white'),
    elevated: r('white'),
    surface: r('gray.50'),
    hover: 'rgba(55, 53, 47, 0.08)',
    border: r('gray.200'),
    accent: r('azure.500'),
    accentHover: r('azure.600'),
    onAccent: r('white'),
    selection: 'rgba(35, 131, 226, 0.28)',
    blockSelected: 'rgba(35, 131, 226, 0.14)',
    danger: r('tint.red.lightText'),
    handle: '#b9b9b7',
    inlineCodeText: '#eb5757',
    inlineCodeBg: 'rgba(135, 131, 120, 0.15)',
    overlay: 'rgba(0, 0, 0, 0.5)',
  },
  shadow: {
    popover: 'rgba(15, 15, 15, 0.05) 0 0 0 1px, rgba(15, 15, 15, 0.1) 0 3px 6px, rgba(15, 15, 15, 0.2) 0 9px 24px',
  },
  palette: palette('light'),
  syntax: {
    comment: '#8e908c',
    keyword: '#8959a8',
    string: '#718c00',
    number: '#f5871f',
    title: '#4271ae',
    variable: '#c82829',
    meta: '#3e999f',
  },
}

export const semanticDark: typeof semanticLight = {
  color: {
    text: r('gray.300'),
    textMuted: '#9b9b9b',
    textFaint: '#7f7f7f',
    bg: r('gray.950'),
    elevated: r('gray.900'),
    surface: r('gray.925'),
    hover: 'rgba(255, 255, 255, 0.055)',
    border: r('gray.850'),
    accent: r('azure.400'),
    accentHover: r('azure.500'),
    onAccent: r('white'),
    selection: 'rgba(35, 131, 226, 0.4)',
    blockSelected: 'rgba(35, 131, 226, 0.22)',
    danger: r('tint.red.darkText'),
    handle: '#5a5a5a',
    inlineCodeText: '#ff7369',
    inlineCodeBg: 'rgba(135, 131, 120, 0.15)',
    overlay: 'rgba(255, 255, 255, 0.5)',
  },
  shadow: {
    popover: 'rgba(255, 255, 255, 0.094) 0 0 0 1px, rgba(0, 0, 0, 0.3) 0 3px 6px, rgba(0, 0, 0, 0.4) 0 9px 24px',
  },
  palette: palette('dark'),
  syntax: {
    comment: '#7f848e',
    keyword: '#c678dd',
    string: '#98c379',
    number: '#d19a66',
    title: '#61afef',
    variable: '#e06c75',
    meta: '#56b6c2',
  },
}

// ── 3. Component ──────────────────────────────────────────────────────────────

export const component = {
  /** Editor root. `bg` is transparent so it blends into the page; a forced mode paints `forcedBg`. */
  editor: { bg: 'transparent', forcedBg: r('color.bg') },
  icon: { size: r('fontSize.md'), stroke: '1.75' },
  popover: { bg: r('color.elevated'), radius: r('radius.lg'), shadow: r('shadow.popover'), padding: r('space.2'), offset: r('space.4') },
  menu: {
    itemGap: r('space.4'),
    itemPaddingX: r('space.4'),
    itemPaddingY: r('space.2'),
    itemRadius: r('radius.md'),
    itemHover: r('color.hover'),
    iconBox: '28px',
    iconRadius: r('radius.md'),
    iconBorder: r('color.border'),
    titleSize: r('fontSize.sm'),
    descriptionSize: r('fontSize.xs'),
    descriptionColor: r('color.textMuted'),
    labelSize: r('fontSize.xs'),
    labelWeight: r('fontWeight.medium'),
    labelColor: r('color.textMuted'),
    shortcutColor: r('color.textFaint'),
    width: '288px',
    submenuWidth: '224px',
    maxHeight: '320px',
  },
  toolbar: {
    buttonSize: '28px',
    buttonRadius: r('radius.sm'),
    buttonHover: r('color.hover'),
    activeColor: r('color.accent'),
    dividerColor: r('color.border'),
    linkFormWidth: '320px',
  },
  button: {
    height: '32px',
    paddingX: r('space.5'),
    radius: r('radius.md'),
    fontSize: r('fontSize.sm'),
    border: r('color.border'),
    bg: r('color.bg'),
    hoverBg: r('color.surface'),
    primaryBg: r('color.accent'),
    primaryHoverBg: r('color.accentHover'),
    primaryText: r('color.onAccent'),
    floatingBg: r('color.elevated'),
    floatingHoverBg: r('color.surface'),
    floatingShadow: r('shadow.popover'),
    disabledOpacity: '0.5',
  },
  input: {
    height: '32px',
    paddingX: r('space.4'),
    radius: r('radius.md'),
    fontSize: r('fontSize.sm'),
    border: r('color.border'),
    focusBorder: r('color.accent'),
    focusRing: 'color-mix(in srgb, var(--me-color-accent) 20%, transparent)',
  },
  handle: {
    color: r('color.handle'),
    hoverColor: r('color.textMuted'),
    hoverBg: r('color.hover'),
    /** "+" button (square) and the ⋮⋮ grip, like Notion. */
    buttonWidth: '24px',
    buttonHeight: '24px',
    gripWidth: '18px',
    iconSize: '18px',
    radius: r('radius.sm'),
    gap: r('space.1'),
  },
  /**
   * Block rhythm, two levels like Notion: text blocks (paragraphs, lists, quotes,
   * toggles) sit close (`gap` + `paddingY`); every boxed/media block (code, callout,
   * table, image, embed, HTML, file, math, TOC, columns) uses `boxSpacing`.
   */
  block: {
    paddingY: '3px',
    paddingX: r('space.1'),
    gap: '1px',
    boxSpacing: r('space.4'),
    radius: r('radius.sm'),
    minHeight: 'calc(var(--me-font-line-height) * 1em)',
    /** Tint over any selected block (text, boxes and media alike). */
    selectedBg: r('color.blockSelected'),
  },
  /** Shared look of boxed blocks: code, callout, file rows, upload placeholders, HTML. */
  box: {
    bg: r('color.surface'),
    border: r('color.border'),
    radius: r('radius.md'),
    padding: '12px 16px',
    paddingCompact: '6px 10px',
    /** Header row inside a box (code language + copy, HTML name + tabs). */
    barPadding: '8px 10px 0 14px',
    barColor: r('color.textMuted'),
    barFontSize: r('fontSize.xs'),
    barIconSize: r('fontSize.sm'),
    barButtonSize: '24px',
  },
  /** Underlined tabs (upload placeholders, HTML Code / Preview). */
  tabs: {
    gap: r('space.7'),
    fontSize: r('fontSize.sm'),
    color: r('color.textMuted'),
    activeColor: r('color.text'),
    indicator: r('borderWidth.medium'),
    paddingBottom: r('space.4'),
  },
  heading: {
    weight: r('fontWeight.semibold'),
    lineHeight: r('lineHeight.snug'),
    h1Size: '1.875em',
    h2Size: '1.5em',
    h3Size: '1.25em',
    h4Size: '1.1em',
    h1Margin: '1.1em',
    h2Margin: '0.9em',
    h3Margin: '0.6em',
    h4Margin: '0.5em',
    /** Space kept above a heading scrolled to from the outline/TOC (room for sticky app headers). */
    scrollMargin: '80px',
  },
  link: { underline: 'color-mix(in srgb, var(--me-color-text) 40%, transparent)', underlineHover: r('color.text') },
  inlineCode: { color: r('color.inlineCodeText'), bg: r('color.inlineCodeBg'), radius: r('radius.sm'), fontSize: '85%', padding: '0.2em 0.4em' },
  list: { indent: '1.6em' },
  todo: { checkSize: r('fontSize.md'), checkColor: r('color.accent'), doneColor: r('color.textFaint') },
  quote: { borderWidth: r('borderWidth.thick'), borderColor: 'currentColor', paddingLeft: r('space.6') },
  divider: { color: r('color.border'), spacing: r('space.6') },
  callout: {
    /** Left matches top, so the icon sits evenly from both edges; right/bottom follow `box.padding`. */
    padding: '12px 16px 12px 12px',
    gap: r('space.4'),
    iconSize: r('fontSize.lg'),
    iconBox: '28px',
    defaultBg: r('palette.gray.bg'),
    pickerWidth: '240px',
  },
  toggle: { arrowColor: r('color.text'), buttonSize: '24px', headingArrowOffset: 'calc(var(--me-block-padding-y) + 0.15em)' },
  columns: { gap: r('space.9') },
  code: { fontSize: '85%', lineHeight: r('lineHeight.relaxed') },
  table: { border: r('color.border'), headerBg: r('color.surface'), cellPadding: '6px 8px', cellMinWidth: '80px', selected: r('color.blockSelected'), resizeHandle: r('color.accent') },
  media: {
    captionColor: r('color.textMuted'),
    captionSize: r('fontSize.sm'),
    resizeHandleBg: r('color.overlay'),
    errorColor: r('color.danger'),
  },
  dropIndicator: { color: 'rgba(35, 131, 226, 0.5)', height: r('borderWidth.heavy') },
  html: {
    /** User HTML usually assumes a white page, also in dark mode. */
    frameBg: '#fff',
    editorBg: r('color.bg'),
    editorFont: r('font.mono'),
    editorFontSize: '13px',
    editorPadding: r('space.5'),
    coverBg: 'rgba(15, 15, 15, 0.08)',
  },
  /** Full-screen views (HTML block expand, image zoom). */
  modal: {
    backdrop: 'rgba(15, 15, 15, 0.6)',
    /** Image viewer: darker, so the photo stands out. */
    backdropStrong: 'rgba(15, 15, 15, 0.88)',
    inset: '4vh 4vw',
    toolbarOffset: r('space.7'),
  },
  image: {
    /** Hover toolbar inset from the image's top-right corner. */
    toolbarInset: r('space.3'),
    menuWidth: '208px',
    cropDim: 'rgba(15, 15, 15, 0.55)',
    cropBorder: r('white'),
    cropHandle: '10px',
    cropHandleBg: r('white'),
    cropHandleBorder: 'rgba(15, 15, 15, 0.35)',
  },
  outline: {
    /** Distance from the viewport's right edge and top. */
    right: r('space.7'),
    top: '30vh',
    barColor: r('color.border'),
    barActive: r('color.textMuted'),
    barHeight: r('borderWidth.medium'),
    barGap: r('space.3'),
    barWidth: '16px',
    panelWidth: '240px',
    panelMaxHeight: '60vh',
    itemColor: r('color.textMuted'),
    itemActive: r('color.accent'),
    indent: r('space.5'),
  },
  tableControls: {
    gripSize: '12px',
    gripBg: r('color.elevated'),
    gripColor: r('color.textFaint'),
    gripHoverBg: r('color.hover'),
    addSize: '18px',
    addBg: r('color.surface'),
    addHoverBg: r('color.hover'),
    radius: r('radius.sm'),
  },
  toc: { itemColor: r('color.textMuted'), itemHover: r('color.hover'), indent: r('space.7'), padding: r('space.2') },
  math: { editorWidth: '360px', emptyColor: r('color.textFaint') },
  emojiMenu: { cell: '32px', columns: '8', size: r('fontSize.lg') },
  file: { sizeColor: r('color.textFaint') },
  mention: {
    color: r('color.text'),
    bg: r('color.hover'),
    hoverBg: 'color-mix(in srgb, var(--me-color-text) 14%, transparent)',
    radius: r('radius.sm'),
    padding: '0 3px',
    pageUnderline: r('color.textFaint'),
    avatarRadius: r('rounded.full'),
    avatarSize: '1.1em',
    popoverWidth: '280px',
  },
  /** Sub-page / link-to-page rows (`@toantranmei/page-block`). */
  pageLink: {
    color: r('color.text'),
    hoverBg: r('color.hover'),
    radius: r('radius.sm'),
    padding: '3px 2px',
    gap: r('space.3'),
    fontWeight: r('fontWeight.medium'),
    iconSize: '1.2em',
    iconColor: r('color.textMuted'),
    underline: r('color.textFaint'),
    underlineHover: r('color.text'),
    mutedColor: r('color.textMuted'),
    missingColor: r('color.textFaint'),
    popoverWidth: '320px',
  },
  /** Database block (`@toantranmei/database-block`): header, tabs, toolbar, table and the other views. */
  database: {
    gap: r('space.4'),
    titleSize: '1.5em',
    titleWeight: r('fontWeight.semibold'),
    titleColor: r('color.text'),
    titlePlaceholder: r('color.textFaint'),
    fontSize: r('fontSize.sm'),
    mutedColor: r('color.textMuted'),
    faintColor: r('color.textFaint'),
    border: r('color.border'),
    radius: r('radius.sm'),
    hoverBg: r('color.hover'),
    bg: r('color.bg'),
    /** Scroll area of an inline database; a full-page one uses `fullHeight`. */
    maxHeight: '520px',
    fullHeight: '75vh',
    /** Tabs + toolbar row. */
    tabGap: r('space.1'),
    tabPadding: '4px 8px',
    tabActiveColor: r('color.text'),
    tabIndicator: r('borderWidth.medium'),
    toolbarGap: r('space.2'),
    toolbarButtonActive: r('color.accent'),
    searchWidth: '180px',
    /** Table. Row/header heights are also read by the virtualizer (px). */
    rowHeight: '33px',
    headerHeight: '33px',
    footerHeight: '33px',
    groupHeaderHeight: '40px',
    headerColor: r('color.textMuted'),
    headerBg: r('color.bg'),
    headerWeight: r('fontWeight.regular'),
    cellPaddingX: r('space.4'),
    cellMinWidth: '60px',
    cellDefaultWidth: '180px',
    selectColWidth: '32px',
    handleColWidth: '20px',
    activeRing: r('color.accent'),
    activeRingWidth: r('borderWidth.medium'),
    selectedBg: r('color.blockSelected'),
    placeholderBg: r('color.surface'),
    placeholderRadius: r('radius.sm'),
    resizeHandle: r('color.accent'),
    resizeHandleWidth: r('borderWidth.thick'),
    dropIndicator: r('color.accent'),
    dropIndicatorWidth: r('borderWidth.medium'),
    editorBg: r('color.elevated'),
    editorShadow: r('shadow.popover'),
    editorMinHeight: '120px',
    readOnlyColor: r('color.textMuted'),
    linkColor: r('color.text'),
    aggregateColor: r('color.textMuted'),
    errorColor: r('color.danger'),
    /** Select / multi-select / status / person / relation chips. */
    tagHeight: '20px',
    tagPadding: '0 6px',
    tagRadius: r('radius.sm'),
    tagGap: r('space.2'),
    tagFontSize: r('fontSize.sm'),
    defaultTagBg: r('palette.gray.bg'),
    defaultTagText: r('color.text'),
    swatchSize: r('fontSize.md'),
    avatarSize: '18px',
    avatarRadius: r('rounded.full'),
    /** Popovers: menus, filter / sort builders, property editor. */
    menuWidth: '260px',
    builderWidth: '560px',
    formulaHeight: '96px',
    dangerColor: r('color.danger'),
    warningBg: r('palette.yellow.bg'),
    warningText: r('palette.yellow.text'),
    /** Board. */
    columnWidth: '264px',
    columnGap: r('space.5'),
    columnBg: r('color.surface'),
    cardBg: r('color.elevated'),
    cardBorder: r('color.border'),
    cardRadius: r('radius.md'),
    cardPadding: '8px 10px',
    cardGap: r('space.3'),
    cardShadow: 'rgba(15, 15, 15, 0.1) 0 0 0 1px, rgba(15, 15, 15, 0.1) 0 2px 4px',
    dropBg: 'color-mix(in srgb, var(--me-color-accent) 10%, transparent)',
    /** Calendar. */
    calendarCellHeight: '116px',
    calendarTodayBg: r('color.accent'),
    calendarTodayText: r('color.onAccent'),
    calendarOutsideBg: r('color.surface'),
    /** Timeline: width of one day at each scale (px, read by the view). */
    timelineDay: '40px',
    timelineWeek: '16px',
    timelineMonth: '5px',
    timelineRowHeight: '36px',
    timelineLabelWidth: '200px',
    barBg: 'color-mix(in srgb, var(--me-color-accent) 18%, var(--me-color-bg))',
    barBorder: r('color.accent'),
    barRadius: r('radius.md'),
    barHeight: '24px',
    todayLine: r('palette.red.text'),
    /** Gallery card widths per size, cover height. */
    gallerySmall: '180px',
    galleryMedium: '260px',
    galleryLarge: '340px',
    coverHeight: '148px',
    coverBg: r('color.surface'),
    /** Pivot. */
    pivotHeaderBg: r('color.surface'),
    pivotTotalWeight: r('fontWeight.semibold'),
    /** Full-page database link row. */
    linkIconSize: '1.2em',
  },
  /** Charts (`@toantranmei/chart-block`), also used by the database chart view. */
  chart: {
    height: '320px',
    padding: r('space.5'),
    text: r('color.textMuted'),
    title: r('color.text'),
    axis: r('color.border'),
    splitLine: r('color.border'),
    tooltipBg: r('color.elevated'),
    tooltipText: r('color.text'),
    tooltipBorder: r('color.border'),
    fontSize: r('fontSize.xs'),
    fontFamily: r('font.sans'),
    series1: r('palette.blue.text'),
    series2: r('palette.orange.text'),
    series3: r('palette.green.text'),
    series4: r('palette.purple.text'),
    series5: r('palette.red.text'),
    series6: r('palette.yellow.text'),
    series7: r('palette.pink.text'),
    series8: r('palette.brown.text'),
    series9: r('palette.gray.text'),
    /** Standalone block: data grid and config panel. */
    cellWidth: '120px',
    gridMaxHeight: '260px',
    panelGap: r('space.4'),
    emptyColor: r('color.textFaint'),
  },
  /** Comment highlights, gutter badges and the side panel (`@toantranmei/comments`). */
  comments: {
    highlight: 'color-mix(in srgb, var(--me-palette-yellow-text) 22%, transparent)',
    highlightActive: 'color-mix(in srgb, var(--me-palette-yellow-text) 45%, transparent)',
    underline: r('palette.yellow.text'),
    badgeBg: r('color.surface'),
    badgeColor: r('color.textMuted'),
    badgeActiveBg: r('palette.yellow.bg'),
    badgeActiveColor: r('palette.yellow.text'),
    badgeSize: '22px',
    badgeOffset: '-36px',
    badgeFontSize: r('fontSize.xs'),
    panelWidth: '340px',
    panelBg: r('color.bg'),
    panelBorder: r('color.border'),
    panelPadding: r('space.5'),
    threadGap: r('space.4'),
    threadRadius: r('radius.lg'),
    threadBorder: r('color.border'),
    threadActiveBorder: r('palette.yellow.text'),
    threadPadding: r('space.5'),
    quoteColor: r('color.textMuted'),
    quoteBorder: r('palette.yellow.text'),
    avatarSize: '24px',
    metaColor: r('color.textFaint'),
    metaFontSize: r('fontSize.xs'),
    bodyFontSize: r('fontSize.sm'),
    composerMinHeight: '36px',
    composerBg: r('color.surface'),
    composerPadding: '6px 8px',
    composerWidth: '320px',
  },
  /** Synced block frame (`@toantranmei/synced-block`). */
  synced: {
    border: 'color-mix(in srgb, var(--me-palette-red-text) 55%, transparent)',
    borderWidth: r('borderWidth.medium'),
    radius: r('radius.md'),
    padding: '2px 4px',
    labelColor: r('palette.red.text'),
    labelBg: r('color.bg'),
    labelFontSize: r('fontSize.xs'),
    labelPadding: '0 6px',
    labelOffset: '-10px',
    hoverBorder: r('palette.red.text'),
    emptyColor: r('color.textFaint'),
    gap: r('space.3'),
  },
  datepicker: {
    width: '264px',
    cell: '34px',
    todayColor: r('color.accent'),
    selectedBg: r('color.accent'),
    selectedText: r('color.onAccent'),
    rangeBg: 'color-mix(in srgb, var(--me-color-accent) 18%, transparent)',
    outsideColor: r('color.textFaint'),
    inputBg: r('color.surface'),
  },
  switch: { width: '28px', height: '16px', knob: '12px', off: r('color.border'), on: r('color.accent'), knobColor: r('color.bg') },
  unknown: { color: r('color.textMuted'), invalidBorder: r('palette.red.text'), invalidColor: r('palette.red.text') },
  /** Handle tooltip and toast: dark in both modes, like Notion. */
  tooltip: {
    bg: '#0f0f0f',
    text: 'rgba(255, 255, 255, 0.9)',
    hint: 'rgba(206, 205, 202, 0.6)',
    radius: r('radius.sm'),
    padding: '4px 8px',
    fontSize: r('fontSize.xs'),
    offset: r('space.3'),
    shadow: 'rgba(15, 15, 15, 0.1) 0 3px 6px',
  },
}

/** Everything a consumer can override, with autocomplete. */
export interface ThemeTokens {
  color?: Partial<Record<keyof typeof semanticLight.color, string>>
  shadow?: Partial<Record<keyof typeof semanticLight.shadow, string>>
  palette?: Partial<Record<PaletteName, { text?: string, bg?: string }>>
  syntax?: Partial<Record<keyof typeof semanticLight.syntax, string>>
  font?: Partial<Record<keyof typeof semanticBase.font, string>>
  radius?: Partial<Record<keyof typeof semanticBase.radius, string>>
  /** Per-part knobs, e.g. `{ menu: { itemRadius: '8px' } }`. */
  components?: { [G in keyof typeof component]?: Partial<Record<keyof typeof component[G], string>> }
  /** Overrides applied only in dark mode. */
  dark?: Pick<ThemeTokens, 'color' | 'shadow' | 'palette' | 'syntax'>
}
