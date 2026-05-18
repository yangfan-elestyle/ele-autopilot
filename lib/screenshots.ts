import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

import type { TaskActionResult } from './db';

const URL_PREFIX = '/screenshots';

export function getScreenshotsDir(): string {
  return resolve(process.cwd(), process.env.SCREENSHOTS_DIR ?? 'data/screenshots');
}

export function resolveScreenshotAbsPath(relPath: string): string | null {
  const base = getScreenshotsDir();
  const abs = resolve(base, relPath);
  const baseWithSep = base.endsWith(sep) ? base : base + sep;
  if (abs !== base && !abs.startsWith(baseWithSep)) return null;
  return abs;
}

function stripDataUriPrefix(value: string): string {
  const m = /^data:image\/[a-zA-Z0-9+.-]+;base64,/.exec(value);
  return m ? value.slice(m[0].length) : value;
}

function looksLikePath(value: string): boolean {
  return value.startsWith('/') || /^https?:\/\//.test(value);
}

function writeScreenshotFile(jobTaskId: string, stepIndex: number, base64: string): string {
  const dir = resolve(getScreenshotsDir(), jobTaskId);
  mkdirSync(dir, { recursive: true });
  const absPath = resolve(dir, `${stepIndex}.png`);
  writeFileSync(absPath, Buffer.from(stripDataUriPrefix(base64), 'base64'));
  return `${URL_PREFIX}/${jobTaskId}/${stepIndex}.png`;
}

/**
 * 把 result.steps[].thinking_image 的 base64 内嵌图片抽出落盘, 字段值替换为 /screenshots/{id}/{i}.png 路径.
 * 已经是路径 (以 / 或 http(s):// 开头) 的字段保持不变 - 幂等, 重跑安全.
 * 返回处理后的 result (同一对象, 字段就地修改).
 */
export function externalizeScreenshots(
  jobTaskId: string,
  result: TaskActionResult | null,
): TaskActionResult | null {
  if (!result || !Array.isArray(result.steps)) return result;

  for (let i = 0; i < result.steps.length; i++) {
    const step = result.steps[i] as { thinking_image?: unknown };
    const img = step.thinking_image;
    if (typeof img !== 'string' || img.length === 0 || img === '<string>') continue;
    if (looksLikePath(img)) continue;
    step.thinking_image = writeScreenshotFile(jobTaskId, i, img);
  }

  return result;
}

export function ensureScreenshotsDir(): void {
  const dir = getScreenshotsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // 确保父目录存在 (容错 SCREENSHOTS_DIR 指向多层不存在路径)
  mkdirSync(dirname(dir), { recursive: true });
}
