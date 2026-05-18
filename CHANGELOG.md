# Changelog

[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) + [SemVer](https://semver.org/).

## [0.3.0] - 2026-05-18

### Changed

- **平台迁移到 Cloudflare Workers + D1 + R2**. 运行时从 Node `react-router-serve` 切换到 Workers (V8 isolate). 数据库 `better-sqlite3` (同步) → D1 (prepared statement, 异步); 截图 `data/screenshots/` 本地 fs → R2 bucket `ele-autopilot-screenshots`.
- `lib/db/*` 全部函数改异步 (`async`/`await`); 通过 `lib/bindings.ts` 的 `AsyncLocalStorage` 注入 D1 + R2, 调用层无须显式传 binding.
- `app/entry.server.tsx`: Node `renderToPipeableStream` + `node:stream` → web `renderToReadableStream` + 缓冲注入 antd cssinjs 样式 (Workers 不支持 PassThrough).
- 构建系统: 接入 `@cloudflare/vite-plugin`, 启用 RR7 `future.v8_viteEnvironmentApi`. `wrangler.jsonc` 声明 `DB` (D1) + `SCREENSHOTS` (R2) bindings. 产物 `build/server/` 由 vite plugin 自动写入 `wrangler.json` 含完整 binding 配置.
- 发布流程: push tag → Actions 走 `wrangler deploy` (替代旧 tarball release). 新增 `migrations/0001_init.sql` (D1 schema), Actions 自动 `wrangler d1 migrations apply --remote`.

### Added

- `workers/app.ts`: Workers fetch handler, 用 `createRequestHandler` + `runWithBindings` 把 `env` (DB + R2) 注入 RR7 AppLoadContext + ALS scope.
- `lib/bindings.ts`: `AsyncLocalStorage<{DB, SCREENSHOTS}>` 容器, 请求级别注入 Cloudflare bindings; `getBindings()` / `runWithBindings()` API.
- `migrations/0001_init.sql`: D1 初始 schema (folders / tasks / jobs / job_tasks / settings + 默认 agent_config).
- `worker-configuration.d.ts`: `wrangler types` 生成的 runtime types + Env 类型 (含 DB / SCREENSHOTS).
- `package.json` scripts: `preview` (`wrangler dev`), `deploy` (`wrangler deploy`), `typegen` (`wrangler types`).

### Removed

- `better-sqlite3` / `@types/better-sqlite3` / `@react-router/node` / `@react-router/serve` 依赖.
- `lib/db/connection.ts` 中 `getDbPath` / `initSchema` / `seedTestData` (schema 由 D1 migrations 管理, seed 数据不再自动注入 - 生产环境靠 admin 创建).
- 旧 `data/` 目录写入 (本地开发用 `wrangler dev` + miniflare 模拟 D1 + R2).
- `.github/workflows/release.yml` 的 tarball 打包逻辑 (`linux-x64.tar.gz` + `checksums.txt` 不再产出).

### Migration Notes (operator)

- 必备 GitHub Secrets: `CLOUDFLARE_API_TOKEN` (含 Workers / D1 / R2 编辑权限), `CLOUDFLARE_ACCOUNT_ID`.
- 首次部署 Actions 自动创建 D1 database `ele-autopilot` + R2 bucket `ele-autopilot-screenshots` (幂等检测, 已存在不重建).
- 历史 SQLite 数据 / 本地 screenshots 不自动迁移. 如需保留, 用 `wrangler d1 execute` 批量导入 + `wrangler r2 object put` 上传图片.

## [0.2.5] - 2026-05-18

### Removed

- `job_tasks.result.steps[].thinking_image` 不再以 base64 字符串内嵌存储 — 原设计文档 (`todos/link-serve-client.md:465`) 写明 "截图路径", 但实现意外走了 base64, 导致单 task result 平均 14.5 MB (规划上限 500 KB 的 29×, 极端 task 530 步达 230 MB / 单 task).

### Added

- `lib/screenshots.ts`: base64 解码 + 落盘 + path 替换工具, 含路径越狱防护 (`resolveScreenshotAbsPath`).
- `app/routes/screenshots.$.tsx`: 静态 resource route, URL `/screenshots/{job_task_id}/{i}.png` 直接读 `data/screenshots/`, 返回 `image/png` + immutable 缓存头.
- 环境变量 `SCREENSHOTS_DIR` (默认 `data/screenshots`) 自定义截图根目录, 沿用 `SQLITE_DB_PATH` 同款思路, 部署可指向持久卷. 未来上 R2 / S3 时只改 `lib/screenshots.ts` 落盘逻辑, DB / UI 层 (存的是 URL 字符串) 无需变动.
- `scripts/migrate-screenshots-to-fs.mjs`: 一次性历史数据迁移脚本, 把存量 base64 抽出落盘并 `UPDATE` result. 幂等可重跑, 支持 `--vacuum`. 用 ID 列表流式逐行处理避免 OOM (5+ GB 数据).

### Changed

- `api.jobs.$id.callback.task.tsx` 收到 callback 后, 先 `getJobTaskByIndex` 拿 job_task id, 调用 `externalizeScreenshots` 把 `result.steps[].thinking_image` 的 base64 抽出落盘到 `data/screenshots/{id}/{i}.png`, 字段值替换为 `/screenshots/{id}/{i}.png` 再入 SQLite. Local 端契约不变, 仍传 base64 (因为 local 与 server 跨机部署, local path 在 server 上访问不到).
- `app/admin/preview/_components/job-task-detail.tsx` UI 渲染兼容三种格式: `data:` / `http(s)://` / `/` 直接当 URL, 否则按旧数据 raw base64 兜底加前缀.
- 历史数据迁移: 5.5 GB base64 截图全量抽出 → `data/screenshots/` (4.1 GB binary PNG, 10,316 张图) + `app.sqlite` 从 5.8 GB → **387 MB** (-93%). 迁移 18.6s + VACUUM 2.1s.

## [0.2.4] - 2026-05-18

### Removed

- `TaskActionResult.raw_history` 字段 — 该字段是 browser-use `AgentHistoryList.model_dump()` 的原样镜像, 与 `steps[]` 内容 100% 冗余 (thinking / evaluation / memory / next_goal / model_output / action / results 已全部结构化到 steps), 服务端 UI / API 零消费, 仅是 `job_tasks.result` 列的纯膨胀源. 同步清理 `lib/db/types.ts` / `app/admin/_types.ts` 类型定义与 `todos/link-serve-client.md` 设计文档 (类型 / 示例 / 树形图共 3 处).

### Changed

- 历史数据迁移: 对 `job_tasks.result` 执行 `UPDATE ... json_remove($.raw_history)` (404 行全量) + `VACUUM`. 物理库 6.2 GB → 5.8 GB (-400 MB / -6.5%), 单条 result 平均 16.0 MB → 14.5 MB. 需配套 `ele-autopilot-local` ≥ v0.1.4 (源头同步停止注入, 否则旧版 local 回调会重新写入该字段).

## [0.2.3] - 2026-05-18

### Fixed

- `.prettierignore` 仍写 `.next` (Next.js 产物目录, RR7 已无意义), 改为 RR7 实际产物 `build` / `.react-router`. 否则 `bun run format` 会扫这些目录里的生成文件.
- `todos/link-serve-client.md` 架构图标签 `(Next.js + SQLite)` → `(React Router v7 + SQLite)`, 避免误导后续 agent 以为 server 还是 Next.js.

## [0.2.2] - 2026-05-18

### Removed

- `docs/next-llms.txt` / `docs/next-llms-full.txt`: Next.js 离线文档镜像, 项目已不再依赖 Next.js, 留着会误导后续 AI agent. 总计 ~3MB.

### Changed

- `docs/AGENTS.md` 重写: 删除 Next.js App Router 相关引导, 替换为 React Router v7 (Framework mode) 上下文; 离线检索资料保留 Bun + Ant Design 两套.
- `deploy.md` 修正注释 "验证 standalone 启动" → "验证生产构建启动" (Next.js 残留措辞).

## [0.2.1] - 2026-05-18

### Changed

- `app/entry.server.tsx` 移除残留的 `isbot` UA 分支与 `readyOption` 三元死代码 — antd cssinjs `extractStyle` 强依赖完整渲染, 始终走 `onAllReady`. 同步从 `package.json` 移除显式 `isbot` 依赖 (RR7 dev 仍间接持有).
- 移除 5 个组件文件 (`admin-task-explorer-page` / `use-agent-connection` / `preview/_components/job-*`) 顶部残留的 `'use client';` 指令 — RR7 无 RSC 边界, 无意义.
- `AGENTS.md` 修正 `vite.config.ts` 描述: 实为 `reactRouter()` + `tailwindcss()` 两 plugin, `@/*` 别名走 Vite 8 内置 `resolve.tsconfigPaths` 读 `tsconfig.json#paths` 解析, 无独立 plugin.

## [0.2.0] - 2026-05-18

### Changed

- 框架从 Next.js 16 (App Router) 迁移到 React Router v7 (Framework mode + Node adapter + Vite). 所有 URL 路径 / DB schema / 外部 runner 回调契约保持不变.
- 服务端入口由 `next.config.ts` standalone server → `@react-router/serve`. 启动命令 `./node_modules/.bin/react-router-serve ./build/server/index.js`.
- Release artifact 内容从 `.next/standalone/` → `build/` + `public/` + `package.json` + 生产 `node_modules/`. 解压后直接启动, 无需额外 `npm install`.
- antd SSR 从 `@ant-design/nextjs-registry` 切换为 `@ant-design/cssinjs` 在 `app/entry.server.tsx` 内 `StyleProvider` + `extractStyle` 手动抽取. SSR 用 `renderToPipeableStream` + `onAllReady` (非 `renderToString`), 经 PassThrough buffer 在 `</head>` 前注入 style — 否则 RR7 client `<HydratedRouter>` 等不到 stream close 信号会永远 suspend (页面卡 Spin).
- ESLint 配置从 `eslint-config-next` 切换为 `@eslint/js` + `typescript-eslint` 推荐规则集.
- `lib/db/*.ts` 移除 `import 'server-only'` (RR7 没有此约定, loader/action 天然只在服务端运行).
- `app/root.tsx` 的 `<html>` / `<body>` 加 `suppressHydrationWarning` 防御浏览器扩展 (沉浸式翻译 / Claude in Chrome 等) 修改根元素属性触发的 hydration 警告.

### Added

- `app/routes.ts`: 显式路由总表, 一处定义所有 URL → 文件映射, 不用 `flatRoutes`.
- `app/lib/api-shared.ts`: REST resource route 通用 helper (`jsonResponse` / `parseListParams` / `withContentRange` / `mapDbErrorToStatus` / `methodNotAllowed`).

### Removed

- `next` / `eslint-config-next` / `@ant-design/nextjs-registry` / `@tailwindcss/postcss` 依赖, `next.config.ts` / `next-env.d.ts` / `app/layout.tsx` / `app/page.tsx` / `app/api/` 目录全部清理. `app/page.tsx` 默认首页改为重定向到 `/admin`.

## [0.1.0] - 2026-05-18

### Added

- 管理后台 UI (`app/admin`): 文件夹树 + 任务列表的层级管理, 支持任务标题 / sub_ids 子任务链 / 多任务批量创建.
- 数据模型: `folders` (`parent_id` 表层级) / `tasks` (关联 folder, `sub_ids` JSON 表子任务链).
- Job 执行模型: `jobs` + `job_tasks` (一次执行展开 `sub_ids` 后 flat 成多个 `job_task`, 各自记录 `status` / `result` / `error`).
- 全局配置: `settings` (key-value, 默认写入 `agent_config` 含 gemini model / max_steps / 各类 timeout 等).
- 管理后台 REST API (`/api/admin/{folders,tasks,jobs,settings}`): 列表支持 `sort` / `range` / `filter` 查询参数 (均 JSON 字符串), 分页通过响应头 `Content-Range` 表达, 浏览器侧通过 `Access-Control-Expose-Headers: Content-Range` 暴露.
- Job 回调入口: `/api/jobs/[id]/callback` 接收外部 runner 上报 job_task 执行结果.
- SQLite 持久化 (`better-sqlite3`, 仅服务端), 首次启动自动建表 + 写入示例数据 (10 个顶级文件夹 × 5 个子文件夹 + 100 条任务模板).
- DB schema 迁移机制: `initSchema` 内 `ALTER TABLE ... ADD COLUMN` (try/catch 包裹) 幂等处理, 保证已有数据不被破坏.
- `tag (v*)` 触发 GitHub Actions: 构建 Next.js `standalone` 产物, 打包 `linux-x64` tarball, 生成 SHA256 `checksums.txt`, 发布 GitHub Release.

[0.3.0]: https://github.com/yangfan-elestyle/ele-autopilot-pretest/releases/tag/v0.3.0
[0.2.5]: https://github.com/yangfan-elestyle/ele-autopilot-pretest/releases/tag/v0.2.5
[0.2.4]: https://github.com/yangfan-elestyle/ele-autopilot-pretest/releases/tag/v0.2.4
[0.2.3]: https://github.com/yangfan-elestyle/ele-autopilot-pretest/releases/tag/v0.2.3
[0.2.2]: https://github.com/yangfan-elestyle/ele-autopilot-pretest/releases/tag/v0.2.2
[0.2.1]: https://github.com/yangfan-elestyle/ele-autopilot-pretest/releases/tag/v0.2.1
[0.2.0]: https://github.com/yangfan-elestyle/ele-autopilot-pretest/releases/tag/v0.2.0
[0.1.0]: https://github.com/yangfan-elestyle/ele-autopilot-pretest/releases/tag/v0.1.0
