import { createRequestHandler } from 'react-router';

import { runWithBindings } from '@/lib/bindings';

declare global {
  // 由 wrangler types 注入完整 Env 类型 (含 DB / SCREENSHOTS bindings)
  interface CloudflareEnvironment extends Env {}
}

declare module 'react-router' {
  interface AppLoadContext {
    cloudflare: {
      env: CloudflareEnvironment;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    return runWithBindings({ DB: env.DB, SCREENSHOTS: env.SCREENSHOTS }, () =>
      requestHandler(request, { cloudflare: { env, ctx } }),
    );
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
