# ele-autopilot 与 ele-autopilot-local 打通方案（混合模式）

## 网络拓扑约束

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户本地环境                                     │
│                                                                             │
│  ┌─────────────────────┐      ┌─────────────────────────────────────────┐  │
│  │ autopilot-local     │      │           浏览器                          │  │
│  │ (FastAPI)           │      │  ┌─────────────────────────────────┐    │  │
│  │                     │ ◀──  │  │      autopilot-ui (前端)         │    │  │
│  │ 127.0.0.1:8000      │ UI可 │  │                                  │    │  │
│  │                     │ 访问 │  │                                  │    │  │
│  │                     │ ───▶ │  └─────────────────────────────────┘    │  │
│  │                     │      └──────────────────┬──────────────────────┘  │
│  │                     │                         │                         │
│  │          │          │                         │ UI 可访问 Server        │
│  │          │          │                         │                         │
│  │   Local 可访问      │                         │                         │
│  │   Server ─────────────────────────────────────┼───────────┐             │
│  │          │          │                         │           │             │
│  └──────────┼──────────┘                         │           │             │
└─────────────┼────────────────────────────────────┼───────────┼─────────────┘
              │                                    │           │
              │ ✅ Local → Server                  │           │
              │    (回调上报)                       │           │
              ▼                                    ▼           │
           ┌─────────────────────────────────────────┐         │
           │         autopilot-server                │ ◀───────┘
           │         (Next.js + SQLite)              │
           │                                         │
           │  ❌ Server 无法访问 Local (内网)         │
           └─────────────────────────────────────────┘
```

**网络通信矩阵**：

| 源 → 目标      | 可达性 | 说明                                    |
| -------------- | ------ | --------------------------------------- |
| Server → Local | ❌     | Local 在内网，Server 无法主动访问       |
| Local → Server | ✅     | Local 可以主动访问 Server（回调、上报） |
| UI → Local     | ✅     | 本地浏览器可访问本地服务                |
| UI → Server    | ✅     | 浏览器可访问 Server                     |

**关键结论**：

- **任务下发**：必须由 UI 发起（Server 无法访问 Local）
- **状态回调**：Local 可以直接回调 Server（保留 Webhook 机制）
- **UI 查询**：UI 轮询 Server 即可（状态已由 Local 回调更新到 Server）

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│   ┌──────────────────┐                               ┌──────────────────────┐   │
│   │ autopilot-local  │                               │  autopilot-server    │   │
│   │ 127.0.0.1:8000   │                               │  (公网/内网)          │   │
│   │                  │          3. 回调上报           │                      │   │
│   │  Job.run()       │ ─────────────────────────────>│  /api/jobs/callback  │   │
│   │  执行浏览器任务   │          (Local → Server)     │                      │   │
│   │                  │                               │  jobs / job_tasks    │   │
│   └────────▲─────────┘                               └──────────▲───────────┘   │
│            │                                                    │               │
│            │ 2. 下发任务                              4. 轮询状态 │               │
│            │    (UI → Local)                         (UI → Server)              │
│            │                                                    │               │
│   ┌────────┴────────────────────────────────────────────────────┴───────────┐   │
│   │                         autopilot-ui (前端浏览器)                         │   │
│   │                                                                          │   │
│   │   1. 创建 Job ──────────────────────────────────> POST /api/admin/jobs   │   │
│   │   2. 下发任务 ──────────────────────────────────> POST local/autopilot/run│   │
│   │   4. 轮询状态 ──────────────────────────────────> GET /api/admin/jobs/{id}│   │
│   │                                                                          │   │
│   └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**数据流**：

1. **UI → Server**：创建 Job 记录（状态 pending）
2. **UI → Local**：下发任务执行（携带 callback_url）
3. **Local → Server**：每个 task 完成后回调 Server 更新状态
4. **UI → Server**：轮询 Server 获取最新状态（已由 Local 回调更新）

---

## 前置：Agent 连接配置

### 功能说明

UI 首页提供 Agent（Local）连接检测入口，用户可手动输入 Local 的地址（ip:port）。
**注意**：这是前端直接访问 Local 进行检测。

```
┌─────────────────────────────────────────────────────────────────┐
│                    UI 首页                                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Agent 连接配置                                           │   │
│  │                                                           │   │
│  │  地址: [ http://127.0.0.1:8000 ]  [检测连接]              │   │
│  │                                                           │   │
│  │  状态: ✅ 已连接                                           │   │
│  │  服务: ele-autopilot-local v0.1.2                         │   │
│  │  运行时间: 2小时15分钟                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 连接检测（前端直接调用 Local）

**Local 已有接口**：`GET /system/connect`

```typescript
// 前端直接调用 Local
GET http://127.0.0.1:8000/system/connect

// 响应
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "running",
    "timestamp": "2026-02-02T12:00:00+00:00",
    "started_at": "2026-02-02T09:45:00+00:00",
    "uptime_seconds": 8100,
    "service": {
      "name": "ele-autopilot-local",
      "version": "0.1.2",
      "pid": 12345
    }
  }
}
```

### 配置存储

Agent 地址存储在浏览器 localStorage（因为是本地地址，每个用户环境可能不同）：

```typescript
// 前端存储
localStorage.setItem('agent_url', 'http://127.0.0.1:8000');

// 前端读取
const agentUrl = localStorage.getItem('agent_url') || 'http://127.0.0.1:8000';
```

---

## 一、数据库设计（autopilot-server）

### 1.0 数据模型关系

**TaskRow 结构说明**：

```
TaskRow 有两种形态：
├── sub_ids = []        → text 就是任务内容（叶子节点）
└── sub_ids = [id1,id2] → sub_ids 引用的才是任务内容（容器节点）

执行时：递归展开所有 sub_ids，最终 flat 成一个任务数组
```

**示例**：

```
TaskRow A: { id: "A", text: "登录系统", sub_ids: [] }     ← 叶子节点
TaskRow B: { id: "B", text: "查询数据", sub_ids: [] }     ← 叶子节点
TaskRow C: { id: "C", text: "", sub_ids: ["A", "B"] }     ← 容器节点

执行 TaskRow C → flat 展开 → ["登录系统", "查询数据"]
```

**数据模型关系**：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   tasks (任务定义)                                                           │
│   ├── id: "C"                                                               │
│   ├── text: ""  (容器节点，text 可忽略)                                       │
│   └── sub_ids: ["A", "B"]                                                   │
│          │                                                                   │
│          │ 执行一次                                                          │
│          ▼                                                                   │
│   jobs (执行记录)                                                            │
│   ├── id: "job-uuid"                                                        │
│   ├── task_id: "C"  ← 绑定原始 TaskRow，支持溯源                             │
│   └── status, config, ...                                                   │
│          │                                                                   │
│          │ flat 展开 sub_ids                                                 │
│          ▼                                                                   │
│   job_tasks (flat 后每个任务的执行记录)                                       │
│   ├── { task_id: "A", task_index: 0, task_text: "登录系统" }                 │
│   └── { task_id: "B", task_index: 1, task_text: "查询数据" }                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

关系总结：
• tasks 1:N jobs      — 一个 TaskRow 可被执行多次，每次产生一个 job
• jobs  1:N job_tasks — 一个 job flat 展开后包含多个 job_task
• 溯源：job.task_id → 原始 TaskRow | job_task.task_id → 这个 text 来源的 TaskRow
```

### 1.1 新增表结构

```sql
-- jobs 表：Job 执行记录（一个 TaskRow 执行一次 = 一个 Job）
-- 注：Local 侧直接使用 Server 的 job.id，不再有独立的 local_job_id
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,                     -- UUID v4，Server 和 Local 共用此 id
  task_id TEXT NOT NULL,                   -- 关联 tasks.id，表示是哪个任务（链）的执行
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | running | completed | failed
  config TEXT NOT NULL DEFAULT '{}',       -- JSON string，可扩展配置（如 max_steps, headless 等）
  created_at TEXT NOT NULL,                -- ISO 8601
  started_at TEXT,                         -- 开始执行时间
  completed_at TEXT,                       -- 完成时间
  error TEXT,                              -- 错误信息
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_task_id ON jobs(task_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);

-- job_tasks 表：flat 展开后每个任务的执行记录
-- 一个 Job 执行时会递归展开 sub_ids，flat 成任务数组，每个任务对应一条 job_task
-- 重要：result 字段存储完整的执行结果（可能非常大，包含每一步的详细信息）
CREATE TABLE IF NOT EXISTS job_tasks (
  id TEXT PRIMARY KEY,                     -- UUID v4
  job_id TEXT NOT NULL,                    -- 关联 jobs.id
  task_id TEXT NOT NULL,                   -- 来源的叶子节点 TaskRow id（必填，用于溯源）
  task_index INTEGER NOT NULL,             -- 执行顺序（0-based）
  task_text TEXT NOT NULL,                 -- 任务文本快照（执行时的快照）
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | running | completed | failed
  result TEXT,                             -- JSON: 完整执行结果（参考 task_action_out.template.json）
  error TEXT,                              -- 错误信息（status=failed 时有值）
  started_at TEXT NOT NULL,                -- 必填
  completed_at TEXT NOT NULL,              -- 必填（无论成功/失败）
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_job_tasks_job_id ON job_tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_job_tasks_status ON job_tasks(status);
```

### 1.2 类型定义

```typescript
// lib/db/types.ts 新增

type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

// config 使用 JSON string 存储，不定义具体类型
// 当前已知字段：max_steps, headless，后续可扩展
type JobConfig = Record<string, unknown>;

type JobRow = {
  id: Id; // Server 和 Local 共用此 id
  task_id: Id; // 关联 tasks.id，表示是哪个任务（链）的执行
  status: JobStatus;
  config: JobConfig; // DB 中存 JSON string，读取时解析为对象
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
};

type JobTaskRow = {
  id: Id;
  job_id: Id;
  task_id: Id; // 必填，来源的叶子节点 TaskRow id
  task_index: number;
  task_text: string;
  status: JobStatus;
  result: TaskActionResult | null; // 完整执行结果（见下方定义）
  error: string | null; // status=failed 时有值
  started_at: string; // 必填
  completed_at: string; // 必填
};

/**
 * 完整执行结果数据结构（参考 autopilot/task_action_out.template.json）
 * 重要：此数据可能非常大（包含每一步的详细信息），需要全量存储
 */
type TaskActionResult = {
  timestamp: number; // 毫秒时间戳
  runtime: {
    // 运行时信息
    python: { version: string; implementation: string };
    platform: string;
    packages: Record<string, string>;
    app: { name: string; version: string };
  };
  summary: {
    // 执行摘要
    status: string; // completed | failed | incomplete
    is_done: boolean;
    is_successful: boolean | null;
    started_at: number; // 毫秒时间戳
    completed_at: number; // 毫秒时间戳
    duration_seconds: number;
    total_steps: number;
    total_actions: number;
    step_error_count: number;
    action_error_count: number;
    final_result: string | null;
    judgement: {
      // AI 判定
      reasoning: string;
      verdict: boolean;
      failure_reason: string;
      impossible_task: boolean;
      reached_captcha: boolean;
    } | null;
    is_validated: boolean | null;
    all_extracted_content: string[]; // 所有提取的内容
    visited_urls: string[]; // 访问的 URL 列表
    action_sequence: string[]; // 动作序列
    errors: string[];
    action_errors: string[];
  };
  steps: Array<{
    // 每一步的详细信息
    step_number: number;
    url: string;
    page_title: string;
    tabs: Array<{ url: string; title: string; target_id: string }>;
    thinking: string; // LLM 思考过程
    evaluation: string; // 上一步评估
    memory: string;
    next_goal: string;
    model_output: {
      // LLM 输出
      thinking: string;
      evaluation_previous_goal: string;
      memory: string;
      next_goal: string;
      action: any[];
    };
    results: any[]; // 执行结果
    duration_seconds: number;
    step_start_time: number;
    step_end_time: number;
  }>;
  raw_history: string; // 原始历史记录
};
```

---

## 二、API 设计

### 2.1 autopilot-server（Server 侧）

#### 2.1.1 Job 管理 API

| 方法   | 端点                   | 说明                                     |
| ------ | ---------------------- | ---------------------------------------- |
| POST   | `/api/admin/jobs`      | 创建 Job 记录                            |
| GET    | `/api/admin/jobs`      | 列表查询（支持分页、过滤）               |
| GET    | `/api/admin/jobs/[id]` | 获取 Job 详情（含 tasks），UI 轮询此接口 |
| PUT    | `/api/admin/jobs/[id]` | 更新 Job（状态、错误等）                 |
| DELETE | `/api/admin/jobs/[id]` | 删除 Job                                 |

**创建 Job 请求**：

```typescript
POST /api/admin/jobs
{
  "task_id": "task-id-1",                   // 必填，要执行的任务（链）ID
  "config": {                               // 可选，默认 {}，JSON 对象，字段可扩展
    "max_steps": 12000,
    "headless": false
    // 后续可新增其他配置字段...
  }
}

// 服务端处理：
// 1. 根据 task_id 从 tasks 表查询 TaskRow
// 2. 递归展开 sub_ids，flat 成任务数组（只取叶子节点的 text）
// 3. 按顺序创建 job_tasks 记录
// 4. task_text 存储快照，task_id 记录来源（叶子节点的 id）
// 5. config 原样存储为 JSON string
```

**创建 Job 响应**：

```typescript
// 统一响应格式
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "server-job-uuid",                  // Server 和 Local 共用此 id
    "task_id": "task-id-1",                   // 关联的原始 TaskRow
    "status": "pending",
    "config": { "max_steps": 12000, "headless": false },
    "created_at": "2026-02-02T12:00:00.000Z",
    "started_at": "2026-02-02T12:00:00.000Z", // 与 created_at 相同
    "completed_at": null,
    "error": null,
    "tasks": [                                // flat 展开后的任务数组
      { "id": "jt-1", "task_id": "A", "task_index": 0, "task_text": "登录系统", "status": "pending" },
      { "id": "jt-2", "task_id": "B", "task_index": 1, "task_text": "查询数据", "status": "pending" },
      { "id": "jt-3", "task_id": "C", "task_index": 2, "task_text": "导出报表", "status": "pending" }
    ]
  }
}
```

**获取 Job 详情**（UI 轮询，状态由 Local 回调更新）：

```typescript
GET /api/admin/jobs/{job_id}

{
  "id": "server-job-uuid",                  // Server 和 Local 共用此 id
  "task_id": "task-id-1",                   // 关联的原始 TaskRow
  "status": "running",
  "config": { "max_steps": 12000, "headless": false },
  "created_at": "2026-02-02T12:00:00.000Z",
  "started_at": "2026-02-02T12:00:01.000Z",
  "completed_at": null,
  "error": null,
  "tasks": [                                // flat 展开后的任务数组
    {
      "id": "jt-1",
      "task_id": "A",                       // 来源的叶子节点 TaskRow
      "task_index": 0,
      "task_text": "登录系统",
      "status": "completed",
      "result": { "final_result": "登录成功", "duration_seconds": 5.2 },
      "started_at": "2026-02-02T12:00:01.000Z",
      "completed_at": "2026-02-02T12:00:06.200Z"
    },
    {
      "id": "jt-2",
      "task_id": "B",                       // 来源的叶子节点 TaskRow
      "task_index": 1,
      "task_text": "查询数据",
      "status": "running",
      "result": null,
      "started_at": "2026-02-02T12:00:06.200Z",
      "completed_at": null
    }
  ]
}
```

#### 2.1.2 回调接收 API（供 Local 调用）

| 方法 | 端点                               | 说明                   |
| ---- | ---------------------------------- | ---------------------- |
| POST | `/api/jobs/[id]/callback/task`     | 接收单个 task 状态更新 |
| POST | `/api/jobs/[id]/callback/complete` | 接收 job 完成通知      |

**Task 回调请求**（Local → Server）：

**重要**：`result` 字段包含完整的执行结果（参考 `task_action_out.template.json`），数据量可能非常大（包含每一步的 thinking、action、截图路径等），需要全量上传，后续在 UI 中展示。

```typescript
POST /api/jobs/{job_id}/callback/task
{
  "task_index": 0,
  "task_id": "A",                   // 必填，来源的叶子节点 TaskRow id
  "status": "completed",            // running | completed | failed
  "result": {                       // 完整执行结果（TaskActionResult 类型）
    "timestamp": 1769083263774,
    "runtime": { ... },             // 运行时信息
    "summary": {                    // 执行摘要
      "status": "completed",
      "is_done": true,
      "is_successful": true,
      "started_at": 1769083209655,
      "completed_at": 1769083258645,
      "duration_seconds": 48.99,
      "total_steps": 7,
      "total_actions": 10,
      "final_result": "任务完成...",
      "judgement": { "verdict": true, ... },
      "visited_urls": ["https://..."],
      "action_sequence": ["navigate", "input", "click", ...],
      ...
    },
    "steps": [                      // 每一步的详细信息（可能很多）
      {
        "step_number": 1,
        "url": "https://...",
        "thinking": "LLM 思考过程...",
        "model_output": { ... },
        "results": [ ... ],
        "duration_seconds": 10.72,
        ...
      },
      ...
    ],
    "raw_history": "..."            // 原始历史记录
  },
  "error": null,                    // status=failed 时有值（与 result 互斥）
  "started_at": "2026-02-02T12:00:01.000Z",   // 必填
  "completed_at": "2026-02-02T12:00:16.500Z"  // 必填（无论成功/失败都有值）
}

// 响应
{ "code": 0, "message": "success", "data": null }
```

**Job 完成回调请求**（Local → Server）：

```typescript
POST /api/jobs/{job_id}/callback/complete
{
  "status": "completed",            // completed | failed
  "error": null,                    // status=failed 时有值
  "completed_at": "2026-02-02T12:01:00.000Z"  // 必填
}

// 响应
{ "code": 0, "message": "success", "data": null }
```

---

### 2.2 autopilot-local（Local 侧）

#### 2.2.0 现状背景与调整方向

**现状**：

- Local 当前有自己的 `job_id`（由 Local 自己生成 UUID）
- 这是因为 Local 开发时还没有 Server，所以自行管理 job 标识

**调整方向**：

- `job_id` 请求参数改为**可选**
- **Server 调用场景**：使用 Server 传入的 `job_id`
- **Local 独立运行场景**：如果没传 `job_id`，Local 自己生成一个 UUID
- 最终 Local 内存中的 job **一定有 `job_id`**

**处理逻辑**：

```python
# Local 内部处理
if request.job_id:
    job_id = request.job_id        # 使用 Server 传入的
else:
    job_id = str(uuid.uuid4())     # 自己生成
```

**好处**：

- 与 Server 联动时，两侧使用统一的 job 标识
- 保持 Local 独立运行能力（开发、测试场景）
- 回调时直接用 `job_id`，无需映射

#### 2.2.1 扩展现有 API

**扩展 `/autopilot/run` 请求体**：

```python
# schemas/autopilot.py

class TaskInput(BaseModel):
    """单个任务输入"""
    id: str                     # 来源的叶子节点 TaskRow id（必填）
    text: str                   # 任务文本

class AutopilotRunRequest(BaseModel):
    """扩展后的运行请求"""
    job_id: str | None = None           # 可选，Server 传入则使用，否则 Local 自己生成
    tasks: list[TaskInput]              # flat 展开后的任务数组
    callback_url: str | None = None     # 可选，有则回调 Server，无则不回调
    config: dict = {}                   # 可选，默认空对象
```

**请求示例**（UI → Local）：

```json
POST http://127.0.0.1:8000/autopilot/run
{
  "job_id": "server-job-uuid",
  "tasks": [                                // flat 展开后的任务数组
    { "id": "A", "text": "登录系统" },       // id 是来源的叶子节点 TaskRow
    { "id": "B", "text": "查询数据" },
    { "id": "C", "text": "导出报表" }
  ],
  "callback_url": "http://server-host:3000/api/jobs/server-job-uuid/callback",
  "config": {
    "max_steps": 12000,
    "headless": false
  }
}
```

**响应**（立即返回）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "job_id": "server-job-uuid", // 直接使用 Server 传入的 job_id
    "status": "pending"
  }
}
```

#### 2.2.2 扩展 TaskResult

```python
# autopilot/task.py

@dataclass
class TaskResult:
    """扩展后的任务结果"""
    task: str                        # 任务文本
    task_id: str                     # 来源的叶子节点 TaskRow id（必填）
    task_index: int                  # 任务索引（在 flat 数组中的位置）
    status: TaskStatus
    started_at: datetime | None
    completed_at: datetime | None
    result: Any
    error: str | None
```

#### 2.2.3 新增回调逻辑（Local → Server）

```python
# autopilot/callback.py

import httpx
from datetime import datetime

class CallbackClient:
    """回调客户端（Local 主动回调 Server）"""

    def __init__(self, callback_url: str | None):
        self.callback_url = callback_url
        self.client = httpx.AsyncClient(timeout=10.0) if callback_url else None

    async def report_task_update(
        self,
        task_index: int,
        task_id: str,                           # 必填
        status: str,
        result: dict | None = None,             # 完整执行结果（TaskActionResult）
        error: str | None = None,
        started_at: datetime,                   # 必填
        completed_at: datetime,                 # 必填
    ):
        """
        上报单个 task 状态到 Server

        重要：result 包含完整的执行结果（参考 task_action_out.template.json），
        数据量可能很大，但需要全量上传，后续在 UI 中展示。
        """
        if not self.client:
            return

        payload = {
            "task_index": task_index,
            "task_id": task_id,
            "status": status,
            "result": result,                   # 完整执行结果（可能很大）
            "error": error,
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
        }

        try:
            await self.client.post(f"{self.callback_url}/task", json=payload)
        except Exception as e:
            # 回调失败不影响任务执行，仅记录日志
            logger.warning(f"Callback failed: {e}")

    async def report_job_complete(
        self,
        status: str,
        error: str | None = None,
        completed_at: datetime | None = None,
    ):
        """上报 Job 完成到 Server"""
        if not self.client:
            return

        payload = {
            "status": status,
            "error": error,
            "completed_at": completed_at.isoformat() if completed_at else None,
        }

        try:
            await self.client.post(f"{self.callback_url}/complete", json=payload)
        except Exception as e:
            logger.warning(f"Job complete callback failed: {e}")

    async def close(self):
        if self.client:
            await self.client.aclose()
```

#### 2.2.4 修改 Job.run() 集成回调

```python
# autopilot/job.py

from autopilot.task_action import TaskActionHandler

async def run(self, callback_url: str | None = None) -> None:
    """执行 Job，支持回调到 Server"""
    callback = CallbackClient(callback_url)

    try:
        self.started_at = datetime.now()
        self.status = TaskStatus.RUNNING

        runner = TaskRunner(config=self.config)

        for index, task_result in enumerate(self.tasks):
            task_result.task_index = index
            task_result.status = TaskStatus.RUNNING
            task_result.started_at = datetime.now()

            # 上报 task 开始到 Server（此时 result 为 None）
            await callback.report_task_update(
                task_index=index,
                task_id=task_result.task_id,
                status="running",
                result=None,
                started_at=task_result.started_at,
                completed_at=task_result.started_at,  # 临时值
            )

            try:
                # 执行任务
                agent_result = await runner.run(task_result.task)
                task_result.status = TaskStatus.COMPLETED
                task_result.completed_at = datetime.now()

                # 重要：提取完整执行结果（参考 task_action_out.template.json）
                handler = TaskActionHandler(agent_result.history)
                task_result.result = handler.to_cloud_payload()

            except Exception as e:
                task_result.status = TaskStatus.FAILED
                task_result.error = str(e)
                task_result.completed_at = datetime.now()
                task_result.result = None

            # 上报 task 完成到 Server（携带完整执行结果）
            await callback.report_task_update(
                task_index=index,
                task_id=task_result.task_id,
                status=task_result.status.value,
                result=task_result.result,          # 完整执行结果（可能很大）
                error=task_result.error,
                started_at=task_result.started_at,
                completed_at=task_result.completed_at,
            )

        self._update_status()
        self.completed_at = datetime.now()

        # 上报 Job 完成到 Server
        await callback.report_job_complete(
            status=self.status.value,
            completed_at=self.completed_at,
        )

    except Exception as e:
        self.status = TaskStatus.FAILED
        self.error = str(e)
        self.completed_at = datetime.now()

        await callback.report_job_complete(
            status="failed",
            error=str(e),
            completed_at=self.completed_at,
        )

    finally:
        await callback.close()
```

---

## 三、前端执行流程

### 3.1 完整执行流程

```typescript
// app/admin/_services/job-executor.ts

class JobExecutor {
  private serverApi: ServerApi;
  private localUrl: string;
  private serverUrl: string;
  private pollingInterval: number = 2000; // 2秒

  constructor() {
    this.serverApi = new ServerApi();
    this.localUrl = localStorage.getItem('agent_url') || 'http://127.0.0.1:8000';
    this.serverUrl = window.location.origin; // 或从配置读取
  }

  /**
   * 执行 Job 完整流程
   */
  async executeJob(params: {
    taskId: string; // 要执行的任务（链）ID
    config?: JobConfig;
  }): Promise<string> {
    // 1. 在 Server 创建 Job 记录
    const serverJob = await this.serverApi.createJob(params);

    try {
      // 2. 下发任务到 Local（携带 job_id 和 callback_url）
      //    Local 使用 Server 的 job_id，不再自己生成
      await this.dispatchToLocal(serverJob);

      // 3. 返回 job_id，UI 可开始轮询 Server 获取状态
      return serverJob.id;
    } catch (error) {
      // 下发失败，更新 Server Job 状态
      await this.serverApi.updateJob(serverJob.id, {
        status: 'failed',
        error: `下发失败: ${error.message}`,
        completed_at: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * 下发任务到 Local
   * callback_url 指向 Server，Local 执行时会直接回调 Server
   */
  private async dispatchToLocal(serverJob: Job): Promise<{ job_id: string }> {
    const callbackUrl = `${this.serverUrl}/api/jobs/${serverJob.id}/callback`;

    const response = await fetch(`${this.localUrl}/autopilot/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: serverJob.id,
        tasks: serverJob.tasks.map((t) => ({ id: t.task_id, text: t.task_text })),
        callback_url: callbackUrl, // Local 会回调这个地址
        config: serverJob.config, // 直接透传 config 对象
      }),
    });

    const result = await response.json();
    if (result.code !== 0) throw new Error(result.message);
    return result.data;
  }

  /**
   * 轮询 Server 获取 Job 状态（状态由 Local 回调更新）
   */
  async pollJobStatus(jobId: string, onUpdate: (job: Job) => void): Promise<Job> {
    while (true) {
      const job = await this.serverApi.getJob(jobId);
      onUpdate(job);

      if (job.status === 'completed' || job.status === 'failed') {
        return job;
      }

      await new Promise((resolve) => setTimeout(resolve, this.pollingInterval));
    }
  }
}
```

### 3.2 状态同步时序图

```
┌──────┐          ┌──────┐          ┌───────┐
│  UI  │          │Server│          │ Local │
└──┬───┘          └──┬───┘          └───┬───┘
   │                 │                  │
   │ 1. POST /jobs   │                  │
   │ ───────────────>│                  │
   │ <─ job created ─│  (返回 job_id)   │
   │                 │                  │
   │ 2. POST /autopilot/run             │
   │    (job_id, callback_url)          │
   │ ──────────────────────────────────>│
   │ <────────── ok ───────────────────│  (Local 使用 Server 的 job_id)
   │                 │                  │
   │                 │   3. 执行任务     │
   │                 │                  │
   │                 │ 4. POST callback/task
   │                 │ <────────────────│
   │                 │    (状态更新)     │
   │                 │                  │
   │ 5. GET /jobs/{id}                  │
   │ ───────────────>│                  │
   │ <─ job status ──│                  │
   │    (已由回调更新)                   │
   │                 │                  │
   │                 │ 6. POST callback/complete
   │                 │ <────────────────│
   │                 │                  │
   │ 7. GET /jobs/{id}                  │
   │ ───────────────>│                  │
   │ <─ completed ───│                  │
   │                 │                  │
```

**关键点**：

- Local 直接使用 Server 的 `job_id`，两侧统一标识
- 步骤 4、6：Local 直接回调 Server（不经过 UI）
- 步骤 5、7：UI 轮询 Server，获取的是已被 Local 回调更新的状态

---

## 四、文件改动清单

### 4.1 autopilot-server（Server）

| 文件                                           | 操作 | 说明                              |
| ---------------------------------------------- | ---- | --------------------------------- |
| `lib/db/connection.ts`                         | 修改 | 添加 jobs、job_tasks 建表语句     |
| `lib/db/types.ts`                              | 修改 | 添加 JobRow、JobTaskRow 类型      |
| `lib/db/jobs.ts`                               | 新增 | jobs 表 CRUD 操作                 |
| `lib/db/job-tasks.ts`                          | 新增 | job_tasks 表 CRUD 操作            |
| `lib/db/index.ts`                              | 修改 | 导出新模块                        |
| `app/api/admin/jobs/route.ts`                  | 新增 | Job 列表/创建 API                 |
| `app/api/admin/jobs/[id]/route.ts`             | 新增 | Job 详情/更新/删除 API            |
| `app/api/jobs/[id]/callback/task/route.ts`     | 新增 | Task 回调接收（供 Local 调用）    |
| `app/api/jobs/[id]/callback/complete/route.ts` | 新增 | Job 完成回调接收（供 Local 调用） |

### 4.2 autopilot-ui（前端）

| 文件                                           | 操作 | 说明                         |
| ---------------------------------------------- | ---- | ---------------------------- |
| `app/admin/_components/agent-connect-card.tsx` | 新增 | Agent 连接配置 UI 组件       |
| `app/admin/_services/job-executor.ts`          | 新增 | Job 执行器（协调下发和轮询） |
| `app/admin/_services/local-api.ts`             | 新增 | Local API 客户端             |
| `app/admin/_hooks/use-agent-connection.ts`     | 新增 | Agent 连接状态 Hook          |
| `app/admin/_components/job-panel.tsx`          | 新增 | Job 执行面板组件             |
| `app/admin/_components/job-progress.tsx`       | 新增 | Job 进度展示组件             |

### 4.3 autopilot-local（Local）

| 文件                       | 操作 | 说明                                                                |
| -------------------------- | ---- | ------------------------------------------------------------------- |
| `schemas/autopilot.py`     | 新增 | TaskInput、扩展 AutopilotRunRequest                                 |
| `autopilot/task.py`        | 修改 | TaskResult 添加 task_id、task_index                                 |
| `autopilot/task_action.py` | 已有 | TaskActionHandler 提取完整执行结果（to_cloud_payload）              |
| `autopilot/callback.py`    | 新增 | CallbackClient 回调客户端，发送完整执行结果                         |
| `autopilot/job.py`         | 修改 | Job.run() 集成回调逻辑；使用 Server 传入的 job_id；获取完整执行结果 |
| `autopilot/job_service.py` | 修改 | create_job 接收 Server 的 job_id 和 callback_url                    |
| `routers/autopilot.py`     | 修改 | 解析扩展请求体                                                      |

---

## 五、实施步骤

### 阶段〇：Agent 连接配置

**目标**：UI 能检测并保存 Local 地址（存 localStorage）

1. **前端 UI**
   - [ ] 新增 `agent-connect-card.tsx` 组件
   - [ ] 实现地址输入和连接检测（直接调用 Local `/system/connect`）
   - [ ] 连接状态存储到 localStorage
   - [ ] 在首页集成 Agent 连接配置卡片

2. **联调测试**
   - [ ] 输入 Local 地址，点击检测连接
   - [ ] 验证连接成功/失败状态显示
   - [ ] 刷新页面后配置仍保留

### 阶段一：Server 数据层

**目标**：Server 能存储 Job 记录和接收回调

1. **autopilot-server**
   - [ ] 添加 jobs、job_tasks 表结构
   - [ ] 实现 jobs、job_tasks CRUD API
   - [ ] 实现回调接收 API（`/api/jobs/[id]/callback/task`、`complete`）

2. **联调测试**
   - [ ] 手动调用回调 API 验证状态更新

### 阶段二：Local 回调机制

**目标**：Local 执行时能回调 Server 更新状态

1. **autopilot-local**
   - [ ] 扩展 AutopilotRunRequest 支持 job_id、tasks[{id, text}]、callback_url、config
   - [ ] 实现 CallbackClient
   - [ ] Job.run() 集成回调逻辑

2. **联调测试**
   - [ ] 手动调用 Local `/autopilot/run`（带 callback_url）
   - [ ] 验证 Local 回调 Server 更新状态

### 阶段三：前端执行器

**目标**：UI 能协调完成完整执行流程

1. **前端 UI**
   - [ ] 实现 `job-executor.ts` 执行器
   - [ ] 实现下发到 Local（携带 callback_url）
   - [ ] 实现轮询 Server 状态

2. **联调测试**
   - [ ] 完整执行流程测试
   - [ ] Local 断开后的错误处理

### 阶段四：Job 管理 UI

**目标**：前端展示 Job 列表和执行进度

1. **前端 UI**
   - [ ] 新增 Job 管理页面
   - [ ] 新增 Job 执行面板组件
   - [ ] 新增 Job 进度展示组件
   - [ ] 支持从任务列表创建 Job

---

## 六、接口协议汇总

### UI → Local（连接检测）

```
GET http://{local_url}/system/connect

// 响应（Local 统一响应格式）
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "running",
    "service": { "name": "ele-autopilot-local", "version": "0.1.2" }
  }
}
```

### UI → Server（创建 Job）

```
POST http://{server_url}/api/admin/jobs
Content-Type: application/json

{
  "task_id": "task-id-1",                   // 要执行的 TaskRow ID
  "config": { "max_steps": 12000, "headless": false }
}

// 响应（统一格式）
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "server-job-uuid",
    "task_id": "task-id-1",
    "status": "pending",
    "tasks": [...]                          // flat 展开后的任务数组
  }
}
```

### UI → Local（下发任务）

```
POST http://{local_url}/autopilot/run
Content-Type: application/json

{
  "job_id": "server-job-id",
  "tasks": [                                // flat 展开后的任务数组
    { "id": "A", "text": "登录系统" },       // id 是来源的叶子节点 TaskRow
    { "id": "B", "text": "查询数据" },
    { "id": "C", "text": "导出报表" }
  ],
  "callback_url": "http://{server_url}/api/jobs/{job_id}/callback",
  "config": {
    "max_steps": 12000,
    "headless": false
  }
}

// 响应（Local 统一响应格式）
{
  "code": 0,
  "message": "success",
  "data": { "job_id": "server-job-uuid", "status": "pending" }
}
```

### Local → Server（Task 回调）

```
POST http://{server_url}/api/jobs/{job_id}/callback/task
Content-Type: application/json

{
  "task_index": 0,
  "task_id": "A",                           // 来源的叶子节点 TaskRow
  "status": "completed",
  "result": { ... },
  "error": null,
  "started_at": "2026-02-02T12:00:01.000Z",
  "completed_at": "2026-02-02T12:00:10.000Z"
}
```

### Local → Server（Job 完成回调）

```
POST http://{server_url}/api/jobs/{job_id}/callback/complete
Content-Type: application/json

{
  "status": "completed",
  "error": null,
  "completed_at": "2026-02-02T12:01:00.000Z"
}
```

### UI → Server（轮询状态）

```
GET http://{server_url}/api/admin/jobs/{job_id}

// 响应（统一格式，状态由 Local 回调更新）
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "server-job-uuid",
    "task_id": "task-id-1",                 // 关联的原始 TaskRow
    "status": "running",
    "created_at": "2026-02-02T12:00:00.000Z",
    "started_at": "2026-02-02T12:00:00.000Z",
    "completed_at": null,
    "error": null,
    "tasks": [                              // flat 展开后的任务数组
      { "task_index": 0, "task_id": "A", "status": "completed", "result": {...}, "error": null },
      { "task_index": 1, "task_id": "B", "status": "running", "result": null, "error": null }
    ]
  }
}
```

---

## 七、错误处理

### Local 连接失败（UI → Local）

前端检测到 Local 不可达时：

- 显示连接失败提示
- 禁用 Job 执行功能
- 引导用户检查 Local 服务是否启动

### 回调失败（Local → Server）

Local 回调 Server 失败时：

- 记录警告日志，不中断任务执行
- UI 轮询 Server 时可能看到状态未更新
- 可通过 UI 手动查询 Local 状态进行补偿（后续扩展）

### 下发失败（UI → Local）

UI 下发任务到 Local 失败时：

- 更新 Server Job 状态为 failed
- UI 显示错误信息
- 支持重试

### 浏览器关闭/刷新

- Local 侧任务会继续执行并回调 Server
- 重新打开页面后，从 Server 查看 Job 状态
- 状态是最新的（因为 Local 一直在回调 Server）

---

## 八、状态与时间字段规范

### 8.1 Job 状态更新逻辑

**状态聚合规则**（参考 Local 现有实现）：

```python
# 优先级：RUNNING > COMPLETED > FAILED > PENDING
def _update_status(self):
    if any(t.status == RUNNING for t in self.tasks):
        self.status = RUNNING
    elif all(t.status == COMPLETED for t in self.tasks):
        self.status = COMPLETED
    elif any(t.status == FAILED for t in self.tasks):
        self.status = FAILED
    else:
        self.status = PENDING
```

| 条件                           | Job 状态    |
| ------------------------------ | ----------- |
| 任一 task 正在运行             | `running`   |
| 所有 task 都完成               | `completed` |
| 任一 task 失败（且无 running） | `failed`    |
| 其他情况                       | `pending`   |

**关键点**：

- 单个 task 失败**不中断**其他 task 执行（串行继续）
- 只要有一个 task 失败，Job 最终状态为 `failed`

### 8.2 时间字段规范

**Server 侧（jobs / job_tasks 表）**：

| 字段                    | 设置时机                                 | 是否必填       |
| ----------------------- | ---------------------------------------- | -------------- |
| `job.created_at`        | Server 创建 Job 时                       | 必填           |
| `job.started_at`        | Server 创建 Job 时（与 created_at 相同） | 必填           |
| `job.completed_at`      | 收到 Job 完成回调时更新                  | 执行完成后必填 |
| `job_task.started_at`   | 收到 task 回调时更新                     | 必填           |
| `job_task.completed_at` | 收到 task 回调时更新                     | 必填           |

**Local 侧（内存中的 Job/TaskResult）**：

| 字段                | 设置时机                     | 说明                |
| ------------------- | ---------------------------- | ------------------- |
| `job.created_at`    | `create_job()` 时            | 自动设置            |
| `job.started_at`    | `run()` 入口                 | 实际开始执行时      |
| `job.completed_at`  | `run()` finally 块           | 执行完成时          |
| `task.started_at`   | 任务开始执行前               | 每个 task 单独记录  |
| `task.completed_at` | 任务执行完成后（finally 块） | 无论成功/失败都设置 |

### 8.3 result 与 error 互斥

```typescript
// 成功时
{ status: "completed", result: {...}, error: null }

// 失败时
{ status: "failed", result: null, error: "错误信息" }
```

---

## 九、Server API 响应格式规范

参考 Local 现有的统一响应格式：

### 9.1 成功响应

```typescript
{
  "code": 0,
  "message": "success",
  "data": { ... }  // 实际数据
}
```

### 9.2 错误响应

```typescript
// HTTP 异常
{
  "code": 404,
  "message": "Job not found",
  "data": null
}

// 请求验证错误
{
  "code": 422,
  "message": "Validation Error",
  "data": { "errors": ["task_id is required"] }
}

// 服务器内部错误
{
  "code": 500,
  "message": "Internal Server Error",
  "data": null
}
```

### 9.3 回调 API 响应

```typescript
// 回调成功
{ "code": 0, "message": "success", "data": null }

// Job 不存在
{ "code": 404, "message": "Job not found", "data": null }

// task_index 越界
{ "code": 400, "message": "Invalid task_index", "data": null }
```

---

## 十、执行结果数据规范

### 10.1 完整执行结果（TaskActionResult）

**重要**：每个 job-task 执行完成后，需要将完整的执行结果上传到 Server。这些数据非常重要，后续在 autopilot-ui 中需要展示。

**数据来源**：参考 `autopilot/task_action_out.template.json`

**数据结构**：

```
TaskActionResult
├── timestamp          # 时间戳
├── runtime            # 运行时信息（Python、平台、包版本、应用版本）
├── summary            # 执行摘要
│   ├── status         # completed | failed | incomplete
│   ├── is_done, is_successful
│   ├── started_at, completed_at, duration_seconds
│   ├── total_steps, total_actions
│   ├── step_error_count, action_error_count
│   ├── final_result   # 最终结果文本
│   ├── judgement      # AI 判定（reasoning、verdict、failure_reason）
│   ├── all_extracted_content  # 提取的所有内容
│   ├── visited_urls   # 访问的 URL 列表
│   ├── action_sequence # 动作序列
│   └── errors, action_errors
├── steps[]            # 每一步的详细信息（可能很多）
│   ├── step_number, url, page_title, tabs
│   ├── thinking       # LLM 思考过程
│   ├── evaluation     # 上一步评估
│   ├── memory, next_goal
│   ├── model_output   # LLM 输出（thinking、action 等）
│   ├── results        # 执行结果
│   └── duration_seconds, step_start_time, step_end_time
└── raw_history        # 原始历史记录
```

### 10.2 数据量说明

- 单个 task 的执行结果可能有 **几十 KB 到几百 KB**
- 主要取决于执行步骤数量（steps 数组）
- **必须全量存储**，不能截断或压缩（UI 需要展示完整信息）

### 10.3 UI 展示需求

在 autopilot-ui 中需要展示的关键信息：

| 信息          | 来源字段                                       |
| ------------- | ---------------------------------------------- |
| 执行状态      | `summary.status`, `summary.is_successful`      |
| 执行时长      | `summary.duration_seconds`                     |
| 步骤数/动作数 | `summary.total_steps`, `summary.total_actions` |
| 最终结果      | `summary.final_result`                         |
| AI 判定       | `summary.judgement`                            |
| 访问的 URL    | `summary.visited_urls`                         |
| 动作序列      | `summary.action_sequence`                      |
| 每一步详情    | `steps[]`（thinking、action、results）         |
| 错误信息      | `summary.errors`, `summary.action_errors`      |
