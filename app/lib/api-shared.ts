import type { Id } from '@/lib/db';
import { isValidId } from '@/lib/db/utils';

type SortValue = [string, string];

type RangeValue = [number, number];

type ListParams = {
  sort: SortValue;
  range: RangeValue;
  filter: Record<string, unknown>;
};

const JSON_HEADER = { 'Content-Type': 'application/json; charset=utf-8' };

export function jsonResponse<T>(data: T, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADER, ...(init?.headers ?? {}) },
  });
}

export function jsonError(message: string, status = 400): Response {
  return jsonResponse({ error: message }, { status });
}

export function parseIdParam(raw: string): Id | null {
  return isValidId(raw) ? raw : null;
}

export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function parseListParams(request: Request): ListParams {
  const url = new URL(request.url);

  const sort = safeJsonParse<SortValue>(url.searchParams.get('sort'), ['created_at', 'DESC']);
  const range = safeJsonParse<RangeValue>(url.searchParams.get('range'), [0, 24]);
  const filter = safeJsonParse<Record<string, unknown>>(url.searchParams.get('filter'), {});

  return { sort, range, filter };
}

export function withContentRange(resource: string, start: number, end: number, total: number) {
  const headers = new Headers(JSON_HEADER);
  headers.set('Content-Range', `${resource} ${start}-${end}/${total}`);
  headers.set('Access-Control-Expose-Headers', 'Content-Range');
  return headers;
}

export function mapDbErrorToStatus(message: string) {
  const normalized = message.toLowerCase();
  if (normalized === 'not found' || normalized.endsWith(' not found')) {
    return 404;
  }
  if (
    normalized.includes('invalid') ||
    normalized.includes('required') ||
    normalized.includes('subfolders') ||
    normalized.includes('has tasks')
  ) {
    return 400;
  }
  return 500;
}

export function methodNotAllowed(allow: string[]): Response {
  return jsonResponse(
    { error: `Method not allowed` },
    { status: 405, headers: { Allow: allow.join(', ') } },
  );
}
