export type SortOrder = 'ASC' | 'DESC';

export type Id = string;

export type FolderRow = {
  id: Id;
  name: string;
  parent_id: Id | null;
  order_index: number | null;
  created_at: string;
  task_count: number;
};

export type TaskRow = {
  id: Id;
  folder_id: Id;
  text: string;
  sub_ids: Id[];
  created_at: string;
};

// SQL 原始结果（JSON 字符串字段）
export type TaskDbRow = Omit<TaskRow, 'sub_ids'> & { sub_ids: string };

export type ListPageArgs = {
  limit: number;
  offset: number;
  sort?: string;
  order?: SortOrder;
  filter?: Record<string, unknown>;
};

// ============ Job 相关类型 ============

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

// config 使用 JSON string 存储，不定义具体类型
// 当前已知字段：max_steps, headless，后续可扩展
export type JobConfig = Record<string, unknown>;

export type JobRow = {
  id: Id;
  task_id: Id;
  status: JobStatus;
  config: JobConfig;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
};

// SQL 原始结果（JSON 字符串字段）
export type JobDbRow = Omit<JobRow, 'config'> & { config: string };

export type JobTaskRow = {
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

// SQL 原始结果（JSON 字符串字段）
export type JobTaskDbRow = Omit<JobTaskRow, 'result'> & { result: string | null };

/**
 * 完整执行结果数据结构（参考 autopilot/task_action_out.template.json）
 * 重要：此数据可能非常大（包含每一步的详细信息），需要全量存储
 */
export type TaskActionResult = {
  timestamp: number;
  runtime: Record<string, unknown>;
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

// Job 详情（含 job_tasks）
export type JobWithTasks = JobRow & {
  tasks: JobTaskRow[];
};

// ============ 轻量版类型（用于列表展示，不含完整 result）============

/**
 * 轻量版 JobTask（不含完整 result，只包含 summary 摘要）
 * 用于列表展示和轮询，减少数据传输量
 */
export type JobTaskLiteRow = {
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

// Job 详情（含轻量版 job_tasks）
export type JobWithTasksLite = JobRow & {
  tasks: JobTaskLiteRow[];
};

// ============ Settings 相关类型 ============

export type SettingRow = {
  key: string;
  value: string;
  updated_at: string;
};
