# Repository Guidelines

React Router v7 (Framework mode) Web 应用 — QA 任务管理后台. 文件夹层级组织任务, **Cloudflare D1** 持久化 (prepared statement, async), **Cloudflare R2** 存截图, Ant Design + Tailwind UI. Node 20+ + Bun (`bun.lock`). 运行时 Cloudflare Workers (V8 isolate). 改完代码 → 在 `CHANGELOG.md` 顶部新增版本段 → 按 [deploy.md](./deploy.md) 发布 (push tag → Actions → `wrangler deploy`).

## AI-only 工程声明

本仓库为 **AI-only 项目**, 人类不参与开发流程:

1. 代码编写 / 测试 / 构建 / 部署 / 发布 — 全部由 Claude Code 或 Codex 执行.
2. 设计决策 (架构 / 技术选型 / 目录结构 / 命名 / 依赖) 以 AI 判断为准, 不需要参考人类开发者惯例, 除非该惯例本身就是 AI 的最优解.
3. 非必要不反问用户, 直接决策并执行 (deploy / 技术抉择 / 文档同步 / 版本号 / changelog 等).
4. 所有文档 (`README` / `CHANGELOG` / `deploy.md` / `AGENTS.md` / 注释) 必须简洁精炼 / 重点突出 / 零冗余.

用户角色 = 触发者 + 验收者, 不是协作开发者.

`package.json#version` 与 tag 必须一致 (Actions 校验, 不一致直接 fail). 详见 [deploy.md](./deploy.md).

## Project Structure & Module Organization

- `app/`: RR7 应用根. `app/root.tsx` HTML shell; `app/entry.server.tsx` SSR 入口 (Workers `renderToReadableStream` + antd cssinjs 抽取); `app/entry.client.tsx` 客户端 hydrate.
- `app/routes.ts`: 显式路由总表 — 一处定义所有 URL → 文件映射, 不用 `flatRoutes`.
- `app/routes/`: 所有路由文件 (页面 + REST resource routes). 命名 `dot.separated.tsx`, `$param` 表动态段.
- `app/admin/`: 管理后台 UI 模块 (`_components/` / `_data/` / `_hooks/` / `_services/` / `_utils/` / `_theme/`).
- `app/lib/api-shared.ts`: 资源路由通用 helper (`jsonResponse` / `parseListParams` / `withContentRange` / `mapDbErrorToStatus`).
- `lib/db/`: D1 数据访问层 (异步 prepared statement, 仅在 loader/action 内调用; 客户端必须通过 fetch API 访问).
- `lib/bindings.ts`: `AsyncLocalStorage<{DB, SCREENSHOTS}>` 容器, 请求级别注入 Cloudflare bindings.
- `lib/screenshots.ts`: R2 截图读写 (base64 解码 → R2.put, key = `<jobTaskId>/<i>.png`).
- `workers/app.ts`: Workers fetch handler 入口, `runWithBindings()` wrap + RR7 `createRequestHandler`.
- `migrations/`: D1 SQL 迁移 (`NNNN_description.sql`, `wrangler d1 migrations apply` 顺序执行).
- `public/`: 静态资源 (含 `favicon.ico`); `docs/`: 参考资料; `data/`: 历史本地 SQLite (已废弃, 保留兼容; 已 gitignore).

## Key Files

- `wrangler.jsonc`: Workers 配置 — `main: ./workers/app.ts`, `compatibility_flags: ["nodejs_compat"]`, d1 binding `DB`, r2 binding `SCREENSHOTS`. `database_id` 在 Actions 部署时由真实 ID 替换.
- `react-router.config.ts`: `ssr: true`, `appDirectory: 'app'`, `future.v8_viteEnvironmentApi: true` (与 `@cloudflare/vite-plugin` 集成必需).
- `vite.config.ts`: `cloudflare({ viteEnvironment: { name: 'ssr' } })` + `tailwindcss()` + `reactRouter()`; `@/*` 别名通过 Vite 内置 `resolve.tsconfigPaths`.
- `worker-configuration.d.ts`: `wrangler types` 生成, 含 `Env` (DB / SCREENSHOTS) + runtime types. **不要手编辑**, 改 `wrangler.jsonc` 后跑 `bun run typegen`.
- `app/routes.ts`: 路由总表 (新增页面 / API 必须同步登记).
- `lib/db/index.ts`: 公共导出聚合; 业务调 `import { getTaskById } from '@/lib/db'`.
- `lib/db/connection.ts`: `getDb()` 从 ALS 取 D1 实例.
- `lib/db/utils.ts`: `queryAll/queryGet/queryRun` 包装 D1 prepared statement, 全部 async.
- `app/admin/_components/admin-task-explorer.tsx`: 管理后台主页面状态与交互.

## API Conventions

- 路由形态: `/api/admin/{resource}` 与 `/api/admin/{resource}/:id`, 资源命名: `folders` / `tasks` / `jobs` / `settings`.
- 所有 API 路由文件位于 `app/routes/api.*.tsx`, 仅导出 `loader` (GET) 与 `action` (POST/PUT/PATCH/DELETE), 无 `default export` = resource route.
- `action` 内通过 `request.method` 分发 PUT/PATCH/DELETE.
- 列表查询参数 (均 JSON 字符串): `sort` / `range` / `filter`.
- 分页通过响应头 `Content-Range` 表达 (`Access-Control-Expose-Headers: Content-Range`).
- 新增接口: 1) 写 `app/routes/api.xxx.tsx`, 2) 在 `app/routes.ts` 中 `route()` 登记.
- 所有 db 函数 async, loader/action 内必须 `await`.

## Database (D1)

- 表: `folders` (`parent_id` 表层级) / `tasks` (关联 `folders`, `sub_ids` JSON 表子任务链) / `jobs` + `job_tasks` (执行记录) / `settings` (全局配置).
- Schema 改动: 在 `migrations/` 下新建 `NNNN_description.sql` (`wrangler d1 migrations create ele-autopilot <desc>`). **必须向后兼容**: `ALTER TABLE ... ADD COLUMN`, 禁止 `DROP` / `RENAME` 已有列.
- Actions 部署自动跑 `wrangler d1 migrations apply --remote`. 本地用 `--local` 同步 miniflare D1.
- D1 prepared statement: `db.prepare(sql).bind(...).all()/first()/run()`, 参数仅 `?` 位置绑定, 不支持命名参数.

## Storage (R2)

- `ele-autopilot-screenshots` bucket, key 格式 `<jobTaskId>/<stepIndex>.png`.
- 写: callback 收到 base64 → `lib/screenshots.ts#externalizeScreenshots` → `R2.put`, DB 存路径字符串 `/screenshots/<jobTaskId>/<i>.png`.
- 读: `/screenshots/*` 路由 → `R2.get(key).body` → Response (1y immutable cache).
- 路径越狱防护: `r2KeyFromRelPath()` 校验 `..`/控制字符/非法字符.

## Build & Development

```bash
bun install
bun dev                # Vite + cloudflare 插件 + miniflare (本地 D1 / R2 模拟)
bun run build          # 输出 build/client + build/server (含 wrangler.json)
bun run preview        # wrangler dev (生产环境模拟, 走 build 产物)
bun run typecheck      # wrangler types + react-router typegen + tsc
bun run typegen        # 仅生成 worker-configuration.d.ts (改 wrangler.jsonc 后必跑)
bun run deploy         # 直接 wrangler deploy (常规走 Actions, 仅紧急情况手动)
bun run lint
bun run format         # prettier --write .
```

首次本地开发: `bunx wrangler d1 migrations apply ele-autopilot --local` 把 schema 写到 miniflare 本地 D1.

## Coding Style

- TypeScript `strict: true`. 优先使用 `@/*` 路径别名.
- Prettier 配置 (含 `prettier-plugin-tailwindcss`) 为准, 不要手工对齐.
- React 组件 `PascalCase` + 导出; 文件名 `kebab-case.tsx`.
- 路由文件按 RR7 显式登记约定 `app/routes/dot.separated.$param.tsx`.

## Testing

未配置测试框架. 改 D1 schema / API 形态时通过 `bun run build` + `bunx wrangler deploy --dry-run` 验证产物 + bindings.

## Commit & PR

- Conventional Commits: `feat | fix | chore | refactor | docs | test: ...`.
- 发布提交统一: `release: vX.Y.Z`.

## Release

- 触发: push `v*` tag. workflow: `.github/workflows/release.yml`.
- 流程: 校验版本 → 探测 / 创建 D1 + R2 → build → migrations apply --remote → `wrangler deploy`.
- 完整步骤 / amend 场景: [deploy.md](./deploy.md).

## Security & Configuration

- 不要提交 `.env*` / `data/` / `build/` / `.react-router/` / `node_modules/` / `*.sqlite*` / `.wrangler/`. 敏感配置放 `.dev.vars` (wrangler 本地 env 文件, 已 gitignore).
- 必备 GitHub Secrets: `CLOUDFLARE_API_TOKEN` (Workers/D1/R2 编辑权限), `CLOUDFLARE_ACCOUNT_ID`.
- Workers 环境变量 (非 secret) 写 `wrangler.jsonc#vars`; secret 用 `wrangler secret put <name>`.
- D1 数据备份: `bunx wrangler d1 export ele-autopilot --remote --output backup.sql`.

## Boundary

- Workers 单文件大小限制 (gzip): Free 3 MiB / Paid 10 MiB. 当前 server bundle ~900 KiB gzip, 安全.
- D1 单库上限 10 GB (Paid). 单查询行数 / 字节有上限, 详见 Cloudflare D1 文档.
- `CLAUDE.md` 为 `AGENTS.md` 的 symlink, 改 `AGENTS.md` 即可, 不要分叉.
