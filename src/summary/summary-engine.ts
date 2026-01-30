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
import { AIProvider } from '../ai/ai-provider';
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
const CHUNK_OVERLAP_MESSAGES = 2;

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

  /**
   * Create a new DefaultSummaryEngine instance
   * 
   * @param messageStore - The message store to fetch messages from
   * @param aiProvider - The AI provider for summarization
   */
  constructor(messageStore: MessageStore, aiProvider: AIProvider) {
    this.messageStore = messageStore;
    this.aiProvider = aiProvider;
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
      return this.hierarchicalSummarize(formattedMessages);
    }

    // Generate summary using AI provider
    return this.aiProvider.summarize(formattedMessages);
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
   * Formats each message with:
   * - Timestamp in human-readable format
   * - Username
   * - Message text
   * - Thread context (reply indicator if applicable)
   * 
   * @param messages - Array of stored messages to format
   * @returns Array of formatted message strings
   */
  formatMessagesForAI(messages: StoredMessage[]): string[] {
    // Build a map of messageId to message for thread context lookup
    const messageMap = new Map<number, StoredMessage>();
    for (const msg of messages) {
      messageMap.set(msg.messageId, msg);
    }

    return messages.map((msg) => {
      return this.formatSingleMessage(msg, messageMap);
    });
  }

  /**
   * Format a single message for AI prompt
   * 
   * @param message - The message to format
   * @param messageMap - Map of messageId to message for thread context
   * @returns Formatted message string
   */
  private formatSingleMessage(
    message: StoredMessage,
    messageMap: Map<number, StoredMessage>
  ): string {
    const timestamp = this.formatTimestamp(message.timestamp);
    const username = message.username;
    const text = message.text;

    // Build the base message with forward attribution if present
    let formatted: string;
    if (message.forwardFromName) {
      // For forwarded messages, show who forwarded it and who originally wrote it
      formatted = `[${timestamp}] ${username} forwarded from ${message.forwardFromName}: ${text}`;
    } else {
      formatted = `[${timestamp}] ${username}: ${text}`;
    }

    // Add thread context if this is a reply
    if (message.replyToMessageId !== undefined) {
      const replyTo = messageMap.get(message.replyToMessageId);
      if (replyTo) {
        // Include a brief context of what this message is replying to
        const replyPreview = this.truncateText(replyTo.text, 50);
        const replyAuthor = replyTo.forwardFromName 
          ? `${replyTo.username} (fwd from ${replyTo.forwardFromName})`
          : replyTo.username;
        if (message.forwardFromName) {
          formatted = `[${timestamp}] ${username} forwarded from ${message.forwardFromName} (replying to ${replyAuthor}: "${replyPreview}"): ${text}`;
        } else {
          formatted = `[${timestamp}] ${username} (replying to ${replyAuthor}: "${replyPreview}"): ${text}`;
        }
      } else {
        // Reply target not in our message set
        if (message.forwardFromName) {
          formatted = `[${timestamp}] ${username} forwarded from ${message.forwardFromName} (reply): ${text}`;
        } else {
          formatted = `[${timestamp}] ${username} (reply): ${text}`;
        }
      }
    }

    // Add thread/topic indicator if present
    if (message.threadId !== undefined) {
      formatted = `[Topic ${message.threadId}] ${formatted}`;
    }

    return formatted;
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
   * Truncate text to a maximum length with ellipsis
   * 
   * @param text - The text to truncate
   * @param maxLength - Maximum length before truncation
   * @returns Truncated text with ellipsis if needed
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
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
  async hierarchicalSummarize(messages: string[]): Promise<string> {
    // Split messages into chunks that fit within token limit
    const chunks = this.splitIntoChunks(messages);
    
    // Handle edge case: if only one chunk, just summarize directly
    if (chunks.length === 1) {
      return this.aiProvider.summarize(chunks[0]);
    }

    // Summarize each chunk separately
    const chunkSummaries = await this.summarizeChunks(chunks);

    // Combine chunk summaries into final summary
    return this.combineChunkSummaries(chunkSummaries);
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
  async summarizeChunks(chunks: string[][]): Promise<string[]> {
    const summaries: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkNumber = i + 1;
      const totalChunks = chunks.length;

      // Add context about which part of the conversation this is
      const contextPrefix = `[Part ${chunkNumber} of ${totalChunks}]`;
      const chunkWithContext = [contextPrefix, ...chunk];

      const summary = await this.aiProvider.summarize(chunkWithContext);
      summaries.push(`Part ${chunkNumber}: ${summary}`);
    }

    return summaries;
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
  async combineChunkSummaries(chunkSummaries: string[]): Promise<string> {
    // Create a prompt that asks the AI to combine the chunk summaries
    const combinationPrompt = [
      'The following are summaries of different parts of a long conversation.',
      'Please combine them into a single cohesive summary that captures all key topics and discussions.',
      '',
      ...chunkSummaries,
    ];

    return this.aiProvider.summarize(combinationPrompt);
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
  aiProvider: AIProvider
): SummaryEngine {
  return new DefaultSummaryEngine(messageStore, aiProvider);
}
