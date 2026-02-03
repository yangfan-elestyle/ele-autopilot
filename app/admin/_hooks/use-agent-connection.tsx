'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import type { AgentConnectionStatus, AgentInfo, JobConfig } from '../_types';

const STORAGE_KEY = 'agent_url';
const DEFAULT_AGENT_URL = 'http://127.0.0.1:8000';

export type AgentConnectionContextValue = {
  agentUrl: string;
  setAgentUrl: (url: string) => void;
  status: AgentConnectionStatus;
  agentInfo: AgentInfo | null;
  checkConnection: () => Promise<boolean>;
  isChecking: boolean;
  agentConfig: JobConfig;
  setAgentConfig: (config: JobConfig) => Promise<boolean>;
  isLoadingConfig: boolean;
};

const AgentConnectionContext = createContext<AgentConnectionContextValue | null>(null);

export function AgentConnectionProvider({ children }: { children: React.ReactNode }) {
  const [agentUrl, setAgentUrlState] = useState<string>(DEFAULT_AGENT_URL);
  const [status, setStatus] = useState<AgentConnectionStatus>('disconnected');
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [agentConfig, setAgentConfigState] = useState<JobConfig>({});
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  // 从 localStorage 读取 agentUrl
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setAgentUrlState(stored);
    }
  }, []);

  // 从 API 读取 agentConfig
  useEffect(() => {
    async function fetchConfig() {
      try {
        const response = await fetch('/api/admin/settings');
        if (response.ok) {
          const config = await response.json();
          setAgentConfigState(config);
        }
      } catch {
        // 初始化失败时静默处理，执行任务时会再次获取并报错
      } finally {
        setIsLoadingConfig(false);
      }
    }
    fetchConfig();
  }, []);

  // 设置 agentUrl 并保存到 localStorage
  const setAgentUrl = useCallback((url: string) => {
    setAgentUrlState(url);
    localStorage.setItem(STORAGE_KEY, url);
    // 重置状态
    setStatus('disconnected');
    setAgentInfo(null);
  }, []);

  // 设置 agentConfig 并保存到 API
  const setAgentConfig = useCallback(async (config: JobConfig): Promise<boolean> => {
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (response.ok) {
        setAgentConfigState(config);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  // 检测连接
  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (!agentUrl) {
      setStatus('disconnected');
      setAgentInfo(null);
      return false;
    }

    setIsChecking(true);
    setStatus('checking');

    try {
      const response = await fetch(`${agentUrl}/system/connect`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        setStatus('disconnected');
        setAgentInfo(null);
        return false;
      }

      const result = await response.json();

      // Local 返回统一响应格式：{ code: 0, message: "success", data: {...} }
      if (result.code === 0 && result.data) {
        setStatus('connected');
        setAgentInfo(result.data as AgentInfo);
        return true;
      }

      setStatus('disconnected');
      setAgentInfo(null);
      return false;
    } catch {
      setStatus('disconnected');
      setAgentInfo(null);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [agentUrl]);

  // 初始化时自动检测一次
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // 断开时自动重连：每 2 秒检测一次
  useEffect(() => {
    if (status !== 'disconnected') {
      return;
    }

    const intervalId = setInterval(() => {
      // 避免在检测中重复触发
      if (!isChecking) {
        checkConnection();
      }
    }, 2000);

    return () => clearInterval(intervalId);
  }, [status, isChecking, checkConnection]);

  return (
    <AgentConnectionContext.Provider
      value={{
        agentUrl,
        setAgentUrl,
        status,
        agentInfo,
        checkConnection,
        isChecking,
        agentConfig,
        setAgentConfig,
        isLoadingConfig,
      }}
    >
      {children}
    </AgentConnectionContext.Provider>
  );
}

// Hook to consume the context
export function useAgentConnection(): AgentConnectionContextValue {
  const context = useContext(AgentConnectionContext);
  if (!context) {
    throw new Error('useAgentConnection must be used within AgentConnectionProvider');
  }
  return context;
}

// 工具函数：获取当前 agent URL（仅客户端）
export function getAgentUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_AGENT_URL;
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_AGENT_URL;
}

// 工具函数：从 API 获取 agent config
export async function fetchAgentConfig(): Promise<JobConfig> {
  const response = await fetch('/api/admin/settings');
  if (!response.ok) {
    throw new Error('Failed to fetch agent config');
  }
  return await response.json();
}
