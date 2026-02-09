import { Form, Input, Modal } from 'antd';
import type { FormInstance } from 'antd';

export type TaskModalMode = 'create' | 'edit';

export type TaskFormValues = { title?: string; text: string };

type TaskModalProps = {
  open: boolean;
  mode: TaskModalMode;
  form: FormInstance<TaskFormValues>;
  onCancel: () => void;
  onOk: () => void;
};

export default function TaskModal({ open, mode, form, onCancel, onOk }: TaskModalProps) {
  return (
    <Modal
      title={mode === 'create' ? '新建任务' : '编辑任务'}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      okText={mode === 'create' ? '创建' : '保存'}
      cancelText="取消"
      width="80vw"
    >
      <Form form={form} layout="vertical">
        <Form.Item label="标题（可选）" name="title">
          <Input placeholder="简短标注，便于快速识别任务" allowClear />
        </Form.Item>
        <Form.Item
          label="任务内容"
          name="text"
          rules={[{ required: true, message: '请输入任务内容' }]}
        >
          <Input.TextArea
            placeholder={
              mode === 'create'
                ? '请输入任务内容\n\n提示：使用 --- 分隔可批量创建多个任务'
                : '请输入任务内容'
            }
            autoFocus
            style={{ height: 'calc(60vh - 70px)' }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
