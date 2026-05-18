import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import { deleteTaskById, getTaskById, updateTaskById } from '@/lib/db';
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

  const task = await getTaskById(id);
  if (!task) return jsonError('Not found', 404);
  return jsonResponse(task);
}

export async function action({ request, params }: ActionFunctionArgs) {
  const method = request.method;

  if (method === 'PUT' || method === 'PATCH') {
    return updateTask(request, params.id ?? '');
  }

  if (method === 'DELETE') {
    const id = parseIdParam(params.id ?? '');
    if (!id) return jsonError('Invalid `id`', 400);

    const existing = await getTaskById(id);
    if (!existing) return jsonError('Not found', 404);

    const changes = await deleteTaskById(id);
    if (changes === 0) return jsonError('Not found', 404);
    return jsonResponse(existing);
  }

  return methodNotAllowed(['PUT', 'PATCH', 'DELETE']);
}

async function updateTask(request: Request, rawId: string) {
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
    const title =
      payload.title === undefined
        ? undefined
        : typeof payload.title === 'string'
          ? payload.title
          : null;
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

    const task = await updateTaskById(id, { title, text, folder_id, sub_ids });
    return jsonResponse(task);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, mapDbErrorToStatus(message));
  }
}
