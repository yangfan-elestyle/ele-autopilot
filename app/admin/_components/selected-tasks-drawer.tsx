import { DeleteOutlined, MenuOutlined } from '@ant-design/icons';
import { Button, Drawer, Empty, Modal, Space, Typography } from 'antd';
import { useMemo, useState } from 'react';

import type { Folder, Id, Task } from '../_types';
import TaskTitleTag from './task-title-tag';

type SelectedTasksDrawerProps = {
  open: boolean;
  onClose: () => void;
  selectedTaskIds: Id[];
  selectedTasksById: Record<Id, Task>;
  folderById: Map<Id, Folder>;
  onReorder?: (ids: Id[]) => void;
  onRemove?: (id: Id) => void;
  onClear?: () => void;
  onCreateTaskChain?: () => void;
  title?: string;
  readonly?: boolean;
};

function arrayMove<T>(arr: T[], fromIndex: number, toIndex: number) {
  const next = arr.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export default function SelectedTasksDrawer({
  open,
  onClose,
  selectedTaskIds,
  selectedTasksById,
  folderById,
  onReorder,
  onRemove,
  onClear,
  onCreateTaskChain,
  title,
  readonly = false,
}: SelectedTasksDrawerProps) {
  const [draggingId, setDraggingId] = useState<Id | null>(null);
  const [dragOverId, setDragOverId] = useState<Id | null>(null);

  const selectedTasks = useMemo(
    () => selectedTaskIds.map((id) => selectedTasksById[id]).filter((t): t is Task => Boolean(t)),
    [selectedTaskIds, selectedTasksById],
  );

  function reorder(fromId: Id, toId: Id) {
    if (fromId === toId || !onReorder) return;
    const fromIndex = selectedTaskIds.indexOf(fromId);
    const toIndex = selectedTaskIds.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0) return;
    onReorder(arrayMove(selectedTaskIds, fromIndex, toIndex));
  }

  function confirmClear() {
    if (!selectedTaskIds.length || !onClear) return;
    Modal.confirm({
      title: '全部删除？',
      content: '这会清空已选择的任务（不会删除任务本身）。',
      okText: '清空',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk() {
        onClear();
      },
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title ?? `已选任务（${selectedTaskIds.length}）`}
      size="large"
      footer={
        readonly ? null : (
          <Space className="w-full justify-between">
            <Button danger disabled={!selectedTaskIds.length} onClick={confirmClear}>
              全部删除
            </Button>
            <Button type="primary" disabled={!selectedTaskIds.length} onClick={onCreateTaskChain}>
              创建任务链
            </Button>
          </Space>
        )
      }
    >
      {selectedTasks.length === 0 ? (
        <Empty description="暂无已选任务" />
      ) : (
        <Space orientation="vertical" size={8} className="w-full">
          {!readonly && (
            <Typography.Text type="secondary">
              拖动排序后，创建任务链会按当前顺序处理。
            </Typography.Text>
          )}

          {selectedTasks.map((task, index) => {
            const folderName = folderById.get(task.folder_id)?.name ?? '未知路径';
            const dragging = draggingId === task.id;
            const over = dragOverId === task.id;

            return (
              <div
                key={task.id}
                draggable={!readonly}
                onDragStart={
                  readonly
                    ? undefined
                    : (e) => {
                        setDraggingId(task.id);
                        setDragOverId(task.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', task.id);
                      }
                }
                onDragOver={
                  readonly
                    ? undefined
                    : (e) => {
                        e.preventDefault();
                        if (dragOverId !== task.id) setDragOverId(task.id);
                      }
                }
                onDrop={
                  readonly
                    ? undefined
                    : (e) => {
                        e.preventDefault();
                        const from = draggingId ?? e.dataTransfer.getData('text/plain');
                        if (from) reorder(from, task.id);
                        setDraggingId(null);
                        setDragOverId(null);
                      }
                }
                onDragEnd={
                  readonly
                    ? undefined
                    : () => {
                        setDraggingId(null);
                        setDragOverId(null);
                      }
                }
                className={[
                  'flex items-center gap-2 rounded-md border px-3 py-2',
                  'border-(--ant-color-border) bg-(--ant-color-bg-container)',
                  !readonly && over ? 'ring-1 ring-(--ant-color-primary)' : '',
                  !readonly && dragging ? 'opacity-60' : '',
                ].join(' ')}
              >
                <span className="w-6 text-right text-(--ant-color-text-secondary)">
                  {index + 1}
                </span>
                {!readonly && (
                  <span className="cursor-grab text-(--ant-color-text-secondary)">
                    <MenuOutlined />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <Typography.Text ellipsis={{ tooltip: task.text }} className="max-w-full">
                    <TaskTitleTag title={task.title} />
                    {task.text}
                  </Typography.Text>
                </div>

                <Typography.Text type="secondary" className="max-w-44 truncate" title={folderName}>
                  {folderName}
                </Typography.Text>

                {!readonly && onRemove && (
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => onRemove(task.id)}
                  />
                )}
              </div>
            );
          })}
        </Space>
      )}
    </Drawer>
  );
}
