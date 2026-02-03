'use client';

import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Image,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { useState } from 'react';

import type { JobTask, JobTaskLite, TaskActionResult } from '../../../_types';

const { Text, Paragraph } = Typography;

// 格式化秒数为 时/分/秒 格式
function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds == null) return '-';
  const s = Math.round(seconds);
  if (s < 60) return `${s}秒`;
  if (s < 3600) return `${Math.floor(s / 60)}分${s % 60}秒`;
  return `${Math.floor(s / 3600)}时${Math.floor((s % 3600) / 60)}分${s % 60}秒`;
}

type JobTaskDetailProps = {
  /** 轻量版数据（只包含 summary 摘要） */
  taskLite: JobTaskLite;
  /** 完整详情（按需加载，可能为 null） */
  taskDetail: JobTask | null;
  /** 是否正在加载完整详情 */
  loading: boolean;
};

type StepInfo = TaskActionResult['steps'][number];

export default function JobTaskDetail({ taskLite, taskDetail, loading }: JobTaskDetailProps) {
  // 优先使用完整详情，否则使用轻量数据的 summary
  const fullResult = taskDetail?.result as TaskActionResult | null;
  const summary = fullResult?.summary ?? taskLite.result_summary;
  const error = taskDetail?.error ?? taskLite.error;

  return (
    <div className="space-y-4 bg-gray-50 p-4">
      {/* 错误信息 */}
      {error && <Alert type="error" title="执行错误" description={error} showIcon />}

      {/* 执行结果 */}
      {summary ? (
        <>
          {/* 执行摘要（使用 summary 数据） */}
          <ResultSummary summary={summary} runtime={fullResult?.runtime} />

          {/* 执行步骤（需要完整详情） */}
          {loading ? (
            <Card size="small" title="执行步骤" className="bg-white">
              <div className="flex items-center justify-center py-8">
                <Spin indicator={<LoadingOutlined spin />} />
                <span className="ml-2 text-gray-400">加载详情中...</span>
              </div>
            </Card>
          ) : fullResult?.steps && fullResult.steps.length > 0 ? (
            <StepsList steps={fullResult.steps} />
          ) : (
            <Card size="small" title="执行步骤" className="bg-white">
              <div className="py-4 text-center text-gray-400">
                {taskLite.status === 'running' ? '执行中...' : '暂无步骤详情'}
              </div>
            </Card>
          )}
        </>
      ) : (
        <div className="py-8 text-center text-gray-400">
          {taskLite.status === 'pending'
            ? '等待执行'
            : taskLite.status === 'running'
              ? '正在执行...'
              : '无执行结果'}
        </div>
      )}
    </div>
  );
}

// 执行摘要组件
function ResultSummary({
  summary,
  runtime,
}: {
  summary: TaskActionResult['summary'];
  runtime?: TaskActionResult['runtime'];
}) {
  if (!summary) return null;

  const isSuccess = summary.is_successful === true;
  const judgement = summary.judgement;

  return (
    <Card size="small" title="执行摘要" className="bg-white">
      <Descriptions size="small" column={2}>
        <Descriptions.Item label="执行状态">
          <Tag
            color={isSuccess ? 'success' : summary.is_successful === false ? 'error' : 'default'}
          >
            {summary.status}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="执行时长">
          {formatDurationSeconds(summary.duration_seconds)}
        </Descriptions.Item>
        <Descriptions.Item label="总步骤数">{summary.total_steps ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="总动作数">{summary.total_actions ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="步骤错误数">
          <span className={summary.step_error_count > 0 ? 'text-red-500' : ''}>
            {summary.step_error_count ?? 0}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="动作错误数">
          <span className={summary.action_error_count > 0 ? 'text-red-500' : ''}>
            {summary.action_error_count ?? 0}
          </span>
        </Descriptions.Item>
      </Descriptions>

      {/* 最终结果 */}
      {summary.final_result && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <Text type="secondary" className="text-xs">
            最终结果
          </Text>
          <Paragraph className="mt-1 mb-0 rounded bg-gray-50 p-2 text-sm">
            {summary.final_result}
          </Paragraph>
        </div>
      )}

      {/* AI 判定 */}
      {judgement && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <Text type="secondary" className="text-xs">
            AI 判定
          </Text>
          <div className="mt-1 space-y-2">
            <div className="flex items-center gap-2">
              <Tag color={judgement.verdict ? 'success' : 'error'}>
                {judgement.verdict ? '成功' : '失败'}
              </Tag>
              {judgement.impossible_task && <Tag color="warning">不可能完成的任务</Tag>}
              {judgement.reached_captcha && <Tag color="warning">遇到验证码</Tag>}
            </div>
            {judgement.reasoning && (
              <Paragraph className="mb-0 rounded bg-gray-50 p-2 text-xs">
                {judgement.reasoning}
              </Paragraph>
            )}
            {judgement.failure_reason && (
              <Alert type="error" title="失败原因" description={judgement.failure_reason} />
            )}
          </div>
        </div>
      )}

      {/* 访问的 URL */}
      {summary.visited_urls && summary.visited_urls.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <Text type="secondary" className="text-xs">
            访问的 URL ({summary.visited_urls.length})
          </Text>
          <div className="mt-1 max-h-16 overflow-auto">
            {summary.visited_urls.map((url, i) => (
              <div key={i} className="truncate text-xs">
                <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  <LinkOutlined className="mr-1" />
                  {url}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 动作序列 */}
      {summary.action_sequence && summary.action_sequence.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <Text type="secondary" className="text-xs">
            动作序列 ({summary.action_sequence.length})
          </Text>
          <div className="mt-1 flex max-h-16 flex-wrap gap-1 overflow-auto">
            {summary.action_sequence.map((action, i) => (
              <Tag key={i} className="text-xs">
                {action}
              </Tag>
            ))}
          </div>
        </div>
      )}

      {/* 提取的内容 */}
      {summary.all_extracted_content && summary.all_extracted_content.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <Text type="secondary" className="text-xs">
            提取的内容 ({summary.all_extracted_content.length})
          </Text>
          <div className="mt-1 max-h-16 overflow-auto rounded bg-gray-50 p-2">
            {summary.all_extracted_content.map((content, i) => (
              <div key={i} className="border-b border-gray-100 py-1 text-xs last:border-b-0">
                {content}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 错误信息 */}
      {summary.errors && summary.errors.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <Text type="secondary" className="text-xs">
            错误信息
          </Text>
          {summary.errors.map((err, i) => (
            <Alert key={i} type="error" title={err} className="mt-1" />
          ))}
        </div>
      )}

      {/* 运行时信息 */}
      {runtime && <RuntimeInfo runtime={runtime} />}
    </Card>
  );
}

// 执行步骤列表组件
function StepsList({ steps }: { steps: StepInfo[] }) {
  // 默认展开最后 3 个
  const [activeKeys, setActiveKeys] = useState<number[]>(() => {
    const total = steps.length;
    if (total <= 3) return steps.map((_, i) => i);
    return [total - 3, total - 2, total - 1];
  });

  const handleExpandAll = () => {
    setActiveKeys(steps.map((_, i) => i));
  };

  const handleCollapseAll = () => {
    setActiveKeys([]);
  };

  const handleExpandDown10 = (fromIndex: number) => {
    const newKeys = Array.from(
      { length: Math.min(10, steps.length - fromIndex) },
      (_, i) => fromIndex + i,
    );
    setActiveKeys((prev) => [...new Set([...prev, ...newKeys])]);
  };

  // 预计算每个步骤的累积时间
  const cumulativeTimes = steps.reduce<number[]>((acc, step, index) => {
    const prevTime = index === 0 ? 0 : acc[index - 1];
    acc.push(prevTime + (step.duration_seconds ?? 0));
    return acc;
  }, []);

  const collapseItems = steps.map((step, index) => ({
    key: index,
    label: (
      <StepLabel
        step={step}
        index={index}
        totalSteps={steps.length}
        cumulativeTime={cumulativeTimes[index]}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        onExpandDown10={() => handleExpandDown10(index)}
      />
    ),
    children: <StepDetail step={step} />,
  }));

  return (
    <Card
      size="small"
      title={`执行步骤 (${steps.length})`}
      className="bg-white [&_.ant-card-body]:max-h-[500px] [&_.ant-card-body]:overflow-auto [&_.ant-card-body]:p-0"
    >
      <Collapse
        activeKey={activeKeys}
        onChange={(keys) => setActiveKeys((Array.isArray(keys) ? keys : [keys]).map(Number))}
        items={collapseItems}
        className="rounded-none border-0 [&_.ant-collapse-content-box]:p-0 [&_.ant-collapse-item]:border-b [&_.ant-collapse-item]:border-b-gray-100"
      />
    </Card>
  );
}

// Step 标题组件
function StepLabel({
  step,
  index,
  totalSteps,
  cumulativeTime,
  onExpandAll,
  onCollapseAll,
  onExpandDown10,
}: {
  step: StepInfo;
  index: number;
  totalSteps: number;
  cumulativeTime: number;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onExpandDown10: () => void;
}) {
  const hasError = step.results?.some((r: unknown) => {
    const result = r as { error?: string | null };
    return result.error;
  });

  const handleButtonClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  return (
    <div className="flex w-full items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 font-mono text-xs text-blue-600">
        {step.step_number}
      </span>
      {hasError ? (
        <ExclamationCircleOutlined className="text-red-500" />
      ) : (
        <CheckCircleOutlined className="text-green-500" />
      )}
      <span className="min-w-0 flex-1 truncate text-xs" title={step.page_title}>
        {step.page_title || '未知页面'}
      </span>
      <span className="shrink-0 text-xs text-gray-400">
        {formatDurationSeconds(cumulativeTime)}/{formatDurationSeconds(step.duration_seconds)}
      </span>
      <Space size={4} className="shrink-0">
        <Button
          size="small"
          type="link"
          className="!px-1 !text-xs"
          onClick={(e) => handleButtonClick(e, onExpandAll)}
        >
          全部展开
        </Button>
        <Button
          size="small"
          type="link"
          className="!px-1 !text-xs"
          onClick={(e) => handleButtonClick(e, onCollapseAll)}
        >
          全部关闭
        </Button>
        {index + 10 < totalSteps && (
          <Button
            size="small"
            type="link"
            className="!px-1 !text-xs"
            onClick={(e) => handleButtonClick(e, onExpandDown10)}
          >
            ↓展开10
          </Button>
        )}
      </Space>
    </div>
  );
}

// Step 详情组件
function StepDetail({ step }: { step: StepInfo }) {
  const modelOutput = step.model_output;

  return (
    <div className="space-y-3 bg-gray-50 p-3">
      {/* 基本信息 */}
      <Descriptions size="small" column={1} className="[&_.ant-descriptions-item]:pb-1">
        <Descriptions.Item label="URL">
          <a
            href={step.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs hover:underline"
          >
            {step.url}
          </a>
        </Descriptions.Item>
        <Descriptions.Item label="页面标题">{step.page_title || '-'}</Descriptions.Item>
        <Descriptions.Item label="耗时">
          {formatDurationSeconds(step.duration_seconds)}
        </Descriptions.Item>
      </Descriptions>

      {/* 思考图像 */}
      {step.thinking_image && step.thinking_image !== '<string>' && (
        <div>
          <Text type="secondary" className="text-xs">
            页面截图
          </Text>
          <div className="mt-1">
            <Image
              src={
                step.thinking_image.startsWith('data:')
                  ? step.thinking_image
                  : `data:image/png;base64,${step.thinking_image}`
              }
              alt="页面截图"
              className="max-h-64 rounded border"
              placeholder
            />
          </div>
        </div>
      )}

      {/* LLM 思考过程 */}
      {(step.thinking || modelOutput?.thinking) && (
        <div>
          <Text type="secondary" className="text-xs">
            <ThunderboltOutlined className="mr-1" />
            LLM 思考
          </Text>
          <Paragraph className="mt-1 mb-0 rounded bg-white p-2 text-xs whitespace-pre-wrap">
            {step.thinking || modelOutput?.thinking}
          </Paragraph>
        </div>
      )}

      {/* 上一步评估 */}
      {(step.evaluation || modelOutput?.evaluation_previous_goal) && (
        <div>
          <Text type="secondary" className="text-xs">
            上一步评估
          </Text>
          <Paragraph className="mt-1 mb-0 rounded bg-white p-2 text-xs whitespace-pre-wrap">
            {step.evaluation || modelOutput?.evaluation_previous_goal}
          </Paragraph>
        </div>
      )}

      {/* 下一步目标 */}
      {(step.next_goal || modelOutput?.next_goal) && (
        <div>
          <Text type="secondary" className="text-xs">
            下一步目标
          </Text>
          <Paragraph className="mt-1 mb-0 rounded bg-white p-2 text-xs whitespace-pre-wrap">
            {step.next_goal || modelOutput?.next_goal}
          </Paragraph>
        </div>
      )}

      {/* 记忆 */}
      {(step.memory || modelOutput?.memory) && (
        <div>
          <Text type="secondary" className="text-xs">
            记忆
          </Text>
          <Paragraph className="mt-1 mb-0 rounded bg-white p-2 text-xs whitespace-pre-wrap">
            {step.memory || modelOutput?.memory}
          </Paragraph>
        </div>
      )}

      {/* 动作 */}
      {modelOutput?.action && modelOutput.action.length > 0 && (
        <div>
          <Text type="secondary" className="text-xs">
            执行动作
          </Text>
          <div className="mt-1 rounded bg-white p-2">
            {modelOutput.action.map((action: unknown, i: number) => (
              <pre key={i} className="mb-1 overflow-auto text-xs whitespace-pre-wrap last:mb-0">
                {JSON.stringify(action, null, 2)}
              </pre>
            ))}
          </div>
        </div>
      )}

      {/* 执行结果 */}
      {step.results && step.results.length > 0 && (
        <div>
          <Text type="secondary" className="text-xs">
            执行结果
          </Text>
          <div className="mt-1 space-y-2">
            {step.results.map((result: unknown, i: number) => {
              const r = result as {
                is_done?: boolean;
                success?: boolean | null;
                error?: string | null;
                extracted_content?: string;
                long_term_memory?: string;
              };
              return (
                <div key={i} className="rounded bg-white p-2 text-xs">
                  {r.is_done && (
                    <Tag color="green" className="mb-1">
                      完成
                    </Tag>
                  )}
                  {r.error && <Alert type="error" title={r.error} className="mb-1" />}
                  {r.extracted_content && (
                    <div className="mb-1">
                      <span className="text-gray-500">提取内容: </span>
                      {r.extracted_content}
                    </div>
                  )}
                  {r.long_term_memory && (
                    <div>
                      <span className="text-gray-500">长期记忆: </span>
                      {r.long_term_memory}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 标签页信息 */}
      {step.tabs && step.tabs.length > 0 && (
        <div>
          <Text type="secondary" className="text-xs">
            浏览器标签页 ({step.tabs.length})
          </Text>
          <div className="mt-1 rounded bg-white p-2">
            {step.tabs.map((tab, i) => (
              <div key={i} className="border-b border-gray-100 py-1 text-xs last:border-b-0">
                <div className="font-medium">{tab.title || '无标题'}</div>
                <div className="truncate text-gray-500">{tab.url}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 运行时信息组件 - 直接展示 runtime 所有字段
function RuntimeInfo({ runtime }: { runtime: TaskActionResult['runtime'] }) {
  // 格式化值为字符串
  const formatValue = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <Text type="secondary" className="text-xs">
        运行时环境
      </Text>
      <div className="mt-1 rounded bg-gray-100 p-2">
        <pre className="m-0 overflow-auto text-xs whitespace-pre-wrap">
          {Object.entries(runtime).map(([key, value]) => (
            <div key={key} className="py-0.5">
              <span className="text-gray-500">{key}:</span>{' '}
              <span className="text-gray-700">{formatValue(value)}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
