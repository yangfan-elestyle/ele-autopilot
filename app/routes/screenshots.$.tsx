import type { LoaderFunctionArgs } from 'react-router';

import { getBindings } from '@/lib/bindings';
import { r2KeyFromRelPath } from '@/lib/screenshots';

export async function loader({ params }: LoaderFunctionArgs) {
  const rel = params['*'] ?? '';
  const key = r2KeyFromRelPath(rel);
  if (!key) return new Response('Not found', { status: 404 });

  const { SCREENSHOTS } = getBindings();
  const obj = await SCREENSHOTS.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType ?? 'image/png');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('ETag', obj.httpEtag);
  return new Response(obj.body, { headers });
}
