import { App, Form, Layout } from 'antd';
import type { TreeProps, TreeDataNode } from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { apiJson, makeListUrl } from '../_data/admin-api';
import { fetchAgentConfig, useAgentConnection } from '../_hooks/use-agent-connection';
import { executeJob } from '../_services/job-executor';
import type { Folder, Id, Job, Task, TaskJobStats } from '../_types';
import { buildFolderTree } from '../_utils/folder-tree';
import FolderModal from './folder-modal';
import FolderSider from './folder-sider';
import JobProgressDrawer from './job-progress-drawer';
import SelectedTasksDrawer from './selected-tasks-drawer';
import TaskChainModal from './task-chain-modal';
import TaskContent from './task-content';
import TaskModal from './task-modal';

export default function AdminTaskExplorer() {
  const { message, modal } = App.useApp();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<Id | null>(null);

  const [treeSearch, setTreeSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState(true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [taskStats, setTaskStats] = useState<Record<Id, TaskJobStats>>({});
  const [selectedTaskIds, setSelectedTaskIds] = useState<Id[]>([]);
  const [selectedTasksById, setSelectedTasksById] = useState<Record<Id, Task>>({});
  const [selectedTasksOpen, setSelectedTasksOpen] = useState(false);

  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState<'create' | 'rename'>('create');
  const [folderModalParentId, setFolderModalParentId] = useState<Id | null>(null);
  const [folderModalTarget, setFolderModalTarget] = useState<Folder | null>(null);
  const [folderForm] = Form.useForm<{ name: string }>();

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalMode, setTaskModalMode] = useState<'create' | 'edit'>('create');
  const [taskModalTarget, setTaskModalTarget] = useState<Task | null>(null);
  const [taskForm] = Form.useForm<{ text: string }>();

  const [taskChainModalOpen, setTaskChainModalOpen] = useState(false);
  const [rootFolders, setRootFolders] = useState<Folder[]>([]);
  const [rootFoldersLoading, setRootFoldersLoading] = useState(false);
  const [taskChainForm] = Form.useForm<{ text: string; folderId: Id }>();

  const [taskChainViewOpen, setTaskChainViewOpen] = useState(false);
  const [taskChainViewTask, setTaskChainViewTask] = useState<Task | null>(null);
  const [taskChainViewSubIds, setTaskChainViewSubIds] = useState<Id[]>([]);
  const [taskChainViewSubTasksById, setTaskChainViewSubTasksById] = useState<Record<Id, Task>>({});

  // Job 执行相关状态
  const [jobProgressOpen, setJobProgressOpen] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<Id | null>(null);
  const { status: agentStatus } = useAgentConnection();

  const visibleFolderIds = useMemo(() => {
    const q = treeSearch.trim().toLowerCase();
    if (!q) return null;

    const folderById = new Map<Id, Folder>();
    for (const f of folders) folderById.set(f.id, f);

    const visible = new Set<Id>();
    for (const folder of folders) {
      if (!folder.name.toLowerCase().includes(q)) continue;
      let cur: Folder | undefined = folder;
      while (cur) {
        if (visible.has(cur.id)) break;
        visible.add(cur.id);
        cur = cur.parent_id ? folderById.get(cur.parent_id) : undefined;
      }
    }
    return visible;
  }, [folders, treeSearch]);

  const { treeData, folderById } = useMemo(
    () =>
      buildFolderTree(folders, {
        searchText: treeSearch,
        visibleIds: visibleFolderIds,
      }),
    [folders, treeSearch, visibleFolderIds],
  );

  const selectedFolder = selectedFolderId ? (folderById.get(selectedFolderId) ?? null) : null;

  async function reloadFolders() {
    setFoldersLoading(true);
    try {
      const data = await apiJson<Folder[]>(makeListUrl('folders', {}));
      setFolders(data);

      setExpandedKeys((prev) => {
        if (treeSearch.trim()) return prev;
        if (prev.length) return prev;
        const roots = data.filter((f) => f.parent_id == null).map((f) => f.id);
        return roots.length ? roots : [];
      });

      setSelectedFolderId((prev) => {
        if (prev && data.some((f) => f.id === prev)) return prev;
        const root = data.find((f) => f.parent_id == null) ?? data[0];
        return root ? root.id : null;
      });
    } finally {
      setFoldersLoading(false);
    }
  }

  async function reloadTaskStats(taskIds: Id[]) {
    if (taskIds.length === 0) {
      setTaskStats({});
      return;
    }
    try {
      const data = await apiJson<Record<Id, TaskJobStats>>(
        `/api/admin/tasks/stats?ids=${taskIds.join(',')}`,
      );
      setTaskStats(data);
    } catch {
      setTaskStats({});
    }
  }

  async function reloadTasks(folderId: Id | null, search: string) {
    if (!folderId) {
      setTasks([]);
      setTaskStats({});
      return;
    }
    setTasksLoading(true);
    try {
      const filter: Record<string, unknown> = { folder_id: folderId };
      const q = search.trim();
      if (q) filter.q = q;
      const data = await apiJson<Task[]>(makeListUrl('tasks', filter));
      setTasks(data);
      setSelectedTasksById((prev) => {
        if (!selectedTaskIds.length) return prev;
        const selected = new Set(selectedTaskIds);
        const next = { ...prev };
        for (const task of data) {
          if (selected.has(task.id)) next[task.id] = task;
        }
        return next;
      });
      // 加载任务执行统计
      void reloadTaskStats(data.map((t) => t.id));
    } finally {
      setTasksLoading(false);
    }
  }

  useEffect(() => {
    void reloadFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      void reloadTasks(selectedFolderId, taskSearch);
    }, 150);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderId, taskSearch]);

  useEffect(() => {
    if (!visibleFolderIds) {
      setAutoExpandParent(false);
      return;
    }
    setExpandedKeys(Array.from(visibleFolderIds));
    setAutoExpandParent(true);
  }, [visibleFolderIds]);

  function openCreateFolderModal(parentId: Id | null) {
    setFolderModalMode('create');
    setFolderModalParentId(parentId);
    setFolderModalTarget(null);
    folderForm.setFieldsValue({ name: '' });
    setFolderModalOpen(true);
  }

  function openRenameFolderModal(folder: Folder) {
    setFolderModalMode('rename');
    setFolderModalParentId(folder.parent_id ?? null);
    setFolderModalTarget(folder);
    folderForm.setFieldsValue({ name: folder.name });
    setFolderModalOpen(true);
  }

  async function submitFolderModal() {
    const values = await folderForm.validateFields();
    const name = values.name.trim();
    if (!name) return;

    if (folderModalMode === 'create') {
      const parent_id = folderModalParentId ?? null;
      const created = await apiJson<Folder>('/api/admin/folders', {
        method: 'POST',
        body: JSON.stringify({ name, parent_id }),
      });
      message.success('已新建路径');
      setFolderModalOpen(false);
      await reloadFolders();
      setSelectedFolderId(created.id);
      setExpandedKeys(
        (prev) =>
          Array.from(new Set([...prev, parent_id, created.id].filter(Boolean))) as React.Key[],
      );
      return;
    }

    if (!folderModalTarget) return;
    await apiJson<Folder>(`/api/admin/folders/${folderModalTarget.id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
    message.success('已重命名路径');
    setFolderModalOpen(false);
    await reloadFolders();
  }

  async function confirmDeleteFolder(folder: Folder) {
    modal.confirm({
      title: '删除路径？',
      content: '将同时删除该路径下的所有子路径和任务，此操作不可恢复。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        await apiJson(`/api/admin/folders/${folder.id}`, { method: 'DELETE' });
        message.success('已删除路径');
        await reloadFolders();
      },
    });
  }

  function openCreateTaskModal() {
    if (!selectedFolderId) {
      message.warning('请先在左侧选择一个路径');
      return;
    }
    setTaskModalMode('create');
    setTaskModalTarget(null);
    taskForm.setFieldsValue({ text: '' });
    setTaskModalOpen(true);
  }

  function openEditTaskModal(task: Task) {
    setTaskModalMode('edit');
    setTaskModalTarget(task);
    taskForm.setFieldsValue({ text: task.text });
    setTaskModalOpen(true);
  }

  async function submitTaskModal() {
    const values = await taskForm.validateFields();
    const text = values.text.trim();
    if (!text) return;

    if (taskModalMode === 'create') {
      if (!selectedFolderId) return;

      // 通过 --- 分割多任务（3个或更多 - 字符独占一行）
      const parts = text
        .split(/^-{3,}$/m)
        .map((p) => p.trim())
        .filter(Boolean);

      if (parts.length > 1) {
        // 批量创建：反转顺序使最后一个先入库，列表按 created_at DESC 排序后保持原始输入顺序
        const reversed = [...parts].reverse();
        const payload = reversed.map((t) => ({ text: t, folder_id: selectedFolderId }));
        await apiJson<Task[]>('/api/admin/tasks', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        message.success(`已新建 ${parts.length} 条任务`);
      } else {
        // 单任务创建
        await apiJson<Task>('/api/admin/tasks', {
          method: 'POST',
          body: JSON.stringify({ text, folder_id: selectedFolderId }),
        });
        message.success('已新建任务');
      }

      setTaskModalOpen(false);
      await Promise.all([reloadTasks(selectedFolderId, taskSearch), reloadFolders()]);
      return;
    }

    if (!taskModalTarget) return;
    const updated = await apiJson<Task>(`/api/admin/tasks/${taskModalTarget.id}`, {
      method: 'PUT',
      body: JSON.stringify({ text }),
    });
    setSelectedTasksById((prev) => (prev[updated.id] ? { ...prev, [updated.id]: updated } : prev));
    message.success('已更新任务');
    setTaskModalOpen(false);
    await reloadTasks(selectedFolderId, taskSearch);
  }

  async function confirmDeleteTasks(ids: Id[]) {
    if (!ids.length) return;
    modal.confirm({
      title: ids.length > 1 ? `删除 ${ids.length} 条任务？` : '删除任务？',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        await Promise.all(ids.map((id) => apiJson(`/api/admin/tasks/${id}`, { method: 'DELETE' })));
        setSelectedTaskIds((prev) => prev.filter((id) => !ids.includes(id)));
        setSelectedTasksById((prev) => {
          const next = { ...prev };
          for (const id of ids) delete next[id];
          return next;
        });
        message.success('已删除');
        await Promise.all([reloadTasks(selectedFolderId, taskSearch), reloadFolders()]);
      },
    });
  }

  async function loadRootFolders() {
    setRootFoldersLoading(true);
    try {
      const data = await apiJson<Folder[]>(makeListUrl('folders', { parent_id: null }));
      setRootFolders(data);
    } finally {
      setRootFoldersLoading(false);
    }
  }

  function openTaskChainModal() {
    if (selectedTaskIds.length === 0) {
      message.warning('请先选择任务');
      return;
    }
    taskChainForm.resetFields();
    void loadRootFolders();
    setTaskChainModalOpen(true);
  }

  async function openTaskChainView(task: Task) {
    if (!task.sub_ids || task.sub_ids.length === 0) return;

    setTaskChainViewTask(task);
    setTaskChainViewSubIds(task.sub_ids);
    setTaskChainViewOpen(true);

    // 批量加载子任务详情
    const subTasks = await Promise.all(
      task.sub_ids.map(async (id) => {
        try {
          return await apiJson<Task>(`/api/admin/tasks/${id}`);
        } catch {
          return null;
        }
      }),
    );

    const subTasksById: Record<Id, Task> = {};
    for (const subTask of subTasks) {
      if (subTask) subTasksById[subTask.id] = subTask;
    }
    setTaskChainViewSubTasksById(subTasksById);
  }

  async function submitTaskChainModal() {
    try {
      const values = await taskChainForm.validateFields();
      const text = values.text.trim();
      if (!text) return;

      await apiJson<Task>('/api/admin/tasks', {
        method: 'POST',
        body: JSON.stringify({
          text,
          folder_id: values.folderId,
          sub_ids: selectedTaskIds,
        }),
      });

      message.success('任务链创建成功');
      setTaskChainModalOpen(false);
      setSelectedTasksOpen(false);
      clearSelectedTasks();
      await Promise.all([reloadFolders(), reloadTasks(selectedFolderId, taskSearch)]);
    } catch {
      // 表单校验失败时会抛出错误，此处静默处理
    }
  }

  async function handleExecuteTask(task: Task) {
    // 检查 Agent 连接状态
    if (agentStatus !== 'connected') {
      message.error('Agent 未连接，请先在左下角配置并连接 Agent');
      return;
    }

    // 确认执行
    modal.confirm({
      title: '执行任务',
      content: (
        <div>
          <p>确定要执行以下任务吗？</p>
          <div className="mt-2 max-h-60 overflow-y-auto rounded bg-gray-100 p-2 text-sm whitespace-pre-wrap">
            {task.text}
          </div>
          {task.sub_ids && task.sub_ids.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              该任务链包含 {task.sub_ids.length} 个子任务
            </p>
          )}
        </div>
      ),
      okText: '执行',
      cancelText: '取消',
      async onOk() {
        try {
          // 从 API 获取最新配置，避免闭包捕获旧值
          const latestConfig = await fetchAgentConfig();
          const jobId = await executeJob(
            { taskId: task.id, config: latestConfig },
            {
              onJobCreated: (job) => {
                message.success(`Job 已创建: ${job.id.slice(0, 8)}`);
              },
              onError: (error) => {
                message.error(`执行失败: ${error.message}`);
              },
            },
          );
          // 打开进度面板
          setCurrentJobId(jobId);
          setJobProgressOpen(true);
        } catch {
          // 错误已在 onError 回调中处理
        }
      },
    });
  }

  function handleSelectionChange(nextSelectedIds: Id[]) {
    setSelectedTaskIds((prev) => {
      const prevSet = new Set(prev);
      const nextSet = new Set(nextSelectedIds);
      const kept = prev.filter((id) => nextSet.has(id));
      const added = nextSelectedIds.filter((id) => !prevSet.has(id));
      return [...kept, ...added];
    });

    setSelectedTasksById((prev) => {
      const nextSet = new Set(nextSelectedIds);
      const next = { ...prev };
      for (const id of Object.keys(next) as Id[]) {
        if (!nextSet.has(id)) delete next[id];
      }
      const taskById = new Map<Id, Task>();
      for (const task of tasks) taskById.set(task.id, task);
      for (const id of nextSelectedIds) {
        if (next[id]) continue;
        const task = taskById.get(id);
        if (task) next[id] = task;
      }
      return next;
    });
  }

  function removeSelectedTask(id: Id) {
    setSelectedTaskIds((prev) => prev.filter((x) => x !== id));
    setSelectedTasksById((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function clearSelectedTasks() {
    setSelectedTaskIds([]);
    setSelectedTasksById({});
  }

  const handleFolderDrop: TreeProps['onDrop'] = useCallback(
    async (info: {
      node: TreeDataNode & { pos: string };
      dragNode: TreeDataNode;
      dropPosition: number;
      dropToGap: boolean;
    }) => {
      const dragKey = String(info.dragNode.key);
      const dropKey = String(info.node.key);
      const dropPos = info.node.pos.split('-');
      const dropPosition = info.dropPosition - Number(dropPos[dropPos.length - 1]);

      const dragFolder = folderById.get(dragKey);
      if (!dragFolder) return;

      if (info.dropToGap) {
        const dropFolder = folderById.get(dropKey);
        if (!dropFolder) return;

        const targetParentId = dropFolder.parent_id;

        const siblings = folders.filter((f) => f.parent_id === targetParentId);
        siblings.sort((a, b) => {
          if (a.order_index !== null && b.order_index !== null) {
            return a.order_index - b.order_index;
          }
          if (a.order_index !== null) return -1;
          if (b.order_index !== null) return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        const filteredSiblings = siblings.filter((f) => f.id !== dragKey);

        const dropIndex = siblings.findIndex((f) => f.id === dropKey);
        let insertIndex: number;
        if (dropPosition === -1) {
          insertIndex = dropIndex;
        } else {
          insertIndex = dropIndex + 1;
        }

        if (dragFolder.parent_id === targetParentId) {
          const dragIndex = siblings.findIndex((f) => f.id === dragKey);
          if (dragIndex < dropIndex) {
            insertIndex--;
          }
        }

        const newOrder = [...filteredSiblings];
        newOrder.splice(Math.max(0, insertIndex), 0, dragFolder);

        try {
          await apiJson('/api/admin/folders/reorder', {
            method: 'POST',
            body: JSON.stringify({
              order: newOrder.map((f) => f.id),
              parent_id: targetParentId,
            }),
          });
          await reloadFolders();
        } catch {
          message.error('排序失败');
        }
      } else {
        const newParentId = dropKey;

        if (dragKey === newParentId) return;

        const children = folders.filter((f) => f.parent_id === newParentId);
        children.sort((a, b) => {
          if (a.order_index !== null && b.order_index !== null) {
            return a.order_index - b.order_index;
          }
          if (a.order_index !== null) return -1;
          if (b.order_index !== null) return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        const newOrder = [...children.filter((f) => f.id !== dragKey), dragFolder];

        try {
          await apiJson('/api/admin/folders/reorder', {
            method: 'POST',
            body: JSON.stringify({
              order: newOrder.map((f) => f.id),
              parent_id: newParentId,
            }),
          });
          setExpandedKeys((prev) => Array.from(new Set([...prev, newParentId])) as React.Key[]);
          await reloadFolders();
        } catch {
          message.error('移动失败');
        }
      }
    },
    [folders, folderById, message],
  );

  return (
    <>
      <Layout className="h-screen bg-(--ant-color-bg-layout)">
        <FolderSider
          treeSearch={treeSearch}
          onTreeSearchChange={setTreeSearch}
          treeData={treeData}
          selectedFolderId={selectedFolderId}
          expandedKeys={expandedKeys}
          autoExpandParent={autoExpandParent}
          onExpand={(keys) => {
            setExpandedKeys(keys);
            setAutoExpandParent(false);
          }}
          onSelect={(id) => setSelectedFolderId(id)}
          folderById={folderById}
          onCreateRoot={() => openCreateFolderModal(null)}
          onCreateChild={(id) => openCreateFolderModal(id)}
          onRename={openRenameFolderModal}
          onDelete={confirmDeleteFolder}
          onDrop={handleFolderDrop}
        />

        <TaskContent
          tasks={tasks}
          loading={tasksLoading || foldersLoading}
          selectedFolder={selectedFolder}
          selectedTaskIds={selectedTaskIds}
          taskSearch={taskSearch}
          taskStats={taskStats}
          onTaskSearchChange={setTaskSearch}
          onCreateTask={openCreateTaskModal}
          onDeleteTasks={confirmDeleteTasks}
          onEditTask={openEditTaskModal}
          onRefresh={() =>
            void Promise.all([reloadFolders(), reloadTasks(selectedFolderId, taskSearch)])
          }
          onSelectionChange={handleSelectionChange}
          onOpenSelectedTasks={() => setSelectedTasksOpen(true)}
          onViewTaskChain={(task) => void openTaskChainView(task)}
          onExecuteTask={(task) => void handleExecuteTask(task)}
        />
      </Layout>

      <FolderModal
        open={folderModalOpen}
        mode={folderModalMode}
        form={folderForm}
        onCancel={() => setFolderModalOpen(false)}
        onOk={() => void submitFolderModal()}
      />

      <TaskModal
        open={taskModalOpen}
        mode={taskModalMode}
        form={taskForm}
        onCancel={() => setTaskModalOpen(false)}
        onOk={() => void submitTaskModal()}
      />

      <SelectedTasksDrawer
        open={selectedTasksOpen}
        onClose={() => setSelectedTasksOpen(false)}
        selectedTaskIds={selectedTaskIds}
        selectedTasksById={selectedTasksById}
        folderById={folderById}
        onReorder={setSelectedTaskIds}
        onRemove={removeSelectedTask}
        onClear={clearSelectedTasks}
        onCreateTaskChain={openTaskChainModal}
      />

      <TaskChainModal
        open={taskChainModalOpen}
        form={taskChainForm}
        rootFolders={rootFolders}
        rootFoldersLoading={rootFoldersLoading}
        selectedTaskCount={selectedTaskIds.length}
        onCancel={() => setTaskChainModalOpen(false)}
        onOk={() => void submitTaskChainModal()}
      />

      <SelectedTasksDrawer
        open={taskChainViewOpen}
        onClose={() => {
          setTaskChainViewOpen(false);
          setTaskChainViewTask(null);
          setTaskChainViewSubIds([]);
          setTaskChainViewSubTasksById({});
        }}
        selectedTaskIds={taskChainViewSubIds}
        selectedTasksById={taskChainViewSubTasksById}
        folderById={folderById}
        title={taskChainViewTask ? `任务链详情：${taskChainViewTask.text}` : '任务链详情'}
        readonly
      />

      <JobProgressDrawer
        open={jobProgressOpen}
        jobId={currentJobId}
        onClose={() => {
          setJobProgressOpen(false);
          setCurrentJobId(null);
        }}
      />
    </>
  );
}
