'use client';

import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { Button, Drawer, Progress, Space, Steps, Tag, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';

import { createJobPoller, getJobFromServer } from '../_services/job-executor';
import type { Id, JobLite, JobStatus } from '../_types';

const { Text, Paragraph } = Typography;

type JobProgressDrawerProps = {
  open: boolean;
  jobId: Id | null;
  onClose: () => void;
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
    text: '已完成',
  },
  failed: {
    color: 'error',
    icon: <CloseCircleOutlined />,
    text: '失败',
  },
};

export default function JobProgressDrawer({ open, jobId, onClose }: JobProgressDrawerProps) {
  const [job, setJob] = useState<JobLite | null>(null);
  const [loading, setLoading] = useState(false);
  const pollerRef = useRef<{ stop: () => void } | null>(null);

  // 加载 Job 并开始轮询
  useEffect(() => {
    if (!open || !jobId) {
      setJob(null);
      return;
    }

    setLoading(true);

    // 先获取一次
    getJobFromServer(jobId)
      .then((data) => {
        setJob(data);
        setLoading(false);

        // 如果还没完成，开始轮询
        if (data.status !== 'completed' && data.status !== 'failed') {
          const poller = createJobPoller(jobId, (updatedJob) => {
            setJob(updatedJob);
          });
          pollerRef.current = poller;
          poller.start();
        }
      })
      .catch(() => {
        setLoading(false);
      });

    return () => {
      pollerRef.current?.stop();
      pollerRef.current = null;
    };
  }, [open, jobId]);

  // 计算进度
  const completedCount =
    job?.tasks.filter((t) => t.status === 'completed' || t.status === 'failed').length ?? 0;
  const totalCount = job?.tasks.length ?? 0;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // 当前执行到第几个
  const currentIndex = job?.tasks.findIndex((t) => t.status === 'running') ?? -1;

  return (
    <Drawer
      title="任务执行进度"
      placement="right"
      styles={{ wrapper: { width: 500 } }}
      open={open}
      onClose={onClose}
      extra={
        job && (
          <Tag icon={statusConfig[job.status].icon} color={statusConfig[job.status].color}>
            {statusConfig[job.status].text}
          </Tag>
        )
      }
    >
      {loading && !job ? (
        <div className="flex h-40 items-center justify-center">
          <SyncOutlined spin className="text-2xl" />
        </div>
      ) : job ? (
        <Space orientation="vertical" size="large" className="w-full">
          {/* 整体进度 */}
          <div>
            <Text type="secondary">整体进度</Text>
            <Progress
              percent={percent}
              status={
                job.status === 'failed'
                  ? 'exception'
                  : job.status === 'completed'
                    ? 'success'
                    : 'active'
              }
              format={() => `${completedCount}/${totalCount}`}
            />
          </div>

          {/* Job 信息 */}
          <div>
            <Text type="secondary">Job ID</Text>
            <Paragraph copyable className="mb-0 font-mono text-xs">
              {job.id}
            </Paragraph>
          </div>

          {/* 任务列表 */}
          <div>
            <Text type="secondary" className="mb-2 block">
              任务列表
            </Text>
            <Steps
              orientation="vertical"
              size="small"
              current={currentIndex >= 0 ? currentIndex : completedCount}
              status={job.status === 'failed' ? 'error' : undefined}
              items={job.tasks.map((task, index) => {
                let status: 'wait' | 'process' | 'finish' | 'error' = 'wait';
                let icon: React.ReactNode = undefined;

                if (task.status === 'completed') {
                  status = 'finish';
                  icon = <CheckCircleOutlined />;
                } else if (task.status === 'failed') {
                  status = 'error';
                  icon = <CloseCircleOutlined />;
                } else if (task.status === 'running') {
                  status = 'process';
                  icon = <LoadingOutlined />;
                }

                return {
                  title: (
                    <span className="text-sm">
                      任务 {index + 1}
                      {task.status !== 'pending' && (
                        <Tag className="ml-2" color={statusConfig[task.status].color}>
                          {statusConfig[task.status].text}
                        </Tag>
                      )}
                    </span>
                  ),
                  content: (
                    <div className="max-w-[400px]">
                      <Paragraph ellipsis={{ rows: 2, expandable: true }} className="mb-1 text-xs">
                        {task.task_text}
                      </Paragraph>
                      {task.error && (
                        <Text type="danger" className="text-xs">
                          错误: {task.error}
                        </Text>
                      )}
                    </div>
                  ),
                  status,
                  icon,
                };
              })}
            />
          </div>

          {/* 错误信息 */}
          {job.error && (
            <div>
              <Text type="secondary">错误信息</Text>
              <Paragraph type="danger" className="mb-0">
                {job.error}
              </Paragraph>
            </div>
          )}

          {/* 操作按钮 */}
          {(job.status === 'completed' || job.status === 'failed') && (
            <Button type="primary" onClick={onClose}>
              关闭
            </Button>
          )}
        </Space>
      ) : (
        <div className="text-center text-(--ant-color-text-secondary)">暂无数据</div>
      )}
    </Drawer>
  );
}
