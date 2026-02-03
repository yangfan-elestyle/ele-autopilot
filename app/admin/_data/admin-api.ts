export async function apiJson<T>(input: string, init?: RequestInit) {
  const res = await fetch(input, {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `请求失败 (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export function makeListUrl(resource: 'folders' | 'tasks', filter: Record<string, unknown>) {
  const qs = new URLSearchParams();
  qs.set('sort', JSON.stringify(['created_at', 'DESC']));
  qs.set('range', JSON.stringify([0, 9999]));
  qs.set('filter', JSON.stringify(filter ?? {}));
  return `/api/admin/${resource}?${qs.toString()}`;
}
