import type { LoaderFunctionArgs } from 'react-router';

import { getJobStatsByTaskIds } from '@/lib/db';
import type { Id } from '@/lib/db';
import { isValidId } from '@/lib/db/utils';
import { jsonResponse } from '@/app/lib/api-shared';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get('ids') || '';

  const taskIds: Id[] = idsParam
    .split(',')
    .map((s) => s.trim())
    .filter(isValidId);

  if (taskIds.length === 0) {
    return jsonResponse({});
  }

  const statsMap = await getJobStatsByTaskIds(taskIds);

  const result: Record<
    Id,
    { total: number; completed: number; failed: number; running: number; pending: number }
  > = {};
  for (const [id, stats] of statsMap) {
    result[id] = stats;
  }

  return jsonResponse(result);
}
