import { NextResponse } from 'next/server';

import { deleteFolderById, getFolderById, updateFolderById } from '@/lib/db';
import type { Id } from '@/lib/db';
import { isValidId } from '@/lib/db/utils';
import { jsonError, mapDbErrorToStatus, parseIdParam } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: {
    id: string;
  };
};

type NextRouteContext = {
  params: Promise<RouteContext['params']>;
};

export async function GET(_request: Request, context: NextRouteContext) {
  const { id: rawId } = await context.params;
  const id = parseIdParam(rawId);
  if (!id) return jsonError('Invalid `id`', 400);

  const folder = getFolderById(id);
  if (!folder) return jsonError('Not found', 404);
  return NextResponse.json(folder);
}

export async function PUT(request: Request, context: NextRouteContext) {
  return updateFolder(request, context);
}

export async function PATCH(request: Request, context: NextRouteContext) {
  return updateFolder(request, context);
}

async function updateFolder(request: Request, context: NextRouteContext) {
  const { id: rawId } = await context.params;
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
    const name = typeof payload.name === 'string' ? payload.name : undefined;
    let parent_id: Id | null | undefined;
    if (payload.parent_id === undefined) {
      parent_id = undefined;
    } else if (payload.parent_id === null) {
      parent_id = null;
    } else if (isValidId(payload.parent_id)) {
      parent_id = payload.parent_id;
    } else {
      throw new Error('Invalid parent_id');
    }

    let order_index: number | null | undefined;
    if (payload.order_index === undefined) {
      order_index = undefined;
    } else if (payload.order_index === null) {
      order_index = null;
    } else if (typeof payload.order_index === 'number') {
      order_index = payload.order_index;
    } else {
      throw new Error('Invalid order_index');
    }

    const folder = updateFolderById(id, { name, parent_id, order_index });
    return NextResponse.json(folder);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, mapDbErrorToStatus(message));
  }
}

export async function DELETE(_request: Request, context: NextRouteContext) {
  const { id: rawId } = await context.params;
  const id = parseIdParam(rawId);
  if (!id) return jsonError('Invalid `id`', 400);

  const existing = getFolderById(id);
  if (!existing) return jsonError('Not found', 404);

  // keep response compatible with ra-data-simple-rest expectations (deleted record)
  const changes = deleteFolderById(id);
  if (changes === 0) return jsonError('Not found', 404);
  return NextResponse.json(existing);
}
