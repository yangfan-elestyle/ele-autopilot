import { readFileSync } from 'node:fs';

import type { LoaderFunctionArgs } from 'react-router';

import { resolveScreenshotAbsPath } from '@/lib/screenshots';

export async function loader({ params }: LoaderFunctionArgs) {
  const rel = params['*'] ?? '';
  if (!rel || rel.includes('\0')) {
    return new Response('Not found', { status: 404 });
  }

  const abs = resolveScreenshotAbsPath(rel);
  if (!abs) {
    return new Response('Forbidden', { status: 403 });
  }

  let buf: Buffer;
  try {
    buf = readFileSync(abs);
  } catch {
    return new Response('Not found', { status: 404 });
  }

  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
