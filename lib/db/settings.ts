import 'server-only';

import { getDb } from './connection';
import type { JobConfig, SettingRow } from './types';

// ============ Settings CRUD ============

/**
 * 获取指定 key 的配置
 */
export function getSetting(key: string): SettingRow | null {
  const db = getDb();
  const row = db.query(`SELECT key, value, updated_at FROM settings WHERE key = ?`).get(key) as
    | SettingRow
    | undefined;
  return row ?? null;
}

/**
 * 设置指定 key 的配置（upsert）
 */
export function setSetting(key: string, value: string): SettingRow {
  const db = getDb();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, now],
  );
  return { key, value, updated_at: now };
}

// ============ Agent Config 专用方法 ============

const AGENT_CONFIG_KEY = 'agent_config';

/**
 * 获取 Agent 配置
 */
export function getAgentConfig(): JobConfig {
  const setting = getSetting(AGENT_CONFIG_KEY);
  if (!setting) {
    throw new Error('Agent config not found in database');
  }
  return JSON.parse(setting.value) as JobConfig;
}

/**
 * 设置 Agent 配置
 */
export function setAgentConfig(config: JobConfig): JobConfig {
  setSetting(AGENT_CONFIG_KEY, JSON.stringify(config));
  return config;
}
