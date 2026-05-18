<INSTRUCTIONS>
## docs/ 目录说明（给 AI / Agent）

本目录存放「离线可检索」的参考资料, 帮 Agent 在不联网时快速查到 Bun / Ant Design 等相关权威说明.

### 这类文档会在什么时候用到?

- 修改 **React Router v7 (Framework mode)** 相关代码 (`app/routes/`, `app/routes.ts`, loader/action, entry.server/client, SSR/cssinjs 整合). RR7 本地无镜像, 优先联网检索官方 https://reactrouter.com/.
- 处理 **Bun** 相关问题 (依赖安装, 运行脚本, `bun.lock`, 运行时差异等).
- 写 **Ant Design** UI (表格 / 表单 / Modal / Notification / 布局 / 组件 props / 交互 / 可访问性等).

### 当前已有资料 (按优先级)

优先读「精简版」, 需要更深细节再读「完整版」:

- Ant Design
  - `docs/ant-design-llms.txt` (精简版, 优先)
  - `docs/ant-design-llms-full.txt` (完整版)
- Bun
  - `docs/bun-llms.txt` (精简版, 优先)
  - `docs/bun-llms-full.txt` (完整版)

### 使用建议 (让检索更高效)

- 先用仓库内搜索定位关键词, 再打开对应文件相关段落 (例: `rg "Resource Routes|loader|action|Content-Range" docs/`).
- 避免一次性把「完整版」整段搬进上下文; 只提取与当前问题强相关的小段落做依据.
- 文档内容与仓库现有实现冲突时: **以仓库代码与配置为准** (例: `react-router.config.ts`, `vite.config.ts`, `tsconfig.json`, `bun.lock`, `package.json`, `app/` 实际实现). 文档用于解释「为什么 / 怎么做」, 不替代代码事实.

### 维护约定 (可选, 推荐)

- 新增参考资料时按 `*-llms.txt` (精简) 与 `*-llms-full.txt` (完整) 成对存放, 在本文件补充索引.
- 升级 Bun / Ant Design 大版本时同步更新对应资料, 避免版本差异误导实现.
  </INSTRUCTIONS>
