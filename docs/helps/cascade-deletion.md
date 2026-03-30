# 级联删除行为说明

本文档描述 folder、subfolder、task、chain 各节点删除时的级联行为。

## 数据关系

```
folder (parent_id) → subfolder (递归层级)
folder → task (folder_id)
task → chain (sub_ids: task ID 数组，无外键约束)
task/chain → job (task_id, ON DELETE CASCADE) → job_tasks (job_id, ON DELETE CASCADE)
```

## 执行历史的存储设计

`job_tasks` 采用快照式存储，创建 job 时将 `task_title`、`task_text` 拷贝到 `job_tasks` 中。执行历史的展示不依赖原始 task 记录。

- `job_tasks.task_id`：纯记录字段，**无外键约束**到 `tasks` 表
- `job_tasks` 唯一外键：`job_id → jobs(id) ON DELETE CASCADE`
- `jobs.task_id`：**有外键约束**到 `tasks(id) ON DELETE CASCADE`

因此执行历史的生命周期跟随其所属的 task/chain，task/chain 删除时历史自动级联清理。

## 删除场景

### 1. 删除 Folder

<!-- prettier-ignore -->
| 级联对象 | 是否删除 | 说明 |
| --- | --- | --- |
| 所有后代 subfolder | 是 | 递归 CTE 查找，按深度从叶子到根逐个删除 |
| 所有后代 folder 下的 task | 是 | 批量删除 |
| 相关 task 的 jobs + job_tasks | 是 | `jobs.task_id` 外键 `ON DELETE CASCADE` 级联清理 |
| 其他 folder 中 task 的 `sub_ids` 引用 | 否 | 悬空引用，运行时安全跳过（见下方说明） |

代码入口：`lib/db/folders.ts` — `deleteFolderById`

### 2. 删除 Task（单个 task 或 chain）

<!-- prettier-ignore -->
| 级联对象 | 是否删除 | 说明 |
| --- | --- | --- |
| 该 task 的 jobs + job_tasks | 是 | `jobs.task_id` 外键 `ON DELETE CASCADE` 级联清理 |
| `sub_ids` 引用的子 task | 否 | 子 task 保持不变，不受影响 |
| 其他 chain 的 `sub_ids` 引用 | 否 | 悬空引用，运行时安全跳过（见下方说明） |
| 引用该 task 的其他 chain 的执行历史 | 否 | 历史是快照，不受子 task 删除影响 |

代码入口：`lib/db/tasks.ts` — `deleteTaskById`

### 场景示例

```
ChainA.sub_ids = [TaskB, TaskC]
```

- 删除 TaskB → ChainA 及其执行历史**不受影响**（历史中 TaskB 的数据是快照）
- 删除 ChainA → ChainA 的 jobs/job_tasks 级联删除，TaskB、TaskC **不受影响**
- 删除 FolderX（含 TaskB）→ TaskB 被删，ChainA **不受影响**

## 悬空 sub_ids 引用的处理

当 task 被删除后，其他 task 的 `sub_ids` 中可能残留已删除的 task ID。这不会造成问题：

`lib/db/jobs.ts` — `flattenTaskTree` 在展开 chain 时，对每个 sub_id 调用 `getTaskById`，若返回 `null`（task 已不存在）则直接跳过，不会报错或中断执行。

```typescript
const task = getTaskById(taskId);
if (!task) return []; // 安全跳过
```
