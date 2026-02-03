import { NextResponse } from 'next/server';

import { getJobById, updateJobById } from '@/lib/db';
import type { JobStatus } from '@/lib/db';
import { isValidId } from '@/lib/db/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type NextRouteContext = {
  params: Promise<{ id: string }>;
};

const FINAL_STATUSES: JobStatus[] = ['completed', 'failed'];

function jsonResponse(code: number, message: string, data: unknown = null, status = 200) {
  return NextResponse.json({ code, message, data }, { status });
}

/**
 * POST /api/jobs/[id]/callback/complete
 * 接收 Local 的 Job 完成回调
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

  // 验证 status 必须是终态
  const status = payload.status;
  if (typeof status !== 'string' || !FINAL_STATUSES.includes(status as JobStatus)) {
    return jsonResponse(400, 'Invalid status, must be completed or failed', null, 400);
  }

  // 可选字段
  const error = typeof payload.error === 'string' ? payload.error : null;
  const completedAt = typeof payload.completed_at === 'string' ? payload.completed_at : undefined;

  try {
    updateJobById(rawId, {
      status: status as JobStatus,
      error,
      completed_at: completedAt,
    });

    return jsonResponse(0, 'success', null);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse(500, message, null, 500);
  }
}
