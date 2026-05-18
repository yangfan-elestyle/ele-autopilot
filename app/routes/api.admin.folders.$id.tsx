import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import { deleteFolderById, getFolderById, updateFolderById } from '@/lib/db';
import type { Id } from '@/lib/db';
import { isValidId } from '@/lib/db/utils';
import {
  jsonError,
  jsonResponse,
  mapDbErrorToStatus,
  methodNotAllowed,
  parseIdParam,
} from '@/app/lib/api-shared';

export async function loader({ params }: LoaderFunctionArgs) {
  const id = parseIdParam(params.id ?? '');
  if (!id) return jsonError('Invalid `id`', 400);

  const folder = await getFolderById(id);
  if (!folder) return jsonError('Not found', 404);
  return jsonResponse(folder);
}

export async function action({ request, params }: ActionFunctionArgs) {
  const method = request.method;

  if (method === 'PUT' || method === 'PATCH') {
    return updateFolder(request, params.id ?? '');
  }

  if (method === 'DELETE') {
    const id = parseIdParam(params.id ?? '');
    if (!id) return jsonError('Invalid `id`', 400);

    const existing = await getFolderById(id);
    if (!existing) return jsonError('Not found', 404);

    const changes = await deleteFolderById(id);
    if (changes === 0) return jsonError('Not found', 404);
    return jsonResponse(existing);
  }

  return methodNotAllowed(['PUT', 'PATCH', 'DELETE']);
}

async function updateFolder(request: Request, rawId: string) {
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

    const folder = await updateFolderById(id, { name, parent_id, order_index });
    return jsonResponse(folder);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, mapDbErrorToStatus(message));
  }
}
