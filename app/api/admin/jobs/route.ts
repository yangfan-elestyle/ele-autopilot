import { NextResponse } from 'next/server';

import { countJobs, createJob, listJobsPage } from '@/lib/db';
import type { JobConfig } from '@/lib/db';
import { isValidId } from '@/lib/db/utils';
import { jsonError, mapDbErrorToStatus, parseListParams, withContentRange } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { sort, range, filter } = parseListParams(request);

  const [sortField, sortOrder] = sort;
  const [start, end] = range;
  const limit = Math.max(1, Math.trunc(end) - Math.trunc(start) + 1);
  const offset = Math.max(0, Math.trunc(start));

  const data = listJobsPage({
    limit,
    offset,
    sort: sortField,
    order: sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
    filter,
  });
  const total = countJobs(filter);
  const actualEnd = Math.max(offset, offset + data.length - 1);
  const headers = withContentRange('jobs', offset, actualEnd, total);
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
    const task_id = payload.task_id;
    if (!isValidId(task_id)) {
      return jsonError('`task_id` is required', 400);
    }

    // config 可选，默认空对象
    let config: JobConfig = {};
    if (payload.config !== undefined) {
      if (payload.config && typeof payload.config === 'object' && !Array.isArray(payload.config)) {
        config = payload.config as JobConfig;
      } else {
        return jsonError('Invalid config', 400);
      }
    }

    const job = createJob({ task_id, config });

    // 返回统一响应格式
    return NextResponse.json(
      {
        code: 0,
        message: 'success',
        data: job,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, mapDbErrorToStatus(message));
  }
}
