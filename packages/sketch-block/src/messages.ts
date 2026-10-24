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
  },
}
