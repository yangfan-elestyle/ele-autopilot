import { AsyncLocalStorage } from 'node:async_hooks';

export type AppBindings = {
  DB: D1Database;
  SCREENSHOTS: R2Bucket;
};

const storage = new AsyncLocalStorage<AppBindings>();

export function runWithBindings<T>(
  bindings: AppBindings,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return storage.run(bindings, fn);
}

export function getBindings(): AppBindings {
  const bindings = storage.getStore();
  if (!bindings) {
    throw new Error('Cloudflare bindings not available; call runWithBindings() in worker entry');
  }
  return bindings;
}
