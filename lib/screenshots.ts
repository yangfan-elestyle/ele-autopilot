import { getBindings } from './bindings';
import type { TaskActionResult } from './db';

const URL_PREFIX = '/screenshots';

function stripDataUriPrefix(value: string): string {
  const m = /^data:image\/[a-zA-Z0-9+.-]+;base64,/.exec(value);
  return m ? value.slice(m[0].length) : value;
}

function looksLikePath(value: string): boolean {
  return value.startsWith('/') || /^https?:\/\//.test(value);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function r2KeyFromRelPath(rel: string): string | null {
  if (!rel || rel.includes('\0') || rel.includes('..')) return null;
  const trimmed = rel.replace(/^\/+/, '');
  if (!/^[A-Za-z0-9_./-]+$/.test(trimmed)) return null;
  return trimmed;
}

async function writeScreenshotToR2(
  jobTaskId: string,
  stepIndex: number,
  base64: string,
): Promise<string> {
  const { SCREENSHOTS } = getBindings();
  const key = `${jobTaskId}/${stepIndex}.png`;
  await SCREENSHOTS.put(key, base64ToBytes(stripDataUriPrefix(base64)), {
    httpMetadata: { contentType: 'image/png' },
  });
  return `${URL_PREFIX}/${key}`;
}

/**
 * 把 result.steps[].thinking_image 的 base64 内嵌图片抽出落盘到 R2,
 * 字段值替换为 /screenshots/{id}/{i}.png. 幂等 (已经是路径的不动).
 */
export async function externalizeScreenshots(
  jobTaskId: string,
  result: TaskActionResult | null,
): Promise<TaskActionResult | null> {
  if (!result || !Array.isArray(result.steps)) return result;

  for (let i = 0; i < result.steps.length; i++) {
    const step = result.steps[i] as { thinking_image?: unknown };
    const img = step.thinking_image;
    if (typeof img !== 'string' || img.length === 0 || img === '<string>') continue;
    if (looksLikePath(img)) continue;
    step.thinking_image = await writeScreenshotToR2(jobTaskId, i, img);
  }

  return result;
}
