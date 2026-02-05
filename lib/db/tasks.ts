import type { Id, ListPageArgs, TaskDbRow, TaskRow } from './types';
import { escapeLike, isRecord, generateId, isValidId, queryAll, queryGet, queryRun } from './utils';

function ensureFolderExists(folderId: Id) {
  const exists = queryGet<{ ok: 1 }>(`SELECT 1 as ok FROM folders WHERE id = ?`, [folderId]);
  if (!exists) throw new Error('Invalid folder_id');
}

function buildTasksFilterParts(filter: Record<string, unknown>) {
  const where: string[] = [];
  const params: unknown[] = [];

  const q = typeof filter.q === 'string' ? filter.q.trim() : '';
  if (q) {
    where.push(`t.text LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLike(q)}%`);
  }

  const folderId = isValidId(filter.folder_id) ? filter.folder_id : null;
  const subtree = filter.subtree === true || filter.include_descendants === true;

  if (Array.isArray(filter.folder_ids)) {
    const ids = (filter.folder_ids as unknown[]).filter(isValidId);
    const unique = Array.from(new Set(ids));
    if (unique.length) {
      where.push(`t.folder_id IN (${unique.map(() => '?').join(',')})`);
      params.push(...unique);
    }
    return { where, params, withClause: '' };
  }

  if (folderId && subtree) {
    return {
      where: [...where, `t.folder_id IN (SELECT id FROM descendants)`],
      params: [folderId, ...params],
      withClause: `
        WITH RECURSIVE descendants(id) AS (
          SELECT id FROM folders WHERE id = ?
          UNION ALL
          SELECT f.id FROM folders f
          JOIN descendants d ON f.parent_id = d.id
        )
      `,
    };
  }

  if (folderId) {
    where.push(`t.folder_id = ?`);
    params.push(folderId);
  }

  return { where, params, withClause: '' };
}

export function getTaskById(id: Id) {
  const row = queryGet<TaskDbRow>(
    `
      SELECT t.id, t.folder_id, t.text, t.sub_ids, t.created_at
      FROM tasks t
      WHERE t.id = ?
    `,
    [id],
  );
  if (!row) return null;
  return toTaskRow(row);
}

export function getTasksByIds(ids: Id[]) {
  const unique = Array.from(new Set(ids.filter(isValidId)));
  if (unique.length === 0) return [];
  const placeholders = unique.map(() => '?').join(',');
  const rows = queryAll<TaskDbRow>(
    `
      SELECT t.id, t.folder_id, t.text, t.sub_ids, t.created_at
      FROM tasks t
      WHERE t.id IN (${placeholders})
      ORDER BY t.created_at DESC
    `,
    unique,
  );
  return rows.map(toTaskRow);
}

export function listTasksPage(args: ListPageArgs) {
  const { limit, offset } = args;
  const filter = isRecord(args.filter) ? args.filter : {};

  const { where, params, withClause } = buildTasksFilterParts(filter);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const finalParams = [...params, Math.max(1, limit), Math.max(0, offset)];

  const rows = queryAll<TaskDbRow>(
    `
      ${withClause}
      SELECT t.id, t.folder_id, t.text, t.sub_ids, t.created_at
      FROM tasks t
      ${whereSql}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `,
    finalParams,
  );
  return rows.map(toTaskRow);
}

export function countTasks(filter: Record<string, unknown>) {
  const normalized = isRecord(filter) ? filter : {};
  const { where, params, withClause } = buildTasksFilterParts(normalized);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const row = queryGet<{ total: number }>(
    `
      ${withClause}
      SELECT COUNT(1) as total
      FROM tasks t
      ${whereSql}
    `,
    params,
  );
  return row?.total ?? 0;
}

export function createTask(input: {
  text: string;
  folder_id: Id;
  sub_ids?: Id[];
  created_at?: string;
}) {
  const text = input.text.trim();
  if (!text) throw new Error('`text` is required');

  const folderId = input.folder_id;
  if (!isValidId(folderId)) throw new Error('Invalid folder_id');
  ensureFolderExists(folderId);

  const id = generateId();
  const subIds = input.sub_ids ?? [];
  if (!Array.isArray(subIds) || !subIds.every(isValidId)) throw new Error('Invalid sub_ids');

  if (input.created_at) {
    queryRun(
      `INSERT INTO tasks (id, folder_id, text, sub_ids, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, folderId, text, JSON.stringify(subIds), input.created_at],
    );
  } else {
    queryRun(`INSERT INTO tasks (id, folder_id, text, sub_ids) VALUES (?, ?, ?, ?)`, [
      id,
      folderId,
      text,
      JSON.stringify(subIds),
    ]);
  }
  const task = getTaskById(id);
  if (!task) throw new Error('Not found');
  return task;
}

export function createTasks(inputs: { text: string; folder_id: Id; sub_ids?: Id[] }[]) {
  if (!inputs.length) return [];

  const results: ReturnType<typeof createTask>[] = [];
  // 为每个任务生成递增的时间戳，确保批量创建时顺序稳定
  // 每个任务间隔 1 毫秒，避免 created_at 相同导致排序不稳定
  const baseTime = Date.now();
  for (let i = 0; i < inputs.length; i++) {
    const created_at = new Date(baseTime + i).toISOString();
    results.push(createTask({ ...inputs[i], created_at }));
  }
  return results;
}

export function updateTaskById(id: Id, patch: { text?: string; folder_id?: Id; sub_ids?: Id[] }) {
  const existing = getTaskById(id);
  if (!existing) throw new Error('Not found');

  const nextText = patch.text === undefined ? existing.text : String(patch.text).trim();
  if (!nextText) throw new Error('`text` is required');

  const nextFolderId = patch.folder_id === undefined ? existing.folder_id : patch.folder_id;
  if (!isValidId(nextFolderId)) throw new Error('Invalid folder_id');
  ensureFolderExists(nextFolderId);

  if (patch.sub_ids === undefined) {
    queryRun(`UPDATE tasks SET text = ?, folder_id = ? WHERE id = ?`, [nextText, nextFolderId, id]);
  } else {
    if (!Array.isArray(patch.sub_ids) || !patch.sub_ids.every(isValidId)) {
      throw new Error('Invalid sub_ids');
    }
    queryRun(`UPDATE tasks SET text = ?, folder_id = ?, sub_ids = ? WHERE id = ?`, [
      nextText,
      nextFolderId,
      JSON.stringify(patch.sub_ids),
      id,
    ]);
  }

  const task = getTaskById(id);
  if (!task) throw new Error('Not found');
  return task;
}

export function deleteTaskById(id: Id) {
  const result = queryRun(`DELETE FROM tasks WHERE id = ?`, [id]);
  return result.changes;
}

export function deleteTasksByFolderIds(folderIds: Id[]) {
  const unique = Array.from(new Set(folderIds.filter(isValidId)));
  if (unique.length === 0) return 0;
  const placeholders = unique.map(() => '?').join(',');
  const result = queryRun(`DELETE FROM tasks WHERE folder_id IN (${placeholders})`, unique);
  return result.changes;
}

function parseSubIds(raw: string): Id[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? (value as Id[]) : [];
  } catch {
    return [];
  }
}

function toTaskRow(dbRow: TaskDbRow): TaskRow {
  return {
    id: dbRow.id,
    folder_id: dbRow.folder_id,
    text: dbRow.text,
    sub_ids: parseSubIds(dbRow.sub_ids),
    created_at: dbRow.created_at,
  };
}
