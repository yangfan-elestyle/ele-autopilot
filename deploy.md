# 部署流程

AI 改完代码主动执行. push `v*` tag 触发 Actions 构建发布 (React Router v7 build + 生产 `node_modules` + `linux-x64` tarball + `checksums.txt` → GitHub Release).

## 1. 验证

```bash
bun install --frozen-lockfile
bun run lint
bun run build
# 验证生产构建启动 (用临时端口避免占用 dev)
HOSTNAME=0.0.0.0 PORT=3001 SQLITE_DB_PATH=/tmp/ele-autopilot-verify.sqlite \
  bun run start
```

`bun run build` 失败 / `bun run start` 起不来直接中断, 不要打 tag.

## 2. 写版本

- 版本号: 默认递增 PATCH (第三位); 新功能 → MINOR; 不兼容改动 (含破坏性 DB schema 变更 / API 响应结构变化) → MAJOR.
- `package.json#version` 与 tag 一致 (tag 含 `v`, version 不含). Actions 第一步 `Verify tag matches package.json version` 会校验, 不一致直接 fail.
- `CHANGELOG.md` 顶部新增 `## [X.Y.Z] - YYYY-MM-DD` 段 + Added/Changed/Fixed/Removed 子节, 底部补 `[X.Y.Z]: <compare-url>`. CHANGELOG 只写面向运维/用户的精简摘要; commit 详情由 Actions `generate_release_notes` 自动汇总到 Release 描述.
- DB schema 变更必须同步在 `lib/db/connection.ts#initSchema` 内增加 `ALTER TABLE ... ADD COLUMN` (try/catch 包裹保证幂等), 不要 `DROP` / `RENAME` 已有列. CHANGELOG 标注新增列名 + 默认值, 让运维知道升级后行为差异.

## 3. 发布

```bash
git add .
git commit -m "release: vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin <branch> vX.Y.Z
```

> annotated tag (`-a -m`) 而非 lightweight: 兼容 `tag.gpgsign=true` 配置 (开启时 lightweight tag 会被强制升级为 signed 但缺 message → fail).

Actions 跑完后, Release 页面应有:

- `ele-autopilot-vX.Y.Z-linux-x64.tar.gz` (含 `build/` / `public/` / `package.json` / `bun.lock` / `node_modules/` 生产依赖)
- `checksums.txt` (SHA256, 拉取后用 `shasum -a 256 -c` 校验)

## 4. amend 修上版 bug

AI 自主识别 "刚发版的 bug, 不发新版" 场景 (信号: 反馈指向刚 push 的 tag / 改动极小仅修缺陷 / 语气暗示是上版延续, 如 "刚那个" "刚发的"). 此时:

> **commit + tag 必须同步更新**: amend 后 commit hash 变了, 远程 tag 仍指向旧 hash → Release artifact 与 main HEAD 分离. 只 force push commit 不够, 必须删远程 tag 后重打, 否则 Actions 不会重跑构建.

```bash
git commit -a --amend --no-edit
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
git tag -a vX.Y.Z -m "vX.Y.Z"
git push --force-with-lease origin <branch>
git push origin vX.Y.Z
```

amend 场景禁用条件: 服务器已经基于该 tag 拉取并运行. 此时必须发新 PATCH 版, 不能复用 tag (否则相同 tag 对应不同 artifact, 排查时会被误导).

## 5. 线上升级 (operator 视角)

```bash
TAG=vX.Y.Z
curl -fsSLO "https://github.com/yangfan-elestyle/ele-autopilot-pretest/releases/download/${TAG}/ele-autopilot-${TAG}-linux-x64.tar.gz"
curl -fsSLO "https://github.com/yangfan-elestyle/ele-autopilot-pretest/releases/download/${TAG}/checksums.txt"
shasum -a 256 -c checksums.txt --ignore-missing
tar -xzf "ele-autopilot-${TAG}-linux-x64.tar.gz"
cd "ele-autopilot-${TAG}-linux-x64"
# 停旧进程 → 切目录 → 起新进程, 注意 SQLITE_DB_PATH 指向持久化目录 (不在 tarball 内)
HOSTNAME=0.0.0.0 PORT=3000 SQLITE_DB_PATH=/var/lib/ele-autopilot/app.sqlite \
  ./node_modules/.bin/react-router-serve ./build/server/index.js
```
