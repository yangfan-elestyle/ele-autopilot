# 部署流程 (Cloudflare Workers + D1 + R2)

push `v*` tag → Actions 构建 + 部署到 Cloudflare Workers. v0.3.0 起底层从 Node tarball 迁移到 Workers.

## 0. 前置 (一次性)

GitHub 仓库 Secrets:

- `CLOUDFLARE_API_TOKEN`: Workers / D1 / R2 编辑权限 ([创建方式](https://dash.cloudflare.com/profile/api-tokens) → "Edit Cloudflare Workers" 模板).
- `CLOUDFLARE_ACCOUNT_ID`: Account ID (Cloudflare dashboard 主页右栏).

D1 database (`ele-autopilot`) / R2 bucket (`ele-autopilot-screenshots`) 首次部署 Actions 自动创建, 已存在则复用.

## 1. 本地验证

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck      # wrangler types + react-router typegen + tsc
bun run build          # 产物 build/client + build/server (含 wrangler.json)
bunx wrangler deploy --dry-run   # 验证 bindings + worker 大小
```

`build` 失败 / `--dry-run` 报错直接中断, 不要打 tag.

> 本地 `bun dev` 走 Vite + cloudflare 插件 + miniflare, 自动模拟 D1 + R2. 首次启动 schema 不会自动 apply, 需手动 `bunx wrangler d1 migrations apply ele-autopilot --local`.

## 2. 写版本

- 版本号: 递增 PATCH; 新功能 → MINOR; 不兼容改动 (含破坏性 DB schema 变更 / API 响应结构变化) → MAJOR.
- `package.json#version` 与 tag 一致 (tag 含 `v`, version 不含). Actions `Verify tag matches package.json version` 校验, 不一致直接 fail.
- `CHANGELOG.md` 顶部新增 `## [X.Y.Z] - YYYY-MM-DD` 段 + Added/Changed/Fixed/Removed; 底部补 `[X.Y.Z]: <compare-url>`.
- D1 schema 变更: 在 `migrations/` 下新建 `NNNN_description.sql` (`wrangler d1 migrations create ele-autopilot <desc>` 生成骨架). 必须向后兼容: `ALTER TABLE ... ADD COLUMN`, 禁止 `DROP` / `RENAME` 已有列. CHANGELOG 标注新增列 + 默认值.

## 3. 发布

```bash
git add .
git commit -m "release: vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin <branch> vX.Y.Z
```

> annotated tag (`-a -m`) 而非 lightweight: 兼容 `tag.gpgsign=true` (开启时 lightweight tag 会被强制升级为 signed 但缺 message → fail).

Actions 流程:

1. 校验 tag = package.json version.
2. `bun install --frozen-lockfile`.
3. 探测 / 创建 D1 database, 把真实 `database_id` 写回 `wrangler.jsonc` (placeholder 替换).
4. 探测 / 创建 R2 bucket.
5. `bun run build`.
6. `wrangler d1 migrations apply ele-autopilot --remote`.
7. `wrangler deploy`.

成功后 Worker URL: `https://ele-autopilot.<account-subdomain>.workers.dev` (或绑定的自定义域名).

## 4. amend 修上版 bug

AI 自主识别 "刚发版的 bug, 不发新版" 场景 (反馈指向刚 push 的 tag / 改动极小仅修缺陷 / 语气暗示是上版延续). 此时:

> **commit + tag 必须同步更新**: amend 后 commit hash 变了, 远程 tag 仍指向旧 hash → 部署版本与 main HEAD 分离. 必须删远程 tag 后重打, 触发 Actions 重跑.

```bash
git commit -a --amend --no-edit
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
git tag -a vX.Y.Z -m "vX.Y.Z"
git push --force-with-lease origin <branch>
git push origin vX.Y.Z
```

amend 禁用条件: Workers 已基于该 tag 上线并接流量 → 必须发新 PATCH 版.

## 5. 数据库 / 存储管理 (operator 视角)

```bash
# 查看 D1 数据
bunx wrangler d1 execute ele-autopilot --remote --command "SELECT COUNT(*) FROM tasks"

# 查看 R2 对象
bunx wrangler r2 object get ele-autopilot-screenshots/<key> --file ./out.png
bunx wrangler r2 bucket list

# 备份 D1 (生成 SQL dump)
bunx wrangler d1 export ele-autopilot --remote --output backup.sql

# 还原 / 批量插入
bunx wrangler d1 execute ele-autopilot --remote --file restore.sql
```

> D1 当前规模上限: 单库 10 GB (Workers Paid). R2 无单 bucket 上限 (按 storage / class A/B 操作计费).
