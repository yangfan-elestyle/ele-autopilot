# Repository Guidelines

本仓库是基于 Next.js App Router 的 Web 项目，使用 Bun 作为运行与依赖管理工具（见 `bun.lock`），UI 采用 Ant Design + Tailwind CSS。

## Project Overview

Ele-Autopilot 是一个用于 QA 任务管理的 Next.js App Router Web 应用，支持以文件夹层级组织任务。使用 Bun 作为运行时与依赖管理，SQLite 作为持久化存储，UI 基于 Ant Design + Tailwind CSS。

## Project Structure & Module Organization

- `app/`: 页面与路由（App Router）。`app/api/` 为 Route Handlers（REST 风格接口）。
- `app/api/admin/`: 管理后台 REST 接口（资源：`folders`、`tasks`；路由文件位于 `app/api/admin/**/route.ts`）。
- `app/admin/`: 管理后台 UI；内部模块按 `_components/`、`_data/`、`_utils/`、`_theme/` 分层组织；`_types.ts` 为共享类型定义。
- `lib/db/`: SQLite 数据访问层（`bun:sqlite`，仅服务端使用；客户端请通过 API 访问）。
- `public/`: 静态资源；`docs/`: 参考资料；`data/`: 本地 SQLite 文件（默认 `data/app.sqlite`，已在 `.gitignore` 中忽略）。

## Key Files

- `lib/db/connection.ts`: 数据库连接、建表与初始化逻辑。
- `lib/db/folders.ts` / `lib/db/tasks.ts`: 数据库 CRUD 操作。
- `app/admin/_components/admin-task-explorer.tsx`: 管理后台主要页面状态与交互。
- `app/api/admin/_shared.ts`: 管理后台 API 的通用解析与分页响应头（`Content-Range`）处理。

## API Conventions

- 管理后台 API 路由遵循：`/api/admin/{resource}` 与 `/api/admin/{resource}/[id]`（资源：`folders`、`tasks`）。
- 列表接口使用查询参数：`sort`、`range`、`filter`（均为 JSON 字符串）。
- 分页通过响应头 `Content-Range` 表达，并在浏览器侧暴露该响应头（`Access-Control-Expose-Headers: Content-Range`）。

## Database

- 数据表：`folders`（通过 `parent_id` 表示层级关系）、`tasks`（关联到 `folders`）、`jobs` / `job_tasks`（任务执行记录）、`settings`（全局配置）。
- 项目已在线上运行，修改 DB 结构时**必须**提供向后兼容的迁移逻辑（如 `ALTER TABLE ... ADD COLUMN`），确保已有数据不被破坏。
- 迁移代码放在 `lib/db/connection.ts` 的 `initSchema()` 中，使用 `try { ALTER TABLE } catch { /* 列已存在 */ }` 模式处理幂等性。

## Build, Development Commands

- `bun install`: 安装依赖。
- `bun dev`: 启动本地开发（默认 http://localhost:3000）。
- `bun run build`: 生产构建（输出到 `.next/`）。
- `bun run start`: 以生产模式启动（需先执行 build）。
- `bun run format`: 使用 Prettier 格式化代码（`prettier --write .`）。

## Coding Style & Naming Conventions

- TypeScript 开启 `strict: true`；优先使用 `@/*` 路径别名（如 `@/lib/db`）。
- 缩进与引号等风格以 Prettier 配置为准（如 2 空格、分号、单引号等）；保持改动最小、避免无意义重排。
- 项目已配置 Prettier（含 `prettier-plugin-tailwindcss`），涉及格式调整时优先运行 `bun run format`，避免手工对齐/排序造成噪音 diff。
- React 组件以 `PascalCase` 命名并导出；文件名多为 `kebab-case.tsx`。
- API 路由按 Next 约定放在 `app/api/**/route.ts`；新增接口时保持资源命名一致（如 `tasks`、`folders`）。

## Testing Guidelines

当前未配置测试框架，无需进行 单元测试或集成测试。如后续添加测试支持，将更新本节内容。

## Commit & Pull Request Guidelines

- 提交信息遵循 Conventional Commits（仓库历史示例：`feat: add sqlite`）：`feat|fix|chore|refactor|docs|test: ...`。
- PR 需包含：变更动机与影响范围；UI 变更附截图（尤其 `app/admin`）；API 变更列出请求/响应示例。
- 如修改 DB 结构，请同步更新 `lib/db/connection.ts` 的建表逻辑与迁移代码，并在 PR 中说明迁移策略。

## Security & Configuration Tips

- 不要提交 `.env*`、`data/`、`.next/` 等本地产物；敏感配置放在 `.env.local`。
- 可通过环境变量 `SQLITE_DB_PATH` 自定义 SQLite 文件路径（默认 `data/app.sqlite`）。
- 本地数据库首次启动会自动建表并写入示例数据；需要重置时可删除 `data/app.sqlite`（仅限本地开发，线上环境禁止直接删除数据库文件）。
