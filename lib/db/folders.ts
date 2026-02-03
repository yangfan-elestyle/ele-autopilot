import type { FolderRow, Id, ListPageArgs } from './types';
import { escapeLike, generateId, isRecord, isValidId, queryAll, queryGet, queryRun } from './utils';

export function ensureParentFolderValid(folderId: Id, parentId: Id | null) {
  if (parentId === null) return;
  if (parentId === folderId) throw new Error('Invalid parent_id');

  const parentExists = queryGet<{ ok: 1 }>(`SELECT 1 as ok FROM folders WHERE id = ?`, [parentId]);
  if (!parentExists) throw new Error('Invalid parent_id');

  const cycle = queryGet<{ ok: 1 }>(
    `
      WITH RECURSIVE descendants(id) AS (
        SELECT id FROM folders WHERE id = ?
        UNION ALL
        SELECT f.id FROM folders f
        JOIN descendants d ON f.parent_id = d.id
      )
      SELECT 1 as ok FROM descendants WHERE id = ? LIMIT 1;
    `,
    [folderId, parentId],
  );
  if (cycle) throw new Error('Invalid parent_id');
}

export function getFolderById(id: Id) {
  return queryGet<FolderRow>(
    `
      SELECT
        f.id,
        f.name,
        f.parent_id,
        f.order_index,
        f.created_at,
        (SELECT COUNT(1) FROM tasks t WHERE t.folder_id = f.id) AS task_count
      FROM folders f
      WHERE f.id = ?
    `,
    [id],
  );
}

export function getFoldersByIds(ids: Id[]) {
  const unique = Array.from(new Set(ids.filter(isValidId)));
  if (unique.length === 0) return [];
  const placeholders = unique.map(() => '?').join(',');
  return queryAll<FolderRow>(
    `
      SELECT
        f.id,
        f.name,
        f.parent_id,
        f.order_index,
        f.created_at,
        (SELECT COUNT(1) FROM tasks t WHERE t.folder_id = f.id) AS task_count
      FROM folders f
      WHERE f.id IN (${placeholders})
      ORDER BY
        CASE WHEN f.order_index IS NOT NULL THEN 0 ELSE 1 END,
        f.order_index ASC,
        f.created_at DESC
    `,
    unique,
  );
}

export function listFoldersPage(args: ListPageArgs) {
  const { limit, offset } = args;
  const filter = isRecord(args.filter) ? args.filter : {};

  const where: string[] = [];
  const params: unknown[] = [];

  const q = typeof filter.q === 'string' ? filter.q.trim() : '';
  if (q) {
    where.push(`f.name LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLike(q)}%`);
  }

  if (filter.parent_id === null) {
    where.push(`f.parent_id IS NULL`);
  } else {
    const parentId = filter.parent_id;
    if (isValidId(parentId)) {
      where.push(`f.parent_id = ?`);
      params.push(parentId);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(Math.max(1, limit));
  params.push(Math.max(0, offset));

  return queryAll<FolderRow>(
    `
      SELECT
        f.id,
        f.name,
        f.parent_id,
        f.order_index,
        f.created_at,
        (SELECT COUNT(1) FROM tasks t WHERE t.folder_id = f.id) AS task_count
      FROM folders f
      ${whereSql}
      ORDER BY
        CASE WHEN f.order_index IS NOT NULL THEN 0 ELSE 1 END,
        f.order_index ASC,
        f.created_at DESC
      LIMIT ? OFFSET ?
    `,
    params,
  );
}

export function countFolders(filter: Record<string, unknown>) {
  const normalized = isRecord(filter) ? filter : {};
  const where: string[] = [];
  const params: unknown[] = [];

  const q = typeof normalized.q === 'string' ? normalized.q.trim() : '';
  if (q) {
    where.push(`name LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLike(q)}%`);
  }

  if (normalized.parent_id === null) {
    where.push(`parent_id IS NULL`);
  } else {
    const parentId = normalized.parent_id;
    if (isValidId(parentId)) {
      where.push(`parent_id = ?`);
      params.push(parentId);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const row = queryGet<{ total: number }>(
    `SELECT COUNT(1) as total FROM folders ${whereSql}`,
    params,
  );
  return row?.total ?? 0;
}

export function createFolder(input: { name: string; parent_id?: Id | null }) {
  const name = input.name.trim();
  if (!name) throw new Error('`name` is required');
  const parentId = input.parent_id ?? null;

  if (parentId !== null) {
    if (!isValidId(parentId)) throw new Error('Invalid parent_id');
    const exists = queryGet<{ ok: 1 }>(`SELECT 1 as ok FROM folders WHERE id = ?`, [parentId]);
    if (!exists) throw new Error('Invalid parent_id');
  }

  const id = generateId();
  queryRun(`INSERT INTO folders (id, name, parent_id) VALUES (?, ?, ?)`, [id, name, parentId]);
  const folder = getFolderById(id);
  if (!folder) throw new Error('Not found');
  return folder;
}

export function updateFolderById(
  id: Id,
  patch: { name?: string; parent_id?: Id | null; order_index?: number | null },
) {
  const existing = getFolderById(id);
  if (!existing) throw new Error('Not found');

  const nextName = patch.name === undefined ? existing.name : String(patch.name).trim();
  if (!nextName) throw new Error('`name` is required');

  let nextParent = existing.parent_id;
  if (patch.parent_id !== undefined) {
    if (patch.parent_id === null) {
      nextParent = null;
    } else if (isValidId(patch.parent_id)) {
      nextParent = patch.parent_id;
    } else {
      throw new Error('Invalid parent_id');
    }
    ensureParentFolderValid(id, nextParent);
  }

  const nextOrderIndex = patch.order_index === undefined ? existing.order_index : patch.order_index;

  queryRun(`UPDATE folders SET name = ?, parent_id = ?, order_index = ? WHERE id = ?`, [
    nextName,
    nextParent,
    nextOrderIndex,
    id,
  ]);

  const folder = getFolderById(id);
  if (!folder) throw new Error('Not found');
  return folder;
}

/**
 * 递归删除 folder 及其所有子 folder 和关联的 tasks/jobs
 */
export function deleteFolderById(id: Id) {
  // 使用递归 CTE 获取当前 folder 及其所有后代 folder IDs（按深度排序，叶子在前）
  const descendants = queryAll<{ id: Id; depth: number }>(
    `
      WITH RECURSIVE descendants(id, depth) AS (
        SELECT id, 0 FROM folders WHERE id = ?
        UNION ALL
        SELECT f.id, d.depth + 1 FROM folders f
        JOIN descendants d ON f.parent_id = d.id
      )
      SELECT id, depth FROM descendants ORDER BY depth DESC
    `,
    [id],
  );

  // folderIds 已按深度降序排列（叶子节点在前，根节点在后）
  const folderIds = descendants.map((row) => row.id);
  if (folderIds.length === 0) return 0;

  const placeholders = folderIds.map(() => '?').join(',');

  // 获取所有相关的 task IDs
  const taskRows = queryAll<{ id: Id }>(
    `SELECT id FROM tasks WHERE folder_id IN (${placeholders})`,
    folderIds,
  );
  const taskIds = taskRows.map((row) => row.id);

  if (taskIds.length > 0) {
    const taskPlaceholders = taskIds.map(() => '?').join(',');
    // 先删除 jobs（job_tasks 会因 ON DELETE CASCADE 自动删除）
    queryRun(`DELETE FROM jobs WHERE task_id IN (${taskPlaceholders})`, taskIds);
  }

  // 删除所有 tasks
  queryRun(`DELETE FROM tasks WHERE folder_id IN (${placeholders})`, folderIds);

  // 逐个删除 folders（从叶子到根，避免外键约束）
  let totalChanges = 0;
  for (const folderId of folderIds) {
    const result = queryRun(`DELETE FROM folders WHERE id = ?`, [folderId]);
    totalChanges += result.changes;
  }
  return totalChanges;
}

export function reorderFolders(folderIds: Id[], parentId: Id | null) {
  const validIds = folderIds.filter(isValidId);
  if (validIds.length === 0) return;

  if (parentId !== null && !isValidId(parentId)) {
    throw new Error('Invalid parent_id');
  }

  for (let i = 0; i < validIds.length; i++) {
    const id = validIds[i];
    queryRun(`UPDATE folders SET order_index = ?, parent_id = ? WHERE id = ?`, [i, parentId, id]);
  }
}
