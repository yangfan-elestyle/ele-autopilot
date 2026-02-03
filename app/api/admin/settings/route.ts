import { getAgentConfig, setAgentConfig } from '@/lib/db';
import type { JobConfig } from '@/lib/db';
import { NextResponse } from 'next/server';

/**
 * GET /api/admin/settings
 * 获取 Agent 配置
 */
export async function GET() {
  try {
    const config = getAgentConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error('Failed to get settings:', error);
    return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/settings
 * 更新 Agent 配置
 */
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as JobConfig;

    // 验证是对象
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: 'Config must be a JSON object' }, { status: 400 });
    }

    const config = setAgentConfig(body);
    return NextResponse.json(config);
  } catch (error) {
    console.error('Failed to update settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
