import { NextResponse } from 'next/server';

import {
  deleteJobById,
  getJobById,
  getJobWithTasks,
  getJobWithTasksLite,
  updateJobById,
} from '@/lib/db';
import type { JobStatus } from '@/lib/db';
import { jsonError, mapDbErrorToStatus, parseIdParam } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type NextRouteContext = {
  params: Promise<{ id: string }>;
};

const VALID_STATUSES: JobStatus[] = ['pending', 'running', 'completed', 'failed'];

export async function GET(request: Request, context: NextRouteContext) {
  const { id: rawId } = await context.params;
  const id = parseIdParam(rawId);
  if (!id) return jsonError('Invalid `id`', 400);

  // 支持 ?full=true 参数返回完整数据（含所有 job_task 的完整 result）
  const url = new URL(request.url);
  const full = url.searchParams.get('full') === 'true';

  const job = full ? getJobWithTasks(id) : getJobWithTasksLite(id);
  if (!job) return jsonError('Not found', 404);

  // 返回统一响应格式
  return NextResponse.json({
    code: 0,
    message: 'success',
    data: job,
  });
}

export async function PUT(request: Request, context: NextRouteContext) {
  return updateJob(request, context);
}

export async function PATCH(request: Request, context: NextRouteContext) {
  return updateJob(request, context);
}

async function updateJob(request: Request, context: NextRouteContext) {
  const { id: rawId } = await context.params;
  const id = parseIdParam(rawId);
  if (!id) return jsonError('Invalid `id`', 400);

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
    const patch: {
      status?: JobStatus;
      error?: string | null;
      started_at?: string;
      completed_at?: string;
    } = {};

    if (payload.status !== undefined) {
      if (
        typeof payload.status === 'string' &&
        VALID_STATUSES.includes(payload.status as JobStatus)
      ) {
        patch.status = payload.status as JobStatus;
      } else {
        return jsonError('Invalid status', 400);
      }
    }

    if (payload.error !== undefined) {
      patch.error = payload.error === null ? null : String(payload.error);
    }

    if (typeof payload.started_at === 'string') {
      patch.started_at = payload.started_at;
    }

    if (typeof payload.completed_at === 'string') {
      patch.completed_at = payload.completed_at;
    }

    const job = updateJobById(id, patch);
    if (!job) return jsonError('Not found', 404);

    return NextResponse.json({
      code: 0,
      message: 'success',
      data: job,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, mapDbErrorToStatus(message));
  }
}

export async function DELETE(_request: Request, context: NextRouteContext) {
  const { id: rawId } = await context.params;
  const id = parseIdParam(rawId);
  if (!id) return jsonError('Invalid `id`', 400);

  const existing = getJobById(id);
  if (!existing) return jsonError('Not found', 404);

  const changes = deleteJobById(id);
  if (changes === 0) return jsonError('Not found', 404);

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: existing,
  });
}
