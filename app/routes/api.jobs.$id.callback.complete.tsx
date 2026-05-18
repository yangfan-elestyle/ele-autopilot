import type { ActionFunctionArgs } from 'react-router';

import { getJobById, updateJobById } from '@/lib/db';
import type { JobStatus } from '@/lib/db';
import { isValidId } from '@/lib/db/utils';
import { jsonResponse, methodNotAllowed } from '@/app/lib/api-shared';

const FINAL_STATUSES: JobStatus[] = ['completed', 'failed'];

function envelope(code: number, message: string, data: unknown = null, status = 200) {
  return jsonResponse({ code, message, data }, { status });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);

  const rawId = params.id ?? '';
  if (!isValidId(rawId)) {
    return envelope(400, 'Invalid job id', null, 400);
  }

  const job = await getJobById(rawId);
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

  const status = payload.status;
  if (typeof status !== 'string' || !FINAL_STATUSES.includes(status as JobStatus)) {
    return envelope(400, 'Invalid status, must be completed or failed', null, 400);
  }

  const error = typeof payload.error === 'string' ? payload.error : null;
  const completedAt = typeof payload.completed_at === 'string' ? payload.completed_at : undefined;

  try {
    await updateJobById(rawId, {
      status: status as JobStatus,
      error,
      completed_at: completedAt,
    });

    return envelope(0, 'success', null);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return envelope(500, message, null, 500);
  }
}
