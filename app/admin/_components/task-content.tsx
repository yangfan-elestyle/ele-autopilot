import {
  BranchesOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  OrderedListOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Button, Input, Layout, Space, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Folder, Id, Task, TaskJobStats } from '../_types';

type TaskContentProps = {
  tasks: Task[];
  loading: boolean;
  selectedFolder: Folder | null;
  selectedTaskIds: Id[];
  taskSearch: string;
  taskStats: Record<Id, TaskJobStats>;
  onTaskSearchChange: (value: string) => void;
  onCreateTask: () => void;
  onDeleteTasks: (ids: Id[]) => void;
  onEditTask: (task: Task) => void;
  onRefresh: () => void;
  onSelectionChange: (ids: Id[]) => void;
  onOpenSelectedTasks: () => void;
  onViewTaskChain: (task: Task) => void;
  onExecuteTask: (task: Task) => void;
};

function JobStatsDisplay({ stats }: { stats: TaskJobStats | undefined }) {
  if (!stats || stats.total === 0) {
    return <span className="text-xs text-gray-400">-</span>;
  }

  return (
    <span className="font-mono text-xs">
      <span>{stats.total}</span>
      <span className="text-gray-400">/</span>
      <span className="text-green-600">{stats.completed}</span>
      <span className="text-gray-400">/</span>
      <span className="text-red-500">{stats.failed}</span>
      <span className="text-gray-400">/</span>
      <span className="text-blue-500">{stats.running + stats.pending}</span>
    </span>
  );
}

export default function TaskContent({
  tasks,
  loading,
  selectedFolder,
  selectedTaskIds,
  taskSearch,
  taskStats,
  onTaskSearchChange,
  onCreateTask,
  onDeleteTasks,
  onEditTask,
  onRefresh,
  onSelectionChange,
  onOpenSelectedTasks,
  onViewTaskChain,
  onExecuteTask,
}: TaskContentProps) {
  const columns: ColumnsType<Task> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 120,
      render: (id: Id) => (
        <Tooltip title={id}>
          <span className="font-mono text-xs">{id.slice(0, 8)}</span>
        </Tooltip>
      ),
    },
    {
      title: '任务内容',
      dataIndex: 'text',
      ellipsis: true,
      render: (value: string, record) => (
        <div
          className="max-h-40 cursor-text overflow-auto break-all whitespace-pre-wrap hover:bg-(--ant-color-fill-tertiary) rounded px-1 -mx-1 transition-colors"
          title={value}
          onClick={(e) => {
            e.stopPropagation();
            onEditTask(record);
          }}
        >
          {value}
        </div>
      ),
    },
    {
      title: (
        <Tooltip title="总数/成功/失败/进行中">
          <span>执行统计</span>
        </Tooltip>
      ),
      key: 'stats',
      width: 100,
      align: 'center',
      render: (_: unknown, record) => <JobStatsDisplay stats={taskStats[record.id]} />,
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_: unknown, record) => (
        <div className="grid grid-cols-2 gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip title="执行">
            <Button
              type="text"
              icon={<PlayCircleOutlined />}
              onClick={() => onExecuteTask(record)}
              className="!h-10 !w-10"
            />
          </Tooltip>
          <Tooltip title="预览">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => window.open(`/admin/preview/${record.id}`, '_blank')}
              className="!h-10 !w-10"
            />
          </Tooltip>
          {record.sub_ids && record.sub_ids.length > 0 && (
            <Tooltip title="任务链">
              <Button
                type="text"
                icon={<BranchesOutlined />}
                onClick={() => onViewTaskChain(record)}
                className="!h-10 !w-10"
              />
            </Tooltip>
          )}
          <Tooltip title="编辑">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => onEditTask(record)}
              className="!h-10 !w-10"
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => void onDeleteTasks([record.id])}
              className="!h-10 !w-10"
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  const { Content } = Layout;

  return (
    <Content className="flex flex-col overflow-hidden p-4">
      <div className="mb-3 flex-shrink-0">
        <Space className="w-full justify-between" wrap>
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={onCreateTask}>
              新建任务
            </Button>
            <Button
              icon={<OrderedListOutlined />}
              disabled={selectedTaskIds.length === 0}
              onClick={onOpenSelectedTasks}
            >
              已选任务（{selectedTaskIds.length}）
            </Button>
            <Button icon={<ReloadOutlined />} onClick={onRefresh}>
              刷新
            </Button>
          </Space>

          <Input
            allowClear
            placeholder="按内容搜索任务"
            value={taskSearch}
            onChange={(e) => onTaskSearchChange(e.target.value)}
            className="w-80"
          />
        </Space>

        <div className="mt-3 text-(--ant-color-text-secondary)">
          当前路径：{selectedFolder ? selectedFolder.name : '未选择'}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <Table<Task>
          rowKey="id"
          loading={loading}
          dataSource={tasks}
          columns={columns}
          pagination={false}
          rowSelection={{
            selectedRowKeys: selectedTaskIds,
            preserveSelectedRowKeys: true,
            onChange: (keys) => onSelectionChange(keys as Id[]),
          }}
          onRow={(record) => ({
            onClick: () => window.open(`/admin/preview/${record.id}`, '_blank'),
            className: 'cursor-pointer',
          })}
          size="middle"
          className="bg-(--ant-color-bg-container)"
        />
      </div>
    </Content>
  );
}
