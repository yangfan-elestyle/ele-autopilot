'use client';

import { App, ConfigProvider, Spin } from 'antd';
import { useEffect, useState } from 'react';

import { AgentConnectionProvider } from '../_hooks/use-agent-connection';
import { adminTheme } from '../_theme/antd-theme';
import AdminTaskExplorer from './admin-task-explorer';

export default function AdminTaskExplorerPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f5f5f5]">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <ConfigProvider theme={adminTheme}>
      <App>
        <AgentConnectionProvider>
          <AdminTaskExplorer />
        </AgentConnectionProvider>
      </App>
    </ConfigProvider>
  );
}
