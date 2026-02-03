import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CompressOutlined,
  DeleteOutlined,
  EditOutlined,
  ExpandOutlined,
  FolderAddOutlined,
  LoadingOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { App, Button, Input, Layout, Popover, Space, Tag, Tooltip, Tree } from 'antd';
import type { TreeDataNode, TreeProps } from 'antd';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useAgentConnection } from '../_hooks/use-agent-connection';
import type { Folder, Id } from '../_types';

const { TextArea } = Input;

const MIN_WIDTH = 200;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 280;

type FolderSiderProps = {
  treeSearch: string;
  onTreeSearchChange: (value: string) => void;
  treeData: TreeDataNode[];
  selectedFolderId: Id | null;
  expandedKeys: React.Key[];
  autoExpandParent: boolean;
  onExpand: (keys: React.Key[]) => void;
  onSelect: (folderId: Id | null) => void;
  folderById: Map<Id, Folder>;
  onCreateRoot: () => void;
  onCreateChild: (folderId: Id) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  onDrop: TreeProps['onDrop'];
};

export default function FolderSider({
  treeSearch,
  onTreeSearchChange,
  treeData,
  selectedFolderId,
  expandedKeys,
  autoExpandParent,
  onExpand,
  onSelect,
  folderById,
  onCreateRoot,
  onCreateChild,
  onRename,
  onDelete,
  onDrop,
}: FolderSiderProps) {
  const { Sider } = Layout;
  const { message } = App.useApp();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const isResizing = useRef(false);

  // Agent 连接状态
  const {
    agentUrl,
    setAgentUrl,
    status,
    agentInfo,
    checkConnection,
    isChecking,
    agentConfig,
    setAgentConfig,
  } = useAgentConnection();
  const [inputUrl, setInputUrl] = useState(agentUrl);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [configText, setConfigText] = useState('');
  const [configError, setConfigError] = useState<string | null>(null);

  // 同步 inputUrl
  useEffect(() => {
    setInputUrl(agentUrl);
  }, [agentUrl]);

  // 同步 configText
  useEffect(() => {
    setConfigText(JSON.stringify(agentConfig, null, 2));
  }, [agentConfig]);

  const handleAgentCheck = async () => {
    if (inputUrl !== agentUrl) {
      // URL 变化时只更新 URL，让 useEffect 自动触发检测
      setAgentUrl(inputUrl);
    } else {
      // URL 没变化时手动触发检测
      await checkConnection();
    }
  };

  const handleConfigChange = (text: string) => {
    setConfigText(text);
    setConfigError(null);
  };

  const handleSaveConfig = async () => {
    try {
      const parsed = JSON.parse(configText);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setConfigError('配置必须是一个 JSON 对象');
        return;
      }
      const success = await setAgentConfig(parsed);
      if (success) {
        setConfigError(null);
        message.success('配置已保存');
      } else {
        setConfigError('保存失败，请重试');
      }
    } catch {
      setConfigError('JSON 格式错误');
    }
  };

  const handleMouseDown = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <Sider
      width={width}
      theme="light"
      className="relative border-r border-(--ant-color-split) bg-(--ant-color-bg-container) p-3"
    >
      <div className="flex h-full flex-col gap-3">
        <Input
          allowClear
          placeholder="请输入路径名称"
          value={treeSearch}
          onChange={(e) => onTreeSearchChange(e.target.value)}
          className="shrink-0"
        />
        <div className="flex shrink-0 gap-2">
          <Button
            type="primary"
            icon={<FolderAddOutlined />}
            onClick={onCreateRoot}
            className="flex-1"
          >
            新建
          </Button>
          <Tooltip title="展开全部">
            <Button
              icon={<ExpandOutlined />}
              onClick={() => onExpand(Array.from(folderById.keys()))}
            />
          </Tooltip>
          <Tooltip title="折叠全部">
            <Button icon={<CompressOutlined />} onClick={() => onExpand([])} />
          </Tooltip>
        </div>
        <div className="min-h-0 flex-1 overflow-auto pr-1">
          <Tree
            showLine
            blockNode
            draggable={{ icon: false, nodeDraggable: () => true }}
            onDrop={onDrop}
            selectedKeys={selectedFolderId ? [selectedFolderId] : []}
            expandedKeys={expandedKeys}
            autoExpandParent={autoExpandParent}
            onExpand={(keys) => {
              onExpand(keys);
            }}
            treeData={treeData}
            onSelect={(keys) => {
              if (keys.length === 0) return; // 忽略取消选中
              const key = keys[0];
              onSelect(typeof key === 'string' ? key : String(key));
            }}
            titleRender={(node) => {
              const resolvedTitle = (() => {
                const title = node.title;
                return typeof title === 'function' ? title(node) : title;
              })();

              const folderId = typeof node.key === 'string' ? node.key : String(node.key);
              const folder = folderById.get(folderId);
              if (!folder) return resolvedTitle;
              return (
                <span className="group/node relative -my-0.5 flex min-h-[30px] w-full items-center rounded py-0.5 transition-colors hover:bg-(--ant-color-fill-content)">
                  <span className="min-w-0 flex-1">{resolvedTitle as React.ReactNode}</span>
                  <span
                    className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded bg-(--ant-color-bg-container) px-1 opacity-0 shadow-sm transition-opacity group-hover/node:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      size="small"
                      type="text"
                      className="h-5! w-5! min-w-0! p-0!"
                      icon={<PlusOutlined className="text-xs!" />}
                      onClick={() => onCreateChild(folder.id)}
                    />
                    <Button
                      size="small"
                      type="text"
                      className="h-5! w-5! min-w-0! p-0!"
                      icon={<EditOutlined className="text-xs!" />}
                      onClick={() => onRename(folder)}
                    />
                    <Button
                      size="small"
                      type="text"
                      className="h-5! w-5! min-w-0! p-0! hover:text-red-500!"
                      icon={<DeleteOutlined className="text-xs!" />}
                      onClick={() => void onDelete(folder)}
                    />
                  </span>
                </span>
              );
            }}
            className="bg-(--ant-color-bg-container) [&_.ant-tree-indent-unit]:w-3 [&_.ant-tree-switcher]:mr-0"
          />
        </div>

        {/* Agent 连接状态栏 */}
        <div className="border-t border-(--ant-color-split) pt-3">
          <Popover
            open={popoverOpen}
            onOpenChange={setPopoverOpen}
            trigger="click"
            placement="topLeft"
            title="Agent 连接配置"
            content={
              <div className="w-80">
                <Space orientation="vertical" size="small" className="w-full">
                  <Input
                    placeholder="http://127.0.0.1:8000"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    onPressEnter={() => void handleAgentCheck()}
                  />
                  <Button
                    type="primary"
                    block
                    loading={isChecking}
                    onClick={() => void handleAgentCheck()}
                  >
                    检测连接
                  </Button>
                  {status === 'connected' && agentInfo && (
                    <div className="text-xs text-(--ant-color-text-secondary)">
                      <div>
                        服务: {agentInfo.service.name} v{agentInfo.service.version}
                      </div>
                      <div>运行: {Math.floor(agentInfo.uptime_seconds / 60)}分钟</div>
                    </div>
                  )}

                  <div className="mt-2 border-t border-(--ant-color-split) pt-2">
                    <div className="mb-1 text-xs text-(--ant-color-text-secondary)">
                      Job 配置 (JSON)
                    </div>
                    <TextArea
                      value={configText}
                      onChange={(e) => handleConfigChange(e.target.value)}
                      placeholder='{"gemini_model": "gemini-3-flash-preview", "max_steps": 1000}'
                      autoSize={{ minRows: 4, maxRows: 8 }}
                      className="font-mono text-xs"
                      status={configError ? 'error' : undefined}
                    />
                    {configError && (
                      <div className="text-xs text-(--ant-color-error)">{configError}</div>
                    )}
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => void handleSaveConfig()}
                      className="mt-2"
                      disabled={configError !== null}
                    >
                      保存配置
                    </Button>
                  </div>
                </Space>
              </div>
            }
          >
            <div className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 hover:bg-(--ant-color-bg-text-hover)">
              <Space size={4}>
                {status === 'connected' ? (
                  <Tag icon={<CheckCircleOutlined />} color="success" className="m-0">
                    Agent 已连接
                  </Tag>
                ) : status === 'checking' ? (
                  <Tag icon={<LoadingOutlined />} color="processing" className="m-0">
                    检测中
                  </Tag>
                ) : (
                  <Tag icon={<CloseCircleOutlined />} color="error" className="m-0">
                    Agent 未连接
                  </Tag>
                )}
              </Space>
              <SettingOutlined className="text-(--ant-color-text-secondary)" />
            </div>
          </Popover>
        </div>
      </div>
      {/* 拖拽调整宽度的手柄 */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 right-0 z-10 h-full w-1 cursor-col-resize hover:bg-(--ant-color-primary) hover:opacity-50"
      />
    </Sider>
  );
}
