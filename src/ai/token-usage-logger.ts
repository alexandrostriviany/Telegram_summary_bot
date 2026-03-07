/**
 * Token Usage Logger
 *
 * Emits structured JSON logs for token usage monitoring.
 * CloudWatch Lambda captures stdout automatically, so console.log
 * is sufficient for structured log ingestion.
 *
 * @module ai/token-usage-logger
 */

import { TokenUsage, AIProviderType } from './ai-provider';

/**
 * Phase of the summarization pipeline that consumed tokens
 */
export type SummarizePhase = 'single' | 'chunk' | 'combine';

/**
 * Structured log entry for a single AI API call
 */
export interface TokenUsageLogEntry {
  _type: 'TOKEN_USAGE';
  timestamp: string;
  provider: AIProviderType;
  model: string;
  chatId: number;
  phase: SummarizePhase;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Structured log entry for aggregated token usage across a full summary request
 */
export interface TokenUsageTotalLogEntry {
  _type: 'TOKEN_USAGE_TOTAL';
  timestamp: string;
  provider: AIProviderType;
  model: string;
  chatId: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  apiCallCount: number;
}

/**
 * Log token usage for a single AI API call
 */
export function logTokenUsage(
  provider: AIProviderType,
  model: string,
  chatId: number,
  usage: TokenUsage,
  phase: SummarizePhase
): void {
  const entry: TokenUsageLogEntry = {
    _type: 'TOKEN_USAGE',
    timestamp: new Date().toISOString(),
    provider,
    model,
    chatId,
    phase,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
  console.log(JSON.stringify(entry));
}

/**
 * Log aggregated token usage for a full summary request
 */
export function logAggregatedTokenUsage(
  provider: AIProviderType,
  model: string,
  chatId: number,
  usages: TokenUsage[],
  apiCallCount: number
): void {
  const totals = usages.reduce(
    (acc, u) => ({
      inputTokens: acc.inputTokens + u.inputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
      totalTokens: acc.totalTokens + u.totalTokens,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  );

  const entry: TokenUsageTotalLogEntry = {
    _type: 'TOKEN_USAGE_TOTAL',
    timestamp: new Date().toISOString(),
    provider,
    model,
    chatId,
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    totalTokens: totals.totalTokens,
    apiCallCount,
  };
  console.log(JSON.stringify(entry));
}
