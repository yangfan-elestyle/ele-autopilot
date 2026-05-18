import type { JobConfig, SettingRow } from './types';
import { queryGet, queryRun } from './utils';

export async function getSetting(key: string): Promise<SettingRow | null> {
  return await queryGet<SettingRow>(
    `SELECT key, value, updated_at FROM settings WHERE key = ?`,
    [key],
  );
}

export async function setSetting(key: string, value: string): Promise<SettingRow> {
  const now = new Date().toISOString();
  await queryRun(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, now],
  );
  return { key, value, updated_at: now };
}

const AGENT_CONFIG_KEY = 'agent_config';

export async function getAgentConfig(): Promise<JobConfig> {
  const setting = await getSetting(AGENT_CONFIG_KEY);
  if (!setting) {
    throw new Error('Agent config not found in database');
  }
  return JSON.parse(setting.value) as JobConfig;
}

export async function setAgentConfig(config: JobConfig): Promise<JobConfig> {
  await setSetting(AGENT_CONFIG_KEY, JSON.stringify(config));
  return config;
}
