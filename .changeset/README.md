# Changesets

Mỗi thay đổi cần phát hành của `@toantranmei/editor` đi kèm một changeset:

```bash
pnpm changeset          # chọn patch / minor / major và mô tả thay đổi
```

Khi merge vào `main`, GitHub Actions mở PR "Version Packages" (tăng version + CHANGELOG).
Merge PR đó là package được publish lên npm.
