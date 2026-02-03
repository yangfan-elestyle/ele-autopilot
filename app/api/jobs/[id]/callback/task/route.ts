import { NextResponse } from 'next/server';

import { getJobById, syncJobStatusFromTasks, updateJobTaskByIndex } from '@/lib/db';
import type { JobStatus, TaskActionResult } from '@/lib/db';
import { isValidId } from '@/lib/db/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type NextRouteContext = {
  params: Promise<{ id: string }>;
};

const VALID_STATUSES: JobStatus[] = ['pending', 'running', 'completed', 'failed'];

function jsonResponse(code: number, message: string, data: unknown = null, status = 200) {
  return NextResponse.json({ code, message, data }, { status });
}

/**
 * POST /api/jobs/[id]/callback/task
 * 接收 Local 的单个 task 状态回调
 */
export async function POST(request: Request, context: NextRouteContext) {
  const { id: rawId } = await context.params;

  if (!isValidId(rawId)) {
    return jsonResponse(400, 'Invalid job id', null, 400);
  }

  const job = getJobById(rawId);
  if (!job) {
    return jsonResponse(404, 'Job not found', null, 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, 'Invalid JSON body', null, 400);
  }

  const payload =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  // 验证必填字段
  const taskIndex = payload.task_index;
  if (typeof taskIndex !== 'number' || taskIndex < 0) {
    return jsonResponse(400, 'Invalid task_index', null, 400);
  }

  const taskId = payload.task_id;
  if (!isValidId(taskId)) {
    return jsonResponse(400, 'Invalid task_id', null, 400);
  }

  const status = payload.status;
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as JobStatus)) {
    return jsonResponse(400, 'Invalid status', null, 400);
  }

  // 可选字段
  const result = payload.result as TaskActionResult | null | undefined;
  const error = typeof payload.error === 'string' ? payload.error : null;
  const startedAt = typeof payload.started_at === 'string' ? payload.started_at : undefined;
  const completedAt = typeof payload.completed_at === 'string' ? payload.completed_at : undefined;

  try {
    // 更新 job_task
    const updated = updateJobTaskByIndex(rawId, taskIndex, {
      status: status as JobStatus,
      result: result ?? null,
      error,
      started_at: startedAt,
      completed_at: completedAt,
    });

    if (!updated) {
      return jsonResponse(400, 'Invalid task_index', null, 400);
    }

    // 同步更新 job 状态
    syncJobStatusFromTasks(rawId);

    return jsonResponse(0, 'success', null);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse(500, message, null, 500);
  }
}
