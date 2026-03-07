/**
 * Summary Engine Implementation
 * 
 * This module provides the SummaryEngine that orchestrates the summarization process:
 * - Fetches messages from the MessageStore based on time or count range
 * - Formats messages for AI prompt with thread context
 * - Estimates token count for chunking decisions
 * - Integrates with AIProvider for summarization
 * 
 * @module summary/summary-engine
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */

import { StoredMessage, MessageRange, MessageQuery } from '../types';
import { MessageStore } from '../store/message-store';
import { AIProvider, AIProviderType, SummarizeResult, TokenUsage } from '../ai/ai-provider';
import { logTokenUsage, logAggregatedTokenUsage } from '../ai/token-usage-logger';
import { COMBINE_SUMMARIES_PROMPT } from '../ai/prompts';
import { NoMessagesError } from '../errors/error-handler';

// Re-export NoMessagesError for backward compatibility
export { NoMessagesError };

// ============================================================================
// Constants
// ============================================================================

/**
 * Approximate characters per token for estimation
 * This is a conservative estimate (~4 chars per token for English text)
 */
const CHARS_PER_TOKEN = 4;

/**
 * Buffer to reserve for system prompt and response tokens
 * We reserve some tokens for the system prompt and expected response
 */
const TOKEN_BUFFER = 1000;

/**
 * Overlap between chunks to maintain context continuity
 * This helps the AI understand context at chunk boundaries
 */
const CHUNK_OVERLAP_MESSAGES = 3;

/**
 * Temporal gap threshold in milliseconds for topic splitting.
 * Messages separated by more than this gap (within non-threaded messages)
 * are treated as different conversation segments.
 */
const TEMPORAL_GAP_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Minimum number of messages per chunk to ensure meaningful summaries
 */
const MIN_MESSAGES_PER_CHUNK = 5;

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Interface for the SummaryEngine
 * 
 * Orchestrates the summarization process including message retrieval,
 * formatting, and AI integration.
 */
export interface SummaryEngine {
  /**
   * Generate a summary for a chat based on the specified range
   * 
   * @param chatId - The Telegram chat ID to summarize
   * @param range - The message range (time-based or count-based)
   * @returns Promise resolving to the generated summary
   */
  generateSummary(chatId: number, range: MessageRange): Promise<string>;
}

// ============================================================================
// Formatted Message Type
// ============================================================================

/**
 * A message formatted for AI prompt consumption
 */
export interface FormattedMessage {
  /** The formatted string representation */
  text: string;
  /** Original message for reference */
  original: StoredMessage;
}

// ============================================================================
// Default Summary Engine Implementation
// ============================================================================

/**
 * Default implementation of the SummaryEngine
 * 
 * This class orchestrates the summarization process:
 * 1. Fetches messages from the store based on the specified range
 * 2. Formats messages for AI consumption with thread context
 * 3. Estimates token count to determine if chunking is needed
 * 4. Calls the AI provider to generate the summary
 * 
 * **Validates: Requirements 3.1** - Default 24h summarization
 * **Validates: Requirements 3.2** - Time-based summarization
 * **Validates: Requirements 3.3** - Count-based summarization
 */
export class DefaultSummaryEngine implements SummaryEngine {
  private messageStore: MessageStore;
  private aiProvider: AIProvider;
  private providerType: AIProviderType;
  private model: string;

  /**
   * Create a new DefaultSummaryEngine instance
   *
   * @param messageStore - The message store to fetch messages from
   * @param aiProvider - The AI provider for summarization
   * @param providerType - The AI provider type for logging (default: 'openai')
   * @param model - The model identifier for logging (default: 'unknown')
   */
  constructor(
    messageStore: MessageStore,
    aiProvider: AIProvider,
    providerType: AIProviderType = 'openai',
    model: string = 'unknown'
  ) {
    this.messageStore = messageStore;
    this.aiProvider = aiProvider;
    this.providerType = providerType;
    this.model = model;
  }

  /**
   * Generate a summary for a chat based on the specified range
   * 
   * @param chatId - The Telegram chat ID to summarize
   * @param range - The message range (time-based or count-based)
   * @returns Promise resolving to the generated summary
   * @throws NoMessagesError if no messages are found in the range
   * 
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  async generateSummary(chatId: number, range: MessageRange): Promise<string> {
    // Fetch messages based on the range
    const messages = await this.fetchMessages(chatId, range);

    if (messages.length === 0) {
      throw new NoMessagesError();
    }

    // Format messages for AI prompt
    const formattedMessages = this.formatMessagesForAI(messages);

    // Estimate token count
    const tokenCount = this.estimateTokenCount(formattedMessages);
    const maxTokens = this.aiProvider.getMaxContextTokens() - TOKEN_BUFFER;

    // Check if we need hierarchical summarization
    // **Validates: Requirements 6.1, 6.2, 6.3, 8.3**
    if (tokenCount > maxTokens) {
      return this.hierarchicalSummarize(formattedMessages, chatId);
    }

    // Generate summary using AI provider
    const result = await this.aiProvider.summarize(formattedMessages);
    if (result.usage) {
      logTokenUsage(this.providerType, this.model, chatId, result.usage, 'single');
      logAggregatedTokenUsage(this.providerType, this.model, chatId, [result.usage], 1);
    }
    return result.text;
  }

  /**
   * Fetch messages from the store based on the specified range
   * 
   * @param chatId - The Telegram chat ID
   * @param range - The message range (time-based or count-based)
   * @returns Promise resolving to array of stored messages
   * 
   * **Validates: Requirements 3.1** - Default time window
   * **Validates: Requirements 3.2** - Time-based range
   * **Validates: Requirements 3.3** - Count-based range
   */
  async fetchMessages(chatId: number, range: MessageRange): Promise<StoredMessage[]> {
    const query: MessageQuery = { chatId };

    if (range.type === 'time') {
      // Time-based range: calculate start time from hours
      const now = Date.now();
      const hoursInMs = range.value * 60 * 60 * 1000;
      query.startTime = now - hoursInMs;
      query.endTime = now;
    } else if (range.type === 'count') {
      // Count-based range: set limit
      query.limit = range.value;
    }

    return this.messageStore.query(query);
  }

  /**
   * Format messages for AI prompt consumption
   *
   * Groups messages by threadId and temporal gaps for better context,
   * then formats each with timestamp, username, and compact reply notation.
   *
   * @param messages - Array of stored messages to format
   * @returns Array of formatted message strings (including group headers)
   */
  formatMessagesForAI(messages: StoredMessage[]): string[] {
    // Build a map of messageId to message for reply lookups
    const messageMap = new Map<number, StoredMessage>();
    for (const msg of messages) {
      messageMap.set(msg.messageId, msg);
    }

    // Group messages by threadId
    const threadGroups = new Map<string, StoredMessage[]>();
    const generalMessages: StoredMessage[] = [];

    for (const msg of messages) {
      if (msg.threadId !== undefined) {
        const key = `thread-${msg.threadId}`;
        if (!threadGroups.has(key)) threadGroups.set(key, []);
        threadGroups.get(key)!.push(msg);
      } else {
        generalMessages.push(msg);
      }
    }

    // Split general messages by temporal gaps
    const generalGroups = this.splitByTemporalGaps(generalMessages);

    // Determine if we need group headers (multiple distinct groups)
    const totalGroups = threadGroups.size + generalGroups.length;

    // Format all groups
    const lines: string[] = [];

    if (totalGroups <= 1) {
      // Single group — no headers needed, saves tokens
      const allMessages = generalMessages.length > 0 ? generalMessages
        : [...threadGroups.values()][0] || [];
      for (const msg of allMessages) {
        lines.push(this.formatSingleMessage(msg, messageMap));
      }
      return lines;
    }

    // Multiple groups — add headers
    for (const [key, msgs] of threadGroups) {
      const threadId = key.replace('thread-', '');
      lines.push(`--- Thread ${threadId} ---`);
      for (const msg of msgs) {
        lines.push(this.formatSingleMessage(msg, messageMap));
      }
    }

    for (let i = 0; i < generalGroups.length; i++) {
      lines.push('---');
      for (const msg of generalGroups[i]) {
        lines.push(this.formatSingleMessage(msg, messageMap));
      }
    }

    return lines;
  }

  /**
   * Split non-threaded messages into groups by temporal gaps.
   * Messages separated by >30 min of silence are grouped separately.
   */
  private splitByTemporalGaps(messages: StoredMessage[]): StoredMessage[][] {
    if (messages.length === 0) return [];

    const groups: StoredMessage[][] = [[messages[0]]];

    for (let i = 1; i < messages.length; i++) {
      const gap = messages[i].timestamp - messages[i - 1].timestamp;
      if (gap > TEMPORAL_GAP_MS) {
        groups.push([messages[i]]);
      } else {
        groups[groups.length - 1].push(messages[i]);
      }
    }

    return groups;
  }

  /**
   * Format a single message for AI prompt.
   * Uses compact reply notation (>username) instead of verbose format.
   */
  private formatSingleMessage(
    message: StoredMessage,
    messageMap: Map<number, StoredMessage>
  ): string {
    const timestamp = this.formatTimestamp(message.timestamp);
    const username = message.username;
    const text = message.text;

    // Build reply indicator (compact notation)
    let replyTag = '';
    if (message.replyToMessageId !== undefined) {
      const replyTo = messageMap.get(message.replyToMessageId);
      if (replyTo) {
        replyTag = ` (>${replyTo.username})`;
      } else {
        replyTag = ' (reply)';
      }
    }

    // Build forward indicator
    const fwdTag = message.forwardFromName
      ? ` fwd:${message.forwardFromName}`
      : '';

    return `[${timestamp}] ${username}${fwdTag}${replyTag}: ${text}`;
  }

  /**
   * Format a timestamp for display
   * 
   * @param timestampMs - Timestamp in milliseconds
   * @returns Human-readable timestamp string (HH:MM format)
   */
  private formatTimestamp(timestampMs: number): string {
    const date = new Date(timestampMs);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Estimate the token count for an array of formatted messages
   * 
   * Uses a rough estimation of ~4 characters per token for English text.
   * This is a conservative estimate to avoid exceeding AI provider limits.
   * 
   * @param messages - Array of formatted message strings
   * @returns Estimated total token count
   */
  estimateTokenCount(messages: string[]): number {
    const totalChars = messages.reduce((sum, msg) => sum + msg.length, 0);
    return Math.ceil(totalChars / CHARS_PER_TOKEN);
  }

  /**
   * Perform hierarchical summarization for long conversations
   * 
   * When the message volume exceeds the AI provider's token limit, this method:
   * 1. Splits messages into chunks that fit within the token limit
   * 2. Summarizes each chunk separately
   * 3. Combines chunk summaries into a final hierarchical summary
   * 
   * @param messages - Array of formatted message strings
   * @returns Promise resolving to the final combined summary
   * 
   * **Validates: Requirements 6.1** - Split messages into chunks
   * **Validates: Requirements 6.2** - Summarize each chunk separately
   * **Validates: Requirements 6.3** - Combine into final hierarchical summary
   * **Validates: Requirements 8.3** - Token overflow fallback
   */
  async hierarchicalSummarize(messages: string[], chatId?: number): Promise<string> {
    // Split messages into chunks that fit within token limit
    const chunks = this.splitIntoChunks(messages);

    // Handle edge case: if only one chunk, just summarize directly
    if (chunks.length === 1) {
      const result = await this.aiProvider.summarize(chunks[0]);
      if (result.usage && chatId !== undefined) {
        logTokenUsage(this.providerType, this.model, chatId, result.usage, 'single');
        logAggregatedTokenUsage(this.providerType, this.model, chatId, [result.usage], 1);
      }
      return result.text;
    }

    // Summarize each chunk separately
    const { summaries: chunkSummaries, usages: chunkUsages } = await this.summarizeChunks(chunks, chatId);

    // Combine chunk summaries into final summary
    const { text: combinedText, usage: combineUsage } = await this.combineChunkSummaries(chunkSummaries, chatId);

    // Log aggregated usage
    if (chatId !== undefined) {
      const allUsages = [...chunkUsages];
      if (combineUsage) {
        allUsages.push(combineUsage);
      }
      if (allUsages.length > 0) {
        logAggregatedTokenUsage(
          this.providerType, this.model, chatId, allUsages, chunks.length + 1
        );
      }
    }

    return combinedText;
  }

  /**
   * Split messages into chunks that fit within the AI provider's token limit
   * 
   * Each chunk is sized to fit within the available token budget, with some
   * overlap between chunks to maintain context continuity.
   * 
   * @param messages - Array of formatted message strings
   * @returns Array of message chunks, each chunk is an array of message strings
   * 
   * **Validates: Requirements 6.1** - Split messages into chunks when exceeding token limit
   */
  splitIntoChunks(messages: string[]): string[][] {
    const maxTokens = this.aiProvider.getMaxContextTokens() - TOKEN_BUFFER;
    const chunks: string[][] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const messageTokens = Math.ceil(message.length / CHARS_PER_TOKEN);

      // Check if adding this message would exceed the limit
      if (currentTokens + messageTokens > maxTokens && currentChunk.length >= MIN_MESSAGES_PER_CHUNK) {
        // Save current chunk and start a new one
        chunks.push(currentChunk);
        
        // Start new chunk with overlap from previous chunk for context continuity
        const overlapStart = Math.max(0, currentChunk.length - CHUNK_OVERLAP_MESSAGES);
        currentChunk = currentChunk.slice(overlapStart);
        currentTokens = this.estimateTokenCount(currentChunk);
      }

      // Handle very long single messages that exceed the limit
      if (messageTokens > maxTokens) {
        // Truncate the message to fit
        const truncatedMessage = this.truncateSingleMessage(message, maxTokens - currentTokens);
        currentChunk.push(truncatedMessage);
        currentTokens += Math.ceil(truncatedMessage.length / CHARS_PER_TOKEN);
      } else {
        currentChunk.push(message);
        currentTokens += messageTokens;
      }
    }

    // Don't forget the last chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Truncate a single message to fit within a token limit
   * 
   * @param message - The message to truncate
   * @param maxTokens - Maximum tokens allowed for this message
   * @returns Truncated message string
   */
  private truncateSingleMessage(message: string, maxTokens: number): string {
    const maxChars = maxTokens * CHARS_PER_TOKEN;
    if (message.length <= maxChars) {
      return message;
    }
    return message.substring(0, maxChars - 3) + '...';
  }

  /**
   * Summarize each chunk separately using the AI provider
   * 
   * @param chunks - Array of message chunks to summarize
   * @returns Promise resolving to array of chunk summaries
   * 
   * **Validates: Requirements 6.2** - Summarize each chunk separately
   */
  async summarizeChunks(
    chunks: string[][],
    chatId?: number
  ): Promise<{ summaries: string[]; usages: TokenUsage[] }> {
    const totalChunks = chunks.length;

    const promises = chunks.map((chunk, i) => {
      const contextPrefix = `[Part ${i + 1} of ${totalChunks}]`;
      const chunkWithContext = [contextPrefix, ...chunk];
      return this.aiProvider.summarize(chunkWithContext);
    });

    const results = await Promise.all(promises);
    const summaries: string[] = [];
    const usages: TokenUsage[] = [];

    for (const result of results) {
      summaries.push(result.text);
      if (result.usage) {
        usages.push(result.usage);
        if (chatId !== undefined) {
          logTokenUsage(this.providerType, this.model, chatId, result.usage, 'chunk');
        }
      }
    }

    return { summaries, usages };
  }

  /**
   * Combine chunk summaries into a final hierarchical summary
   * 
   * Takes the individual chunk summaries and asks the AI to create
   * a cohesive final summary that captures the key points from all chunks.
   * 
   * @param chunkSummaries - Array of summaries from each chunk
   * @returns Promise resolving to the final combined summary
   * 
   * **Validates: Requirements 6.3** - Combine chunk summaries into final hierarchical summary
   */
  async combineChunkSummaries(
    chunkSummaries: string[],
    chatId?: number
  ): Promise<SummarizeResult> {
    const combinationPrompt = [
      COMBINE_SUMMARIES_PROMPT,
      '',
      ...chunkSummaries,
    ];

    const result = await this.aiProvider.summarize(combinationPrompt);
    if (result.usage && chatId !== undefined) {
      logTokenUsage(this.providerType, this.model, chatId, result.usage, 'combine');
    }
    return result;
  }
}

/**
 * Create a SummaryEngine with the given dependencies
 * 
 * @param messageStore - The message store to fetch messages from
 * @param aiProvider - The AI provider for summarization
 * @returns Configured SummaryEngine instance
 */
export function createSummaryEngine(
  messageStore: MessageStore,
  aiProvider: AIProvider,
  providerType?: AIProviderType,
  model?: string
): SummaryEngine {
  return new DefaultSummaryEngine(messageStore, aiProvider, providerType, model);
}
