import 'server-only';

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

declare global {
  var __eleAutopilotDb: Database | undefined;
}

function getDbPath() {
  return resolve(process.cwd(), process.env.SQLITE_DB_PATH ?? 'data/app.sqlite');
}

function initSchema(db: Database) {
  db.run(`
    PRAGMA foreign_keys = ON;
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT NULL REFERENCES folders(id) ON DELETE RESTRICT,
      order_index INTEGER NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE RESTRICT,
      title TEXT,
      text TEXT NOT NULL,
      sub_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  // 迁移：为已有 tasks 表添加 title 列
  try {
    db.run(`ALTER TABLE tasks ADD COLUMN title TEXT`);
  } catch {
    // 列已存在则忽略
  }

  db.run(`CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);`);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_folders_order ON folders(parent_id, order_index, created_at);`,
  );
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_folder_id ON tasks(folder_id);`);

  // jobs 表：Job 执行记录（一个 TaskRow 执行一次 = 一个 Job）
  // 注：Local 侧直接使用 Server 的 job.id，不再有独立的 local_job_id
  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      config TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_task_id ON jobs(task_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);`);

  // job_tasks 表：flat 展开后每个任务的执行记录
  // 一个 Job 执行时会递归展开 sub_ids，flat 成任务数组，每个任务对应一条 job_task
  // 重要：result 字段存储完整的执行结果（可能非常大，包含每一步的详细信息）
  db.run(`
    CREATE TABLE IF NOT EXISTS job_tasks (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      task_index INTEGER NOT NULL,
      task_title TEXT,
      task_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT,
      error TEXT,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );
  `);

  // 迁移：为已有 job_tasks 表添加 task_title 列
  try {
    db.run(`ALTER TABLE job_tasks ADD COLUMN task_title TEXT`);
  } catch {
    // 列已存在则忽略
  }

  db.run(`CREATE INDEX IF NOT EXISTS idx_job_tasks_job_id ON job_tasks(job_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_job_tasks_status ON job_tasks(status);`);

  // settings 表：全局配置（key-value 结构）
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  // 插入默认的 agent_config（如果不存在）
  const defaultAgentConfig = JSON.stringify({
    gemini_model: 'gemini-3-flash-preview',
    max_steps: 1000,
    headless: false,
    use_vision: true,
    max_failures: 10,
    max_actions_per_step: 1,
    use_thinking: false,
    flash_mode: true,
    llm_timeout: 240,
    step_timeout: 240,
    override_system_message: '',
    extend_system_message: '',
  });
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('agent_config', ?)`, [
    defaultAgentConfig,
  ]);
}

function seedTestData(db: Database) {
  // 检查是否已有数据
  const count = db.query(`SELECT COUNT(1) as c FROM folders`).get() as {
    c: number;
  };
  if (count.c > 0) return;

  // QA 自动化测试场景的文件夹结构
  const folderData = [
    // 顶级模块
    { name: '登录模块', parent_id: null },
    { name: '用户管理', parent_id: null },
    { name: '订单系统', parent_id: null },
    { name: '支付模块', parent_id: null },
    { name: '商品管理', parent_id: null },
    { name: '购物车', parent_id: null },
    { name: '搜索功能', parent_id: null },
    { name: '消息通知', parent_id: null },
    { name: '数据报表', parent_id: null },
    { name: '系统设置', parent_id: null },
  ];

  // 插入顶级文件夹
  const insertFolder = db.query(`INSERT INTO folders (id, name, parent_id) VALUES (?, ?, ?)`);
  const topFolderIds: string[] = [];
  for (const f of folderData) {
    const id = crypto.randomUUID().toLowerCase();
    insertFolder.run(id, f.name, f.parent_id);
    topFolderIds.push(id);
  }

  // 为每个顶级文件夹添加子文件夹
  const subFolders = ['正向用例', '异常用例', '边界测试', '兼容性测试', '性能测试'];
  const allFolderIds = [...topFolderIds];
  for (const parentId of topFolderIds) {
    for (const subName of subFolders) {
      const id = crypto.randomUUID().toLowerCase();
      insertFolder.run(id, subName, parentId);
      allFolderIds.push(id);
    }
  }

  // 测试用例模板
  const taskTemplates = [
    // 登录相关
    '验证使用正确的用户名和密码可以成功登录',
    '验证使用错误密码登录时显示正确的错误提示',
    '验证用户名为空时无法提交登录表单',
    '验证密码为空时无法提交登录表单',
    '验证连续5次登录失败后账号被锁定',
    '验证登录成功后正确跳转到首页',
    '验证记住密码功能正常工作',
    '验证退出登录后清除所有会话信息',
    // 用户相关
    '验证可以成功创建新用户账号',
    '验证用户名重复时显示错误提示',
    '验证邮箱格式验证正常工作',
    '验证手机号格式验证正常工作',
    '验证修改用户信息后数据正确保存',
    '验证删除用户时需要二次确认',
    '验证用户角色权限分配正确',
    // 订单相关
    '验证可以成功创建订单',
    '验证订单金额计算正确',
    '验证订单状态流转正常',
    '验证取消订单功能正常',
    '验证订单详情页信息完整显示',
    '验证订单列表分页功能正常',
    '验证按订单号搜索功能正常',
    '验证按时间范围筛选订单功能正常',
    // 支付相关
    '验证支付宝支付流程正常',
    '验证微信支付流程正常',
    '验证银行卡支付流程正常',
    '验证支付超时后订单自动取消',
    '验证支付成功后订单状态更新',
    '验证退款流程正常',
    // 商品相关
    '验证商品列表正确展示',
    '验证商品详情页信息完整',
    '验证商品库存显示正确',
    '验证商品价格显示正确',
    '验证商品分类筛选正常',
    '验证商品排序功能正常',
    // 购物车相关
    '验证添加商品到购物车成功',
    '验证修改购物车商品数量成功',
    '验证删除购物车商品成功',
    '验证购物车商品数量上限检查',
    '验证购物车金额计算正确',
    // 搜索相关
    '验证关键词搜索返回正确结果',
    '验证搜索历史记录保存',
    '验证热门搜索词展示',
    '验证搜索结果排序正确',
    '验证空搜索结果提示友好',
    // 通知相关
    '验证系统通知正确推送',
    '验证消息已读状态同步',
    '验证消息删除功能正常',
    // 报表相关
    '验证日报数据统计正确',
    '验证周报数据统计正确',
    '验证月报数据统计正确',
    '验证报表导出功能正常',
    // 设置相关
    '验证修改密码功能正常',
    '验证修改手机号需要验证码',
    '验证系统配置保存成功',
  ];

  // 插入测试任务，分配到各个文件夹
  const insertTask = db.query(`INSERT INTO tasks (id, folder_id, text) VALUES (?, ?, ?)`);
  let taskIndex = 0;
  const totalTasks = 100;

  while (taskIndex < totalTasks) {
    for (const folderId of allFolderIds) {
      if (taskIndex >= totalTasks) break;
      const text = taskTemplates[taskIndex % taskTemplates.length];
      const id = crypto.randomUUID().toLowerCase();
      insertTask.run(id, folderId, text);
      taskIndex++;
    }
  }
}

export function getDb() {
  if (globalThis.__eleAutopilotDb) return globalThis.__eleAutopilotDb;

  const dbPath = getDbPath();
  const isNewDb = !existsSync(dbPath);
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  initSchema(db);

  if (isNewDb) {
    seedTestData(db);
  }

  globalThis.__eleAutopilotDb = db;
  return db;
}
