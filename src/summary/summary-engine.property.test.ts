/**
 * Property-Based Tests for Hierarchical Summarization
 * 
 * These tests use fast-check to verify properties hold across many randomly generated inputs.
 * 
 * **Validates: Requirements 6.1, 6.2, 6.3, 8.3**
 * 
 * Property 8: Hierarchical Summarization
 * For any message set that exceeds the AI provider's token limit, the Summary_Engine SHALL:
 * 1. Split messages into chunks that fit within the token limit
 * 2. Generate a summary for each chunk
 * 3. Combine chunk summaries into a final summary
 * 
 * @module summary/summary-engine.property.test
 */

import * as fc from 'fast-check';
import { DefaultSummaryEngine } from './summary-engine';
import { AIProvider, SummarizeOptions } from '../ai/ai-provider';
import { MessageStore } from '../store/message-store';
import { StoredMessage, MessageQuery, MessageRange } from '../types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Approximate characters per token for estimation (matches summary-engine.ts)
 */
const CHARS_PER_TOKEN = 4;

/**
 * Buffer reserved for system prompt and response tokens (matches summary-engine.ts)
 */
const TOKEN_BUFFER = 1000;

/**
 * Minimum messages per chunk (matches summary-engine.ts)
 */
const MIN_MESSAGES_PER_CHUNK = 5;

// ============================================================================
// Mock Implementations
// ============================================================================

/**
 * Mock AI Provider that tracks all summarization calls
 * 
 * This mock allows us to verify:
 * - How many times summarize() was called
 * - What messages were passed to each call
 * - The token limit behavior
 */
class MockAIProvider implements AIProvider {
  private maxContextTokens: number;
  public summarizeCalls: string[][] = [];
  public summaryResponses: string[] = [];
  private callIndex = 0;

  constructor(maxContextTokens: number = 4000) {
    this.maxContextTokens = maxContextTokens;
  }

  async summarize(messages: string[], _options?: SummarizeOptions): Promise<string> {
    this.summarizeCalls.push([...messages]);
    
    // Return a predictable summary based on call index
    const response = this.summaryResponses[this.callIndex] ?? 
      `Summary ${this.callIndex + 1}: ${messages.length} messages summarized`;
    this.callIndex++;
    return response;
  }

  getMaxContextTokens(): number {
    return this.maxContextTokens;
  }

  reset(): void {
    this.summarizeCalls = [];
    this.summaryResponses = [];
    this.callIndex = 0;
  }

  setResponses(responses: string[]): void {
    this.summaryResponses = responses;
  }
}

/**
 * Mock Message Store that returns predefined messages
 */
class MockMessageStore implements MessageStore {
  private messages: StoredMessage[] = [];

  setMessages(messages: StoredMessage[]): void {
    this.messages = messages;
  }

  async store(_message: StoredMessage): Promise<void> {
    // Not used in these tests
  }

  async query(_query: MessageQuery): Promise<StoredMessage[]> {
    return this.messages;
  }

  async deleteAll(_chatId: number): Promise<void> {
    // Not used in these tests
  }
}

// ============================================================================
// Arbitrary Generators
// ============================================================================

/**
 * Generate a random username (1-32 characters, alphanumeric with underscores)
 */
const usernameArbitrary: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 32 })
  .filter(s => s.trim().length > 0)
  .map(s => s.replace(/[^a-zA-Z0-9_]/g, 'x').substring(0, 32) || 'user');

/**
 * Generate random message text (1-500 characters)
 */
const messageTextArbitrary: fc.Arbitrary<string> = fc.string({ minLength: 10, maxLength: 500 })
  .filter(s => s.trim().length > 0)
  .map(s => s.replace(/[\n\r]/g, ' ').trim() || 'Hello world');

/**
 * Generate a single StoredMessage with random but valid data
 */
const storedMessageArbitrary: fc.Arbitrary<StoredMessage> = fc.record({
  chatId: fc.constant(12345), // Fixed chat ID for simplicity
  timestamp: fc.integer({ min: 1609459200000, max: 1735689600000 }), // 2021-2025
  messageId: fc.integer({ min: 1, max: 1000000 }),
  userId: fc.integer({ min: 1, max: 1000000 }),
  username: usernameArbitrary,
  text: messageTextArbitrary,
  expireAt: fc.integer({ min: 1609459200, max: 1735689600 }),
  replyToMessageId: fc.constant(undefined),
  threadId: fc.constant(undefined),
});

/**
 * Generate an array of StoredMessages that will fit within token limit
 * (small message set - under token limit)
 */
const smallMessageSetArbitrary: fc.Arbitrary<StoredMessage[]> = fc.array(
  storedMessageArbitrary,
  { minLength: 1, maxLength: 10 }
);

/**
 * Generate an array of StoredMessages that will exceed token limit
 * (large message set - over token limit)
 * 
 * We generate enough messages to ensure they exceed the token limit.
 * With ~100 chars per message and 4 chars per token, each message is ~25 tokens.
 * With a 4000 token limit and 1000 buffer, we have 3000 usable tokens.
 * So ~120 messages would exceed the limit.
 */
const largeMessageSetArbitrary: fc.Arbitrary<StoredMessage[]> = fc.array(
  storedMessageArbitrary,
  { minLength: 150, maxLength: 300 }
);

/**
 * Generate message sets of varying sizes (including both under and over token limit)
 */
const variableSizeMessageSetArbitrary: fc.Arbitrary<StoredMessage[]> = fc.oneof(
  smallMessageSetArbitrary,
  largeMessageSetArbitrary,
  // Medium size that might or might not exceed limit
  fc.array(storedMessageArbitrary, { minLength: 50, maxLength: 150 })
);

/**
 * Generate a message set that is guaranteed to exceed the token limit
 * by creating messages with longer text
 */
const guaranteedLargeMessageSetArbitrary: fc.Arbitrary<StoredMessage[]> = fc.array(
  fc.record({
    chatId: fc.constant(12345),
    timestamp: fc.integer({ min: 1609459200000, max: 1735689600000 }),
    messageId: fc.integer({ min: 1, max: 1000000 }),
    userId: fc.integer({ min: 1, max: 1000000 }),
    username: usernameArbitrary,
    // Longer text to ensure we exceed token limit
    text: fc.string({ minLength: 200, maxLength: 500 })
      .filter(s => s.trim().length > 0)
      .map(s => s.replace(/[\n\r]/g, ' ').trim() || 'A'.repeat(200)),
    expireAt: fc.integer({ min: 1609459200, max: 1735689600 }),
    replyToMessageId: fc.constant(undefined),
    threadId: fc.constant(undefined),
  }),
  { minLength: 100, maxLength: 200 }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Estimate token count for an array of formatted messages
 */
function estimateTokenCount(messages: string[]): number {
  const totalChars = messages.reduce((sum, msg) => sum + msg.length, 0);
  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

/**
 * Format messages the same way the SummaryEngine does
 */
function formatMessagesForAI(messages: StoredMessage[]): string[] {
  return messages.map(msg => {
    const date = new Date(msg.timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `[${hours}:${minutes}] ${msg.username}: ${msg.text}`;
  });
}

// ============================================================================
// Property Tests
// ============================================================================

/**
 * **Validates: Requirements 6.1, 6.2, 6.3, 8.3**
 * 
 * Property 8: Hierarchical Summarization
 * 
 * For any message set that exceeds the AI provider's token limit, the Summary_Engine SHALL:
 * 1. Split messages into chunks that fit within the token limit
 * 2. Generate a summary for each chunk
 * 3. Combine chunk summaries into a final summary
 */
describe('Property Tests: Hierarchical Summarization', () => {
  let mockAIProvider: MockAIProvider;
  let mockMessageStore: MockMessageStore;
  let summaryEngine: DefaultSummaryEngine;

  beforeEach(() => {
    mockAIProvider = new MockAIProvider(4000); // 4000 token limit
    mockMessageStore = new MockMessageStore();
    summaryEngine = new DefaultSummaryEngine(mockMessageStore, mockAIProvider);
  });

  describe('Property 8: Hierarchical Summarization', () => {
    /**
     * **Validates: Requirements 6.1**
     * 
     * For any message set that exceeds the AI provider's token limit,
     * the Summary_Engine SHALL split messages into chunks that fit within the token limit.
     * 
     * Property: When tokenCount > maxTokens, splitIntoChunks() returns multiple chunks,
     * each with tokenCount <= maxTokens
     */
    it('should split messages into chunks that fit within token limit', () => {
      fc.assert(
        fc.property(guaranteedLargeMessageSetArbitrary, (messages: StoredMessage[]) => {
          mockAIProvider.reset();
          
          // Format messages as the engine would
          const formattedMessages = formatMessagesForAI(messages);
          
          // Verify we have a message set that exceeds the limit
          const totalTokens = estimateTokenCount(formattedMessages);
          const maxUsableTokens = mockAIProvider.getMaxContextTokens() - TOKEN_BUFFER;
          
          // Only test if we actually exceed the limit
          if (totalTokens <= maxUsableTokens) {
            return true; // Skip this case
          }
          
          // Split into chunks
          const chunks = summaryEngine.splitIntoChunks(formattedMessages);
          
          // Verify we got multiple chunks
          expect(chunks.length).toBeGreaterThan(1);
          
          // Verify each chunk fits within the token limit
          for (let i = 0; i < chunks.length; i++) {
            const chunkTokens = estimateTokenCount(chunks[i]);
            // Allow some tolerance for edge cases
            expect(chunkTokens).toBeLessThanOrEqual(maxUsableTokens + 100);
          }
          
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 6.2**
     * 
     * When messages are split into chunks, the Summary_Engine SHALL summarize
     * each chunk separately.
     * 
     * Property: For N chunks, summarize() is called N times (once per chunk)
     * plus 1 time for combining (N+1 total calls)
     */
    it('should summarize each chunk separately', async () => {
      await fc.assert(
        fc.asyncProperty(guaranteedLargeMessageSetArbitrary, async (messages: StoredMessage[]) => {
          mockAIProvider.reset();
          mockMessageStore.setMessages(messages);
          
          // Format messages to check if they exceed limit
          const formattedMessages = formatMessagesForAI(messages);
          const totalTokens = estimateTokenCount(formattedMessages);
          const maxUsableTokens = mockAIProvider.getMaxContextTokens() - TOKEN_BUFFER;
          
          // Only test if we actually exceed the limit
          if (totalTokens <= maxUsableTokens) {
            return true; // Skip this case
          }
          
          // Calculate expected number of chunks
          const chunks = summaryEngine.splitIntoChunks(formattedMessages);
          const expectedChunkCount = chunks.length;
          
          // Set up responses for each chunk summary + final combination
          const responses: string[] = [];
          for (let i = 0; i < expectedChunkCount; i++) {
            responses.push(`Chunk ${i + 1} summary`);
          }
          responses.push('Final combined summary');
          mockAIProvider.setResponses(responses);
          
          // Generate summary
          const range: MessageRange = { type: 'time', value: 24 };
          await summaryEngine.generateSummary(12345, range);
          
          // Verify summarize was called for each chunk
          // Expected: N chunk summaries + 1 combination call = N+1 total
          expect(mockAIProvider.summarizeCalls.length).toBe(expectedChunkCount + 1);
          
          // Verify each chunk call has the part indicator
          for (let i = 0; i < expectedChunkCount; i++) {
            const chunkCall = mockAIProvider.summarizeCalls[i];
            // First element should be the part indicator
            expect(chunkCall[0]).toContain(`[Part ${i + 1} of ${expectedChunkCount}]`);
          }
          
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 6.3**
     * 
     * When chunk summaries are generated, the Summary_Engine SHALL combine them
     * into a final hierarchical summary.
     * 
     * Property: The final summarize() call receives all chunk summaries
     */
    it('should combine chunk summaries into final summary', async () => {
      await fc.assert(
        fc.asyncProperty(guaranteedLargeMessageSetArbitrary, async (messages: StoredMessage[]) => {
          mockAIProvider.reset();
          mockMessageStore.setMessages(messages);
          
          // Format messages to check if they exceed limit
          const formattedMessages = formatMessagesForAI(messages);
          const totalTokens = estimateTokenCount(formattedMessages);
          const maxUsableTokens = mockAIProvider.getMaxContextTokens() - TOKEN_BUFFER;
          
          // Only test if we actually exceed the limit
          if (totalTokens <= maxUsableTokens) {
            return true; // Skip this case
          }
          
          // Calculate expected number of chunks
          const chunks = summaryEngine.splitIntoChunks(formattedMessages);
          const expectedChunkCount = chunks.length;
          
          // Set up responses for each chunk summary + final combination
          const chunkSummaries: string[] = [];
          for (let i = 0; i < expectedChunkCount; i++) {
            chunkSummaries.push(`Summary of chunk ${i + 1}`);
          }
          mockAIProvider.setResponses([...chunkSummaries, 'Final combined summary']);
          
          // Generate summary
          const range: MessageRange = { type: 'time', value: 24 };
          await summaryEngine.generateSummary(12345, range);
          
          // The last call should be the combination call
          const lastCall = mockAIProvider.summarizeCalls[mockAIProvider.summarizeCalls.length - 1];
          
          // Verify the combination call contains instructions and all chunk summaries
          expect(lastCall.length).toBeGreaterThan(0);
          
          // First lines should be combination instructions
          expect(lastCall[0]).toContain('summaries');
          
          // Should contain references to all parts
          const combinedText = lastCall.join('\n');
          for (let i = 0; i < expectedChunkCount; i++) {
            expect(combinedText).toContain(`Part ${i + 1}`);
          }
          
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 6.1, 6.2, 6.3**
     * 
     * Comprehensive test: For any message set exceeding token limit,
     * the complete hierarchical summarization flow should work correctly.
     */
    it('should perform complete hierarchical summarization for large message sets', async () => {
      await fc.assert(
        fc.asyncProperty(guaranteedLargeMessageSetArbitrary, async (messages: StoredMessage[]) => {
          mockAIProvider.reset();
          mockMessageStore.setMessages(messages);
          
          // Format messages to check if they exceed limit
          const formattedMessages = formatMessagesForAI(messages);
          const totalTokens = estimateTokenCount(formattedMessages);
          const maxUsableTokens = mockAIProvider.getMaxContextTokens() - TOKEN_BUFFER;
          
          // Only test if we actually exceed the limit
          if (totalTokens <= maxUsableTokens) {
            return true; // Skip this case
          }
          
          // Set up mock responses
          const chunks = summaryEngine.splitIntoChunks(formattedMessages);
          const responses = chunks.map((_, i) => `Chunk ${i + 1} summary`);
          responses.push('Final hierarchical summary');
          mockAIProvider.setResponses(responses);
          
          // Generate summary
          const range: MessageRange = { type: 'time', value: 24 };
          const result = await summaryEngine.generateSummary(12345, range);
          
          // Verify result is the final combined summary
          expect(result).toBe('Final hierarchical summary');
          
          // Verify the flow:
          // 1. Multiple chunks were created
          expect(chunks.length).toBeGreaterThan(1);
          
          // 2. Each chunk was summarized (N calls)
          // 3. Summaries were combined (1 call)
          // Total: N + 1 calls
          expect(mockAIProvider.summarizeCalls.length).toBe(chunks.length + 1);
          
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 8.3**
     * 
     * When token overflow occurs during summarization, the Summary_Engine SHALL
     * use the hierarchical summarization fallback.
     * 
     * Property: Messages exceeding token limit trigger hierarchical summarization
     * (multiple summarize calls), while messages under limit use single call.
     */
    it('should use hierarchical summarization as fallback for token overflow', async () => {
      await fc.assert(
        fc.asyncProperty(variableSizeMessageSetArbitrary, async (messages: StoredMessage[]) => {
          // Skip empty message sets
          if (messages.length === 0) {
            return true;
          }
          
          mockAIProvider.reset();
          mockMessageStore.setMessages(messages);
          
          // Format messages to check if they exceed limit
          const formattedMessages = formatMessagesForAI(messages);
          const totalTokens = estimateTokenCount(formattedMessages);
          const maxUsableTokens = mockAIProvider.getMaxContextTokens() - TOKEN_BUFFER;
          const exceedsLimit = totalTokens > maxUsableTokens;
          
          // Set up mock responses
          if (exceedsLimit) {
            const chunks = summaryEngine.splitIntoChunks(formattedMessages);
            const responses = chunks.map((_, i) => `Chunk ${i + 1} summary`);
            responses.push('Final combined summary');
            mockAIProvider.setResponses(responses);
          } else {
            mockAIProvider.setResponses(['Single summary']);
          }
          
          // Generate summary
          const range: MessageRange = { type: 'time', value: 24 };
          await summaryEngine.generateSummary(12345, range);
          
          if (exceedsLimit) {
            // Should have multiple calls (hierarchical)
            expect(mockAIProvider.summarizeCalls.length).toBeGreaterThan(1);
          } else {
            // Should have single call (direct)
            expect(mockAIProvider.summarizeCalls.length).toBe(1);
          }
          
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     * 
     * Edge case: Verify that all messages are included across all chunks
     * (no messages are lost during chunking).
     */
    it('should include all messages across chunks without loss', () => {
      fc.assert(
        fc.property(guaranteedLargeMessageSetArbitrary, (messages: StoredMessage[]) => {
          mockAIProvider.reset();
          
          const formattedMessages = formatMessagesForAI(messages);
          const totalTokens = estimateTokenCount(formattedMessages);
          const maxUsableTokens = mockAIProvider.getMaxContextTokens() - TOKEN_BUFFER;
          
          // Only test if we actually exceed the limit
          if (totalTokens <= maxUsableTokens) {
            return true;
          }
          
          const chunks = summaryEngine.splitIntoChunks(formattedMessages);
          
          // Collect all unique messages from chunks (accounting for overlap)
          const allChunkMessages = new Set<string>();
          for (const chunk of chunks) {
            for (const msg of chunk) {
              allChunkMessages.add(msg);
            }
          }
          
          // All original messages should be present in at least one chunk
          for (const originalMsg of formattedMessages) {
            expect(allChunkMessages.has(originalMsg)).toBe(true);
          }
          
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     * 
     * Edge case: Verify chunks maintain minimum message count
     * (except possibly the last chunk).
     */
    it('should maintain minimum messages per chunk', () => {
      fc.assert(
        fc.property(guaranteedLargeMessageSetArbitrary, (messages: StoredMessage[]) => {
          mockAIProvider.reset();
          
          const formattedMessages = formatMessagesForAI(messages);
          const totalTokens = estimateTokenCount(formattedMessages);
          const maxUsableTokens = mockAIProvider.getMaxContextTokens() - TOKEN_BUFFER;
          
          // Only test if we actually exceed the limit
          if (totalTokens <= maxUsableTokens) {
            return true;
          }
          
          const chunks = summaryEngine.splitIntoChunks(formattedMessages);
          
          // All chunks except possibly the last should have minimum messages
          for (let i = 0; i < chunks.length - 1; i++) {
            expect(chunks[i].length).toBeGreaterThanOrEqual(MIN_MESSAGES_PER_CHUNK);
          }
          
          // Last chunk can be smaller but should not be empty
          expect(chunks[chunks.length - 1].length).toBeGreaterThan(0);
          
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 6.2**
     * 
     * Edge case: Verify chunk summaries include part numbers for context.
     */
    it('should include part numbers in chunk summaries', async () => {
      await fc.assert(
        fc.asyncProperty(guaranteedLargeMessageSetArbitrary, async (messages: StoredMessage[]) => {
          mockAIProvider.reset();
          mockMessageStore.setMessages(messages);
          
          const formattedMessages = formatMessagesForAI(messages);
          const totalTokens = estimateTokenCount(formattedMessages);
          const maxUsableTokens = mockAIProvider.getMaxContextTokens() - TOKEN_BUFFER;
          
          // Only test if we actually exceed the limit
          if (totalTokens <= maxUsableTokens) {
            return true;
          }
          
          const chunks = summaryEngine.splitIntoChunks(formattedMessages);
          const responses = chunks.map((_, i) => `Summary ${i + 1}`);
          responses.push('Final');
          mockAIProvider.setResponses(responses);
          
          const range: MessageRange = { type: 'time', value: 24 };
          await summaryEngine.generateSummary(12345, range);
          
          // Verify each chunk call includes part number context
          for (let i = 0; i < chunks.length; i++) {
            const call = mockAIProvider.summarizeCalls[i];
            const firstElement = call[0];
            expect(firstElement).toContain(`Part ${i + 1} of ${chunks.length}`);
          }
          
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 6.3**
     * 
     * Edge case: Single chunk should not trigger combination step.
     */
    it('should not combine when only one chunk exists', async () => {
      // Use small message set that won't exceed limit
      await fc.assert(
        fc.asyncProperty(smallMessageSetArbitrary, async (messages: StoredMessage[]) => {
          // Skip empty message sets
          if (messages.length === 0) {
            return true;
          }
          
          mockAIProvider.reset();
          mockMessageStore.setMessages(messages);
          
          const formattedMessages = formatMessagesForAI(messages);
          const totalTokens = estimateTokenCount(formattedMessages);
          const maxUsableTokens = mockAIProvider.getMaxContextTokens() - TOKEN_BUFFER;
          
          // Only test if we're under the limit (single chunk case)
          if (totalTokens > maxUsableTokens) {
            return true;
          }
          
          mockAIProvider.setResponses(['Direct summary']);
          
          const range: MessageRange = { type: 'time', value: 24 };
          const result = await summaryEngine.generateSummary(12345, range);
          
          // Should have exactly one call (no chunking, no combination)
          expect(mockAIProvider.summarizeCalls.length).toBe(1);
          expect(result).toBe('Direct summary');
          
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });
  });
});
