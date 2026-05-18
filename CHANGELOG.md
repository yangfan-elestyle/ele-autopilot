# Changelog

[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) + [SemVer](https://semver.org/).

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

[0.2.0]: https://github.com/yangfan-elestyle/ele-autopilot-pretest/releases/tag/v0.2.0
[0.1.0]: https://github.com/yangfan-elestyle/ele-autopilot-pretest/releases/tag/v0.1.0
