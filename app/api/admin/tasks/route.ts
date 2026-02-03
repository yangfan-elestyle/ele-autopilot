import { NextResponse } from 'next/server';

import { countTasks, createTask, createTasks, getTasksByIds, listTasksPage } from '@/lib/db';
import type { Id } from '@/lib/db';
import { isValidId } from '@/lib/db/utils';
import { jsonError, mapDbErrorToStatus, parseListParams, withContentRange } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { sort, range, filter } = parseListParams(request);

  const filterIds =
    filter && typeof filter === 'object' && Array.isArray((filter as Record<string, unknown>).id)
      ? ((filter as Record<string, unknown>).id as unknown[])
      : null;

  // getMany (by ids)
  if (filterIds) {
    const ids = Array.from(new Set(filterIds.filter(isValidId)));

    const data = getTasksByIds(ids);
    const start = 0;
    const end = Math.max(0, data.length - 1);
    const headers = withContentRange('tasks', start, end, data.length);
    return NextResponse.json(data, { headers });
  }

  // getList
  const [sortField, sortOrder] = sort;
  const [start, end] = range;
  const limit = Math.max(1, Math.trunc(end) - Math.trunc(start) + 1);
  const offset = Math.max(0, Math.trunc(start));

  const data = listTasksPage({
    limit,
    offset,
    sort: sortField,
    order: sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
    filter,
  });
  const total = countTasks(filter);
  const actualEnd = Math.max(offset, offset + data.length - 1);
  const headers = withContentRange('tasks', offset, actualEnd, total);
  return NextResponse.json(data, { headers });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  // 批量创建：body 为数组
  if (Array.isArray(body)) {
    try {
      const inputs: { text: string; folder_id: Id; sub_ids?: Id[] }[] = [];
      for (const item of body) {
        if (!item || typeof item !== 'object') {
          return jsonError('Each item must be an object', 400);
        }
        const payload = item as Record<string, unknown>;
        const text = typeof payload.text === 'string' ? payload.text.trim() : '';
        const folder_id = payload.folder_id;

        if (!text) return jsonError('`text` is required for each item', 400);
        if (!isValidId(folder_id)) return jsonError('`folder_id` is required for each item', 400);

        inputs.push({ text, folder_id });
      }

      const tasks = createTasks(inputs);
      return NextResponse.json(tasks, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return jsonError(message, mapDbErrorToStatus(message));
    }
  }

  // 单任务创建：body 为对象
  const payload =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  try {
    const text = typeof payload.text === 'string' ? payload.text : '';
    const folder_id = payload.folder_id;
    let sub_ids: Id[] | undefined;
    if (payload.sub_ids === undefined) {
      sub_ids = undefined;
    } else if (Array.isArray(payload.sub_ids) && payload.sub_ids.every(isValidId)) {
      sub_ids = payload.sub_ids as Id[];
    } else {
      return jsonError('Invalid sub_ids', 400);
    }

    if (!text.trim()) return jsonError('`text` is required', 400);
    if (!isValidId(folder_id)) {
      return jsonError('`folder_id` is required', 400);
    }

    const task = createTask({ text, folder_id, sub_ids });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, mapDbErrorToStatus(message));
  }
}
