import type {
  Id,
  JobConfig,
  JobDbRow,
  JobRow,
  JobStatus,
  JobTaskDbRow,
  JobTaskLiteRow,
  JobTaskRow,
  JobWithTasks,
  JobWithTasksLite,
  ListPageArgs,
  TaskActionResult,
  TaskRow,
} from './types';
import { generateId, isRecord, isValidId, queryAll, queryGet, queryRun } from './utils';
import { getTaskById } from './tasks';

// ============ 辅助函数 ============

function ensureTaskExists(taskId: Id) {
  const exists = queryGet<{ ok: 1 }>(`SELECT 1 as ok FROM tasks WHERE id = ?`, [taskId]);
  if (!exists) throw new Error('Invalid task_id');
}

function parseConfig(raw: string): JobConfig {
  try {
    const value = JSON.parse(raw) as unknown;
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function parseResult(raw: string | null): TaskActionResult | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TaskActionResult;
  } catch {
    return null;
  }
}

function toJobRow(dbRow: JobDbRow): JobRow {
  return {
    id: dbRow.id,
    task_id: dbRow.task_id,
    status: dbRow.status as JobStatus,
    config: parseConfig(dbRow.config),
    created_at: dbRow.created_at,
    started_at: dbRow.started_at,
    completed_at: dbRow.completed_at,
    error: dbRow.error,
  };
}

function toJobTaskRow(dbRow: JobTaskDbRow): JobTaskRow {
  return {
    id: dbRow.id,
    job_id: dbRow.job_id,
    task_id: dbRow.task_id,
    task_index: dbRow.task_index,
    task_title: dbRow.task_title ?? null,
    task_text: dbRow.task_text,
    status: dbRow.status as JobStatus,
    result: parseResult(dbRow.result),
    error: dbRow.error,
    started_at: dbRow.started_at,
    completed_at: dbRow.completed_at,
  };
}

/**
 * 转换为轻量版 JobTaskRow（只包含 summary，不含完整 result）
 */
function toJobTaskLiteRow(dbRow: JobTaskDbRow): JobTaskLiteRow {
  const result = parseResult(dbRow.result);
  return {
    id: dbRow.id,
    job_id: dbRow.job_id,
    task_id: dbRow.task_id,
    task_index: dbRow.task_index,
    task_title: dbRow.task_title ?? null,
    task_text: dbRow.task_text,
    status: dbRow.status as JobStatus,
    result_summary: result?.summary ?? null,
    error: dbRow.error,
    started_at: dbRow.started_at,
    completed_at: dbRow.completed_at,
  };
}

/**
 * 递归展开 TaskRow 的 sub_ids，返回所有叶子节点（flat 任务数组）
 * 叶子节点：sub_ids 为空的 TaskRow
 */
function flattenTaskTree(
  taskId: Id,
  visited: Set<Id> = new Set(),
): Array<{ id: Id; title: string | null; text: string }> {
  if (visited.has(taskId)) return []; // 防止循环引用
  visited.add(taskId);

  const task = getTaskById(taskId);
  if (!task) return [];

  // 叶子节点：没有 sub_ids
  if (!task.sub_ids || task.sub_ids.length === 0) {
    return [{ id: task.id, title: task.title ?? null, text: task.text }];
  }

  // 容器节点：递归展开所有 sub_ids
  const result: Array<{ id: Id; title: string | null; text: string }> = [];
  for (const subId of task.sub_ids) {
    result.push(...flattenTaskTree(subId, visited));
  }
  return result;
}

// ============ Job CRUD ============

export function getJobById(id: Id): JobRow | null {
  const row = queryGet<JobDbRow>(
    `
      SELECT id, task_id, status, config, created_at, started_at, completed_at, error
      FROM jobs
      WHERE id = ?
    `,
    [id],
  );
  if (!row) return null;
  return toJobRow(row);
}

export function getJobWithTasks(id: Id): JobWithTasks | null {
  const job = getJobById(id);
  if (!job) return null;

  const taskRows = queryAll<JobTaskDbRow>(
    `
      SELECT id, job_id, task_id, task_index, task_title, task_text, status, result, error, started_at, completed_at
      FROM job_tasks
      WHERE job_id = ?
      ORDER BY task_index ASC
    `,
    [id],
  );

  return {
    ...job,
    tasks: taskRows.map(toJobTaskRow),
  };
}

/**
 * 获取 Job 详情（轻量版，tasks 只包含 summary 摘要）
 * 用于列表展示和轮询，减少数据传输量
 */
export function getJobWithTasksLite(id: Id): JobWithTasksLite | null {
  const job = getJobById(id);
  if (!job) return null;

  const taskRows = queryAll<JobTaskDbRow>(
    `
      SELECT id, job_id, task_id, task_index, task_title, task_text, status, result, error, started_at, completed_at
      FROM job_tasks
      WHERE job_id = ?
      ORDER BY task_index ASC
    `,
    [id],
  );

  return {
    ...job,
    tasks: taskRows.map(toJobTaskLiteRow),
  };
}

export function listJobsPage(args: ListPageArgs): JobRow[] {
  const { limit, offset, filter } = args;
  const where: string[] = [];
  const params: unknown[] = [];

  if (isRecord(filter)) {
    if (isValidId(filter.task_id)) {
      where.push(`task_id = ?`);
      params.push(filter.task_id);
    }
    if (
      typeof filter.status === 'string' &&
      ['pending', 'running', 'completed', 'failed'].includes(filter.status)
    ) {
      where.push(`status = ?`);
      params.push(filter.status);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const finalParams = [...params, Math.max(1, limit), Math.max(0, offset)];

  const rows = queryAll<JobDbRow>(
    `
      SELECT id, task_id, status, config, created_at, started_at, completed_at, error
      FROM jobs
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
    finalParams,
  );
  return rows.map(toJobRow);
}

export function countJobs(filter?: Record<string, unknown>): number {
  const where: string[] = [];
  const params: unknown[] = [];

  if (isRecord(filter)) {
    if (isValidId(filter.task_id)) {
      where.push(`task_id = ?`);
      params.push(filter.task_id);
    }
    if (
      typeof filter.status === 'string' &&
      ['pending', 'running', 'completed', 'failed'].includes(filter.status)
    ) {
      where.push(`status = ?`);
      params.push(filter.status);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const row = queryGet<{ total: number }>(`SELECT COUNT(1) as total FROM jobs ${whereSql}`, params);
  return row?.total ?? 0;
}

/**
 * 创建 Job
 * 1. 根据 task_id 查询 TaskRow
 * 2. 递归展开 sub_ids，flat 成任务数组
 * 3. 创建 job 记录
 * 4. 按顺序创建 job_tasks 记录
 */
export function createJob(input: { task_id: Id; config?: JobConfig }): JobWithTasks {
  const taskId = input.task_id;
  if (!isValidId(taskId)) throw new Error('Invalid task_id');
  ensureTaskExists(taskId);

  const config = input.config ?? {};
  const now = new Date().toISOString();
  const jobId = generateId();

  // 递归展开 sub_ids，获取所有叶子节点
  const flatTasks = flattenTaskTree(taskId);
  if (flatTasks.length === 0) {
    // 如果 task 本身就是叶子节点，直接使用它
    const task = getTaskById(taskId);
    if (task) {
      flatTasks.push({ id: task.id, title: task.title ?? null, text: task.text });
    }
  }

  if (flatTasks.length === 0) {
    throw new Error('No tasks to execute');
  }

  // 创建 job 记录
  queryRun(
    `INSERT INTO jobs (id, task_id, status, config, created_at, started_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [jobId, taskId, 'pending', JSON.stringify(config), now, now],
  );

  // 创建 job_tasks 记录
  for (let i = 0; i < flatTasks.length; i++) {
    const ft = flatTasks[i];
    const jtId = generateId();
    queryRun(
      `INSERT INTO job_tasks (id, job_id, task_id, task_index, task_title, task_text, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [jtId, jobId, ft.id, i, ft.title, ft.text, 'pending'],
    );
  }

  const result = getJobWithTasks(jobId);
  if (!result) throw new Error('Failed to create job');
  return result;
}

export function updateJobById(
  id: Id,
  patch: {
    status?: JobStatus;
    error?: string | null;
    started_at?: string;
    completed_at?: string;
  },
): JobRow | null {
  const existing = getJobById(id);
  if (!existing) return null;

  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (patch.status !== undefined) {
    setClauses.push('status = ?');
    params.push(patch.status);
  }
  if (patch.error !== undefined) {
    setClauses.push('error = ?');
    params.push(patch.error);
  }
  if (patch.started_at !== undefined) {
    setClauses.push('started_at = ?');
    params.push(patch.started_at);
  }
  if (patch.completed_at !== undefined) {
    setClauses.push('completed_at = ?');
    params.push(patch.completed_at);
  }

  if (setClauses.length === 0) return existing;

  params.push(id);
  queryRun(`UPDATE jobs SET ${setClauses.join(', ')} WHERE id = ?`, params);

  return getJobById(id);
}

export function deleteJobById(id: Id): number {
  // job_tasks 会通过 ON DELETE CASCADE 自动删除
  const result = queryRun(`DELETE FROM jobs WHERE id = ?`, [id]);
  return result.changes;
}

// ============ JobTask 相关 ============

export function getJobTasksByJobId(jobId: Id): JobTaskRow[] {
  const rows = queryAll<JobTaskDbRow>(
    `
      SELECT id, job_id, task_id, task_index, task_title, task_text, status, result, error, started_at, completed_at
      FROM job_tasks
      WHERE job_id = ?
      ORDER BY task_index ASC
    `,
    [jobId],
  );
  return rows.map(toJobTaskRow);
}

/**
 * 根据 job_id 和 task_index 获取单个 job_task 的完整详情
 * 用于按需加载详细执行结果
 */
export function getJobTaskByIndex(jobId: Id, taskIndex: number): JobTaskRow | null {
  const row = queryGet<JobTaskDbRow>(
    `
      SELECT id, job_id, task_id, task_index, task_title, task_text, status, result, error, started_at, completed_at
      FROM job_tasks
      WHERE job_id = ? AND task_index = ?
    `,
    [jobId, taskIndex],
  );
  return row ? toJobTaskRow(row) : null;
}

/**
 * 根据 job_id 和 task_index 更新 job_task
 * 用于 Local 回调更新状态
 */
export function updateJobTaskByIndex(
  jobId: Id,
  taskIndex: number,
  patch: {
    status?: JobStatus;
    result?: TaskActionResult | null;
    error?: string | null;
    started_at?: string;
    completed_at?: string;
  },
): JobTaskRow | null {
  const row = queryGet<JobTaskDbRow>(
    `
      SELECT id, job_id, task_id, task_index, task_title, task_text, status, result, error, started_at, completed_at
      FROM job_tasks
      WHERE job_id = ? AND task_index = ?
    `,
    [jobId, taskIndex],
  );
  if (!row) return null;

  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (patch.status !== undefined) {
    setClauses.push('status = ?');
    params.push(patch.status);
  }
  if (patch.result !== undefined) {
    setClauses.push('result = ?');
    params.push(patch.result ? JSON.stringify(patch.result) : null);
  }
  if (patch.error !== undefined) {
    setClauses.push('error = ?');
    params.push(patch.error);
  }
  if (patch.started_at !== undefined) {
    setClauses.push('started_at = ?');
    params.push(patch.started_at);
  }
  if (patch.completed_at !== undefined) {
    setClauses.push('completed_at = ?');
    params.push(patch.completed_at);
  }

  if (setClauses.length === 0) return toJobTaskRow(row);

  params.push(row.id);
  queryRun(`UPDATE job_tasks SET ${setClauses.join(', ')} WHERE id = ?`, params);

  const updated = queryGet<JobTaskDbRow>(
    `
      SELECT id, job_id, task_id, task_index, task_title, task_text, status, result, error, started_at, completed_at
      FROM job_tasks
      WHERE id = ?
    `,
    [row.id],
  );
  return updated ? toJobTaskRow(updated) : null;
}

/**
 * 根据 job_tasks 的状态聚合更新 job 状态
 */
export function syncJobStatusFromTasks(jobId: Id): JobRow | null {
  const tasks = getJobTasksByJobId(jobId);
  if (tasks.length === 0) return getJobById(jobId);

  let newStatus: JobStatus;

  if (tasks.some((t) => t.status === 'running')) {
    newStatus = 'running';
  } else if (tasks.every((t) => t.status === 'completed')) {
    newStatus = 'completed';
  } else if (tasks.some((t) => t.status === 'failed')) {
    newStatus = 'failed';
  } else {
    newStatus = 'pending';
  }

  return updateJobById(jobId, { status: newStatus });
}

// ============ Job 统计 ============

export type JobStats = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
};

/**
 * 批量获取 task 的 job 执行统计
 * 返回 Map<task_id, JobStats>
 */
export function getJobStatsByTaskIds(taskIds: Id[]): Map<Id, JobStats> {
  const result = new Map<Id, JobStats>();
  if (taskIds.length === 0) return result;

  // 初始化所有 taskId 的统计为 0
  for (const id of taskIds) {
    result.set(id, { total: 0, completed: 0, failed: 0, running: 0, pending: 0 });
  }

  // 构建 IN 子句的占位符
  const placeholders = taskIds.map(() => '?').join(', ');

  // 聚合查询
  const rows = queryAll<{ task_id: string; status: string; cnt: number }>(
    `
      SELECT task_id, status, COUNT(*) as cnt
      FROM jobs
      WHERE task_id IN (${placeholders})
      GROUP BY task_id, status
    `,
    taskIds,
  );

  // 填充统计数据
  for (const row of rows) {
    const stats = result.get(row.task_id);
    if (!stats) continue;

    stats.total += row.cnt;
    switch (row.status) {
      case 'completed':
        stats.completed = row.cnt;
        break;
      case 'failed':
        stats.failed = row.cnt;
        break;
      case 'running':
        stats.running = row.cnt;
        break;
      case 'pending':
        stats.pending = row.cnt;
        break;
    }
  }

  return result;
}
