import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs';
import { renderToReadableStream } from 'react-dom/server';
import type { EntryContext } from 'react-router';
import { ServerRouter } from 'react-router';

export const streamTimeout = 5_000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, { status: responseStatusCode, headers: responseHeaders });
  }

  const cache = createCache();

  const body = await renderToReadableStream(
    <StyleProvider cache={cache}>
      <ServerRouter context={routerContext} url={request.url} />
    </StyleProvider>,
    {
      signal: request.signal,
      onError(error: unknown) {
        responseStatusCode = 500;
        console.error(error);
      },
    },
  );

  // antd cssinjs extractStyle 强依赖完整渲染, 全量缓冲到 string 后注入 <style>
  const html = await new Response(body).text();
  const styleText = extractStyle(cache);
  const patched = html.replace('</head>', `${styleText}</head>`);

  responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(patched, { status: responseStatusCode, headers: responseHeaders });
}
