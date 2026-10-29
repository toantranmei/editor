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
  viewTypes: Record<'table' | 'board' | 'calendar' | 'timeline' | 'gallery' | 'list' | 'chart' | 'pivot', string>
  addView: string
  renameView: string
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
  dateFormats: Record<'dmy' | 'mdy' | 'ymd' | 'relative', string>
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
  scales: Record<'day' | 'week' | 'month', string>
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
  inline: string
  fullPage: string
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
    viewTypes: { table: 'Table', board: 'Board', calendar: 'Calendar', timeline: 'Timeline', gallery: 'Gallery', list: 'List', chart: 'Chart', pivot: 'Pivot' },
    addView: 'Add view',
    renameView: 'Rename',
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
      last_edited_time: 'Last edited time', created_by: 'Created by', last_edited_by: 'Last edited by', unique_id: 'ID',
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
    dateFormats: { dmy: 'Day/Month/Year', mdy: 'Month/Day/Year', ymd: 'Year/Month/Day', relative: 'Relative' },
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
    scales: { day: 'Day', week: 'Week', month: 'Month' },
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
    inline: 'Database – inline',
    fullPage: 'Database – full page',
  },
  vi: {
    untitled: 'Không có tiêu đề',
    titlePlaceholder: 'Cơ sở dữ liệu không tên',
    loading: 'Đang tải…',
    notFound: 'Không tìm thấy cơ sở dữ liệu hoặc bạn không có quyền truy cập',
    error: 'Đã có lỗi xảy ra',
    openFullPage: 'Mở toàn trang',
    openDatabase: 'Mở cơ sở dữ liệu {title}',
    viewTypes: { table: 'Bảng', board: 'Bảng Kanban', calendar: 'Lịch', timeline: 'Dòng thời gian', gallery: 'Thư viện', list: 'Danh sách', chart: 'Biểu đồ', pivot: 'Bảng tổng hợp' },
    addView: 'Thêm chế độ xem',
    renameView: 'Đổi tên',
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
      last_edited_time: 'Sửa lần cuối', created_by: 'Người tạo', last_edited_by: 'Người sửa cuối', unique_id: 'ID',
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
    dateFormats: { dmy: 'Ngày/Tháng/Năm', mdy: 'Tháng/Ngày/Năm', ymd: 'Năm/Tháng/Ngày', relative: 'Tương đối' },
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
    scales: { day: 'Ngày', week: 'Tuần', month: 'Tháng' },
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
    inline: 'Cơ sở dữ liệu – trong trang',
    fullPage: 'Cơ sở dữ liệu – toàn trang',
  },
  zh: {
    untitled: '无标题',
    titlePlaceholder: '无标题数据库',
    loading: '加载中…',
    notFound: '数据库不存在或无访问权限',
    error: '出错了',
    openFullPage: '以整页打开',
    openDatabase: '打开数据库 {title}',
    viewTypes: { table: '表格', board: '看板', calendar: '日历', timeline: '时间线', gallery: '画廊', list: '列表', chart: '图表', pivot: '数据透视' },
    addView: '添加视图',
    renameView: '重命名',
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
      last_edited_time: '最后编辑时间', created_by: '创建者', last_edited_by: '最后编辑者', unique_id: 'ID',
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
    dateFormats: { dmy: '日/月/年', mdy: '月/日/年', ymd: '年/月/日', relative: '相对时间' },
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
    scales: { day: '天', week: '周', month: '月' },
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
    inline: '数据库 – 内嵌',
    fullPage: '数据库 – 整页',
  },
}

/** Strings for a locale, with the app's overrides. */
export function databaseMessages(locale: string | undefined, overrides?: Partial<Record<LocaleName, Partial<DatabaseMessages>>> | null): DatabaseMessages {
  const key = (locale && locale in messages ? locale : 'vi') as LocaleName
  return { ...messages[key], ...(overrides?.[key] ?? {}) }
}

/** `fmt('{count} selected', { count: 3 })` */
export const fmt = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
