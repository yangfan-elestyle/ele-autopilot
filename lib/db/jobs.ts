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
} from './types';
import { generateId, isRecord, isValidId, queryAll, queryGet, queryRun } from './utils';
import { getTaskById } from './tasks';

// ============ 辅助函数 ============

async function ensureTaskExists(taskId: Id) {
  const exists = await queryGet<{ ok: 1 }>(`SELECT 1 as ok FROM tasks WHERE id = ?`, [taskId]);
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

function toJobTaskLiteRow(dbRow: JobTaskDbRow): JobTaskLiteRow {
  return {
    id: dbRow.id,
    job_id: dbRow.job_id,
    task_id: dbRow.task_id,
    task_index: dbRow.task_index,
    task_title: dbRow.task_title ?? null,
    task_text: dbRow.task_text,
    status: dbRow.status as JobStatus,
    result_summary: null,
    error: dbRow.error,
    started_at: dbRow.started_at,
    completed_at: dbRow.completed_at,
  };
}

/**
 * 递归展开 TaskRow 的 sub_ids, 返回所有叶子节点 (flat 任务数组)
 */
async function flattenTaskTree(
  taskId: Id,
  visited: Set<Id> = new Set(),
): Promise<Array<{ id: Id; title: string | null; text: string }>> {
  if (visited.has(taskId)) return [];
  visited.add(taskId);

  const task = await getTaskById(taskId);
  if (!task) return [];

  if (!task.sub_ids || task.sub_ids.length === 0) {
    return [{ id: task.id, title: task.title ?? null, text: task.text }];
  }

  const result: Array<{ id: Id; title: string | null; text: string }> = [];
  for (const subId of task.sub_ids) {
    result.push(...(await flattenTaskTree(subId, visited)));
  }
  return result;
}

// ============ Job CRUD ============

export async function getJobById(id: Id): Promise<JobRow | null> {
  const row = await queryGet<JobDbRow>(
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

export async function getJobWithTasks(id: Id): Promise<JobWithTasks | null> {
  const job = await getJobById(id);
  if (!job) return null;

  const taskRows = await queryAll<JobTaskDbRow>(
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

export async function getJobWithTasksLite(id: Id): Promise<JobWithTasksLite | null> {
  const job = await getJobById(id);
  if (!job) return null;

  const taskRows = await queryAll<
    Omit<JobTaskDbRow, 'result'> & {
      result?: null;
    }
  >(
    `
      SELECT id, job_id, task_id, task_index, task_title, task_text, status, error, started_at, completed_at
      FROM job_tasks
      WHERE job_id = ?
      ORDER BY task_index ASC
    `,
    [id],
  );

  return {
    ...job,
    tasks: taskRows.map((row) => toJobTaskLiteRow({ ...row, result: null })),
  };
}

export async function listJobsPage(args: ListPageArgs): Promise<JobRow[]> {
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

  const rows = await queryAll<JobDbRow>(
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

export async function countJobs(filter?: Record<string, unknown>): Promise<number> {
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
  const row = await queryGet<{ total: number }>(
    `SELECT COUNT(1) as total FROM jobs ${whereSql}`,
    params,
  );
  return row?.total ?? 0;
}

export async function createJob(input: { task_id: Id; config?: JobConfig }): Promise<JobWithTasks> {
  const taskId = input.task_id;
  if (!isValidId(taskId)) throw new Error('Invalid task_id');
  await ensureTaskExists(taskId);

  const config = input.config ?? {};
  const now = new Date().toISOString();
  const jobId = generateId();

  const flatTasks = await flattenTaskTree(taskId);
  if (flatTasks.length === 0) {
    const task = await getTaskById(taskId);
    if (task) {
      flatTasks.push({ id: task.id, title: task.title ?? null, text: task.text });
    }
  }

  if (flatTasks.length === 0) {
    throw new Error('No tasks to execute');
  }

  await queryRun(
    `INSERT INTO jobs (id, task_id, status, config, created_at, started_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [jobId, taskId, 'pending', JSON.stringify(config), now, now],
  );

  for (let i = 0; i < flatTasks.length; i++) {
    const ft = flatTasks[i];
    const jtId = generateId();
    await queryRun(
      `INSERT INTO job_tasks (id, job_id, task_id, task_index, task_title, task_text, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [jtId, jobId, ft.id, i, ft.title, ft.text, 'pending'],
    );
  }

  const result = await getJobWithTasks(jobId);
  if (!result) throw new Error('Failed to create job');
  return result;
}

export async function updateJobById(
  id: Id,
  patch: {
    status?: JobStatus;
    error?: string | null;
    started_at?: string;
    completed_at?: string;
  },
): Promise<JobRow | null> {
  const existing = await getJobById(id);
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
  await queryRun(`UPDATE jobs SET ${setClauses.join(', ')} WHERE id = ?`, params);

  return await getJobById(id);
}

export async function deleteJobById(id: Id): Promise<number> {
  const result = await queryRun(`DELETE FROM jobs WHERE id = ?`, [id]);
  return result.changes;
}

// ============ JobTask 相关 ============

export async function getJobTasksByJobId(jobId: Id): Promise<JobTaskRow[]> {
  const rows = await queryAll<JobTaskDbRow>(
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

export async function getJobTaskByIndex(jobId: Id, taskIndex: number): Promise<JobTaskRow | null> {
  const row = await queryGet<JobTaskDbRow>(
    `
      SELECT id, job_id, task_id, task_index, task_title, task_text, status, result, error, started_at, completed_at
      FROM job_tasks
      WHERE job_id = ? AND task_index = ?
    `,
    [jobId, taskIndex],
  );
  return row ? toJobTaskRow(row) : null;
}

export async function updateJobTaskByIndex(
  jobId: Id,
  taskIndex: number,
  patch: {
    status?: JobStatus;
    result?: TaskActionResult | null;
    error?: string | null;
    started_at?: string;
    completed_at?: string;
  },
): Promise<JobTaskRow | null> {
  const row = await queryGet<JobTaskDbRow>(
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
  await queryRun(`UPDATE job_tasks SET ${setClauses.join(', ')} WHERE id = ?`, params);

  const updated = await queryGet<JobTaskDbRow>(
    `
      SELECT id, job_id, task_id, task_index, task_title, task_text, status, result, error, started_at, completed_at
      FROM job_tasks
      WHERE id = ?
    `,
    [row.id],
  );
  return updated ? toJobTaskRow(updated) : null;
}

export async function syncJobStatusFromTasks(jobId: Id): Promise<JobRow | null> {
  const tasks = await getJobTasksByJobId(jobId);
  if (tasks.length === 0) return await getJobById(jobId);

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

  return await updateJobById(jobId, { status: newStatus });
}

// ============ Job 统计 ============

export type JobStats = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
};

export async function getJobStatsByTaskIds(taskIds: Id[]): Promise<Map<Id, JobStats>> {
  const result = new Map<Id, JobStats>();
  if (taskIds.length === 0) return result;

  for (const id of taskIds) {
    result.set(id, { total: 0, completed: 0, failed: 0, running: 0, pending: 0 });
  }

  const placeholders = taskIds.map(() => '?').join(', ');

  const rows = await queryAll<{ task_id: string; status: string; cnt: number }>(
    `
      SELECT task_id, status, COUNT(*) as cnt
      FROM jobs
      WHERE task_id IN (${placeholders})
      GROUP BY task_id, status
    `,
    taskIds,
  );

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
