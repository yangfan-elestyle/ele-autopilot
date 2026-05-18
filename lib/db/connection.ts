import { getBindings } from '../bindings';

export function getDb(): D1Database {
  return getBindings().DB;
}
