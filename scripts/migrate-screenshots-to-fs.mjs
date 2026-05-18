#!/usr/bin/env node
/**
 * 一次性迁移: 把 job_tasks.result.steps[].thinking_image 的 base64 内嵌图片抽出落盘到
 * data/screenshots/{job_task_id}/{step_index}.png, 字段值替换为 /screenshots/{...} 路径.
 *
 * 幂等: 已经是 / 或 http(s):// 开头的字段会被跳过, 可以安全重跑.
 *
 * 运行 (项目根):
 *   node scripts/migrate-screenshots-to-fs.mjs              # 仅迁移, 不 VACUUM
 *   node scripts/migrate-screenshots-to-fs.mjs --vacuum     # 迁移完后 VACUUM 回收磁盘
 *
 * 环境变量:
 *   SQLITE_DB_PATH       SQLite 文件路径 (默认 data/app.sqlite)
 *   SCREENSHOTS_DIR      落盘根目录 (默认 data/screenshots)
 */
import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DB_PATH = resolve(process.cwd(), process.env.SQLITE_DB_PATH ?? 'data/app.sqlite');
const SCREENSHOTS_DIR = resolve(process.cwd(), process.env.SCREENSHOTS_DIR ?? 'data/screenshots');
const shouldVacuum = process.argv.includes('--vacuum');

function stripDataUriPrefix(value) {
  const m = /^data:image\/[a-zA-Z0-9+.-]+;base64,/.exec(value);
  return m ? value.slice(m[0].length) : value;
}

function isExternalizable(v) {
  return (
    typeof v === 'string' &&
    v.length > 0 &&
    v !== '<string>' &&
    !/^(data:|https?:\/\/|\/)/.test(v)
  );
}

function externalizeRow(jobTaskId, result) {
  if (!result || !Array.isArray(result.steps)) return 0;
  const dir = resolve(SCREENSHOTS_DIR, jobTaskId);
  let dirCreated = false;
  let n = 0;
  for (let i = 0; i < result.steps.length; i++) {
    const step = result.steps[i];
    const img = step?.thinking_image;
    if (!isExternalizable(img)) continue;
    if (!dirCreated) {
      mkdirSync(dir, { recursive: true });
      dirCreated = true;
    }
    writeFileSync(resolve(dir, `${i}.png`), Buffer.from(stripDataUriPrefix(img), 'base64'));
    step.thinking_image = `/screenshots/${jobTaskId}/${i}.png`;
    n++;
  }
  return n;
}

console.log(`DB:           ${DB_PATH}`);
console.log(`Screenshots:  ${SCREENSHOTS_DIR}`);
console.log(`VACUUM:       ${shouldVacuum ? 'yes' : 'no'}\n`);

const db = new Database(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

// 先只取 id 列表 (轻量), 再按 id 逐行 SELECT+UPDATE — 避免一次把 5+ GB JSON 全部加载进 v8 heap.
const ids = db
  .prepare(`SELECT id FROM job_tasks WHERE result IS NOT NULL ORDER BY id`)
  .all()
  .map((r) => r.id);
console.log(`Found ${ids.length} rows with result`);

const selectOne = db.prepare(`SELECT result FROM job_tasks WHERE id = ?`);
const update = db.prepare(`UPDATE job_tasks SET result = ? WHERE id = ?`);

let processed = 0;
let rowsUpdated = 0;
let imagesWritten = 0;
const t0 = Date.now();

for (const id of ids) {
  const row = selectOne.get(id);
  if (!row?.result) {
    processed++;
    continue;
  }

  let parsed;
  try {
    parsed = JSON.parse(row.result);
  } catch {
    console.warn(`[skip] ${id}: invalid JSON`);
    processed++;
    continue;
  }

  const n = externalizeRow(id, parsed);
  if (n > 0) {
    update.run(JSON.stringify(parsed), id);
    rowsUpdated++;
    imagesWritten += n;
  }
  processed++;

  if (processed % 25 === 0) {
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    const heapMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);
    console.log(
      `  ${processed}/${ids.length}  rows_updated=${rowsUpdated}  images=${imagesWritten}  ${sec}s  heap=${heapMb}MB`,
    );
  }
}

const sec = ((Date.now() - t0) / 1000).toFixed(1);
console.log(
  `\nDone: ${processed}/${ids.length} rows, ${rowsUpdated} updated, ${imagesWritten} images in ${sec}s`,
);

if (shouldVacuum) {
  console.log('\nRunning VACUUM ...');
  const tv = Date.now();
  db.exec('VACUUM');
  console.log(`VACUUM done in ${((Date.now() - tv) / 1000).toFixed(1)}s`);
}

db.close();
