import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import { countJobs, createJob, listJobsPage } from '@/lib/db';
import type { JobConfig } from '@/lib/db';
import { isValidId } from '@/lib/db/utils';
import {
  jsonError,
  jsonResponse,
  mapDbErrorToStatus,
  methodNotAllowed,
  parseListParams,
  withContentRange,
} from '@/app/lib/api-shared';

export async function loader({ request }: LoaderFunctionArgs) {
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
  return new Response(JSON.stringify(data), { headers });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);

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

    let config: JobConfig = {};
    if (payload.config !== undefined) {
      if (payload.config && typeof payload.config === 'object' && !Array.isArray(payload.config)) {
        config = payload.config as JobConfig;
      } else {
        return jsonError('Invalid config', 400);
      }
    }

    const job = createJob({ task_id, config });

    return jsonResponse(
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
