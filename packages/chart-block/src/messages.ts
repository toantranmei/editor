import type { LocaleName } from '@toantranmei/editor'

export interface ChartMessages {
  edit: string
  done: string
  empty: string
  loading: string
  data: string
  settings: string
  chartType: string
  types: Record<'bar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter', string>
  xAxis: string
  yAxis: string
  series: string
  none: string
  stacked: string
  fn: Record<'count' | 'sum' | 'avg' | 'min' | 'max', string>
  addRow: string
  addColumn: string
  deleteRow: string
  deleteColumn: string
  addValue: string
  removeValue: string
  pasteCsv: string
  pastePlaceholder: string
  apply: string
  cancel: string
  column: string
  /** Accessible label of a cell input: `{row}`, `{column}` are replaced. */
  cell: string
}

export const messages: Record<LocaleName, ChartMessages> = {
  vi: {
    edit: 'Sửa dữ liệu',
    done: 'Xong',
    empty: 'Chưa có dữ liệu',
    loading: 'Đang tải biểu đồ…',
    data: 'Dữ liệu',
    settings: 'Cấu hình',
    chartType: 'Loại biểu đồ',
    types: { bar: 'Cột', line: 'Đường', area: 'Vùng', pie: 'Tròn', donut: 'Vành khuyên', scatter: 'Phân tán' },
    xAxis: 'Trục X',
    yAxis: 'Giá trị (Y)',
    series: 'Chia nhóm theo',
    none: 'Không',
    stacked: 'Xếp chồng',
    fn: { count: 'Đếm', sum: 'Tổng', avg: 'Trung bình', min: 'Nhỏ nhất', max: 'Lớn nhất' },
    addRow: 'Thêm dòng',
    addColumn: 'Thêm cột',
    deleteRow: 'Xoá dòng',
    deleteColumn: 'Xoá cột',
    addValue: 'Thêm giá trị',
    removeValue: 'Bỏ giá trị',
    pasteCsv: 'Dán CSV',
    pastePlaceholder: 'Dán dữ liệu CSV hoặc từ bảng tính (dòng đầu là tên cột)…',
    apply: 'Áp dụng',
    cancel: 'Huỷ',
    column: 'Cột',
    cell: 'Dòng {row}, cột {column}',
  },
  en: {
    edit: 'Edit data',
    done: 'Done',
    empty: 'No data',
    loading: 'Loading chart…',
    data: 'Data',
    settings: 'Settings',
    chartType: 'Chart type',
    types: { bar: 'Bar', line: 'Line', area: 'Area', pie: 'Pie', donut: 'Donut', scatter: 'Scatter' },
    xAxis: 'X axis',
    yAxis: 'Values (Y)',
    series: 'Group by',
    none: 'None',
    stacked: 'Stacked',
    fn: { count: 'Count', sum: 'Sum', avg: 'Average', min: 'Min', max: 'Max' },
    addRow: 'Add row',
    addColumn: 'Add column',
    deleteRow: 'Delete row',
    deleteColumn: 'Delete column',
    addValue: 'Add value',
    removeValue: 'Remove value',
    pasteCsv: 'Paste CSV',
    pastePlaceholder: 'Paste CSV or spreadsheet cells (first line = column names)…',
    apply: 'Apply',
    cancel: 'Cancel',
    column: 'Column',
    cell: 'Row {row}, column {column}',
  },
  zh: {
    edit: '编辑数据',
    done: '完成',
    empty: '暂无数据',
    loading: '图表加载中…',
    data: '数据',
    settings: '设置',
    chartType: '图表类型',
    types: { bar: '柱状图', line: '折线图', area: '面积图', pie: '饼图', donut: '环形图', scatter: '散点图' },
    xAxis: 'X 轴',
    yAxis: '数值 (Y)',
    series: '分组依据',
    none: '无',
    stacked: '堆叠',
    fn: { count: '计数', sum: '求和', avg: '平均值', min: '最小值', max: '最大值' },
    addRow: '添加行',
    addColumn: '添加列',
    deleteRow: '删除行',
    deleteColumn: '删除列',
    addValue: '添加数值',
    removeValue: '移除数值',
    pasteCsv: '粘贴 CSV',
    pastePlaceholder: '粘贴 CSV 或表格数据（第一行为列名）…',
    apply: '应用',
    cancel: '取消',
    column: '列',
    cell: '第 {row} 行，第 {column} 列',
  },
}

/** Strings for the editor's current locale, with the app's overrides. */
export function chartMessages(locale: string | undefined, overrides?: Partial<Record<LocaleName, Partial<ChartMessages>>> | null): ChartMessages {
  const key = (locale && locale in messages ? locale : 'vi') as LocaleName
  return { ...messages[key], ...(overrides?.[key] ?? {}) }
}
