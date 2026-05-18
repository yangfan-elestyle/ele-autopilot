import type { ActionFunctionArgs } from 'react-router';

import { getJobById, syncJobStatusFromTasks, updateJobTaskByIndex } from '@/lib/db';
import type { JobStatus, TaskActionResult } from '@/lib/db';
import { isValidId } from '@/lib/db/utils';
import { jsonResponse, methodNotAllowed } from '@/app/lib/api-shared';

const VALID_STATUSES: JobStatus[] = ['pending', 'running', 'completed', 'failed'];

function envelope(code: number, message: string, data: unknown = null, status = 200) {
  return jsonResponse({ code, message, data }, { status });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);

  const rawId = params.id ?? '';
  if (!isValidId(rawId)) {
    return envelope(400, 'Invalid job id', null, 400);
  }

  const job = getJobById(rawId);
  if (!job) {
    return envelope(404, 'Job not found', null, 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return envelope(400, 'Invalid JSON body', null, 400);
  }

  const payload =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  const taskIndex = payload.task_index;
  if (typeof taskIndex !== 'number' || taskIndex < 0) {
    return envelope(400, 'Invalid task_index', null, 400);
  }

  const taskId = payload.task_id;
  if (!isValidId(taskId)) {
    return envelope(400, 'Invalid task_id', null, 400);
  }

  const status = payload.status;
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as JobStatus)) {
    return envelope(400, 'Invalid status', null, 400);
  }

  const result = payload.result as TaskActionResult | null | undefined;
  const error = typeof payload.error === 'string' ? payload.error : null;
  const startedAt = typeof payload.started_at === 'string' ? payload.started_at : undefined;
  const completedAt = typeof payload.completed_at === 'string' ? payload.completed_at : undefined;

  try {
    const updated = updateJobTaskByIndex(rawId, taskIndex, {
      status: status as JobStatus,
      result: result ?? null,
      error,
      started_at: startedAt,
      completed_at: completedAt,
    });

    if (!updated) {
      return envelope(400, 'Invalid task_index', null, 400);
    }

    syncJobStatusFromTasks(rawId);

    return envelope(0, 'success', null);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return envelope(500, message, null, 500);
  }
}
