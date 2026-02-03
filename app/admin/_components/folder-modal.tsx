import { Form, Input, Modal } from 'antd';
import type { FormInstance } from 'antd';

export type FolderModalMode = 'create' | 'rename';

type FolderModalProps = {
  open: boolean;
  mode: FolderModalMode;
  form: FormInstance<{ name: string }>;
  onCancel: () => void;
  onOk: () => void;
};

export default function FolderModal({ open, mode, form, onCancel, onOk }: FolderModalProps) {
  return (
    <Modal
      title={mode === 'create' ? '新建路径' : '重命名路径'}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      okText={mode === 'create' ? '创建' : '保存'}
      cancelText="取消"
    >
      <Form form={form} layout="vertical">
        <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="请输入路径名称" autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
}
