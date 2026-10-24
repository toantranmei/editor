import type { ToolName } from './tools/controller'

export interface SketchMessages {
  title: string
  description: string
  interact: string
  expand: string
  close: string
  empty: string
  notOnDevice: string
  loading: string
  loadError: string
  tools: Record<ToolName | 'lock', string>
  undo: string
  redo: string
  zoomIn: string
  zoomOut: string
  resetZoom: string
  fit: string
  /** Accessible name of the tool bar. */
  toolbar: string
  zen: string
  viewMode: string
  exitZen: string
  style: StyleMessages
}

export interface StyleMessages {
  panel: string
  collapse: string
  expand: string
  mixed: string
  customColor: string
  transparent: string
  stroke: string
  background: string
  fillStyle: string
  hachure: string
  crossHatch: string
  solid: string
  strokeWidth: string
  thin: string
  bold: string
  extraBold: string
  strokeStyle: string
  dashed: string
  dotted: string
  sloppiness: string
  architect: string
  artist: string
  cartoonist: string
  edges: string
  sharp: string
  round: string
  arrowheads: string
  startArrowhead: string
  endArrowhead: string
  none: string
  arrow: string
  triangle: string
  dot: string
  bar: string
  routing: string
  straight: string
  elbow: string
  curved: string
  font: string
  fontHand: string
  fontNormal: string
  fontCode: string
  fontSize: string
  small: string
  medium: string
  large: string
  extraLarge: string
  textAlign: string
  alignLeft: string
  alignCenter: string
  alignRight: string
  opacity: string
  layers: string
  sendToBack: string
  bringToFront: string
}

export const messages: Record<'vi' | 'en', SketchMessages> = {
  vi: {
    title: 'Bảng vẽ',
    description: 'Bảng trắng phong cách vẽ tay',
    interact: 'Chỉnh sửa',
    expand: 'Mở rộng',
    close: 'Đóng',
    empty: 'Bảng vẽ trống. Bấm để bắt đầu vẽ',
    notOnDevice: 'Bảng vẽ này không có trên thiết bị này',
    loading: 'Đang tải…',
    loadError: 'Không mở được bảng vẽ',
    tools: {
      hand: 'Kéo (H)',
      select: 'Chọn (V)',
      rectangle: 'Hình chữ nhật (R)',
      diamond: 'Hình thoi (D)',
      ellipse: 'Hình elip (O)',
      pen: 'Bút (P)',
      highlighter: 'Bút dạ quang (M)',
      line: 'Đường thẳng (L)',
      arrow: 'Mũi tên (A)',
      text: 'Văn bản (T)',
      eraser: 'Tẩy (E)',
      laser: 'Bút laser (K)',
      lasso: 'Chọn tự do',
      eyedropper: 'Lấy màu (I)',
      lock: 'Giữ công cụ sau khi vẽ (Q)',
    },
    undo: 'Hoàn tác',
    redo: 'Làm lại',
    zoomIn: 'Phóng to',
    zoomOut: 'Thu nhỏ',
    resetZoom: 'Đặt lại thu phóng',
    fit: 'Vừa khung nhìn',
    toolbar: 'Công cụ vẽ',
    zen: 'Chế độ tập trung',
    viewMode: 'Chế độ xem',
    exitZen: 'Thoát chế độ tập trung',
    style: {
      panel: 'Kiểu dáng',
      collapse: 'Thu gọn bảng kiểu dáng',
      expand: 'Mở bảng kiểu dáng',
      mixed: 'Nhiều giá trị',
      customColor: 'Màu tùy chọn',
      transparent: 'Trong suốt',
      stroke: 'Nét vẽ',
      background: 'Nền',
      fillStyle: 'Kiểu tô',
      hachure: 'Gạch chéo',
      crossHatch: 'Gạch lưới',
      solid: 'Đặc',
      strokeWidth: 'Độ dày nét',
      thin: 'Mảnh',
      bold: 'Đậm',
      extraBold: 'Rất đậm',
      strokeStyle: 'Kiểu nét',
      dashed: 'Nét đứt',
      dotted: 'Nét chấm',
      sloppiness: 'Độ phác thảo',
      architect: 'Kiến trúc sư',
      artist: 'Họa sĩ',
      cartoonist: 'Họa sĩ biếm họa',
      edges: 'Góc cạnh',
      sharp: 'Góc nhọn',
      round: 'Góc bo tròn',
      arrowheads: 'Đầu mũi tên',
      startArrowhead: 'Đầu bắt đầu',
      endArrowhead: 'Đầu kết thúc',
      none: 'Không có',
      arrow: 'Mũi tên',
      triangle: 'Tam giác',
      dot: 'Chấm tròn',
      bar: 'Vạch ngang',
      routing: 'Kiểu đường',
      straight: 'Thẳng',
      elbow: 'Gấp khúc',
      curved: 'Cong',
      font: 'Phông chữ',
      fontHand: 'Viết tay',
      fontNormal: 'Thường',
      fontCode: 'Mã',
      fontSize: 'Cỡ chữ',
      small: 'Nhỏ',
      medium: 'Vừa',
      large: 'Lớn',
      extraLarge: 'Rất lớn',
      textAlign: 'Căn lề chữ',
      alignLeft: 'Căn trái',
      alignCenter: 'Căn giữa',
      alignRight: 'Căn phải',
      opacity: 'Độ mờ',
      layers: 'Lớp',
      sendToBack: 'Đưa xuống dưới cùng',
      bringToFront: 'Đưa lên trên cùng',
    },
  },
  en: {
    title: 'Sketch',
    description: 'Hand-drawn style whiteboard',
    interact: 'Edit',
    expand: 'Expand',
    close: 'Close',
    empty: 'Empty board. Click to start drawing',
    notOnDevice: 'This board is not available on this device',
    loading: 'Loading…',
    loadError: 'Could not open the board',
    tools: {
      hand: 'Hand (H)',
      select: 'Select (V)',
      rectangle: 'Rectangle (R)',
      diamond: 'Diamond (D)',
      ellipse: 'Ellipse (O)',
      pen: 'Pen (P)',
      highlighter: 'Highlighter (M)',
      line: 'Line (L)',
      arrow: 'Arrow (A)',
      text: 'Text (T)',
      eraser: 'Eraser (E)',
      laser: 'Laser pointer (K)',
      lasso: 'Lasso select',
      eyedropper: 'Eyedropper (I)',
      lock: 'Keep tool active after drawing (Q)',
    },
    undo: 'Undo',
    redo: 'Redo',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetZoom: 'Reset zoom',
    fit: 'Zoom to fit',
    toolbar: 'Drawing tools',
    zen: 'Zen mode',
    viewMode: 'View mode',
    exitZen: 'Exit zen mode',
    style: {
      panel: 'Style',
      collapse: 'Collapse style panel',
      expand: 'Open style panel',
      mixed: 'Mixed',
      customColor: 'Custom color',
      transparent: 'Transparent',
      stroke: 'Stroke',
      background: 'Background',
      fillStyle: 'Fill',
      hachure: 'Hachure',
      crossHatch: 'Cross-hatch',
      solid: 'Solid',
      strokeWidth: 'Stroke width',
      thin: 'Thin',
      bold: 'Bold',
      extraBold: 'Extra bold',
      strokeStyle: 'Stroke style',
      dashed: 'Dashed',
      dotted: 'Dotted',
      sloppiness: 'Sloppiness',
      architect: 'Architect',
      artist: 'Artist',
      cartoonist: 'Cartoonist',
      edges: 'Edges',
      sharp: 'Sharp',
      round: 'Round',
      arrowheads: 'Arrowheads',
      startArrowhead: 'Start',
      endArrowhead: 'End',
      none: 'None',
      arrow: 'Arrow',
      triangle: 'Triangle',
      dot: 'Dot',
      bar: 'Bar',
      routing: 'Routing',
      straight: 'Straight',
      elbow: 'Elbow',
      curved: 'Curved',
      font: 'Font',
      fontHand: 'Hand-drawn',
      fontNormal: 'Normal',
      fontCode: 'Code',
      fontSize: 'Font size',
      small: 'Small',
      medium: 'Medium',
      large: 'Large',
      extraLarge: 'Extra large',
      textAlign: 'Text align',
      alignLeft: 'Left',
      alignCenter: 'Center',
      alignRight: 'Right',
      opacity: 'Opacity',
      layers: 'Layers',
      sendToBack: 'Send to back',
      bringToFront: 'Bring to front',
    },
  },
}
