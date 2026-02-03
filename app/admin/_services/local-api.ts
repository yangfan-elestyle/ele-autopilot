/**
 * Local API 客户端
 *
 * 用于前端直接调用 ele-autopilot-local 的接口
 */

import { getAgentUrl } from '../_hooks/use-agent-connection';
import type { JobConfig } from '../_types';

type TaskInput = {
  id: string;
  text: string;
};

type LocalRunRequest = {
  job_id: string;
  tasks: TaskInput[];
  callback_url: string;
  config: JobConfig;
};

// Local API 实际需要的请求体（config 字段展开到顶层）
type LocalRunPayload = Omit<LocalRunRequest, 'config'> & JobConfig;

type LocalRunResponse = {
  code: number;
  message: string;
  data: {
    job_id: string;
    status: string;
  } | null;
};

/**
 * 下发任务到 Local
 *
 * @param request 任务下发请求
 * @returns 响应数据
 */
export async function dispatchToLocal(request: LocalRunRequest): Promise<LocalRunResponse> {
  const agentUrl = getAgentUrl();

  // Local API 期望 config 字段展开到顶层（AutopilotRunRequest 继承自 JobConfig）
  const { config, ...rest } = request;
  const payload: LocalRunPayload = { ...rest, ...config };

  const response = await fetch(`${agentUrl}/autopilot/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Local API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * 检测 Local 连接状态
 *
 * @returns 是否连接成功
 */
export async function checkLocalConnection(): Promise<boolean> {
  const agentUrl = getAgentUrl();

  try {
    const response = await fetch(`${agentUrl}/system/connect`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) return false;

    const result = await response.json();
    return result.code === 0;
  } catch {
    return false;
  }
}
