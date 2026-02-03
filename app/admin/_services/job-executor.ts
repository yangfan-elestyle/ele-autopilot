/**
 * Job 执行器
 *
 * 协调 Server 和 Local 完成 Job 执行流程：
 * 1. UI → Server：创建 Job 记录
 * 2. UI → Local：下发任务执行（携带 callback_url）
 * 3. Local → Server：回调更新状态
 * 4. UI → Server：轮询获取最新状态
 */

import { dispatchToLocal, checkLocalConnection } from './local-api';
import type { Job, JobConfig, JobLite, Id } from '../_types';

// Server API 基础 URL
function getServerUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

// ============ Server API 调用 ============

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

/**
 * 在 Server 创建 Job
 */
export async function createJobOnServer(params: { task_id: Id; config?: JobConfig }): Promise<Job> {
  const serverUrl = getServerUrl();
  const response = await fetch(`${serverUrl}/api/admin/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Server error: ${response.status}`);
  }

  const result: ApiResponse<Job> = await response.json();
  if (result.code !== 0) {
    throw new Error(result.message || 'Failed to create job');
  }

  return result.data;
}

/**
 * 从 Server 获取 Job 详情（轻量版）
 */
export async function getJobFromServer(jobId: Id): Promise<JobLite> {
  const serverUrl = getServerUrl();
  const response = await fetch(`${serverUrl}/api/admin/jobs/${jobId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Server error: ${response.status}`);
  }

  const result: ApiResponse<JobLite> = await response.json();
  if (result.code !== 0) {
    throw new Error(result.message || 'Failed to get job');
  }

  return result.data;
}

/**
 * 更新 Server 上的 Job 状态
 */
export async function updateJobOnServer(
  jobId: Id,
  patch: {
    status?: string;
    error?: string | null;
    completed_at?: string;
  },
): Promise<Job> {
  const serverUrl = getServerUrl();
  const response = await fetch(`${serverUrl}/api/admin/jobs/${jobId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Server error: ${response.status}`);
  }

  const result: ApiResponse<Job> = await response.json();
  if (result.code !== 0) {
    throw new Error(result.message || 'Failed to update job');
  }

  return result.data;
}

// ============ Job 执行器 ============

export type ExecuteJobParams = {
  taskId: Id;
  config?: JobConfig;
};

export type JobExecutorCallbacks = {
  onJobCreated?: (job: Job) => void;
  onJobUpdate?: (job: JobLite) => void;
  onError?: (error: Error) => void;
};

/**
 * 执行 Job 完整流程
 *
 * 1. 检查 Local 连接
 * 2. 在 Server 创建 Job
 * 3. 下发任务到 Local
 * 4. 返回 Job ID，后续可轮询状态
 */
export async function executeJob(
  params: ExecuteJobParams,
  callbacks?: JobExecutorCallbacks,
): Promise<Id> {
  const { taskId, config = {} } = params;

  // 1. 检查 Local 连接
  const isConnected = await checkLocalConnection();
  if (!isConnected) {
    const error = new Error('Agent 未连接，请先检查 Agent 连接状态');
    callbacks?.onError?.(error);
    throw error;
  }

  // 2. 在 Server 创建 Job 记录
  let serverJob: Job;
  try {
    serverJob = await createJobOnServer({ task_id: taskId, config });
    callbacks?.onJobCreated?.(serverJob);
  } catch (error) {
    callbacks?.onError?.(error as Error);
    throw error;
  }

  // 3. 下发任务到 Local
  try {
    const serverUrl = getServerUrl();
    const callbackUrl = `${serverUrl}/api/jobs/${serverJob.id}/callback`;

    const result = await dispatchToLocal({
      job_id: serverJob.id,
      tasks: serverJob.tasks.map((t) => ({ id: t.task_id, text: t.task_text })),
      callback_url: callbackUrl,
      config: serverJob.config,
    });

    if (result.code !== 0) {
      throw new Error(result.message || 'Failed to dispatch to Local');
    }
  } catch (error) {
    // 下发失败，更新 Server Job 状态
    await updateJobOnServer(serverJob.id, {
      status: 'failed',
      error: `下发失败: ${(error as Error).message}`,
      completed_at: new Date().toISOString(),
    });
    callbacks?.onError?.(error as Error);
    throw error;
  }

  // 4. 返回 job_id，UI 可开始轮询
  return serverJob.id;
}

/**
 * 轮询 Job 状态
 *
 * @param jobId Job ID
 * @param onUpdate 状态更新回调
 * @param interval 轮询间隔（毫秒），默认 2000
 * @returns 最终的 Job 对象（轻量版）
 */
export async function pollJobStatus(
  jobId: Id,
  onUpdate: (job: JobLite) => void,
  interval = 2000,
): Promise<JobLite> {
  while (true) {
    const job = await getJobFromServer(jobId);
    onUpdate(job);

    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * 创建一个可取消的轮询
 */
export function createJobPoller(jobId: Id, onUpdate: (job: JobLite) => void, interval = 2000) {
  let cancelled = false;

  const poll = async () => {
    while (!cancelled) {
      try {
        const job = await getJobFromServer(jobId);
        onUpdate(job);

        if (job.status === 'completed' || job.status === 'failed') {
          break;
        }
      } catch {
        // 忽略单次轮询错误，继续轮询
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  };

  return {
    start: () => {
      poll();
    },
    stop: () => {
      cancelled = true;
    },
  };
}
