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
  /** A pasted / duplicated block while its board is being copied. */
  copying: string
  cloneError: string
  tools: Record<ToolName | 'lock', string>
  /** Tool bar button (and popover title) for the other shapes. */
  shapes: string
  /** Tool bar button that opens the image file picker. */
  insertImage: string
  /** Accessible name of the frame name editor. */
  frameName: string
  undo: string
  redo: string
  zoomIn: string
  zoomOut: string
  resetZoom: string
  fit: string
  /** Grid toggle (shows and snaps to the grid). */
  grid: string
  /** Object snap toggle. */
  objectSnap: string
  /** Accessible name of the tool bar. */
  toolbar: string
  zen: string
  viewMode: string
  exitZen: string
  /** Inline error shown for 4 s when an image cannot be inserted. */
  imageError: Record<'type' | 'size' | 'upload', string>
  /** Inline error shown for 4 s when a copy / paste is over the clipboard size limit. */
  /** A networked board without an uploader refuses large inline images. */
  imageNeedsUpload: string
  clipboardTooLarge: string
  /** Presence (networked boards); `{name}` / `{n}` are replaced. */
  presence: PresenceMessages
  /** Canvas search box (mod+F); `{i}` / `{n}` are replaced. */
  search: SearchMessages
  style: StyleMessages
}

export interface SearchMessages {
  /** Accessible name of the search field. */
  label: string
  placeholder: string
  noMatches: string
  /** Match position: "{i}/{n}" (i = 0 before the first step). */
  count: string
  prev: string
  next: string
  close: string
}

export interface PresenceMessages {
  /** Accessible name of the avatars list. */
  people: string
  /** Avatar button: follow this user's view. */
  follow: string
  /** Pill shown while following. */
  following: string
  stopFollowing: string
  /** "+N" badge tooltip. */
  more: string
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
  stickyColor: string
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
  arrange: string
  alignElLeft: string
  alignElHCenter: string
  alignElRight: string
  alignElTop: string
  alignElVCenter: string
  alignElBottom: string
  distributeH: string
  distributeV: string
  group: string
  ungroup: string
  /** Lock toggle (a constant name; its pressed state says whether the selection is locked). */
  lock: string
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
    copying: 'Đang sao chép bảng…',
    cloneError: 'Không sao chép được nội dung bảng vẽ. Bảng mới đang trống.',
    tools: {
      hand: 'Kéo (H)',
      select: 'Chọn (V)',
      rectangle: 'Hình chữ nhật (R)',
      diamond: 'Hình thoi (D)',
      ellipse: 'Hình elip (O)',
      triangle: 'Tam giác',
      pentagon: 'Ngũ giác',
      hexagon: 'Lục giác',
      star: 'Ngôi sao',
      parallelogram: 'Hình bình hành',
      trapezoid: 'Hình thang',
      cylinder: 'Hình trụ',
      cloud: 'Đám mây',
      callout: 'Khung chú thích',
      document: 'Tài liệu',
      stadium: 'Hình viên thuốc',
      blockArrow: 'Mũi tên khối',
      pen: 'Bút (P)',
      highlighter: 'Bút dạ quang (M)',
      line: 'Đường thẳng (L)',
      arrow: 'Mũi tên (A)',
      text: 'Văn bản (T)',
      sticky: 'Giấy nhớ (S)',
      frame: 'Khung (F)',
      eraser: 'Tẩy (E)',
      laser: 'Bút laser (K)',
      lasso: 'Chọn tự do',
      eyedropper: 'Lấy màu (I)',
      lock: 'Giữ công cụ sau khi vẽ (Q)',
    },
    shapes: 'Hình khác',
    insertImage: 'Chèn ảnh',
    frameName: 'Tên khung',
    undo: 'Hoàn tác',
    redo: 'Làm lại',
    zoomIn: 'Phóng to',
    zoomOut: 'Thu nhỏ',
    resetZoom: 'Đặt lại thu phóng',
    fit: 'Vừa khung nhìn',
    grid: 'Lưới (Ctrl/⌘+\')',
    objectSnap: 'Bắt dính đối tượng (Alt+S)',
    toolbar: 'Công cụ vẽ',
    zen: 'Chế độ tập trung',
    viewMode: 'Chế độ xem',
    exitZen: 'Thoát chế độ tập trung',
    presence: {
      people: 'Người đang xem',
      follow: 'Theo dõi {name}',
      following: 'Đang theo dõi {name}',
      stopFollowing: 'Dừng theo dõi',
      more: '{n} người khác',
    },
    search: {
      label: 'Tìm trên bảng vẽ',
      placeholder: 'Tìm văn bản…',
      noMatches: 'Không tìm thấy',
      count: '{i}/{n}',
      prev: 'Kết quả trước (Shift+Enter)',
      next: 'Kết quả tiếp theo (Enter)',
      close: 'Đóng tìm kiếm (Esc)',
    },
    imageError: {
      type: 'Tệp này không phải ảnh được hỗ trợ.',
      size: 'Ảnh quá lớn (tối đa 4 MB).',
      upload: 'Không tải được ảnh lên.',
    },
    imageNeedsUpload: 'Ảnh quá lớn để lưu trực tiếp trên bảng dùng chung. Hãy cấu hình tải ảnh lên (uploadImage).',
    clipboardTooLarge: 'Quá lớn để sao chép hoặc dán (tối đa 24 MB).',
    style: {
      panel: 'Kiểu dáng',
      collapse: 'Thu gọn bảng kiểu dáng',
      expand: 'Mở bảng kiểu dáng',
      mixed: 'Nhiều giá trị',
      customColor: 'Màu tùy chọn',
      transparent: 'Trong suốt',
      stroke: 'Nét vẽ',
      background: 'Nền',
      stickyColor: 'Màu giấy nhớ',
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
      arrange: 'Sắp xếp',
      alignElLeft: 'Căn trái',
      alignElHCenter: 'Căn giữa theo chiều ngang',
      alignElRight: 'Căn phải',
      alignElTop: 'Căn trên',
      alignElVCenter: 'Căn giữa theo chiều dọc',
      alignElBottom: 'Căn dưới',
      distributeH: 'Phân bố đều theo chiều ngang',
      distributeV: 'Phân bố đều theo chiều dọc',
      group: 'Nhóm',
      ungroup: 'Bỏ nhóm',
      lock: 'Khóa',
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
    copying: 'Copying board…',
    cloneError: 'Could not copy the board. The new board is empty.',
    tools: {
      hand: 'Hand (H)',
      select: 'Select (V)',
      rectangle: 'Rectangle (R)',
      diamond: 'Diamond (D)',
      ellipse: 'Ellipse (O)',
      triangle: 'Triangle',
      pentagon: 'Pentagon',
      hexagon: 'Hexagon',
      star: 'Star',
      parallelogram: 'Parallelogram',
      trapezoid: 'Trapezoid',
      cylinder: 'Cylinder',
      cloud: 'Cloud',
      callout: 'Callout',
      document: 'Document',
      stadium: 'Stadium',
      blockArrow: 'Block arrow',
      pen: 'Pen (P)',
      highlighter: 'Highlighter (M)',
      line: 'Line (L)',
      arrow: 'Arrow (A)',
      text: 'Text (T)',
      sticky: 'Sticky note (S)',
      frame: 'Frame (F)',
      eraser: 'Eraser (E)',
      laser: 'Laser pointer (K)',
      lasso: 'Lasso select',
      eyedropper: 'Eyedropper (I)',
      lock: 'Keep tool active after drawing (Q)',
    },
    shapes: 'More shapes',
    insertImage: 'Insert image',
    frameName: 'Frame name',
    undo: 'Undo',
    redo: 'Redo',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetZoom: 'Reset zoom',
    fit: 'Zoom to fit',
    grid: 'Grid (Ctrl/⌘+\')',
    objectSnap: 'Snap to objects (Alt+S)',
    toolbar: 'Drawing tools',
    zen: 'Zen mode',
    viewMode: 'View mode',
    exitZen: 'Exit zen mode',
    presence: {
      people: 'People here',
      follow: 'Follow {name}',
      following: 'Following {name}',
      stopFollowing: 'Stop following',
      more: '{n} more',
    },
    search: {
      label: 'Search the board',
      placeholder: 'Find text…',
      noMatches: 'No matches',
      count: '{i}/{n}',
      prev: 'Previous match (Shift+Enter)',
      next: 'Next match (Enter)',
      close: 'Close search (Esc)',
    },
    imageError: {
      type: 'This file is not a supported image.',
      size: 'The image is too large (max 4 MB).',
      upload: 'The image could not be uploaded.',
    },
    imageNeedsUpload: 'This image is too large to store inline on a shared board. Configure an image uploader (uploadImage).',
    clipboardTooLarge: 'Too large to copy or paste (max 24 MB).',
    style: {
      panel: 'Style',
      collapse: 'Collapse style panel',
      expand: 'Open style panel',
      mixed: 'Mixed',
      customColor: 'Custom color',
      transparent: 'Transparent',
      stroke: 'Stroke',
      background: 'Background',
      stickyColor: 'Note color',
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
      arrange: 'Arrange',
      alignElLeft: 'Align left',
      alignElHCenter: 'Center horizontally',
      alignElRight: 'Align right',
      alignElTop: 'Align top',
      alignElVCenter: 'Center vertically',
      alignElBottom: 'Align bottom',
      distributeH: 'Distribute horizontally',
      distributeV: 'Distribute vertically',
      group: 'Group',
      ungroup: 'Ungroup',
      lock: 'Lock',
    },
  },
}
