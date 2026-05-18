import { PassThrough } from 'node:stream';

import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs';
import { createReadableStreamFromReadable } from '@react-router/node';
import { isbot } from 'isbot';
import type { RenderToPipeableStreamOptions } from 'react-dom/server';
import { renderToPipeableStream } from 'react-dom/server';
import type { EntryContext } from 'react-router';
import { ServerRouter } from 'react-router';

export const streamTimeout = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, { status: responseStatusCode, headers: responseHeaders });
  }

  const cache = createCache();

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get('user-agent');

    // Use onAllReady so antd cssinjs cache is fully populated before we flush styles.
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? 'onAllReady' : 'onAllReady';

    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000,
    );

    const { pipe, abort } = renderToPipeableStream(
      <StyleProvider cache={cache}>
        <ServerRouter context={routerContext} url={request.url} />
      </StyleProvider>,
      {
        [readyOption]() {
          shellRendered = true;

          // Inject antd cssinjs styles into <head> of the rendered HTML by
          // transforming the pipe output.
          const styleText = extractStyle(cache);

          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });

          // Buffer + replace </head> with styleText + </head>, then emit at once.
          const chunks: Buffer[] = [];
          const transformer = new PassThrough();
          transformer.on('data', (chunk: Buffer) => chunks.push(chunk));
          transformer.on('end', () => {
            const html = Buffer.concat(chunks).toString('utf8');
            const patched = html.replace('</head>', `${styleText}</head>`);
            body.write(patched);
            body.end();
          });

          pipe(transformer);

          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set('Content-Type', 'text/html; charset=utf-8');

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        },
      },
    );
  });
}
