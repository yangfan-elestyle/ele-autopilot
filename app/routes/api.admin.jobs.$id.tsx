import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import {
  deleteJobById,
  getJobById,
  getJobWithTasks,
  getJobWithTasksLite,
  updateJobById,
} from '@/lib/db';
import type { JobStatus } from '@/lib/db';
import {
  jsonError,
  jsonResponse,
  mapDbErrorToStatus,
  methodNotAllowed,
  parseIdParam,
} from '@/app/lib/api-shared';

const VALID_STATUSES: JobStatus[] = ['pending', 'running', 'completed', 'failed'];

export async function loader({ request, params }: LoaderFunctionArgs) {
  const id = parseIdParam(params.id ?? '');
  if (!id) return jsonError('Invalid `id`', 400);

  const url = new URL(request.url);
  const full = url.searchParams.get('full') === 'true';

  const job = full ? await getJobWithTasks(id) : await getJobWithTasksLite(id);
  if (!job) return jsonError('Not found', 404);

  return jsonResponse({ code: 0, message: 'success', data: job });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const method = request.method;

  if (method === 'PUT' || method === 'PATCH') {
    return updateJob(request, params.id ?? '');
  }

  if (method === 'DELETE') {
    const id = parseIdParam(params.id ?? '');
    if (!id) return jsonError('Invalid `id`', 400);

    const existing = await getJobById(id);
    if (!existing) return jsonError('Not found', 404);

    const changes = await deleteJobById(id);
    if (changes === 0) return jsonError('Not found', 404);

    return jsonResponse({ code: 0, message: 'success', data: existing });
  }

  return methodNotAllowed(['PUT', 'PATCH', 'DELETE']);
}

async function updateJob(request: Request, rawId: string) {
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

    const job = await updateJobById(id, patch);
    if (!job) return jsonError('Not found', 404);

    return jsonResponse({ code: 0, message: 'success', data: job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, mapDbErrorToStatus(message));
  }
}
