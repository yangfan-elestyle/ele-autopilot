'use client';

import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  message,
  Popconfirm,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';

import { stopJobOnLocal } from '../../../_services/local-api';

import JobTaskDetail from './job-task-detail';
import type { JobLite, JobStatus, JobTask, JobTaskLite } from '../../../_types';

const { Text, Paragraph } = Typography;

type JobDetailPanelProps = {
  jobId: string;
  fetchJobDetail: (jobId: string) => Promise<JobLite | null>;
  fetchJobTaskDetail: (jobId: string, taskIndex: number) => Promise<JobTask | null>;
};

const statusConfig: Record<JobStatus, { color: string; icon: React.ReactNode; text: string }> = {
  pending: {
    color: 'default',
    icon: <ClockCircleOutlined />,
    text: '等待中',
  },
  running: {
    color: 'processing',
    icon: <LoadingOutlined />,
    text: '执行中',
  },
  completed: {
    color: 'success',
    icon: <CheckCircleOutlined />,
    text: '成功',
  },
  failed: {
    color: 'error',
    icon: <CloseCircleOutlined />,
    text: '失败',
  },
};

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN');
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const duration = Math.round((end - start) / 1000);

  if (duration < 60) return `${duration}秒`;
  if (duration < 3600) return `${Math.floor(duration / 60)}分${duration % 60}秒`;
  return `${Math.floor(duration / 3600)}时${Math.floor((duration % 3600) / 60)}分`;
}

export default function JobDetailPanel({
  jobId,
  fetchJobDetail,
  fetchJobTaskDetail,
}: JobDetailPanelProps) {
  const [job, setJob] = useState<JobLite | null>(null);
  const [loading, setLoading] = useState(true);
  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 缓存已加载的 job_task 完整详情（按 task_index 索引）
  const [taskDetailCache, setTaskDetailCache] = useState<Map<number, JobTask>>(new Map());
  const [loadingTaskIndex, setLoadingTaskIndex] = useState<number | null>(null);

  const loadJob = useCallback(async () => {
    const data = await fetchJobDetail(jobId);
    if (data) {
      setJob(data);
    }
    setLoading(false);
  }, [jobId, fetchJobDetail]);

  // 加载单个 job_task 的完整详情
  const loadTaskDetail = useCallback(
    async (taskIndex: number) => {
      // 如果已缓存，直接返回
      if (taskDetailCache.has(taskIndex)) return;

      setLoadingTaskIndex(taskIndex);
      try {
        const detail = await fetchJobTaskDetail(jobId, taskIndex);
        if (detail) {
          setTaskDetailCache((prev) => new Map(prev).set(taskIndex, detail));
        }
      } finally {
        setLoadingTaskIndex(null);
      }
    },
    [jobId, fetchJobTaskDetail, taskDetailCache],
  );

  // 处理 Collapse 展开事件
  const handleCollapseChange = useCallback(
    (key: string | string[]) => {
      const activeKey = Array.isArray(key) ? key[0] : key;
      if (!activeKey || !job) return;

      // 找到对应的 task_index
      const task = job.tasks.find((t) => t.id === activeKey);
      if (task) {
        loadTaskDetail(task.task_index);
      }
    },
    [job, loadTaskDetail],
  );

  // 初始加载
  useEffect(() => {
    setLoading(true);
    // 切换 job 时清空缓存
    setTaskDetailCache(new Map());
    loadJob();
  }, [loadJob]);

  const handleStopJob = useCallback(async () => {
    if (!job) return;
    try {
      await stopJobOnLocal(job.id);
      message.success('已发送停止 Job 信号');
      loadJob();
    } catch (error) {
      message.error(`停止 Job 失败: ${(error as Error).message}`);
    }
  }, [job, loadJob]);

  const handleStopTask = useCallback(
    async (taskId: string) => {
      if (!job) return;
      try {
        await stopJobOnLocal(job.id, taskId);
        message.success('已发送停止任务信号');
        loadJob();
      } catch (error) {
        message.error(`停止任务失败: ${(error as Error).message}`);
      }
    },
    [job, loadJob],
  );

  // 轮询正在执行的 job
  useEffect(() => {
    if (!job || (job.status !== 'running' && job.status !== 'pending')) {
      if (pollerRef.current) {
        clearInterval(pollerRef.current);
        pollerRef.current = null;
      }
      return;
    }

    pollerRef.current = setInterval(() => {
      loadJob();
    }, 2000);

    return () => {
      if (pollerRef.current) {
        clearInterval(pollerRef.current);
        pollerRef.current = null;
      }
    };
  }, [job?.status, loadJob]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!job) {
    return <Alert type="error" message="无法加载 Job 信息" />;
  }

  const config = statusConfig[job.status];
  const tasks = job.tasks || [];

  // 统计
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const failedCount = tasks.filter((t) => t.status === 'failed').length;
  const runningCount = tasks.filter((t) => t.status === 'running').length;
  const pendingCount = tasks.filter((t) => t.status === 'pending').length;

  // 生成 Collapse items
  const collapseItems = tasks.map((task, index) => {
    const cachedDetail = taskDetailCache.get(task.task_index);
    const isLoading = loadingTaskIndex === task.task_index;

    return {
      key: task.id,
      label: (
        <JobTaskLabel
          task={task}
          index={index}
          jobStatus={job.status}
          onStopJob={handleStopJob}
          onStopTask={handleStopTask}
        />
      ),
      children: (
        <JobTaskDetail taskLite={task} taskDetail={cachedDetail ?? null} loading={isLoading} />
      ),
    };
  });

  return (
    <div className="space-y-4">
      {/* Job 概要信息 */}
      <Card size="small" title="执行概要">
        <Descriptions size="small" column={2}>
          <Descriptions.Item label="Job ID">
            <Text copyable className="font-mono text-xs">
              {job.id}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag icon={config.icon} color={config.color}>
              {config.text}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatDateTime(job.created_at)}</Descriptions.Item>
          <Descriptions.Item label="开始时间">{formatDateTime(job.started_at)}</Descriptions.Item>
          <Descriptions.Item label="结束时间">{formatDateTime(job.completed_at)}</Descriptions.Item>
          <Descriptions.Item label="执行耗时">
            {formatDuration(job.started_at, job.completed_at)}
          </Descriptions.Item>
          <Descriptions.Item label="任务统计" span={2}>
            <span className="font-mono">
              总数: {tasks.length} | 成功: <span className="text-green-600">{completedCount}</span>{' '}
              | 失败: <span className="text-red-500">{failedCount}</span> | 执行中:{' '}
              <span className="text-blue-500">{runningCount}</span> | 等待中:{' '}
              <span className="text-gray-500">{pendingCount}</span>
            </span>
          </Descriptions.Item>
        </Descriptions>
        {job.error && (
          <Alert type="error" message="Job 错误" description={job.error} className="mt-3" />
        )}
      </Card>

      {/* Job Tasks 列表 */}
      <Card
        size="small"
        title={`任务列表 (${tasks.length})`}
        className="[&_.ant-card-body]:max-h-[calc(100vh-340px)] [&_.ant-card-body]:overflow-auto [&_.ant-card-body]:p-0"
      >
        {tasks.length === 0 ? (
          <div className="p-4 text-center text-gray-400">暂无任务</div>
        ) : (
          <Collapse
            accordion
            items={collapseItems}
            onChange={handleCollapseChange}
            className="rounded-none border-0 [&_.ant-collapse-content-box]:p-0 [&_.ant-collapse-header]:overflow-hidden [&_.ant-collapse-item]:border-b [&_.ant-collapse-item]:border-b-gray-100"
          />
        )}
      </Card>
    </div>
  );
}

// JobTask 标题组件
function JobTaskLabel({
  task,
  index,
  jobStatus,
  onStopJob,
  onStopTask,
}: {
  task: JobTaskLite;
  index: number;
  jobStatus: JobStatus;
  onStopJob: () => void;
  onStopTask: (taskId: string) => void;
}) {
  const config = statusConfig[task.status];
  const isRunning = task.status === 'running';
  const jobIsActive = jobStatus === 'running' || jobStatus === 'pending';

  return (
    <div className="flex w-full items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-100 font-mono text-xs">
        {index + 1}
      </span>
      <Tag icon={config.icon} color={config.color} className="shrink-0">
        {config.text}
      </Tag>
      <span className="min-w-0 flex-1 overflow-hidden text-sm break-all">{task.task_text}</span>
      {isRunning && jobIsActive && (
        <span className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
          <Popconfirm
            title="停止当前任务"
            description="仅停止当前正在执行的任务，后续任务继续执行"
            onConfirm={() => onStopTask(task.task_id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              size="small"
              type="text"
              icon={<StopOutlined />}
              className="!text-orange-500 hover:!text-orange-600"
            >
              停止任务
            </Button>
          </Popconfirm>
          <Popconfirm
            title="停止整个 Job"
            description="当前任务将失败，剩余所有任务将被跳过"
            onConfirm={onStopJob}
            okText="确定"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" type="text" danger icon={<StopOutlined />}>
              停止 Job
            </Button>
          </Popconfirm>
        </span>
      )}
      {task.started_at && (
        <span className="shrink-0 text-xs text-gray-400">
          {formatDuration(task.started_at, task.completed_at)}
        </span>
      )}
    </div>
  );
}
