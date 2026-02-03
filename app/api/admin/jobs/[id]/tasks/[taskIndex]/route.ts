import { NextResponse } from 'next/server';

import { getJobById, getJobTaskByIndex } from '@/lib/db';
import { jsonError, parseIdParam } from '../../../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type NextRouteContext = {
  params: Promise<{ id: string; taskIndex: string }>;
};

export async function GET(_request: Request, context: NextRouteContext) {
  const { id: rawId, taskIndex: rawTaskIndex } = await context.params;
  const id = parseIdParam(rawId);
  if (!id) return jsonError('Invalid `id`', 400);

  const taskIndex = parseInt(rawTaskIndex, 10);
  if (isNaN(taskIndex) || taskIndex < 0) {
    return jsonError('Invalid `taskIndex`', 400);
  }

  // 检查 job 是否存在
  const job = getJobById(id);
  if (!job) return jsonError('Job not found', 404);

  // 获取 job_task 详情
  const jobTask = getJobTaskByIndex(id, taskIndex);
  if (!jobTask) return jsonError('JobTask not found', 404);

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: jobTask,
  });
}
