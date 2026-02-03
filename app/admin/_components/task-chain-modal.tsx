import { Form, Input, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';

import type { Folder, Id } from '../_types';

type TaskChainModalProps = {
  open: boolean;
  form: FormInstance<{ text: string; folderId: Id }>;
  rootFolders: Folder[];
  rootFoldersLoading: boolean;
  selectedTaskCount: number;
  onCancel: () => void;
  onOk: () => void;
};

export default function TaskChainModal({
  open,
  form,
  rootFolders,
  rootFoldersLoading,
  selectedTaskCount,
  onCancel,
  onOk,
}: TaskChainModalProps) {
  return (
    <Modal
      title="创建任务链"
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      okText="创建"
      cancelText="取消"
      okButtonProps={{ disabled: rootFolders.length === 0 }}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="任务链名称"
          name="text"
          rules={[{ required: true, message: '请输入任务链名称' }]}
        >
          <Input placeholder="请输入任务链名称" autoFocus />
        </Form.Item>
        <Form.Item
          label="目标根目录"
          name="folderId"
          rules={[{ required: true, message: '请选择目标根目录' }]}
        >
          <Select
            placeholder={rootFolders.length === 0 ? '暂无根目录' : '请选择根目录'}
            loading={rootFoldersLoading}
            disabled={rootFolders.length === 0}
            options={rootFolders.map((folder) => ({
              value: folder.id,
              label: folder.name,
            }))}
          />
        </Form.Item>
      </Form>
      <p className="text-sm text-(--ant-color-text-secondary)">
        将创建包含 {selectedTaskCount} 个子任务的任务链
      </p>
    </Modal>
  );
}
