# ele-autopilot

React Router v7 (Framework mode) Web 应用 — QA 任务管理后台. 文件夹层级组织任务, SQLite 持久化 (`better-sqlite3`), Ant Design + Tailwind UI. Node 20+ + Bun. 改完代码 → 在 `CHANGELOG.md` 顶部新增版本段 → 按 [deploy.md](./deploy.md) 发布.

## 部署 (服务器侧)

打 `v*` tag 后, GitHub Actions 自动构建 RR7 SSR 产物 + 生产 `node_modules`, 打包成 `linux-x64.tar.gz` 发布 Release. 服务器拉取 + 启动:

```bash
TAG=v0.2.0
curl -fsSLO "https://github.com/yangfan-elestyle/ele-autopilot-pretest/releases/download/${TAG}/ele-autopilot-${TAG}-linux-x64.tar.gz"
tar -xzf "ele-autopilot-${TAG}-linux-x64.tar.gz"
cd "ele-autopilot-${TAG}-linux-x64"
HOSTNAME=0.0.0.0 PORT=3000 SQLITE_DB_PATH=/var/lib/ele-autopilot/app.sqlite \
  ./node_modules/.bin/react-router-serve ./build/server/index.js
```

环境变量:

- `HOSTNAME` / `PORT`: `react-router-serve` 监听地址 (默认 `localhost:3000`).
- `SQLITE_DB_PATH`: SQLite 文件路径, 相对 `cwd` 解析 (默认 `data/app.sqlite`). 线上必须落在持久化目录, 否则升级覆盖时数据会丢.

## 开发

```bash
bun install
bun dev                # http://localhost:3000 (Vite + RR7 HMR)
bun run lint
bun run format
bun run typecheck      # react-router typegen + tsc
bun run build && bun run start
```

React DevTools 独立窗口: 必须先 `bunx react-devtools` 再 `bun dev`, 反序无效.

## 发布

详见 [deploy.md](./deploy.md). 一条线:

```bash
# 1. 改 package.json#version (与即将打的 tag 不含 v 保持一致)
# 2. CHANGELOG.md 顶部新增 ## [X.Y.Z] - YYYY-MM-DD 段
git commit -am "release: vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin <branch> vX.Y.Z
```
