import { NextResponse } from 'next/server';

import { countFolders, createFolder, getFoldersByIds, listFoldersPage } from '@/lib/db';
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

    const data = getFoldersByIds(ids);
    const start = 0;
    const end = Math.max(0, data.length - 1);
    const headers = withContentRange('folders', start, end, data.length);
    return NextResponse.json(data, { headers });
  }

  // getList
  const [sortField, sortOrder] = sort;
  const [start, end] = range;
  const limit = Math.max(1, Math.trunc(end) - Math.trunc(start) + 1);
  const offset = Math.max(0, Math.trunc(start));

  const data = listFoldersPage({
    limit,
    offset,
    sort: sortField,
    order: sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
    filter,
  });
  const total = countFolders(filter);
  const actualEnd = Math.max(offset, offset + data.length - 1);
  const headers = withContentRange('folders', offset, actualEnd, total);
  return NextResponse.json(data, { headers });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const payload =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  try {
    const name = typeof payload.name === 'string' ? payload.name : '';
    let parent_id: Id | null | undefined;
    if (payload.parent_id === undefined) {
      parent_id = undefined;
    } else if (payload.parent_id === null) {
      parent_id = null;
    } else if (isValidId(payload.parent_id)) {
      parent_id = payload.parent_id;
    } else {
      return jsonError('Invalid parent_id', 400);
    }

    if (!name.trim()) return jsonError('`name` is required', 400);

    const folder = createFolder({ name, parent_id });
    return NextResponse.json(folder, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, mapDbErrorToStatus(message));
  }
}
