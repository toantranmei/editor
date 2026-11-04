import type { LocaleName } from '@toantranmei/editor'

/** Every UI string of the database block. `{name}`-style placeholders are replaced by `fmt`. */
export interface DatabaseMessages {
  untitled: string
  titlePlaceholder: string
  loading: string
  notFound: string
  error: string
  openFullPage: string
  openDatabase: string
  /** View types. */
  viewTypes: Record<'table' | 'board' | 'calendar' | 'timeline' | 'gallery' | 'list' | 'chart' | 'pivot' | 'form', string>
  addView: string
  renameView: string
  /** View tab menu: icon and "Display as". */
  viewIcon: string
  viewIconPlaceholder: string
  removeIcon: string
  tabDisplayAs: string
  tabDisplays: Record<'name' | 'icon', string>
  duplicateView: string
  deleteView: string
  copyOf: string
  /** Toolbar. */
  filter: string
  sort: string
  group: string
  properties: string
  settings: string
  search: string
  newRow: string
  deleteRows: string
  selected: string
  /** Filter builder. */
  addFilter: string
  addFilterGroup: string
  where: string
  and: string
  or: string
  remove: string
  noFilters: string
  value: string
  ops: Record<string, string>
  relative: Record<string, string>
  checked: string
  unchecked: string
  /** Sort / group. */
  addSort: string
  noSorts: string
  ascending: string
  descending: string
  moveUp: string
  moveDown: string
  groupBy: string
  noGrouping: string
  hideEmptyGroups: string
  noValue: string
  /** Properties. */
  showAll: string
  hideAll: string
  show: string
  hide: string
  addProperty: string
  propertyName: string
  propertyType: string
  types: Record<string, string>
  rename: string
  changeType: string
  lossyWarning: string
  confirm: string
  cancel: string
  save: string
  editOptions: string
  addOption: string
  optionName: string
  deleteOption: string
  colors: Record<string, string>
  sortAscending: string
  sortDescending: string
  filterBy: string
  deleteProperty: string
  deletePropertyConfirm: string
  numberFormat: string
  numberFormats: Record<'number' | 'percent' | 'currency', string>
  currency: string
  decimals: string
  dateFormat: string
  dateFormats: Record<'full' | 'short' | 'dmy' | 'mdy' | 'ymd' | 'relative', string>
  includeTime: string
  formula: string
  formulaPlaceholder: string
  formulaOk: string
  formulaChecking: string
  relationDatabase: string
  thisDatabase: string
  twoWay: string
  rollupRelation: string
  rollupTarget: string
  rollupFn: string
  rollupFns: Record<string, string>
  prefix: string
  readOnly: string
  /** Cells. */
  empty: string
  searchOrCreate: string
  create: string
  searchPeople: string
  searchRows: string
  upload: string
  addLink: string
  noResults: string
  clear: string
  endDate: string
  time: string
  today: string
  open: string
  dragToMove: string
  selectRow: string
  selectAll: string
  /** Footer aggregates. */
  calculate: string
  none: string
  aggregates: Record<string, string>
  /** Board / calendar / timeline / gallery / chart / pivot. */
  addGroup: string
  newGroupName: string
  dateProperty: string
  startProperty: string
  endProperty: string
  scale: string
  scales: Record<'day' | 'week' | 'month' | 'quarter' | 'year', string>
  noDateProperty: string
  cover: string
  coverNone: string
  size: string
  sizes: Record<'s' | 'm' | 'l', string>
  cardProperties: string
  chartType: string
  chartTypes: Record<'bar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter', string>
  xAxis: string
  bucket: string
  buckets: Record<'none' | 'day' | 'week' | 'month' | 'year', string>
  yAxis: string
  series: string
  stacked: string
  noData: string
  pivotRows: string
  pivotCols: string
  pivotValues: string
  totals: string
  total: string
  previous: string
  next: string
  more: string
  loadMore: string
  /** Slash menu (also in block messages). */
  /** Button property and automations. */
  buttonLabel: string
  actionsLabel: string
  addAction: string
  deleteAction: string
  actionTypes: Record<'set_values' | 'add_row' | 'open_url' | 'show_confirm', string>
  noActions: string
  setProperty: string
  openNewRow: string
  urlFrom: string
  typedUrl: string
  confirmMessage: string
  confirmDefault: string
  emptyValue: string
  dynamicNow: string
  customDate: string
  me: string
  automations: string
  automationsHint: string
  addAutomation: string
  deleteAutomation: string
  automationName: string
  automationEnabled: string
  triggerWhen: string
  triggers: Record<'row_added' | 'prop_changed', string>
  anyProperty: string
  onlyWhen: string
  thenDo: string
  inline: string
  fullPage: string
  /** Layout / view settings (0.2). */
  layout: string
  openPagesIn: string
  openModes: Record<'side_peek' | 'center_peek' | 'full_page', string>
  openModeHints: Record<'side_peek' | 'center_peek' | 'full_page', string>
  wrapText: string
  wrapAll: string
  freezeColumn: string
  freezeFirst: string
  unfreezeColumns: string
  insertLeft: string
  insertRight: string
  duplicateProperty: string
  clearSelection: string
  propertyDescription: string
  propertyDescriptionHint: string
  wrapPageTitles: string
  showTitle: string
  showPageIcon: string
  formDescription: string
  formAnswer: string
  formSubmit: string
  shareForm: string
  shareFormHint: string
  copyFormLink: string
  linkCopied: string
  formSent: string
  formAgain: string
  formNoQuestions: string
  required: string
  formRequiredError: string
  subItems: string
  addSubItem: string
  parentItem: string
  turnOnSubItems: string
  /** Board card footer: "{n} sub-items" (`subItemCount` when n = 1). */
  subItemsCount: string
  subItemCount: string
  subItemsDisplay: string
  subItemsDisplays: Record<'nested' | 'flat', string>
  off: string
  searchFormula: string
  formulaType: string
  formulaTypes: Record<string, string>
  formulaGroups: Record<string, string>
  example: string
  formulaHelp: string
  templates: string
  templatesHint: string
  saveAsTemplate: string
  deleteTemplate: string
  onePerson: string
  oneFile: string
  searchDatabases: string
  relationLimit: string
  onePage: string
  rules: string
  reset: string
  saveForEveryone: string
  locked: string
  lockedHint: string
  lockDatabase: string
  unlockDatabase: string
  copyLinkToView: string
  openAsFullPage: string
  groups: string
  conditionalColor: string
  conditionalColorHint: string
  addColorRule: string
  deleteColorRule: string
  background: string
  applyTo: string
  entireRow: string
  thisProperty: string
  property: string
  operator: string
  searchProperty: string
  shownProps: string
  hiddenProps: string
  calendarAs: string
  calendarModes: Record<'month' | 'week', string>
  verticalLines: string
  loadLimit: string
  noLimit: string
  showAs: string
  showAsKinds: Record<'number' | 'bar' | 'ring', string>
  divideBy: string
  showNumber: string
  timeFormat: string
  hour12: string
  hour24: string
  showFullUrl: string
  appliesToAllViews: string
  optionSort: string
  optionSorts: Record<'manual' | 'asc' | 'desc', string>
  setAsDefault: string
  defaultBadge: string
  moveToGroup: string
  optionColor: string
  done: string
  groupByThis: string
  ungroup: string
  sortLowHigh: string
  sortHighLow: string
  sortOldNew: string
  sortNewOld: string
  rowActions: string
  openIn: string
  duplicate: string
  copyLink: string
  editProperty: string
  moreActions: string
  newRowOptions: string
  newAtTop: string
  newAtBottom: string
  colorColumns: string
  cardSize: string
  fitImage: string
  /** Card preview options besides None and the files properties. */
  coverPageCover: string
  coverPageContent: string
  cardLayout: string
  cardLayouts: Record<'list' | 'compact', string>
  showWeekends: string
  showTable: string
  tableOptions: string
  viewOptions: string
  addRowBelow: string
}

type Shared = Pick<DatabaseMessages, 'ops' | 'types'>

const opsEn: Shared['ops'] = {
  'equals': 'Is', 'not_equals': 'Is not', 'contains': 'Contains', 'not_contains': 'Does not contain',
  'starts_with': 'Starts with', 'ends_with': 'Ends with', 'is_empty': 'Is empty', 'is_not_empty': 'Is not empty',
  '=': '=', '!=': '≠', '>': '>', '>=': '≥', '<': '<', '<=': '≤',
  'is': 'Is', 'is_not': 'Is not', 'is_any_of': 'Is any of', 'is_none_of': 'Is none of',
  'contains_any': 'Contains any of', 'contains_all': 'Contains all of',
  'before': 'Is before', 'after': 'Is after', 'on_or_before': 'Is on or before', 'on_or_after': 'Is on or after',
  'between': 'Is between', 'is_relative': 'Is relative to today',
}

export const messages: Record<LocaleName, DatabaseMessages> = {
  en: {
    untitled: 'Untitled',
    titlePlaceholder: 'Untitled database',
    loading: 'Loading…',
    notFound: 'Database not found or no access',
    error: 'Something went wrong',
    openFullPage: 'Open as full page',
    openDatabase: 'Open database {title}',
    viewTypes: { table: 'Table', board: 'Board', calendar: 'Calendar', timeline: 'Timeline', gallery: 'Gallery', list: 'List', chart: 'Chart', pivot: 'Pivot', form: 'Form' },
    addView: 'Add view',
    renameView: 'Rename',
    viewIcon: 'Icon',
    viewIconPlaceholder: 'Type an emoji',
    removeIcon: 'Remove icon',
    tabDisplayAs: 'Display as',
    tabDisplays: { name: 'Icon and name', icon: 'Icon only' },
    duplicateView: 'Duplicate',
    deleteView: 'Delete view',
    copyOf: '{name} (copy)',
    filter: 'Filter',
    sort: 'Sort',
    group: 'Group',
    properties: 'Properties',
    settings: 'View settings',
    search: 'Search…',
    newRow: 'New',
    deleteRows: 'Delete',
    selected: '{count} selected',
    addFilter: 'Add filter',
    addFilterGroup: 'Add filter group',
    where: 'Where',
    and: 'And',
    or: 'Or',
    remove: 'Remove',
    noFilters: 'No filters applied to this view',
    value: 'Value',
    ops: opsEn,
    relative: {
      today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday', this_week: 'This week', past_week: 'Past week',
      next_week: 'Next week', this_month: 'This month', past_month: 'Past month', next_month: 'Next month',
      past_year: 'Past year', next_year: 'Next year',
    },
    checked: 'Checked',
    unchecked: 'Unchecked',
    addSort: 'Add sort',
    noSorts: 'No sorts applied to this view',
    ascending: 'Ascending',
    descending: 'Descending',
    moveUp: 'Move up',
    moveDown: 'Move down',
    groupBy: 'Group by',
    noGrouping: 'None',
    hideEmptyGroups: 'Hide empty groups',
    noValue: 'No {name}',
    showAll: 'Show all',
    hideAll: 'Hide all',
    show: 'Show',
    hide: 'Hide',
    addProperty: 'Add property',
    propertyName: 'Property name',
    propertyType: 'Type',
    types: {
      title: 'Title', text: 'Text', number: 'Number', select: 'Select', multi_select: 'Multi-select', status: 'Status',
      date: 'Date', person: 'Person', files: 'Files & media', checkbox: 'Checkbox', url: 'URL', email: 'Email',
      phone: 'Phone', relation: 'Relation', rollup: 'Rollup', formula: 'Formula', created_time: 'Created time',
      last_edited_time: 'Last edited time', created_by: 'Created by', last_edited_by: 'Last edited by', unique_id: 'ID', button: 'Button',
    },
    rename: 'Rename',
    changeType: 'Change type',
    lossyWarning: 'Changing {from} to {to} may lose some values in this property. Continue?',
    confirm: 'Continue',
    cancel: 'Cancel',
    save: 'Save',
    editOptions: 'Edit options',
    addOption: 'Add an option',
    optionName: 'Option name',
    deleteOption: 'Delete option',
    colors: {
      default: 'Default', gray: 'Gray', brown: 'Brown', orange: 'Orange', yellow: 'Yellow', green: 'Green', blue: 'Blue',
      purple: 'Purple', pink: 'Pink', red: 'Red',
    },
    sortAscending: 'Sort ascending',
    sortDescending: 'Sort descending',
    filterBy: 'Filter',
    deleteProperty: 'Delete property',
    deletePropertyConfirm: 'Delete the property "{name}" and its values?',
    numberFormat: 'Number format',
    numberFormats: { number: 'Number', percent: 'Percent', currency: 'Currency' },
    currency: 'Currency',
    decimals: 'Decimal places',
    dateFormat: 'Date format',
    dateFormats: { full: 'Full date', short: 'Short date', dmy: 'Day/Month/Year', mdy: 'Month/Day/Year', ymd: 'Year/Month/Day', relative: 'Relative' },
    includeTime: 'Include time',
    formula: 'Formula',
    formulaPlaceholder: 'prop("Price") * prop("Qty")',
    formulaOk: 'Formula is valid',
    formulaChecking: 'Checking…',
    relationDatabase: 'Related database',
    thisDatabase: 'This database',
    twoWay: 'Show on related database (two-way)',
    rollupRelation: 'Relation',
    rollupTarget: 'Property',
    rollupFn: 'Calculate',
    rollupFns: {
      count: 'Count all', count_values: 'Count values', sum: 'Sum', avg: 'Average', min: 'Min', max: 'Max',
      median: 'Median', percent_checked: 'Percent checked', show_original: 'Show original', earliest: 'Earliest date',
      latest: 'Latest date', range: 'Range',
    },
    prefix: 'Prefix',
    readOnly: 'This property is calculated and can’t be edited',
    empty: 'Empty',
    searchOrCreate: 'Search for an option…',
    create: 'Create',
    searchPeople: 'Search for a person…',
    searchRows: 'Search for a page…',
    upload: 'Upload a file',
    addLink: 'Paste a link…',
    noResults: 'No results',
    clear: 'Clear',
    endDate: 'End date',
    time: 'Time',
    today: 'Today',
    open: 'Open',
    dragToMove: 'Drag to move',
    selectRow: 'Select row',
    selectAll: 'Select all',
    calculate: 'Calculate',
    none: 'None',
    aggregates: {
      count: 'Count all', count_values: 'Count values', count_empty: 'Count empty', count_not_empty: 'Count not empty',
      percent_empty: 'Percent empty', percent_not_empty: 'Percent not empty', unique: 'Count unique values', sum: 'Sum',
      avg: 'Average', min: 'Min', max: 'Max', median: 'Median', range: 'Range', earliest: 'Earliest date',
      latest: 'Latest date', checked: 'Checked', unchecked: 'Unchecked', percent_checked: 'Percent checked',
    },
    addGroup: 'Add group',
    newGroupName: 'Group name',
    dateProperty: 'Show calendar by',
    startProperty: 'Start date',
    endProperty: 'End date',
    scale: 'Scale',
    scales: { day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' },
    noDateProperty: 'Add a date property to use this view',
    cover: 'Card preview',
    coverNone: 'None',
    size: 'Card size',
    sizes: { s: 'Small', m: 'Medium', l: 'Large' },
    cardProperties: 'Card properties',
    chartType: 'Chart type',
    chartTypes: { bar: 'Bar', line: 'Line', area: 'Area', pie: 'Pie', donut: 'Donut', scatter: 'Scatter' },
    xAxis: 'X axis',
    bucket: 'Group dates by',
    buckets: { none: 'Exact', day: 'Day', week: 'Week', month: 'Month', year: 'Year' },
    yAxis: 'Y axis',
    series: 'Series',
    stacked: 'Stacked',
    noData: 'No data',
    pivotRows: 'Rows',
    pivotCols: 'Columns',
    pivotValues: 'Values',
    totals: 'Show totals',
    total: 'Total',
    previous: 'Previous',
    next: 'Next',
    more: 'More',
    loadMore: 'Load more',
    layout: 'Layout',
    openPagesIn: 'Open pages in',
    openModes: { side_peek: 'Side peek', center_peek: 'Center peek', full_page: 'Full page' },
    openModeHints: { side_peek: 'Open pages on the side, keeping the view in sight', center_peek: 'Open pages in a focused, centered panel', full_page: 'Open pages as a full page' },
    wrapText: 'Wrap text',
    wrapAll: 'Wrap all columns',
    freezeColumn: 'Freeze up to this column',
    freezeFirst: 'Freeze first column',
    unfreezeColumns: 'Unfreeze columns',
    insertLeft: 'Insert left',
    insertRight: 'Insert right',
    duplicateProperty: 'Duplicate property',
    clearSelection: 'Clear selection',
    propertyDescription: 'Description',
    propertyDescriptionHint: 'Shown when hovering the column',
    wrapPageTitles: 'Wrap page titles',
    showTitle: 'Show database title',
    showPageIcon: 'Show page icon',
    formDescription: 'Description (optional)',
    formAnswer: 'Your answer',
    formSubmit: 'Submit',
    shareForm: 'Share form',
    shareFormHint: 'Anyone with the link can answer, without signing in. Each answer adds a row.',
    copyFormLink: 'Copy link',
    linkCopied: 'Link copied',
    formSent: 'Thanks! Your answers were added.',
    formAgain: 'Submit another response',
    formNoQuestions: 'No questions: show properties in this view to ask them.',
    required: 'Required',
    formRequiredError: 'This question is required.',
    subItems: 'Sub-items',
    addSubItem: 'Add sub-item',
    parentItem: 'Parent item',
    turnOnSubItems: 'Turn on sub-items',
    subItemsCount: '{n} sub-items',
    subItemCount: '1 sub-item',
    subItemsDisplay: 'Show sub-items as',
    subItemsDisplays: { nested: 'Nested in toggle', flat: 'Flattened list' },
    off: 'Off',
    searchFormula: 'Search properties and functions…',
    formulaType: 'Type',
    formulaTypes: { number: 'Number', string: 'Text', boolean: 'Checkbox', date: 'Date' },
    formulaGroups: { general: 'General', text: 'Text', number: 'Number', date: 'Date', logic: 'Logic' },
    example: 'Example',
    formulaHelp: 'Click a property or a function to insert it. Hover one to see how it is used. Functions chain: prop("Name").upper().length(); a one-word property can be typed as is: Price * 2.',
    templates: 'Templates',
    templatesHint: "No templates yet. Use a row's menu → Save as template.",
    saveAsTemplate: 'Save as template',
    deleteTemplate: 'Delete template',
    onePerson: '1 person',
    oneFile: '1 file',
    searchDatabases: 'Search databases…',
    relationLimit: 'Limit',
    onePage: '1 page',
    rules: 'rules',
    reset: 'Reset',
    saveForEveryone: 'Save for everyone',
    locked: 'Locked',
    lockedHint: 'Properties, views and layout are locked. Data can still be edited.',
    lockDatabase: 'Lock database',
    unlockDatabase: 'Unlock database',
    copyLinkToView: 'Copy link to view',
    openAsFullPage: 'Open as full page',
    groups: 'Groups',
    conditionalColor: 'Conditional color',
    conditionalColorHint: 'Color rows or cells that match a condition, e.g. overdue tasks in red.',
    addColorRule: 'New color rule',
    deleteColorRule: 'Delete rule',
    background: 'Background',
    applyTo: 'Apply to',
    entireRow: 'Entire row',
    thisProperty: 'This property',
    property: 'Property',
    operator: 'Operator',
    searchProperty: 'Search for a property…',
    shownProps: 'Shown',
    hiddenProps: 'Hidden',
    calendarAs: 'Show calendar as',
    calendarModes: { month: 'Month', week: 'Week' },
    verticalLines: 'Show vertical lines',
    loadLimit: 'Load limit',
    noLimit: 'No limit',
    showAs: 'Show as',
    showAsKinds: { number: 'Number', bar: 'Bar', ring: 'Ring' },
    divideBy: 'Divide by',
    showNumber: 'Show number',
    timeFormat: 'Time format',
    hour12: '12 hour',
    hour24: '24 hour',
    showFullUrl: 'Show full URL',
    appliesToAllViews: 'Changes apply to all views showing this property.',
    optionSort: 'Sort',
    optionSorts: { manual: 'Manual', asc: 'Alphabetical', desc: 'Reverse alphabetical' },
    setAsDefault: 'Set as default',
    defaultBadge: 'Default',
    moveToGroup: 'Group',
    optionColor: 'Color',
    done: 'Done',
    groupByThis: 'Group',
    ungroup: 'Ungroup',
    sortLowHigh: 'Sort low → high',
    sortHighLow: 'Sort high → low',
    sortOldNew: 'Sort old → new',
    sortNewOld: 'Sort new → old',
    rowActions: 'Row actions',
    openIn: 'Open in',
    duplicate: 'Duplicate',
    copyLink: 'Copy link',
    editProperty: 'Edit property',
    moreActions: 'More actions',
    newRowOptions: 'More ways to add',
    newAtTop: 'Add to top',
    newAtBottom: 'Add to bottom',
    colorColumns: 'Color columns',
    cardSize: 'Card size',
    fitImage: 'Fit image',
    coverPageCover: 'Page cover',
    coverPageContent: 'Page content',
    cardLayout: 'Card layout',
    cardLayouts: { list: 'List', compact: 'Compact' },
    showWeekends: 'Show weekends',
    showTable: 'Show table',
    tableOptions: 'Table',
    viewOptions: 'View options',
    addRowBelow: 'Click to add below',
    inline: 'Database – inline',
    fullPage: 'Database – full page',
    buttonLabel: 'Button label',
    actionsLabel: 'Actions',
    addAction: 'Add action',
    deleteAction: 'Delete action',
    actionTypes: { set_values: 'Edit property', add_row: 'Add page', open_url: 'Open URL', show_confirm: 'Show confirmation' },
    noActions: 'No actions yet',
    setProperty: 'Set a property',
    openNewRow: 'Open the new page',
    urlFrom: 'Open',
    typedUrl: 'A link',
    confirmMessage: 'Message',
    confirmDefault: 'Are you sure?',
    emptyValue: 'Empty',
    dynamicNow: 'Now',
    customDate: 'A date',
    me: 'Me',
    automations: 'Automations',
    automationsHint: 'Run actions when a page is added or a property is edited. They run in the browser that made the edit.',
    addAutomation: 'New automation',
    deleteAutomation: 'Delete automation',
    automationName: 'Name',
    automationEnabled: 'On',
    triggerWhen: 'When',
    triggers: { row_added: 'Page added', prop_changed: 'Property edited' },
    anyProperty: 'Any property',
    onlyWhen: 'Only when the value',
    thenDo: 'Do',
  },
  vi: {
    untitled: 'Không có tiêu đề',
    titlePlaceholder: 'Cơ sở dữ liệu không tên',
    loading: 'Đang tải…',
    notFound: 'Không tìm thấy cơ sở dữ liệu hoặc bạn không có quyền truy cập',
    error: 'Đã có lỗi xảy ra',
    openFullPage: 'Mở toàn trang',
    openDatabase: 'Mở cơ sở dữ liệu {title}',
    viewTypes: { table: 'Bảng', board: 'Bảng Kanban', calendar: 'Lịch', timeline: 'Dòng thời gian', gallery: 'Thư viện', list: 'Danh sách', chart: 'Biểu đồ', pivot: 'Bảng tổng hợp', form: 'Biểu mẫu' },
    addView: 'Thêm chế độ xem',
    renameView: 'Đổi tên',
    viewIcon: 'Biểu tượng',
    viewIconPlaceholder: 'Nhập một emoji',
    removeIcon: 'Bỏ biểu tượng',
    tabDisplayAs: 'Hiển thị',
    tabDisplays: { name: 'Biểu tượng và tên', icon: 'Chỉ biểu tượng' },
    duplicateView: 'Nhân bản',
    deleteView: 'Xoá chế độ xem',
    copyOf: '{name} (bản sao)',
    filter: 'Lọc',
    sort: 'Sắp xếp',
    group: 'Nhóm',
    properties: 'Thuộc tính',
    settings: 'Cài đặt chế độ xem',
    search: 'Tìm kiếm…',
    newRow: 'Mới',
    deleteRows: 'Xoá',
    selected: 'Đã chọn {count}',
    addFilter: 'Thêm bộ lọc',
    addFilterGroup: 'Thêm nhóm bộ lọc',
    where: 'Khi',
    and: 'Và',
    or: 'Hoặc',
    remove: 'Xoá',
    noFilters: 'Chế độ xem này chưa có bộ lọc',
    value: 'Giá trị',
    ops: {
      ...opsEn,
      'equals': 'Là', 'not_equals': 'Không là', 'contains': 'Chứa', 'not_contains': 'Không chứa',
      'starts_with': 'Bắt đầu bằng', 'ends_with': 'Kết thúc bằng', 'is_empty': 'Trống', 'is_not_empty': 'Không trống',
      'is': 'Là', 'is_not': 'Không là', 'is_any_of': 'Là một trong', 'is_none_of': 'Không là cái nào trong',
      'contains_any': 'Chứa một trong', 'contains_all': 'Chứa tất cả',
      'before': 'Trước', 'after': 'Sau', 'on_or_before': 'Vào hoặc trước', 'on_or_after': 'Vào hoặc sau',
      'between': 'Trong khoảng', 'is_relative': 'So với hôm nay',
    },
    relative: {
      today: 'Hôm nay', tomorrow: 'Ngày mai', yesterday: 'Hôm qua', this_week: 'Tuần này', past_week: 'Tuần trước',
      next_week: 'Tuần sau', this_month: 'Tháng này', past_month: 'Tháng trước', next_month: 'Tháng sau',
      past_year: 'Năm trước', next_year: 'Năm sau',
    },
    checked: 'Đã đánh dấu',
    unchecked: 'Chưa đánh dấu',
    addSort: 'Thêm sắp xếp',
    noSorts: 'Chế độ xem này chưa sắp xếp',
    ascending: 'Tăng dần',
    descending: 'Giảm dần',
    moveUp: 'Lên trên',
    moveDown: 'Xuống dưới',
    groupBy: 'Nhóm theo',
    noGrouping: 'Không',
    hideEmptyGroups: 'Ẩn nhóm trống',
    noValue: 'Không có {name}',
    showAll: 'Hiện tất cả',
    hideAll: 'Ẩn tất cả',
    show: 'Hiện',
    hide: 'Ẩn',
    addProperty: 'Thêm thuộc tính',
    propertyName: 'Tên thuộc tính',
    propertyType: 'Kiểu',
    types: {
      title: 'Tiêu đề', text: 'Văn bản', number: 'Số', select: 'Chọn', multi_select: 'Chọn nhiều', status: 'Trạng thái',
      date: 'Ngày', person: 'Người', files: 'Tệp & phương tiện', checkbox: 'Hộp kiểm', url: 'URL', email: 'Email',
      phone: 'Điện thoại', relation: 'Liên kết', rollup: 'Tổng hợp', formula: 'Công thức', created_time: 'Thời gian tạo',
      last_edited_time: 'Sửa lần cuối', created_by: 'Người tạo', last_edited_by: 'Người sửa cuối', unique_id: 'ID', button: 'Nút',
    },
    rename: 'Đổi tên',
    changeType: 'Đổi kiểu',
    lossyWarning: 'Đổi từ {from} sang {to} có thể làm mất một số giá trị của thuộc tính này. Tiếp tục?',
    confirm: 'Tiếp tục',
    cancel: 'Huỷ',
    save: 'Lưu',
    editOptions: 'Sửa lựa chọn',
    addOption: 'Thêm lựa chọn',
    optionName: 'Tên lựa chọn',
    deleteOption: 'Xoá lựa chọn',
    colors: {
      default: 'Mặc định', gray: 'Xám', brown: 'Nâu', orange: 'Cam', yellow: 'Vàng', green: 'Xanh lá', blue: 'Xanh dương',
      purple: 'Tím', pink: 'Hồng', red: 'Đỏ',
    },
    sortAscending: 'Sắp xếp tăng dần',
    sortDescending: 'Sắp xếp giảm dần',
    filterBy: 'Lọc',
    deleteProperty: 'Xoá thuộc tính',
    deletePropertyConfirm: 'Xoá thuộc tính "{name}" cùng các giá trị của nó?',
    numberFormat: 'Định dạng số',
    numberFormats: { number: 'Số', percent: 'Phần trăm', currency: 'Tiền tệ' },
    currency: 'Tiền tệ',
    decimals: 'Số chữ số thập phân',
    dateFormat: 'Định dạng ngày',
    dateFormats: { full: 'Ngày đầy đủ', short: 'Ngày rút gọn', dmy: 'Ngày/Tháng/Năm', mdy: 'Tháng/Ngày/Năm', ymd: 'Năm/Tháng/Ngày', relative: 'Tương đối' },
    includeTime: 'Kèm giờ',
    formula: 'Công thức',
    formulaPlaceholder: 'prop("Giá") * prop("SL")',
    formulaOk: 'Công thức hợp lệ',
    formulaChecking: 'Đang kiểm tra…',
    relationDatabase: 'Cơ sở dữ liệu liên kết',
    thisDatabase: 'Cơ sở dữ liệu này',
    twoWay: 'Hiện ở cơ sở dữ liệu liên kết (hai chiều)',
    rollupRelation: 'Liên kết',
    rollupTarget: 'Thuộc tính',
    rollupFn: 'Tính',
    rollupFns: {
      count: 'Đếm tất cả', count_values: 'Đếm giá trị', sum: 'Tổng', avg: 'Trung bình', min: 'Nhỏ nhất', max: 'Lớn nhất',
      median: 'Trung vị', percent_checked: 'Phần trăm đã đánh dấu', show_original: 'Hiện nguyên bản', earliest: 'Ngày sớm nhất',
      latest: 'Ngày muộn nhất', range: 'Khoảng',
    },
    prefix: 'Tiền tố',
    readOnly: 'Thuộc tính này được tính tự động, không sửa được',
    empty: 'Trống',
    searchOrCreate: 'Tìm lựa chọn…',
    create: 'Tạo',
    searchPeople: 'Tìm người…',
    searchRows: 'Tìm trang…',
    upload: 'Tải tệp lên',
    addLink: 'Dán liên kết…',
    noResults: 'Không có kết quả',
    clear: 'Xoá',
    endDate: 'Ngày kết thúc',
    time: 'Giờ',
    today: 'Hôm nay',
    open: 'Mở',
    dragToMove: 'Kéo để di chuyển',
    selectRow: 'Chọn dòng',
    selectAll: 'Chọn tất cả',
    calculate: 'Tính',
    none: 'Không',
    aggregates: {
      count: 'Đếm tất cả', count_values: 'Đếm giá trị', count_empty: 'Đếm ô trống', count_not_empty: 'Đếm ô có giá trị',
      percent_empty: 'Phần trăm trống', percent_not_empty: 'Phần trăm có giá trị', unique: 'Đếm giá trị khác nhau', sum: 'Tổng',
      avg: 'Trung bình', min: 'Nhỏ nhất', max: 'Lớn nhất', median: 'Trung vị', range: 'Khoảng', earliest: 'Ngày sớm nhất',
      latest: 'Ngày muộn nhất', checked: 'Đã đánh dấu', unchecked: 'Chưa đánh dấu', percent_checked: 'Phần trăm đã đánh dấu',
    },
    addGroup: 'Thêm nhóm',
    newGroupName: 'Tên nhóm',
    dateProperty: 'Hiện lịch theo',
    startProperty: 'Ngày bắt đầu',
    endProperty: 'Ngày kết thúc',
    scale: 'Tỉ lệ',
    scales: { day: 'Ngày', week: 'Tuần', month: 'Tháng', quarter: 'Quý', year: 'Năm' },
    noDateProperty: 'Thêm một thuộc tính ngày để dùng chế độ xem này',
    cover: 'Ảnh thẻ',
    coverNone: 'Không',
    size: 'Cỡ thẻ',
    sizes: { s: 'Nhỏ', m: 'Vừa', l: 'Lớn' },
    cardProperties: 'Thuộc tính trên thẻ',
    chartType: 'Loại biểu đồ',
    chartTypes: { bar: 'Cột', line: 'Đường', area: 'Vùng', pie: 'Tròn', donut: 'Vành khuyên', scatter: 'Phân tán' },
    xAxis: 'Trục X',
    bucket: 'Gộp ngày theo',
    buckets: { none: 'Chính xác', day: 'Ngày', week: 'Tuần', month: 'Tháng', year: 'Năm' },
    yAxis: 'Trục Y',
    series: 'Chuỗi',
    stacked: 'Xếp chồng',
    noData: 'Không có dữ liệu',
    pivotRows: 'Hàng',
    pivotCols: 'Cột',
    pivotValues: 'Giá trị',
    totals: 'Hiện tổng',
    total: 'Tổng',
    previous: 'Trước',
    next: 'Sau',
    more: 'Thêm',
    loadMore: 'Tải thêm',
    layout: 'Bố cục',
    openPagesIn: 'Mở trang trong',
    openModes: { side_peek: 'Xem bên cạnh', center_peek: 'Xem ở giữa', full_page: 'Toàn trang' },
    openModeHints: { side_peek: 'Mở trang ở cạnh phải, vẫn thấy chế độ xem', center_peek: 'Mở trang trong khung tập trung ở giữa', full_page: 'Mở trang như một trang đầy đủ' },
    wrapText: 'Xuống dòng',
    wrapAll: 'Xuống dòng mọi cột',
    freezeColumn: 'Cố định đến cột này',
    freezeFirst: 'Cố định cột đầu',
    unfreezeColumns: 'Bỏ cố định cột',
    insertLeft: 'Chèn bên trái',
    insertRight: 'Chèn bên phải',
    duplicateProperty: 'Nhân bản thuộc tính',
    clearSelection: 'Bỏ chọn',
    propertyDescription: 'Mô tả',
    propertyDescriptionHint: 'Hiện khi rê chuột lên cột',
    wrapPageTitles: 'Xuống dòng tiêu đề',
    showTitle: 'Hiện tiêu đề database',
    showPageIcon: 'Hiện biểu tượng trang',
    formDescription: 'Mô tả (không bắt buộc)',
    formAnswer: 'Câu trả lời',
    formSubmit: 'Gửi',
    shareForm: 'Chia sẻ biểu mẫu',
    shareFormHint: 'Ai có link đều trả lời được, không cần đăng nhập. Mỗi câu trả lời thêm một row.',
    copyFormLink: 'Sao chép link',
    linkCopied: 'Đã sao chép link',
    formSent: 'Cảm ơn! Câu trả lời đã được thêm.',
    formAgain: 'Gửi câu trả lời khác',
    formNoQuestions: 'Chưa có câu hỏi: hiện thuộc tính trong view này để hỏi.',
    required: 'Bắt buộc',
    formRequiredError: 'Câu này bắt buộc.',
    subItems: 'Mục con',
    addSubItem: 'Thêm mục con',
    parentItem: 'Mục cha',
    turnOnSubItems: 'Bật mục con',
    subItemsCount: '{n} mục con',
    subItemCount: '1 mục con',
    subItemsDisplay: 'Hiện mục con dạng',
    subItemsDisplays: { nested: 'Lồng trong nút mở', flat: 'Danh sách phẳng' },
    off: 'Tắt',
    searchFormula: 'Tìm thuộc tính và hàm…',
    formulaType: 'Kiểu',
    formulaTypes: { number: 'Số', string: 'Văn bản', boolean: 'Hộp kiểm', date: 'Ngày' },
    formulaGroups: { general: 'Chung', text: 'Văn bản', number: 'Số', date: 'Ngày', logic: 'Logic' },
    example: 'Ví dụ',
    formulaHelp: 'Bấm vào thuộc tính hoặc hàm để chèn. Rê chuột để xem cách dùng. Gọi nối được: prop("Tên").upper().length(); thuộc tính một từ gõ thẳng tên: Giá * 2.',
    templates: 'Mẫu (template)',
    templatesHint: 'Chưa có mẫu. Dùng menu của một row → Lưu làm mẫu.',
    saveAsTemplate: 'Lưu làm mẫu',
    deleteTemplate: 'Xoá mẫu',
    onePerson: '1 người',
    oneFile: '1 tệp',
    searchDatabases: 'Tìm database…',
    relationLimit: 'Giới hạn',
    onePage: '1 trang',
    rules: 'quy tắc',
    reset: 'Đặt lại',
    saveForEveryone: 'Lưu cho mọi người',
    locked: 'Đã khoá',
    lockedHint: 'Thuộc tính, view và bố cục đã bị khoá. Dữ liệu vẫn sửa được.',
    lockDatabase: 'Khoá database',
    unlockDatabase: 'Mở khoá database',
    copyLinkToView: 'Sao chép liên kết tới view',
    openAsFullPage: 'Mở toàn trang',
    groups: 'Các nhóm',
    conditionalColor: 'Màu theo điều kiện',
    conditionalColorHint: 'Tô màu row hoặc ô khớp điều kiện, ví dụ việc quá hạn tô đỏ.',
    addColorRule: 'Thêm quy tắc màu',
    deleteColorRule: 'Xoá quy tắc',
    background: 'Màu nền',
    applyTo: 'Áp dụng cho',
    entireRow: 'Cả row',
    thisProperty: 'Chỉ ô thuộc tính này',
    property: 'Thuộc tính',
    operator: 'Toán tử',
    searchProperty: 'Tìm thuộc tính…',
    shownProps: 'Đang hiện',
    hiddenProps: 'Đang ẩn',
    calendarAs: 'Hiển thị lịch dạng',
    calendarModes: { month: 'Tháng', week: 'Tuần' },
    verticalLines: 'Hiện đường kẻ dọc',
    loadLimit: 'Giới hạn tải',
    noLimit: 'Không giới hạn',
    showAs: 'Hiển thị dạng',
    showAsKinds: { number: 'Số', bar: 'Thanh', ring: 'Vòng' },
    divideBy: 'Chia cho',
    showNumber: 'Hiện số',
    timeFormat: 'Định dạng giờ',
    hour12: '12 giờ',
    hour24: '24 giờ',
    showFullUrl: 'Hiện URL đầy đủ',
    appliesToAllViews: 'Thay đổi áp dụng cho mọi view hiện thuộc tính này.',
    optionSort: 'Sắp xếp',
    optionSorts: { manual: 'Thủ công', asc: 'Theo bảng chữ cái', desc: 'Ngược bảng chữ cái' },
    setAsDefault: 'Đặt làm mặc định',
    defaultBadge: 'Mặc định',
    moveToGroup: 'Nhóm',
    optionColor: 'Màu',
    done: 'Xong',
    groupByThis: 'Nhóm theo cột này',
    ungroup: 'Bỏ nhóm',
    sortLowHigh: 'Sắp xếp thấp → cao',
    sortHighLow: 'Sắp xếp cao → thấp',
    sortOldNew: 'Sắp xếp cũ → mới',
    sortNewOld: 'Sắp xếp mới → cũ',
    rowActions: 'Thao tác dòng',
    openIn: 'Mở trong',
    duplicate: 'Nhân bản',
    copyLink: 'Sao chép liên kết',
    editProperty: 'Sửa thuộc tính',
    moreActions: 'Thao tác khác',
    newRowOptions: 'Thêm cách tạo khác',
    newAtTop: 'Thêm lên đầu',
    newAtBottom: 'Thêm xuống cuối',
    colorColumns: 'Tô màu cột',
    cardSize: 'Cỡ thẻ',
    fitImage: 'Vừa khung ảnh',
    coverPageCover: 'Ảnh bìa trang',
    coverPageContent: 'Nội dung trang',
    cardLayout: 'Bố cục thẻ',
    cardLayouts: { list: 'Danh sách', compact: 'Gọn' },
    showWeekends: 'Hiện cuối tuần',
    showTable: 'Hiện bảng',
    tableOptions: 'Bảng',
    viewOptions: 'Tùy chọn chế độ xem',
    addRowBelow: 'Bấm để thêm bên dưới',
    inline: 'Cơ sở dữ liệu – trong trang',
    fullPage: 'Cơ sở dữ liệu – toàn trang',
    buttonLabel: 'Nhãn nút',
    actionsLabel: 'Hành động',
    addAction: 'Thêm hành động',
    deleteAction: 'Xóa hành động',
    actionTypes: { set_values: 'Sửa thuộc tính', add_row: 'Thêm trang', open_url: 'Mở URL', show_confirm: 'Hiện xác nhận' },
    noActions: 'Chưa có hành động',
    setProperty: 'Đặt một thuộc tính',
    openNewRow: 'Mở trang mới',
    urlFrom: 'Mở',
    typedUrl: 'Một liên kết',
    confirmMessage: 'Lời nhắn',
    confirmDefault: 'Bạn có chắc không?',
    emptyValue: 'Để trống',
    dynamicNow: 'Bây giờ',
    customDate: 'Một ngày',
    me: 'Tôi',
    automations: 'Tự động hóa',
    automationsHint: 'Chạy hành động khi có trang mới hoặc một thuộc tính được sửa. Chạy trên trình duyệt đã sửa.',
    addAutomation: 'Tự động hóa mới',
    deleteAutomation: 'Xóa tự động hóa',
    automationName: 'Tên',
    automationEnabled: 'Bật',
    triggerWhen: 'Khi',
    triggers: { row_added: 'Có trang mới', prop_changed: 'Thuộc tính được sửa' },
    anyProperty: 'Bất kỳ thuộc tính nào',
    onlyWhen: 'Chỉ khi giá trị',
    thenDo: 'Thì',
  },
  zh: {
    untitled: '无标题',
    titlePlaceholder: '无标题数据库',
    loading: '加载中…',
    notFound: '数据库不存在或无访问权限',
    error: '出错了',
    openFullPage: '以整页打开',
    openDatabase: '打开数据库 {title}',
    viewTypes: { table: '表格', board: '看板', calendar: '日历', timeline: '时间线', gallery: '画廊', list: '列表', chart: '图表', pivot: '数据透视', form: '表单' },
    addView: '添加视图',
    renameView: '重命名',
    viewIcon: '图标',
    viewIconPlaceholder: '输入一个表情',
    removeIcon: '移除图标',
    tabDisplayAs: '显示为',
    tabDisplays: { name: '图标和名称', icon: '仅图标' },
    duplicateView: '创建副本',
    deleteView: '删除视图',
    copyOf: '{name}（副本）',
    filter: '筛选',
    sort: '排序',
    group: '分组',
    properties: '属性',
    settings: '视图设置',
    search: '搜索…',
    newRow: '新建',
    deleteRows: '删除',
    selected: '已选择 {count} 项',
    addFilter: '添加筛选',
    addFilterGroup: '添加筛选组',
    where: '当',
    and: '且',
    or: '或',
    remove: '移除',
    noFilters: '此视图没有筛选条件',
    value: '值',
    ops: {
      ...opsEn,
      'equals': '是', 'not_equals': '不是', 'contains': '包含', 'not_contains': '不包含',
      'starts_with': '开头是', 'ends_with': '结尾是', 'is_empty': '为空', 'is_not_empty': '不为空',
      'is': '是', 'is_not': '不是', 'is_any_of': '是其中之一', 'is_none_of': '都不是',
      'contains_any': '包含任一', 'contains_all': '包含全部',
      'before': '早于', 'after': '晚于', 'on_or_before': '不晚于', 'on_or_after': '不早于',
      'between': '介于', 'is_relative': '相对今天',
    },
    relative: {
      today: '今天', tomorrow: '明天', yesterday: '昨天', this_week: '本周', past_week: '上周',
      next_week: '下周', this_month: '本月', past_month: '上月', next_month: '下月',
      past_year: '去年', next_year: '明年',
    },
    checked: '已勾选',
    unchecked: '未勾选',
    addSort: '添加排序',
    noSorts: '此视图没有排序',
    ascending: '升序',
    descending: '降序',
    moveUp: '上移',
    moveDown: '下移',
    groupBy: '分组依据',
    noGrouping: '无',
    hideEmptyGroups: '隐藏空分组',
    noValue: '无{name}',
    showAll: '全部显示',
    hideAll: '全部隐藏',
    show: '显示',
    hide: '隐藏',
    addProperty: '添加属性',
    propertyName: '属性名称',
    propertyType: '类型',
    types: {
      title: '标题', text: '文本', number: '数字', select: '单选', multi_select: '多选', status: '状态',
      date: '日期', person: '人员', files: '文件和媒体', checkbox: '复选框', url: '网址', email: '电子邮件',
      phone: '电话', relation: '关联', rollup: '汇总', formula: '公式', created_time: '创建时间',
      last_edited_time: '最后编辑时间', created_by: '创建者', last_edited_by: '最后编辑者', unique_id: 'ID', button: '按钮',
    },
    rename: '重命名',
    changeType: '更改类型',
    lossyWarning: '将 {from} 改为 {to} 可能会丢失此属性的部分值。是否继续？',
    confirm: '继续',
    cancel: '取消',
    save: '保存',
    editOptions: '编辑选项',
    addOption: '添加选项',
    optionName: '选项名称',
    deleteOption: '删除选项',
    colors: {
      default: '默认', gray: '灰色', brown: '棕色', orange: '橙色', yellow: '黄色', green: '绿色', blue: '蓝色',
      purple: '紫色', pink: '粉色', red: '红色',
    },
    sortAscending: '升序排序',
    sortDescending: '降序排序',
    filterBy: '筛选',
    deleteProperty: '删除属性',
    deletePropertyConfirm: '删除属性“{name}”及其所有值？',
    numberFormat: '数字格式',
    numberFormats: { number: '数字', percent: '百分比', currency: '货币' },
    currency: '货币',
    decimals: '小数位数',
    dateFormat: '日期格式',
    dateFormats: { full: '完整日期', short: '短日期', dmy: '日/月/年', mdy: '月/日/年', ymd: '年/月/日', relative: '相对时间' },
    includeTime: '包含时间',
    formula: '公式',
    formulaPlaceholder: 'prop("价格") * prop("数量")',
    formulaOk: '公式有效',
    formulaChecking: '检查中…',
    relationDatabase: '关联的数据库',
    thisDatabase: '此数据库',
    twoWay: '在关联数据库中显示（双向）',
    rollupRelation: '关联',
    rollupTarget: '属性',
    rollupFn: '计算',
    rollupFns: {
      count: '全部计数', count_values: '值计数', sum: '求和', avg: '平均值', min: '最小值', max: '最大值',
      median: '中位数', percent_checked: '已勾选百分比', show_original: '显示原始值', earliest: '最早日期',
      latest: '最晚日期', range: '范围',
    },
    prefix: '前缀',
    readOnly: '此属性为自动计算，无法编辑',
    empty: '空',
    searchOrCreate: '搜索选项…',
    create: '创建',
    searchPeople: '搜索人员…',
    searchRows: '搜索页面…',
    upload: '上传文件',
    addLink: '粘贴链接…',
    noResults: '无结果',
    clear: '清除',
    endDate: '结束日期',
    time: '时间',
    today: '今天',
    open: '打开',
    dragToMove: '拖动以移动',
    selectRow: '选择行',
    selectAll: '全选',
    calculate: '计算',
    none: '无',
    aggregates: {
      count: '全部计数', count_values: '值计数', count_empty: '空值计数', count_not_empty: '非空计数',
      percent_empty: '空值百分比', percent_not_empty: '非空百分比', unique: '唯一值计数', sum: '求和',
      avg: '平均值', min: '最小值', max: '最大值', median: '中位数', range: '范围', earliest: '最早日期',
      latest: '最晚日期', checked: '已勾选', unchecked: '未勾选', percent_checked: '已勾选百分比',
    },
    addGroup: '添加分组',
    newGroupName: '分组名称',
    dateProperty: '日历依据',
    startProperty: '开始日期',
    endProperty: '结束日期',
    scale: '刻度',
    scales: { day: '天', week: '周', month: '月', quarter: '季度', year: '年' },
    noDateProperty: '添加一个日期属性以使用此视图',
    cover: '卡片预览',
    coverNone: '无',
    size: '卡片大小',
    sizes: { s: '小', m: '中', l: '大' },
    cardProperties: '卡片属性',
    chartType: '图表类型',
    chartTypes: { bar: '柱状图', line: '折线图', area: '面积图', pie: '饼图', donut: '环形图', scatter: '散点图' },
    xAxis: 'X 轴',
    bucket: '日期分组',
    buckets: { none: '精确', day: '天', week: '周', month: '月', year: '年' },
    yAxis: 'Y 轴',
    series: '系列',
    stacked: '堆叠',
    noData: '无数据',
    pivotRows: '行',
    pivotCols: '列',
    pivotValues: '值',
    totals: '显示总计',
    total: '总计',
    previous: '上一个',
    next: '下一个',
    more: '更多',
    loadMore: '加载更多',
    layout: '布局',
    openPagesIn: '页面打开方式',
    openModes: { side_peek: '侧边预览', center_peek: '居中预览', full_page: '整页' },
    openModeHints: { side_peek: '在侧边打开页面，视图保持可见', center_peek: '在居中的聚焦面板中打开页面', full_page: '以整页打开页面' },
    wrapText: '自动换行',
    wrapAll: '所有列自动换行',
    freezeColumn: '冻结至此列',
    freezeFirst: '冻结首列',
    unfreezeColumns: '取消冻结列',
    insertLeft: '在左侧插入',
    insertRight: '在右侧插入',
    duplicateProperty: '复制属性',
    clearSelection: '取消选择',
    propertyDescription: '描述',
    propertyDescriptionHint: '悬停列时显示',
    wrapPageTitles: '标题换行',
    showTitle: '显示数据库标题',
    showPageIcon: '显示页面图标',
    formDescription: '描述（可选）',
    formAnswer: '你的回答',
    formSubmit: '提交',
    shareForm: '分享表单',
    shareFormHint: '任何拿到链接的人都能填写，无需登录。每份回答新增一行。',
    copyFormLink: '复制链接',
    linkCopied: '已复制链接',
    formSent: '谢谢！你的回答已添加。',
    formAgain: '再提交一份',
    formNoQuestions: '没有问题：在此视图中显示属性即可提问。',
    required: '必填',
    formRequiredError: '此问题为必填项。',
    subItems: '子项',
    addSubItem: '添加子项',
    parentItem: '父项',
    turnOnSubItems: '开启子项',
    subItemsCount: '{n} 个子项',
    subItemCount: '1 个子项',
    subItemsDisplay: '子项显示方式',
    subItemsDisplays: { nested: '嵌套在折叠中', flat: '平铺列表' },
    off: '关闭',
    searchFormula: '搜索属性和函数…',
    formulaType: '类型',
    formulaTypes: { number: '数字', string: '文本', boolean: '复选框', date: '日期' },
    formulaGroups: { general: '通用', text: '文本', number: '数字', date: '日期', logic: '逻辑' },
    example: '示例',
    formulaHelp: '点击属性或函数即可插入，悬停查看用法。函数可链式调用：prop("名称").upper().length()；单个词的属性可直接输入名称：Price * 2。',
    templates: '模板',
    templatesHint: '还没有模板。使用行菜单 → 另存为模板。',
    saveAsTemplate: '另存为模板',
    deleteTemplate: '删除模板',
    onePerson: '1 人',
    oneFile: '1 个文件',
    searchDatabases: '搜索数据库…',
    relationLimit: '上限',
    onePage: '1 个页面',
    rules: '条规则',
    reset: '重置',
    saveForEveryone: '为所有人保存',
    locked: '已锁定',
    lockedHint: '属性、视图和布局已锁定，数据仍可编辑。',
    lockDatabase: '锁定数据库',
    unlockDatabase: '解锁数据库',
    copyLinkToView: '复制视图链接',
    openAsFullPage: '以整页打开',
    groups: '分组',
    conditionalColor: '条件颜色',
    conditionalColorHint: '为符合条件的行或单元格着色，例如将逾期任务标为红色。',
    addColorRule: '新建颜色规则',
    deleteColorRule: '删除规则',
    background: '背景',
    applyTo: '应用于',
    entireRow: '整行',
    thisProperty: '仅此属性',
    property: '属性',
    operator: '运算符',
    searchProperty: '搜索属性…',
    shownProps: '已显示',
    hiddenProps: '已隐藏',
    calendarAs: '日历显示为',
    calendarModes: { month: '月', week: '周' },
    verticalLines: '显示竖线',
    loadLimit: '加载上限',
    noLimit: '无限制',
    showAs: '显示为',
    showAsKinds: { number: '数字', bar: '进度条', ring: '圆环' },
    divideBy: '除以',
    showNumber: '显示数字',
    timeFormat: '时间格式',
    hour12: '12 小时制',
    hour24: '24 小时制',
    showFullUrl: '显示完整网址',
    appliesToAllViews: '更改将应用于显示此属性的所有视图。',
    optionSort: '排序',
    optionSorts: { manual: '手动', asc: '按字母顺序', desc: '按字母倒序' },
    setAsDefault: '设为默认',
    defaultBadge: '默认',
    moveToGroup: '分组',
    optionColor: '颜色',
    done: '完成',
    groupByThis: '分组',
    ungroup: '取消分组',
    sortLowHigh: '从低到高排序',
    sortHighLow: '从高到低排序',
    sortOldNew: '从旧到新排序',
    sortNewOld: '从新到旧排序',
    rowActions: '行操作',
    openIn: '打开方式',
    duplicate: '创建副本',
    copyLink: '复制链接',
    editProperty: '编辑属性',
    moreActions: '更多操作',
    newRowOptions: '更多添加方式',
    newAtTop: '添加到顶部',
    newAtBottom: '添加到底部',
    colorColumns: '列着色',
    cardSize: '卡片大小',
    fitImage: '适应图片',
    coverPageCover: '页面封面',
    coverPageContent: '页面内容',
    cardLayout: '卡片布局',
    cardLayouts: { list: '列表', compact: '紧凑' },
    showWeekends: '显示周末',
    showTable: '显示表格',
    tableOptions: '表格',
    viewOptions: '视图选项',
    addRowBelow: '点击在下方添加',
    inline: '数据库 – 内嵌',
    fullPage: '数据库 – 整页',
    buttonLabel: '按钮文字',
    actionsLabel: '操作',
    addAction: '添加操作',
    deleteAction: '删除操作',
    actionTypes: { set_values: '编辑属性', add_row: '添加页面', open_url: '打开链接', show_confirm: '显示确认' },
    noActions: '暂无操作',
    setProperty: '设置属性',
    openNewRow: '打开新页面',
    urlFrom: '打开',
    typedUrl: '一个链接',
    confirmMessage: '提示信息',
    confirmDefault: '确定吗？',
    emptyValue: '空',
    dynamicNow: '现在',
    customDate: '指定日期',
    me: '我',
    automations: '自动化',
    automationsHint: '在添加页面或编辑属性时运行操作。由进行编辑的浏览器运行。',
    addAutomation: '新建自动化',
    deleteAutomation: '删除自动化',
    automationName: '名称',
    automationEnabled: '启用',
    triggerWhen: '当',
    triggers: { row_added: '添加页面', prop_changed: '编辑属性' },
    anyProperty: '任意属性',
    onlyWhen: '仅当值',
    thenDo: '执行',
  },
}

/** Strings for a locale, with the app's overrides. */
export function databaseMessages(locale: string | undefined, overrides?: Partial<Record<LocaleName, Partial<DatabaseMessages>>> | null): DatabaseMessages {
  const key = (locale && locale in messages ? locale : 'vi') as LocaleName
  return { ...messages[key], ...(overrides?.[key] ?? {}) }
}

/** `fmt('{count} selected', { count: 3 })` */
export const fmt = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
