import { getDb } from './connection';
import type { Id, SortOrder } from './types';

const ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function generateId(): Id {
  return crypto.randomUUID().toLowerCase();
}

export function isValidId(value: unknown): value is Id {
  return typeof value === 'string' && ID_REGEX.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function coercePositiveInt(value: unknown): number | null {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(num) && num > 0 ? num : null;
}

export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function normalizeOrder(order: string | undefined): SortOrder {
  return order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
}

export async function queryAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = getDb();
  const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql);
  const { results } = await stmt.all<T>();
  return results ?? [];
}

export async function queryGet<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const db = getDb();
  const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql);
  const row = await stmt.first<T>();
  return row ?? null;
}

export async function queryRun(
  sql: string,
  params: unknown[] = [],
): Promise<{ changes: number }> {
  const db = getDb();
  const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql);
  const { meta } = await stmt.run();
  return { changes: meta?.changes ?? 0 };
}
