<INSTRUCTIONS>
## docs/ 目录说明（给 AI / Agent）

本目录用于存放「离线可检索」的参考资料，帮助 Agent 在没有联网或不方便联网时快速查到 Next.js / Bun / Ant Design 等相关的权威说明与用法要点。

### 这类文档会在什么时候用到？

- 你正在修改 **Next.js App Router** 相关代码（`app/`、`app/api/`、Route Handlers、Server/Client Components 边界、缓存与数据获取等）
- 你正在处理 **Bun** 相关问题（安装依赖、运行脚本、`bun.lock`、`bun:sqlite`、运行时差异等）
- 你正在写 **Ant Design** UI（表格、表单、Modal、Notification、布局、组件 props、交互与可访问性等）

### 当前已有资料（按优先级）

优先读「精简版」，需要更深入细节时再读「完整版」：

- Ant Design
  - `docs/ant-design-llms.txt`（精简版，优先）
  - `docs/ant-design-llms-full.txt`（完整版）
- Bun
  - `docs/bun-llms.txt`（精简版，优先）
  - `docs/bun-llms-full.txt`（完整版）
- Next.js
  - `docs/next-llms.txt`（精简版，优先）
  - `docs/next-llms-full.txt`（完整版）

### 使用建议（让检索更高效）

- 先用仓库内搜索定位关键词，再打开对应文件的相关段落（例如用 `rg "Server Components|Route Handlers|use client|Content-Range" docs/`）。
- 避免一次性把「完整版」整段搬进上下文；只提取与当前问题强相关的小段落做依据。
- 当文档内容与仓库现有实现冲突时：**以仓库代码与配置为准**（例如 `next.config.*`、`tsconfig.json`、`bun.lock`、`package.json`、`app/` 实际实现）。文档更多用于解释“为什么/怎么做”，而不是替代代码事实。

### 维护约定（可选，但推荐）

- 新增参考资料时，建议按 `*-llms.txt`（精简）与 `*-llms-full.txt`（完整版）成对存放，并在本文件里补充索引。
- 如果升级了 Next.js/Bun/Ant Design 的大版本，建议同步更新对应参考资料，避免因版本差异误导实现。
  </INSTRUCTIONS>
