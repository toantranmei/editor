# mei-tx editor (monorepo)

| Thư mục            | Nội dung                                                        |
| ------------------ | --------------------------------------------------------------- |
| `packages/editor`  | Thư viện `@toantranmei/editor` được publish lên npm ([README](packages/editor/README.md)) |
| `packages/sketch-block` | Block bảng vẽ tuỳ chọn `@toantranmei/sketch-block` ([README](packages/sketch-block/README.md)) |
| `packages/page-block` | Block trang con / liên kết trang tuỳ chọn `@toantranmei/page-block` ([README](packages/page-block/README.md)) |
| `packages/database-block` | Block cơ sở dữ liệu kiểu Notion `@toantranmei/database-block` ([README](packages/database-block/README.md)) |
| `packages/chart-block` | Block biểu đồ + component biểu đồ cho database `@toantranmei/chart-block` ([README](packages/chart-block/README.md)) |
| `apps/playground`  | App Nuxt để phát triển và thử editor (không publish)            |

## Phát triển

```bash
nvm use            # Node 26 (.nvmrc)
pnpm install
pnpm dev           # playground tại http://localhost:3100, sửa packages/editor/src là thấy ngay
```

| Lệnh               | Việc                                                     |
| ------------------ | -------------------------------------------------------- |
| `pnpm build`       | Build thư viện ra `packages/editor/dist`                 |
| `pnpm typecheck`   | Kiểm tra kiểu toàn bộ workspace                          |
| `pnpm pack:editor` | Build + đóng gói `.tgz` vào `dist/` để thử cài như từ npm |
| `pnpm bench`       | Benchmark tài liệu lớn (mở, gõ phím, bộ nhớ) trên bản build production; `-- --sizes=2000,50000 --no-build` |

## Phát hành phiên bản mới

1. Sửa code, rồi chạy `pnpm changeset`: chọn `patch` / `minor` / `major` và mô tả thay đổi.
2. Commit cả file trong `.changeset/` và tạo PR vào `main`.
3. Khi merge, GitHub Actions mở PR **"chore: version packages"** (tăng version + CHANGELOG).
4. Merge PR đó → Actions build và publish `@toantranmei/editor` lên npm.

Repo GitHub cần secret `NPM_TOKEN` (npm → Access Tokens → Granular, quyền Read and write cho `@toantranmei/editor`).

## Sửa giao diện editor

- **Mọi giá trị** (màu, khoảng cách, bo góc, font, đổ bóng...) nằm trong **một file duy nhất**:
  `packages/editor/src/theme/tokens.ts` (3 tầng: primitive → semantic sáng/tối → component).
- CSS trong `packages/editor/src/styles/` chỉ được dùng `var(--me-…)`; template Vue chỉ dùng class `me-*`.
- `pnpm --filter @toantranmei/editor check:styles` (chạy tự động khi build) báo lỗi nếu có giá trị cứng ở chỗ khác.
  Các gói block (`database-block`, `chart-block`) chạy cùng script trên `src` của chúng khi build
  (token của chúng nằm trong `component.database.*`, `component.chart.*`).
