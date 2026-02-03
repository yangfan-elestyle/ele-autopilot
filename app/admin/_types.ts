export type Id = string;

export type Folder = {
  id: Id;
  name: string;
  parent_id: Id | null;
  order_index: number | null;
  created_at: string;
  task_count: number;
};

export type Task = {
  id: Id;
  folder_id: Id;
  text: string;
  sub_ids?: Id[];
  created_at: string;
};

// ============ Job 相关类型 ============

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type JobConfig = Record<string, unknown>;

/**
 * 完整执行结果数据结构（参考 autopilot/task_action_out.template.json）
 */
export type TaskActionResult = {
  timestamp: number;
  runtime: {
    python: { version: string; implementation: string };
    platform: string;
    packages: Record<string, string>;
    app: { name: string; version: string };
  };
  summary: {
    status: string;
    is_done: boolean;
    is_successful: boolean | null;
    started_at: number;
    completed_at: number;
    duration_seconds: number;
    total_steps: number;
    total_actions: number;
    step_error_count: number;
    action_error_count: number;
    final_result: string | null;
    judgement: {
      reasoning: string;
      verdict: boolean;
      failure_reason: string;
      impossible_task: boolean;
      reached_captcha: boolean;
    } | null;
    is_validated: boolean | null;
    all_extracted_content: string[];
    visited_urls: string[];
    action_sequence: string[];
    errors: string[];
    action_errors: string[];
  };
  steps: Array<{
    step_number: number;
    url: string;
    page_title: string;
    tabs: Array<{ url: string; title: string; target_id: string }>;
    thinking: string;
    thinking_image?: string;
    evaluation: string;
    memory: string;
    next_goal: string;
    model_output: {
      thinking: string;
      evaluation_previous_goal: string;
      memory: string;
      next_goal: string;
      action: unknown[];
    };
    results: unknown[];
    duration_seconds: number;
    step_start_time: number;
    step_end_time: number;
  }>;
  raw_history: string;
};

export type JobTask = {
  id: Id;
  job_id: Id;
  task_id: Id;
  task_index: number;
  task_text: string;
  status: JobStatus;
  result: TaskActionResult | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
};

/**
 * 轻量版 JobTask（不含完整 result，只包含 summary 摘要）
 * 用于列表展示和轮询，减少数据传输量
 */
export type JobTaskLite = {
  id: Id;
  job_id: Id;
  task_id: Id;
  task_index: number;
  task_text: string;
  status: JobStatus;
  /** 只包含 summary 摘要，不含 steps/raw_history 等大数据 */
  result_summary: TaskActionResult['summary'] | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
};

// Job 列表项（不含 tasks，用于列表展示）
export type JobListItem = {
  id: Id;
  task_id: Id;
  status: JobStatus;
  config: JobConfig;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
};

// Job 完整信息（含 tasks，用于详情展示）
export type Job = JobListItem & {
  tasks: JobTask[];
};

// Job 详情（轻量版，tasks 只包含 summary 摘要）
export type JobLite = JobListItem & {
  tasks: JobTaskLite[];
};

// Agent 连接状态
export type AgentConnectionStatus = 'connected' | 'disconnected' | 'checking';

export type AgentInfo = {
  status: string;
  timestamp: string;
  started_at: string;
  uptime_seconds: number;
  service: {
    name: string;
    version: string;
    pid: number;
  };
};

// Task 执行统计
export type TaskJobStats = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
};
