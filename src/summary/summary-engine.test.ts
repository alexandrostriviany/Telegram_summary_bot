/**
 * Unit Tests for Summary Engine
 * 
 * Tests the DefaultSummaryEngine implementation including:
 * - Message fetching based on time and count ranges
 * - Message formatting for AI prompts with thread context
 * - Token count estimation
 * - Integration with MessageStore and AIProvider
 * 
 * @module summary/summary-engine.test
 */

import {
  DefaultSummaryEngine,
  NoMessagesError,
  createSummaryEngine,
} from './summary-engine';
import { StoredMessage, MessageRange, MessageQuery } from '../types';
import { MessageStore } from '../store/message-store';
import { AIProvider } from '../ai/ai-provider';

// ============================================================================
// Mock Implementations
// ============================================================================

/**
 * Create a mock MessageStore for testing
 */
function createMockMessageStore(messages: StoredMessage[] = []): MessageStore {
  return {
    store: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue(messages),
    deleteAll: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Create a mock AIProvider for testing
 */
function createMockAIProvider(summary: string = 'Test summary'): AIProvider {
  return {
    summarize: jest.fn().mockResolvedValue(summary),
    getMaxContextTokens: jest.fn().mockReturnValue(4096),
  };
}

/**
 * Create a test StoredMessage
 */
function createTestMessage(overrides: Partial<StoredMessage> = {}): StoredMessage {
  const timestamp = Date.now();
  return {
    chatId: 12345,
    timestamp,
    messageId: 1,
    userId: 100,
    username: 'testuser',
    text: 'Test message',
    expireAt: Math.floor(timestamp / 1000) + 72 * 60 * 60,
    ...overrides,
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('DefaultSummaryEngine', () => {
  describe('generateSummary', () => {
    it('should throw NoMessagesError when no messages are found', async () => {
      const mockStore = createMockMessageStore([]);
      const mockProvider = createMockAIProvider();
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      const range: MessageRange = { type: 'time', value: 24 };

      await expect(engine.generateSummary(12345, range)).rejects.toThrow(NoMessagesError);
    });

    it('should generate summary for time-based range', async () => {
      const messages = [
        createTestMessage({ messageId: 1, text: 'Hello' }),
        createTestMessage({ messageId: 2, text: 'World' }),
      ];
      const mockStore = createMockMessageStore(messages);
      const mockProvider = createMockAIProvider('Generated summary');
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      const range: MessageRange = { type: 'time', value: 2 };
      const result = await engine.generateSummary(12345, range);

      expect(result).toBe('Generated summary');
      expect(mockStore.query).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: 12345,
          startTime: expect.any(Number),
          endTime: expect.any(Number),
        })
      );
    });

    it('should generate summary for count-based range', async () => {
      const messages = [
        createTestMessage({ messageId: 1, text: 'Message 1' }),
        createTestMessage({ messageId: 2, text: 'Message 2' }),
      ];
      const mockStore = createMockMessageStore(messages);
      const mockProvider = createMockAIProvider('Count-based summary');
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      const range: MessageRange = { type: 'count', value: 50 };
      const result = await engine.generateSummary(12345, range);

      expect(result).toBe('Count-based summary');
      expect(mockStore.query).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: 12345,
          limit: 50,
        })
      );
    });

    it('should pass formatted messages to AI provider', async () => {
      const messages = [
        createTestMessage({ messageId: 1, username: 'alice', text: 'Hello everyone' }),
      ];
      const mockStore = createMockMessageStore(messages);
      const mockProvider = createMockAIProvider();
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      const range: MessageRange = { type: 'time', value: 1 };
      await engine.generateSummary(12345, range);

      expect(mockProvider.summarize).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('alice'),
          expect.stringContaining('Hello everyone'),
        ])
      );
    });
  });

  describe('fetchMessages', () => {
    it('should calculate correct time range for time-based query', async () => {
      const mockStore = createMockMessageStore([]);
      const mockProvider = createMockAIProvider();
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      const range: MessageRange = { type: 'time', value: 2 };
      const beforeCall = Date.now();
      await engine.fetchMessages(12345, range);
      const afterCall = Date.now();

      const queryCall = (mockStore.query as jest.Mock).mock.calls[0][0] as MessageQuery;
      
      // Verify startTime is approximately 2 hours ago
      const twoHoursMs = 2 * 60 * 60 * 1000;
      expect(queryCall.startTime).toBeGreaterThanOrEqual(beforeCall - twoHoursMs);
      expect(queryCall.startTime).toBeLessThanOrEqual(afterCall - twoHoursMs);
      
      // Verify endTime is approximately now
      expect(queryCall.endTime).toBeGreaterThanOrEqual(beforeCall);
      expect(queryCall.endTime).toBeLessThanOrEqual(afterCall);
    });

    it('should set correct limit for count-based query', async () => {
      const mockStore = createMockMessageStore([]);
      const mockProvider = createMockAIProvider();
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      const range: MessageRange = { type: 'count', value: 100 };
      await engine.fetchMessages(12345, range);

      expect(mockStore.query).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: 12345,
          limit: 100,
        })
      );
    });

    it('should handle fractional hours (e.g., 30 minutes = 0.5 hours)', async () => {
      const mockStore = createMockMessageStore([]);
      const mockProvider = createMockAIProvider();
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      const range: MessageRange = { type: 'time', value: 0.5 }; // 30 minutes
      const beforeCall = Date.now();
      await engine.fetchMessages(12345, range);

      const queryCall = (mockStore.query as jest.Mock).mock.calls[0][0] as MessageQuery;
      
      // Verify startTime is approximately 30 minutes ago
      const thirtyMinutesMs = 0.5 * 60 * 60 * 1000;
      expect(queryCall.startTime).toBeGreaterThanOrEqual(beforeCall - thirtyMinutesMs - 100);
      expect(queryCall.startTime).toBeLessThanOrEqual(beforeCall - thirtyMinutesMs + 100);
    });
  });

  describe('formatMessagesForAI', () => {
    it('should format basic message with timestamp and username', () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      const timestamp = new Date('2024-01-15T14:30:00Z').getTime();
      const messages = [
        createTestMessage({
          timestamp,
          username: 'alice',
          text: 'Hello world',
        }),
      ];

      const formatted = engine.formatMessagesForAI(messages);

      expect(formatted).toHaveLength(1);
      expect(formatted[0]).toContain('alice');
      expect(formatted[0]).toContain('Hello world');
      // Should contain time in HH:MM format
      expect(formatted[0]).toMatch(/\[\d{2}:\d{2}\]/);
    });

    it('should include reply context for reply messages', () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      const messages = [
        createTestMessage({
          messageId: 1,
          username: 'alice',
          text: 'Original message',
        }),
        createTestMessage({
          messageId: 2,
          username: 'bob',
          text: 'This is a reply',
          replyToMessageId: 1,
        }),
      ];

      const formatted = engine.formatMessagesForAI(messages);

      expect(formatted).toHaveLength(2);
      expect(formatted[1]).toContain('bob');
      expect(formatted[1]).toContain('replying to alice');
      expect(formatted[1]).toContain('Original message');
      expect(formatted[1]).toContain('This is a reply');
    });

    it('should handle reply to message not in set', () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      const messages = [
        createTestMessage({
          messageId: 5,
          username: 'bob',
          text: 'Replying to old message',
          replyToMessageId: 1, // Message 1 not in our set
        }),
      ];

      const formatted = engine.formatMessagesForAI(messages);

      expect(formatted).toHaveLength(1);
      expect(formatted[0]).toContain('bob');
      expect(formatted[0]).toContain('(reply)');
      expect(formatted[0]).toContain('Replying to old message');
    });

    it('should include thread/topic indicator', () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      const messages = [
        createTestMessage({
          username: 'alice',
          text: 'Message in topic',
          threadId: 42,
        }),
      ];

      const formatted = engine.formatMessagesForAI(messages);

      expect(formatted).toHaveLength(1);
      expect(formatted[0]).toContain('[Topic 42]');
      expect(formatted[0]).toContain('alice');
      expect(formatted[0]).toContain('Message in topic');
    });

    it('should truncate long reply previews', () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      const longText = 'A'.repeat(100); // 100 character message
      const messages = [
        createTestMessage({
          messageId: 1,
          username: 'alice',
          text: longText,
        }),
        createTestMessage({
          messageId: 2,
          username: 'bob',
          text: 'Reply',
          replyToMessageId: 1,
        }),
      ];

      const formatted = engine.formatMessagesForAI(messages);

      // The reply preview should be truncated to ~50 chars
      expect(formatted[1]).toContain('...');
      expect(formatted[1].length).toBeLessThan(formatted[0].length + 100);
    });
  });

  describe('estimateTokenCount', () => {
    it('should estimate tokens based on character count', () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      // 100 characters should be ~25 tokens (100/4)
      const messages = ['A'.repeat(100)];
      const estimate = engine.estimateTokenCount(messages);

      expect(estimate).toBe(25);
    });

    it('should sum tokens across multiple messages', () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      // 40 + 40 + 40 = 120 characters = 30 tokens
      const messages = ['A'.repeat(40), 'B'.repeat(40), 'C'.repeat(40)];
      const estimate = engine.estimateTokenCount(messages);

      expect(estimate).toBe(30);
    });

    it('should round up token estimates', () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      // 5 characters should round up to 2 tokens (5/4 = 1.25 → 2)
      const messages = ['ABCDE'];
      const estimate = engine.estimateTokenCount(messages);

      expect(estimate).toBe(2);
    });

    it('should return 0 for empty messages', () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      const estimate = engine.estimateTokenCount([]);

      expect(estimate).toBe(0);
    });
  });

  describe('createSummaryEngine factory', () => {
    it('should create a DefaultSummaryEngine instance', () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();

      const engine = createSummaryEngine(mockStore, mockProvider);

      expect(engine).toBeInstanceOf(DefaultSummaryEngine);
    });
  });

  describe('NoMessagesError', () => {
    it('should have correct name and message', () => {
      const error = new NoMessagesError();

      expect(error.name).toBe('NoMessagesError');
      expect(error.message).toBe('No messages found in the specified range.');
    });

    it('should accept custom message', () => {
      const error = new NoMessagesError('Custom error message');

      expect(error.message).toBe('Custom error message');
    });
  });

  // ============================================================================
  // Hierarchical Summarization Tests
  // **Validates: Requirements 6.1, 6.2, 6.3**
  // ============================================================================

  describe('hierarchicalSummarize', () => {
    it('should return direct summary when messages fit in single chunk', async () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider('Single chunk summary');
      // Set a high token limit so all messages fit
      (mockProvider.getMaxContextTokens as jest.Mock).mockReturnValue(10000);
      
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);
      const messages = ['Message 1', 'Message 2', 'Message 3'];

      const result = await engine.hierarchicalSummarize(messages);

      expect(result).toBe('Single chunk summary');
      // Should only call summarize once for single chunk
      expect(mockProvider.summarize).toHaveBeenCalledTimes(1);
    });

    it('should split messages into multiple chunks when exceeding token limit', async () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      // Set a low token limit to force chunking (500 tokens = ~2000 chars)
      (mockProvider.getMaxContextTokens as jest.Mock).mockReturnValue(500);
      
      // Mock different responses for chunk summaries and final summary
      (mockProvider.summarize as jest.Mock)
        .mockResolvedValueOnce('Chunk 1 summary')
        .mockResolvedValueOnce('Chunk 2 summary')
        .mockResolvedValueOnce('Final combined summary');
      
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);
      
      // Create messages that will exceed the token limit
      // Each message is ~100 chars = ~25 tokens
      // With 500 token limit - 1000 buffer = -500 (will use minimum)
      // Let's use a more reasonable setup
      (mockProvider.getMaxContextTokens as jest.Mock).mockReturnValue(1500);
      
      const messages = Array.from({ length: 20 }, (_, i) => 
        `[12:${i.toString().padStart(2, '0')}] user${i}: ${'A'.repeat(100)}`
      );

      const result = await engine.hierarchicalSummarize(messages);

      expect(result).toBe('Final combined summary');
      // Should call summarize multiple times: once per chunk + once for combining
      expect(mockProvider.summarize).toHaveBeenCalledTimes(3);
    });

    it('should summarize each chunk separately', async () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      (mockProvider.getMaxContextTokens as jest.Mock).mockReturnValue(1200);
      
      (mockProvider.summarize as jest.Mock)
        .mockResolvedValueOnce('Summary of part 1')
        .mockResolvedValueOnce('Summary of part 2')
        .mockResolvedValueOnce('Combined summary');
      
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);
      
      // Create messages that will be split into 2 chunks
      const messages = Array.from({ length: 15 }, (_, i) => 
        `[12:${i.toString().padStart(2, '0')}] user${i}: ${'B'.repeat(80)}`
      );

      await engine.hierarchicalSummarize(messages);

      // Verify chunk summaries include part numbers
      const calls = (mockProvider.summarize as jest.Mock).mock.calls;
      
      // First chunk should have context prefix
      expect(calls[0][0][0]).toContain('[Part 1 of');
      
      // Second chunk should have context prefix
      expect(calls[1][0][0]).toContain('[Part 2 of');
    });

    it('should combine chunk summaries into final summary', async () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      (mockProvider.getMaxContextTokens as jest.Mock).mockReturnValue(1200);
      
      (mockProvider.summarize as jest.Mock)
        .mockResolvedValueOnce('First part topics')
        .mockResolvedValueOnce('Second part topics')
        .mockResolvedValueOnce('Final hierarchical summary');
      
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);
      
      const messages = Array.from({ length: 15 }, (_, i) => 
        `[12:${i.toString().padStart(2, '0')}] user${i}: ${'C'.repeat(80)}`
      );

      await engine.hierarchicalSummarize(messages);

      // The final call should include the combination prompt
      const lastCall = (mockProvider.summarize as jest.Mock).mock.calls.slice(-1)[0][0];
      expect(lastCall).toContain('The following are summaries of different parts of a long conversation.');
      expect(lastCall).toContain('Part 1: First part topics');
      expect(lastCall).toContain('Part 2: Second part topics');
    });
  });

  describe('splitIntoChunks', () => {
    it('should return single chunk when messages fit within token limit', () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      (mockProvider.getMaxContextTokens as jest.Mock).mockReturnValue(10000);
      
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);
      const messages = ['Short message 1', 'Short message 2', 'Short message 3'];

      const chunks = engine.splitIntoChunks(messages);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual(messages);
    });

    it('should split messages into multiple chunks when exceeding limit', () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      // Set token limit that will force splitting
      // 1200 tokens - 1000 buffer = 200 tokens available = ~800 chars
      (mockProvider.getMaxContextTokens as jest.Mock).mockReturnValue(1200);
      
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);
      
      // Each message is ~100 chars = ~25 tokens
      // With 200 token limit, we can fit ~8 messages per chunk
      const messages = Array.from({ length: 20 }, (_, i) => 
        `Message ${i}: ${'X'.repeat(80)}`
      );

      const chunks = engine.splitIntoChunks(messages);

      expect(chunks.length).toBeGreaterThan(1);
      // All messages should be distributed across chunks
      const totalMessages = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      // Account for overlap messages being counted multiple times
      expect(totalMessages).toBeGreaterThanOrEqual(messages.length);
    });

    it('should maintain overlap between chunks for context continuity', () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      (mockProvider.getMaxContextTokens as jest.Mock).mockReturnValue(1200);
      
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);
      
      const messages = Array.from({ length: 20 }, (_, i) => 
        `Unique message ${i}: ${'Y'.repeat(80)}`
      );

      const chunks = engine.splitIntoChunks(messages);

      if (chunks.length > 1) {
        // Check that the end of first chunk overlaps with start of second chunk
        const firstChunkEnd = chunks[0].slice(-2);
        const secondChunkStart = chunks[1].slice(0, 2);
        
        // At least some messages should overlap
        const hasOverlap = firstChunkEnd.some(msg => secondChunkStart.includes(msg));
        expect(hasOverlap).toBe(true);
      }
    });

    it('should handle empty message array', () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      (mockProvider.getMaxContextTokens as jest.Mock).mockReturnValue(10000);
      
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      const chunks = engine.splitIntoChunks([]);

      expect(chunks).toHaveLength(0);
    });

    it('should handle very long single message by truncating', () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      // Very low token limit
      (mockProvider.getMaxContextTokens as jest.Mock).mockReturnValue(1100);
      
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);
      
      // Create a message that exceeds the token limit by itself
      const veryLongMessage = 'A'.repeat(5000); // ~1250 tokens
      const messages = [veryLongMessage];

      const chunks = engine.splitIntoChunks(messages);

      expect(chunks).toHaveLength(1);
      // The message should be truncated
      expect(chunks[0][0].length).toBeLessThan(veryLongMessage.length);
      expect(chunks[0][0]).toContain('...');
    });
  });

  describe('summarizeChunks', () => {
    it('should add part context to each chunk before summarizing', async () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider('Chunk summary');
      
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);
      const chunks = [
        ['Message 1', 'Message 2'],
        ['Message 3', 'Message 4'],
      ];

      await engine.summarizeChunks(chunks);

      const calls = (mockProvider.summarize as jest.Mock).mock.calls;
      
      // First chunk should have [Part 1 of 2] prefix
      expect(calls[0][0][0]).toBe('[Part 1 of 2]');
      expect(calls[0][0]).toContain('Message 1');
      
      // Second chunk should have [Part 2 of 2] prefix
      expect(calls[1][0][0]).toBe('[Part 2 of 2]');
      expect(calls[1][0]).toContain('Message 3');
    });

    it('should return array of summaries with part labels', async () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider();
      (mockProvider.summarize as jest.Mock)
        .mockResolvedValueOnce('Summary A')
        .mockResolvedValueOnce('Summary B');
      
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);
      const chunks = [
        ['Message 1'],
        ['Message 2'],
      ];

      const summaries = await engine.summarizeChunks(chunks);

      expect(summaries).toHaveLength(2);
      expect(summaries[0]).toBe('Part 1: Summary A');
      expect(summaries[1]).toBe('Part 2: Summary B');
    });
  });

  describe('combineChunkSummaries', () => {
    it('should create combination prompt with all chunk summaries', async () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider('Combined result');
      
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);
      const chunkSummaries = [
        'Part 1: Topics about coding',
        'Part 2: Topics about testing',
      ];

      await engine.combineChunkSummaries(chunkSummaries);

      const call = (mockProvider.summarize as jest.Mock).mock.calls[0][0];
      
      expect(call).toContain('The following are summaries of different parts of a long conversation.');
      expect(call).toContain('Part 1: Topics about coding');
      expect(call).toContain('Part 2: Topics about testing');
    });

    it('should return the combined summary from AI provider', async () => {
      const mockStore = createMockMessageStore();
      const mockProvider = createMockAIProvider('Final unified summary');
      
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);
      const chunkSummaries = ['Part 1: Summary'];

      const result = await engine.combineChunkSummaries(chunkSummaries);

      expect(result).toBe('Final unified summary');
    });
  });

  describe('generateSummary with hierarchical fallback', () => {
    it('should use hierarchical summarization when token limit exceeded', async () => {
      // Create many messages that exceed the token limit
      const longMessages = Array.from({ length: 50 }, (_, i) =>
        createTestMessage({
          messageId: i + 1,
          text: 'A'.repeat(200), // Each message ~50 tokens
        })
      );

      const mockStore = createMockMessageStore(longMessages);
      const mockProvider: AIProvider = {
        summarize: jest.fn()
          .mockResolvedValueOnce('Chunk 1 summary')
          .mockResolvedValueOnce('Chunk 2 summary')
          .mockResolvedValueOnce('Chunk 3 summary')
          .mockResolvedValueOnce('Chunk 4 summary')
          .mockResolvedValueOnce('Final hierarchical summary'),
        getMaxContextTokens: jest.fn().mockReturnValue(1500),
      };
      
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      const range: MessageRange = { type: 'count', value: 50 };
      await engine.generateSummary(12345, range);

      // Should have called summarize multiple times (chunks + combination)
      expect((mockProvider.summarize as jest.Mock).mock.calls.length).toBeGreaterThan(1);
      // The last call should be the combination call
      const lastCallArgs = (mockProvider.summarize as jest.Mock).mock.calls.slice(-1)[0][0];
      expect(lastCallArgs).toContain('The following are summaries of different parts of a long conversation.');
    });

    it('should use direct summarization when within token limit', async () => {
      const messages = [
        createTestMessage({ messageId: 1, text: 'Short message' }),
        createTestMessage({ messageId: 2, text: 'Another short message' }),
      ];

      const mockStore = createMockMessageStore(messages);
      const mockProvider = createMockAIProvider('Direct summary');
      // High token limit - no chunking needed
      (mockProvider.getMaxContextTokens as jest.Mock).mockReturnValue(10000);
      
      const engine = new DefaultSummaryEngine(mockStore, mockProvider);

      const range: MessageRange = { type: 'count', value: 10 };
      const result = await engine.generateSummary(12345, range);

      expect(result).toBe('Direct summary');
      // Should only call summarize once
      expect(mockProvider.summarize).toHaveBeenCalledTimes(1);
    });
  });
});
