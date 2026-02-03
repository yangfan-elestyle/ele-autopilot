import { NextResponse } from 'next/server';

import { reorderFolders } from '@/lib/db';
import { isValidId } from '@/lib/db/utils';
import { jsonError, mapDbErrorToStatus } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
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

  const order = payload.order;
  if (!Array.isArray(order)) {
    return jsonError('`order` must be an array of folder ids', 400);
  }

  const folderIds = order.filter(isValidId);
  if (folderIds.length === 0) {
    return jsonError('`order` must contain valid folder ids', 400);
  }

  let parentId: string | null = null;
  if (payload.parent_id === null || payload.parent_id === undefined) {
    parentId = null;
  } else if (isValidId(payload.parent_id)) {
    parentId = payload.parent_id;
  } else {
    return jsonError('Invalid parent_id', 400);
  }

  try {
    reorderFolders(folderIds, parentId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, mapDbErrorToStatus(message));
  }
}
