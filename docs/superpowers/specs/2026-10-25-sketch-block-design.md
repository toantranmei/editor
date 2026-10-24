# Plan: `@toantranmei/sketch-block` — whiteboard block cho Mei Editor

## Context
Bạn cần một block whiteboard kiểu Miro (infinite canvas, collab realtime, hàng nghìn phần tử) có nét vẽ tay và bộ công cụ giống Excalidraw. Block nằm trong một **package npm riêng**, cài thêm thì dùng được, không cài thì `@toantranmei/editor` vẫn chạy bình thường. Mục tiêu: vẽ mượt khi có nhiều phần tử, tài liệu load nhanh, bundle của editor không nặng thêm.

### Các quyết định đã chốt với bạn
| Chủ đề | Quyết định |
|---|---|
| Phạm vi | Whiteboard đầy đủ kiểu Miro, làm theo nhiều mốc (milestone) |
| Engine | Tự viết bằng Vue 3 + Canvas2D, kiến trúc học theo Excalidraw. Không nhúng Excalidraw (chỉ chạy trên React, phải kéo thêm React) và không dùng tldraw (từ v4 bắt buộc license key khi chạy production) |
| Dữ liệu | Node trong doc chỉ giữ `boardId` và preview. Board là một `Y.Doc` riêng |
| Collab | Yjs ngay từ đầu, dùng awareness để hiện con trỏ của người khác. Kèm sẵn helper y-websocket và y-indexeddb |
| Trải nghiệm | Hiện preview SVG tĩnh → bấm nút **Interact** hoặc double-click để thao tác trong khung → nút **fullscreen** mở modal, Esc để đóng. Y hệt `HtmlView.vue` |
| V1 | Phần lõi + arrow dính vào shape + sticky note + collab và con trỏ + ảnh, frame, group + export, library, template |
| Tên | `@toantranmei/sketch-block`, tên block là `sketch` |

## Kiến trúc package

```
packages/sketch-block/
  package.json        # peer: @toantranmei/editor, vue, yjs, y-protocols; optional peer: y-websocket, y-indexeddb
  vite.config.ts      # sao từ packages/editor/vite.config.ts (lib, es, external = deps + peers)
  src/
    index.ts          # entry NHẸ: sketch block, SketchProvider types, <SketchBoard> (lazy)
    block/            # Tiptap node `sketch` + SketchView.vue (preview / interact / fullscreen)
    model/            # kiểu element, schema, Yjs store, fractional index, undo, reconcile
    geometry/         # bounds, hit-test, transform, binding của arrow, snap
    render/           # static/interactive canvas, cache bitmap, culling, LOD, rough/freehand
    tools/            # mỗi tool là một state machine pointer: select, rect, ellipse, diamond, line, arrow, pen, text, eraser, sticky, frame, image, hand
    ui/               # Toolbar, StylePanel, ZoomControls, Minimap, Library, cursor của người khác
    io/               # export SVG/PNG, clipboard, nạp template/library
    providers/        # subpath `@toantranmei/sketch-block/providers`: indexeddb(), http(), websocket()
    engine.ts         # dynamic-import chunk: mọi thứ nặng (roughjs, perfect-freehand, rbush)
    styles/           # chỉ dùng token var(--me-…) của editor
```

**Cách dùng** (khớp với API `defineBlock` sẵn có ở `packages/editor/src/define-block.ts`):
```ts
import { sketch } from '@toantranmei/sketch-block'
import { websocket } from '@toantranmei/sketch-block/providers'
<MeiEditor :blocks="[...defaultBlocks, sketch.configure({ provider: websocket({ url }) })]" />
```
- `SketchProvider = { connect(boardId) → Promise<{ doc: Y.Doc, awareness?, destroy() }>, savePreview?(boardId, svg) → Promise<url>, uploadImage? }`. Nếu không có `uploadImage` thì dùng `editor.storage.meiConfig.uploadImage` (`packages/editor/src/config.ts`).
- Không cấu hình provider thì mặc định dùng `indexeddb()`, chạy offline trên một máy.
- `<SketchBoard :board-id :provider>` là component độc lập, dùng được cho trang board toàn màn hình mà không cần editor.

**Thay đổi nhỏ trong `@toantranmei/editor`** (chỉ thêm export, không đổi hành vi) để package dùng lại thay vì copy:
`blockNodeView` (`src/nodeviews/renderer.ts`), `useScope`, `useClickOutside` (`src/composables/`), và export các class CSS dùng chung (`me-tool-btn`, `me-btn--floating`, modal). Editor ra một bản minor kèm changeset.

## Mô hình dữ liệu (Yjs-native)
- `doc.getMap('elements')`: `Y.Map<id, Y.Map>`. Mỗi element có `type, x, y, w, h, angle, index` (thứ tự lớp dùng fractional-indexing, không dùng Y.Array), style (`stroke, fill, fillStyle, strokeWidth, roughness, opacity, font`), `seed` để nét rough ổn định, `points` (mảng thường, ghi đè một lần mỗi nét), `start/endBinding`, `groupIds`, `frameId`, `locked`, `text`, `fileUrl`.
- `doc.getMap('meta')` lưu tiêu đề, nền, viewport mặc định. Ảnh lưu bằng **URL** đã upload, không lưu base64 vào Y.Doc.
- `Y.UndoManager` chỉ track các thay đổi có origin local, nên undo không xoá nét của người khác.
- **Scene** trong bộ nhớ: element là object bất biến, đồng bộ từ `observeDeep` (chỉ những id đổi), kèm mảng sắp theo `index` và **rbush**. Element đang kéo chỉ là state tạm ở local; mỗi frame mới ghi một `transact` vào Y để người khác thấy realtime mà không spam.
- Node ProseMirror `sketch`: attrs `{ boardId, preview, height, version }`. Lý do: y-prosemirror ghi đè cả attr, nên nếu nhúng JSON scene vào attr thì collab sẽ hỏng.

## Toolbar & các tuỳ chọn trong canvas

Bố cục giống Excalidraw: **thanh công cụ chính** ở giữa phía trên, **panel style theo ngữ cảnh** bên trái (chỉ hiện khi đang chọn tool hoặc phần tử), **thanh điều khiển** ở góc phải. Cột "Mốc" cho biết tính năng có từ bản nào.

### 1. Thanh công cụ chính (chọn tool)
| Tool | Phím | Chức năng | Mốc |
|---|---|---|---|
| Hand (pan) | H / giữ Space | Kéo để di chuyển canvas | M0 |
| Select | V / 1 | Chọn, kéo khung chọn, di chuyển, resize, xoay | M0 |
| Rectangle | R / 2 | Hình chữ nhật | M0 |
| Diamond | D / 3 | Hình thoi | M0 |
| Ellipse | O / 4 | Hình elip/tròn (giữ Shift để vẽ tròn đều) | M0 |
| Arrow | A / 5 | Mũi tên, tự dính vào shape (binding ở M2) | M1 |
| Line | L / 6 | Đường thẳng/đường gấp khúc nhiều điểm | M1 |
| Pen | P / 7 | Vẽ tay tự do (perfect-freehand, có cảm ứng lực bút) | M1 |
| Text | T / 8 | Chữ; double-click vào shape để ghi chữ trong shape | M1 |
| Eraser | E / 0 | Rê qua phần tử nào thì xoá phần tử đó | M1 |
| Sticky note | S | Giấy note kiểu Miro, tự xuống dòng, tự co cỡ chữ | M2 |
| Frame | F | Khung đặt tên để nhóm vùng, phần tử bên trong đi theo khung | M2 |
| Image | I / 9 | Chèn ảnh (cũng hỗ trợ dán và kéo thả) | M2 |
| Library | — | Mở thư viện shape/template | M4 |
| Khoá tool | Q | Giữ nguyên tool sau khi vẽ xong (mặc định quay về Select) | M0 |

### 2. Panel style (theo tool hoặc phần tử đang chọn)
- **Nét**: màu nét (bảng màu hex cố định kiểu Excalidraw và ô chọn màu tự do); độ dày (mảnh, vừa, đậm); kiểu nét (liền, gạch, chấm).
- **Nền**: màu nền; kiểu tô (hachure, cross-hatch, solid, không tô).
- **Độ "tay"** (sloppiness, chỉ số roughness của rough.js): Architect (thẳng), Artist, Cartoonist (rất nguệch ngoạc).
- **Góc**: vuông / bo tròn.
- **Arrow/Line**: đầu mũi tên ở hai đầu (không có, mũi tên, tam giác, chấm, gạch); dạng đường (thẳng, gấp khúc vuông góc kiểu Miro, cong).
- **Text**: font (Tay, Thường, Code); cỡ chữ (S, M, L, XL); căn trái/giữa/phải; với chữ trong shape thì có thêm căn trên/giữa/dưới.
- **Sticky**: màu giấy (6–8 màu), cỡ chữ tự động hoặc cố định.
- **Chung**: opacity; thứ tự lớp (đưa lên trên cùng, lên một bậc, xuống một bậc, xuống dưới cùng).
- **Khi chọn nhiều phần tử**: căn trái/giữa/phải/trên/dưới, dàn đều ngang/dọc, group (Ctrl+G) / ungroup (Ctrl+Shift+G).
- **Hành động**: duplicate (Ctrl+D), lock/unlock, gắn link, xoá.

### 3. Thanh điều khiển góc phải và chuột phải
- Undo / Redo (Ctrl+Z / Ctrl+Shift+Z). Zoom −, %, + (bấm vào % để về 100%). "Fit" (Shift+1) để zoom vừa toàn bộ nội dung.
- Bật/tắt lưới và bám lưới (snap), bật/tắt minimap (M4).
- Menu Export: PNG, SVG, copy dưới dạng ảnh; tuỳ chọn có nền hay trong suốt, xuất cả board hay chỉ frame đang chọn (M4).
- Template: tạo board mới từ mẫu như flowchart, mindmap, kanban, retro (M4).
- Avatar những người đang cùng xem; bấm vào avatar để đi theo (follow) viewport của người đó (M3).
- Fullscreen / Thoát (Esc) (M0).
- **Chuột phải**: cut/copy/paste, duplicate, thứ tự lớp, group, lock, export phần tử đang chọn, thêm vào library.

## Lưu trữ dữ liệu: hiện tại (chưa có backend) và khi có backend

### Hiện trạng của editor
`<MeiEditor v-model>` xuất **JSON của tài liệu**, app tự lưu JSON đó ở đâu tuỳ ý. Playground hiện lưu vào `localStorage` (`apps/playground/app/composables/useLocalPage.ts`, key `mts-editor:page:v3`). Editor **chưa có collab** (yjs nằm trong deps nhưng chưa dùng ở đâu).

### Trong JSON của tài liệu chỉ có
```json
{ "type": "sketch", "attrs": { "boardId": "bd_V1StGXR8", "height": 480, "version": 37,
  "preview": "data:image/svg+xml;base64,…" } }
```
- `boardId` là nanoid, sinh ra khi chèn block.
- `preview`: nếu app có `savePreview` thì đây là URL ảnh; nếu không có backend thì là SVG inline nén (giới hạn khoảng 150KB, vượt thì hạ xuống PNG nhỏ). Nhờ preview này, tài liệu mở ra là thấy ngay hình mà không cần tải board.
- `version`: số lần board đã lưu, dùng để biết preview có cũ hơn board hay không.

### Hiện tại, chưa có backend (mặc định là provider `indexeddb()`)
- Nội dung board (Y.Doc) lưu trong **IndexedDB của trình duyệt**, database `mei-sketch:<boardId>`, dùng y-indexeddb. Mỗi thao tác chỉ ghi phần thay đổi (update vài byte đến vài KB), không ghi lại toàn bộ board.
- Tài liệu JSON (vẫn lưu trong localStorage như cũ) chỉ chứa id và preview, nên vẫn nhẹ.
- **Giới hạn**: board chỉ nằm trên máy và trình duyệt đó. Mang JSON tài liệu sang máy khác thì chỉ còn thấy preview, không sửa được. Để xử lý, package có thêm:
  - `exportBoards(docJSON)` → file `.meisketch.json`, gom tài liệu và toàn bộ board (Yjs state dạng base64) để backup/chuyển máy; `importBoards(file)` để nạp lại.
  - Khi board không tìm thấy, block hiện preview kèm nhãn "Board không có trên thiết bị này", không bị lỗi.

### Khi có backend: 2 cấp, chọn tuỳ nhu cầu

**Cấp A: REST, không realtime** (dễ làm nhất, một người sửa tại một thời điểm)
```ts
sketch.configure({ provider: http({
  load: id => fetch(`/api/boards/${id}`).then(r => r.arrayBuffer()),        // Yjs state (binary)
  save: (id, update) => fetch(`/api/boards/${id}/updates`, { method: 'POST', body: update }), // debounce khoảng 1s
  savePreview: (id, svg) => upload(svg),                                     // trả về URL
}) })
```
Bảng dữ liệu gợi ý (Postgres):
```sql
boards(id text pk, owner_id, state bytea, preview_url text, version int, updated_at)
board_updates(board_id text, update bytea, created_at)  -- phần thay đổi ghi thêm, gộp định kỳ vào boards.state
```
Server không cần hiểu Yjs: chỉ lưu và trả về bytes. Khi gộp (compact) thì chạy `Y.mergeUpdates` bằng Node. Client vẫn giữ IndexedDB làm cache offline và đồng bộ lên server khi có mạng.

**Cấp B: Realtime nhiều người** (đã chốt cho M3)
```ts
sketch.configure({ provider: websocket({
  url: 'wss://api.example.com/sketch',
  params: () => ({ token: getAuthToken() }),   // xác thực
  offline: true,                               // vẫn kết hợp IndexedDB
}) })
```
- Server: y-websocket server (hoặc Hocuspocus nếu sau này tài liệu cũng cần collab). Mỗi `boardId` là một room. Server kiểm tra token, phân quyền đọc/ghi (chỉ đọc thì từ chối update), và persist vào cùng bảng `boards` ở trên.
- Awareness (con trỏ, vùng đang chọn, tên, màu) chỉ truyền realtime, không lưu xuống DB.
- Playground có sẵn script `pnpm sync` chạy server y-websocket local để demo.

### Vòng đời board (áp dụng cho mọi provider)
- **Chèn block**: tạo `boardId` mới, `connect()` mở một board rỗng.
- **Copy/paste block hoặc duplicate tài liệu**: tạo board **mới** bằng cách sao chép state (giống Notion: bản sao không bị liên kết với bản gốc). Package có hook `onPasteClone`, mặc định bật.
- **Xoá block**: **không** xoá board ngay, vì có thể undo. Backend dọn rác định kỳ: board không còn tài liệu nào tham chiếu sau N ngày thì xoá. Package có helper `collectBoardIds(docJSON)`.
- **Undo của editor** chỉ hoàn tác việc chèn/xoá block. Undo trong board do `Y.UndoManager` riêng của board xử lý.

## Chiến lược hiệu năng
1. **Load nhanh**: entry chính chỉ chứa node và preview `<img>` (vài KB). `engine.ts` (roughjs, perfect-freehand, rbush, tools, UI) chỉ `import()` khi người dùng bấm Interact, mở fullscreen, hoặc lúc rảnh khi hover (prefetch). Preview SVG tự sinh mỗi khi thoát interact hoặc sau khi ngừng sửa khoảng 2s (debounce), lưu qua `savePreview`.
2. **Hai lớp canvas**: *static* (các element đã commit, chỉ vẽ lại khi scene hoặc viewport đổi, tối đa một lần mỗi requestAnimationFrame) và *interactive* (selection, handle, nét đang vẽ, con trỏ người khác, vẽ lại mỗi frame). Text đang sửa là một `<textarea>` DOM đè lên.
3. **Cache bitmap theo element** (giống Excalidraw): mỗi element vẽ rough.js một lần lên canvas riêng, khoá theo `(id, version, zoomBucket, theme, dpr)`, sau đó chỉ `drawImage`. Cache rough drawable / `Path2D` theo `seed + version`. Giới hạn kích thước bitmap và LRU theo tổng số pixel.
4. **Culling + rbush**: chỉ vẽ element giao với viewport. Hit-test chạy rbush trước, rồi mới kiểm tra hình học chính xác.
5. **LOD khi zoom xa** (< ~0.3×): vẽ hình đơn giản, không chạy rough, text thành khối. Cache chỉ dựng lại khi ngừng zoom khoảng 150ms (trong lúc zoom thì scale bitmap cũ).
6. **Input**: Pointer Events + `getCoalescedEvents()` để nét bút mượt, `setPointerCapture`, pinch và wheel để zoom quanh con trỏ, xử lý devicePixelRatio đúng.
7. **Font tay**: tự host Patrick Hand (OFL, có tiếng Việt), nạp lazy bằng `FontFace` cùng engine, không lấy từ CDN.
8. Để dành cho sau (chỉ làm nếu benchmark cho thấy cần): dựng bitmap bằng OffscreenCanvas trong worker.

## Các mốc (mỗi mốc là một bản publish 0.x qua changesets)

Cập nhật 2026-10-25: M0 (0.1.0) đã xong. Danh mục công cụ đã chọn (A1–A8, B1–B12, C1–C5, D1–D10, F1–F4) được xếp theo thứ tự "vẽ trước, Miro sau". Không làm: smart drawing, trình chiếu/comment/voting/timer/reactions, AI.

- **M0 – Nền tảng (0.1.0, đã xong)**: package, node `sketch` + SketchView, Y store + scene + rbush, renderer 2 lớp + cache + culling + LOD, pan/zoom, select/move/resize/rotate, rect/ellipse/diamond, undo/redo, provider indexeddb/memory, preview SVG.

| Mốc | Bản | Nội dung |
|---|---|---|
| **M1 – Công cụ vẽ** | 0.2.0 | Pen (A1), highlighter (A2), line (A3), arrow thẳng/gấp khúc/cong (A4), text (A5), eraser (A6), laser (A7), lasso (A8), style panel (D1), hút màu (D2), copy/paste/duplicate và copy style (D3), zen/view mode (D10). Kèm nợ kỹ thuật từ M0 (xem bên dưới). |
| **M2 – Miro core** | 0.3.0 | Sticky + tạo nhanh (B1, B2), ảnh + crop (B5), frame (B6), thư viện shape + flowchart (B3, B4), arrow binding (C1), nhãn arrow (C2), flowchart nhanh Ctrl+phím mũi tên (C3), group/lock (D4), align/distribute (D5), lưới + snap (D6). |
| **M3 – Backend & collab** | 0.4.0 | Như spec gốc (http/websocket provider, awareness, clone-on-paste, exportBoards), thêm tìm kiếm (D7) và link phần tử (D8). |
| **M4 – Xuất file & thư viện** | 0.5.0 | Export PNG/SVG/clipboard (F1), library (F2), template (F3), import `.excalidraw` (F4), minimap (D9), tối ưu hiệu năng theo benchmark. |
| **M5 – Nội dung nâng cao** | 0.6.0 → 1.0 | Embed web (B7), emoji/stamp (B10), code block (B11), table (B8), card/kanban (B9), Mermaid → sketch (B12), mind map (C4), auto layout (C5). |

### Thiết kế M1
- **Model:** mở rộng `SketchElement` thành discriminated union theo `type`:
  - `line` và `arrow`: `points` trong toạ độ local; `startArrowhead`/`endArrowhead`; `routing` là `straight`, `elbow` hoặc `curved`.
  - `freedraw`: `points` kèm `pressures`; `highlighter: boolean` (vẽ với opacity thấp, blend multiply).
  - `text`: `text`, `fontFamily` (hand/normal/code), `fontSize` (S/M/L/XL), `align`; chữ trong shape lưu bằng thuộc tính `label` của chính shape (không dùng `containerId`, đơn giản hơn và merge tốt khi collab).
  - Ghi `points` một lần khi kết thúc nét (đúng như spec). Trong lúc vẽ, nét chỉ là draft local.
- **Render:**
  - freedraw dùng `perfect-freehand@1.2.3`, thành `Path2D`, rồi đưa vào cache bitmap như shape.
  - line/arrow dùng roughjs `linearPath`/`curve`, đầu mũi tên vẽ riêng.
  - Text dùng `fillText` với font tay **Patrick Hand** (OFL, có tiếng Việt; Excalifont thiếu gần hết ký tự tiếng Việt), tự host, nạp lazy bằng `FontFace` cùng engine.
  - `exportSvg` và preview hỗ trợ đủ các kiểu mới.
- **Tools:**
  - pen/highlighter: lấy điểm bằng `getCoalescedEvents` (vòng lặp này đã có sẵn trong board).
  - line/arrow: kéo để vẽ hai điểm, click để thêm điểm, Enter/Esc kết thúc, sửa từng điểm khi chọn.
  - text: `<textarea>` DOM đè lên canvas; đo chữ bằng `measureText`, tự xuống dòng.
  - eraser: rê qua thì đánh dấu, thả chuột thì xoá trong một transaction (một bước undo).
  - laser: vệt chỉ nằm trên lớp interactive, tự mờ sau khoảng 1s, không lưu vào Y (M3 sẽ phát qua awareness).
  - lasso: polygon tự do, chọn phần tử nằm trọn bên trong.
- **UI:**
  - Toolbar thêm các tool trên, phím tắt kiểu Excalidraw (P pen, L line, A arrow, T text, E eraser, K laser).
  - StylePanel theo ngữ cảnh: bảng màu hex cố định kiểu Excalidraw (màu thật, để preview SVG và collab hiển thị đúng ở mọi nơi), kiểu tô, độ dày, kiểu nét, độ nhám, góc, opacity, đầu mũi tên, font. Hút màu bằng phím I.
  - Copy/paste qua clipboard (MIME riêng, có fallback JSON text). Copy/paste style bằng Ctrl+Alt+C/V. Duplicate bằng Ctrl+D.
  - Zen mode (Alt+Z) và view mode (Alt+R).
- **Nợ kỹ thuật từ M0** (theo kết quả review cuối):
  - Cache bitmap/drawable theo hình dạng, để kéo phần tử không phải vẽ lại bitmap mỗi frame.
  - `BoardStore.create` chạy O(1) và nhận `seed`.
  - `History` giữ nguyên khi chuyển qua lại inline ↔ fullscreen.
  - Thêm `lostpointercapture` và chặn `contextmenu`.
  - Đọc `deltaMode` của wheel.
  - Thêm test resize khi đã xoay.
  - Trả focus về editor sau khi thoát board.
  - Xem lại `MAX_ROUGH_PAD` khi style panel cho chỉnh độ dày.
- **Dependency mới:** `perfect-freehand 1.2.3`, `@fontsource/patrick-hand` (OFL-1.1, chỉ để lấy file woff2).

## File cần sửa ngoài package mới
- `package.json` (root): `build` và `release` chạy cho mọi package (`pnpm -r --filter "./packages/*" build`), thêm `dev:sketch`.
- `.github/workflows/ci.yml`: thêm typecheck, build, test cho package mới. `release.yml` không đổi vì changesets tự publish mọi package không private.
- `packages/editor/src/index.ts`: thêm các export kể trên.
- `apps/playground`: thêm dependency `@toantranmei/sketch-block: workspace:*`, trang demo board, server sync.
- `scripts/bench.mjs`: thêm kịch bản sketch.

## Kiểm thử và xác minh
- **Vitest** (mới, chỉ cho package này): geometry (bounds, hit-test, rotate), fractional index, reconcile và binding, mapping Y ↔ scene, undo chỉ track origin local, export SVG (snapshot).
- **Playwright** (đã có ở root): mở playground → chèn block bằng slash → Interact → vẽ rect, arrow, pen → Esc → kiểm tra preview đã cập nhật. Mở 2 tab cùng `boardId` qua y-websocket → kiểm tra sync và con trỏ.
- **Benchmark** (`pnpm bench`): board có 5.000 element trộn lẫn, đo FPS khi pan/zoom (mục tiêu ≥ 55fps trên laptop tầm trung) và thời gian vẽ khung đầu tiên. Đo kích thước bundle: entry chính < 15KB gzip, editor không cài sketch thì bundle không đổi.
- `pnpm typecheck`, `pnpm build` (gồm `check-deps` sao từ editor), và `npm pack --dry-run` để kiểm tra nội dung publish.

## Bước tiếp theo sau khi duyệt
1. Lưu bản thiết kế này thành spec `docs/superpowers/specs/2026-10-25-sketch-block-design.md` (commit không kèm dòng attribution Claude).
2. Dùng `writing-plans` để viết kế hoạch triển khai chi tiết cho **M0**, rồi lần lượt cho từng mốc.
