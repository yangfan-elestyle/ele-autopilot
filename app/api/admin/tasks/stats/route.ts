import { NextResponse } from 'next/server';

import { getJobStatsByTaskIds } from '@/lib/db';
import type { Id } from '@/lib/db';
import { isValidId } from '@/lib/db/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 批量获取 task 的 job 执行统计
 * GET /api/admin/tasks/stats?ids=id1,id2,id3
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get('ids') || '';

  const taskIds: Id[] = idsParam
    .split(',')
    .map((s) => s.trim())
    .filter(isValidId);

  if (taskIds.length === 0) {
    return NextResponse.json({});
  }

  const statsMap = getJobStatsByTaskIds(taskIds);

  // 转换为普通对象返回
  const result: Record<
    Id,
    { total: number; completed: number; failed: number; running: number; pending: number }
  > = {};
  for (const [id, stats] of statsMap) {
    result[id] = stats;
  }

  return NextResponse.json(result);
}
