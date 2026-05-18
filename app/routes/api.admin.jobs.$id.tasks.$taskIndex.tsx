import type { LoaderFunctionArgs } from 'react-router';

import { getJobById, getJobTaskByIndex } from '@/lib/db';
import { jsonError, jsonResponse, parseIdParam } from '@/app/lib/api-shared';

export async function loader({ params }: LoaderFunctionArgs) {
  const id = parseIdParam(params.id ?? '');
  if (!id) return jsonError('Invalid `id`', 400);

  const taskIndex = parseInt(params.taskIndex ?? '', 10);
  if (isNaN(taskIndex) || taskIndex < 0) {
    return jsonError('Invalid `taskIndex`', 400);
  }

  const job = getJobById(id);
  if (!job) return jsonError('Job not found', 404);

  const jobTask = getJobTaskByIndex(id, taskIndex);
  if (!jobTask) return jsonError('JobTask not found', 404);

  return jsonResponse({ code: 0, message: 'success', data: jobTask });
}
