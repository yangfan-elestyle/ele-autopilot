'use client';

import { ReloadOutlined } from '@ant-design/icons';
import { Button, Layout, Space, Spin, Typography } from 'antd';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import JobDetailPanel from './_components/job-detail-panel';
import JobHistoryList from './_components/job-history-list';
import type { JobListItem, JobLite, JobTask, Task } from '../../_types';
import TaskTitleTag from '../../_components/task-title-tag';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export default function PreviewPage() {
  const params = useParams();
  const taskId = params.taskId as string;

  const [task, setTask] = useState<Task | null>(null);
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 获取 Task 信息
  const fetchTask = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/tasks/${taskId}`);
      if (response.ok) {
        const data: Task = await response.json();
        setTask(data);
      }
    } catch (error) {
      console.error('Failed to fetch task:', error);
    }
  }, [taskId]);

  // 获取 Jobs 列表
  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/jobs?filter=${encodeURIComponent(JSON.stringify({ task_id: taskId }))}&range=${encodeURIComponent(JSON.stringify([0, 99]))}&sort=${encodeURIComponent(JSON.stringify(['created_at', 'DESC']))}`,
      );
      if (response.ok) {
        const data: JobListItem[] = await response.json();
        setJobs(data);
        // 如果没有选中的 job，默认选中第一个
        if (!selectedJobId && data.length > 0) {
          setSelectedJobId(data[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    }
  }, [taskId, selectedJobId]);

  // 获取单个 Job 的详情（轻量版，tasks 只包含 summary 摘要）
  const fetchJobDetail = useCallback(async (jobId: string): Promise<JobLite | null> => {
    try {
      const response = await fetch(`/api/admin/jobs/${jobId}`);
      if (response.ok) {
        const result: ApiResponse<JobLite> = await response.json();
        return result.data;
      }
    } catch (error) {
      console.error('Failed to fetch job detail:', error);
    }
    return null;
  }, []);

  // 获取单个 JobTask 的完整详情（包含完整 result）
  const fetchJobTaskDetail = useCallback(
    async (jobId: string, taskIndex: number): Promise<JobTask | null> => {
      try {
        const response = await fetch(`/api/admin/jobs/${jobId}/tasks/${taskIndex}`);
        if (response.ok) {
          const result: ApiResponse<JobTask> = await response.json();
          return result.data;
        }
      } catch (error) {
        console.error('Failed to fetch job task detail:', error);
      }
      return null;
    },
    [],
  );

  // 初始加载
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchTask(), fetchJobs()]);
      setLoading(false);
    };
    load();
  }, [fetchTask, fetchJobs]);

  // 刷新
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  };

  // 选中的 job
  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null;

  // 检查是否有正在执行的 job
  const hasRunningJob = jobs.some((j) => j.status === 'running' || j.status === 'pending');

  // 轮询正在执行的 job
  useEffect(() => {
    if (!hasRunningJob) return;

    const interval = setInterval(() => {
      fetchJobs();
    }, 3000);

    return () => clearInterval(interval);
  }, [hasRunningJob, fetchJobs]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Layout className="h-screen">
      <Header className="flex h-auto min-h-16 items-center gap-4 bg-white px-4 py-2 shadow-sm">
        <Title level={5} className="!mb-0 shrink-0">
          任务执行历史
        </Title>
        {task && (
          <div
            className="max-h-20 min-w-0 flex-1 overflow-auto text-sm whitespace-pre-wrap text-gray-500"
            title={task.text}
          >
            <TaskTitleTag title={task.title} />
            {task.text}
          </div>
        )}
        <Button
          icon={<ReloadOutlined />}
          loading={refreshing}
          onClick={handleRefresh}
          className="shrink-0"
        >
          刷新
        </Button>
      </Header>

      <Layout>
        <Sider width={320} theme="light" className="border-r border-gray-200">
          <JobHistoryList
            jobs={jobs}
            selectedJobId={selectedJobId}
            onSelect={setSelectedJobId}
            loading={refreshing}
          />
        </Sider>

        <Content className="overflow-auto bg-gray-50 p-4">
          {selectedJob ? (
            <JobDetailPanel
              jobId={selectedJob.id}
              fetchJobDetail={fetchJobDetail}
              fetchJobTaskDetail={fetchJobTaskDetail}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              {jobs.length === 0 ? '暂无执行历史' : '请选择一个执行记录'}
            </div>
          )}
        </Content>
      </Layout>
    </Layout>
  );
}
