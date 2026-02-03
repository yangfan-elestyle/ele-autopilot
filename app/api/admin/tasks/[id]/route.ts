import { NextResponse } from 'next/server';

import { deleteTaskById, getTaskById, updateTaskById } from '@/lib/db';
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

  const task = getTaskById(id);
  if (!task) return jsonError('Not found', 404);
  return NextResponse.json(task);
}

export async function PUT(request: Request, context: NextRouteContext) {
  return updateTask(request, context);
}

export async function PATCH(request: Request, context: NextRouteContext) {
  return updateTask(request, context);
}

async function updateTask(request: Request, context: NextRouteContext) {
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
    const text = typeof payload.text === 'string' ? payload.text : undefined;
    let folder_id: Id | undefined;
    if (payload.folder_id === undefined) {
      folder_id = undefined;
    } else if (isValidId(payload.folder_id)) {
      folder_id = payload.folder_id;
    } else {
      throw new Error('Invalid folder_id');
    }

    let sub_ids: Id[] | undefined;
    if (payload.sub_ids === undefined) {
      sub_ids = undefined;
    } else if (Array.isArray(payload.sub_ids) && payload.sub_ids.every(isValidId)) {
      sub_ids = payload.sub_ids as Id[];
    } else {
      throw new Error('Invalid sub_ids');
    }

    const task = updateTaskById(id, { text, folder_id, sub_ids });
    return NextResponse.json(task);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, mapDbErrorToStatus(message));
  }
}

export async function DELETE(_request: Request, context: NextRouteContext) {
  const { id: rawId } = await context.params;
  const id = parseIdParam(rawId);
  if (!id) return jsonError('Invalid `id`', 400);

  const existing = getTaskById(id);
  if (!existing) return jsonError('Not found', 404);

  // keep response compatible with ra-data-simple-rest expectations (deleted record)
  const changes = deleteTaskById(id);
  if (changes === 0) return jsonError('Not found', 404);
  return NextResponse.json(existing);
}
