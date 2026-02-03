'use client';

import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { Empty, Spin, Tag, Typography } from 'antd';

import type { JobListItem, JobStatus } from '../../../_types';

const { Text } = Typography;

type JobHistoryListProps = {
  jobs: JobListItem[];
  selectedJobId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
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
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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

export default function JobHistoryList({
  jobs,
  selectedJobId,
  onSelect,
  loading,
}: JobHistoryListProps) {
  if (jobs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty description="暂无执行历史" />
      </div>
    );
  }

  return (
    <Spin spinning={loading}>
      <div className="h-full overflow-auto">
        {jobs.map((job) => {
          const config = statusConfig[job.status];
          const isSelected = job.id === selectedJobId;

          return (
            <div
              key={job.id}
              className={`cursor-pointer border-b border-l-4 border-b-gray-100 py-3 transition-colors hover:bg-gray-50 ${
                isSelected ? 'border-l-blue-500 bg-blue-50' : 'border-l-transparent'
              }`}
              onClick={() => onSelect(job.id)}
            >
              <div className="w-full px-3 py-1">
                <div className="mb-1 flex items-center justify-between">
                  <Tag icon={config.icon} color={config.color}>
                    {config.text}
                  </Tag>
                  <Text type="secondary" className="text-xs">
                    {formatDateTime(job.created_at)}
                  </Text>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>ID: {job.id.slice(0, 8)}</span>
                  <span>耗时: {formatDuration(job.started_at, job.completed_at)}</span>
                </div>
                {job.error && (
                  <div className="mt-1 truncate text-xs text-red-500" title={job.error}>
                    {job.error}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Spin>
  );
}
