/**
 * Unit Tests for Token Usage Logger
 *
 * Tests the structured JSON logging functions for token usage monitoring.
 *
 * @module ai/token-usage-logger.test
 */

import { logTokenUsage, logAggregatedTokenUsage } from './token-usage-logger';
import { TokenUsage } from './ai-provider';

describe('Token Usage Logger', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('logTokenUsage', () => {
    it('should emit structured JSON with _type TOKEN_USAGE', () => {
      const usage: TokenUsage = { inputTokens: 100, outputTokens: 50, totalTokens: 150 };

      logTokenUsage('openai', 'gpt-3.5-turbo', 12345, usage, 'single');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged._type).toBe('TOKEN_USAGE');
    });

    it('should include all required fields', () => {
      const usage: TokenUsage = { inputTokens: 200, outputTokens: 80, totalTokens: 280 };

      logTokenUsage('gemini', 'gemini-2.5-flash', 67890, usage, 'chunk');

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged.provider).toBe('gemini');
      expect(logged.model).toBe('gemini-2.5-flash');
      expect(logged.chatId).toBe(67890);
      expect(logged.phase).toBe('chunk');
      expect(logged.inputTokens).toBe(200);
      expect(logged.outputTokens).toBe(80);
      expect(logged.totalTokens).toBe(280);
    });

    it('should include ISO-8601 timestamp', () => {
      const usage: TokenUsage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

      logTokenUsage('bedrock', 'claude-3-haiku', 11111, usage, 'combine');

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged.timestamp).toBeDefined();
      // Verify it parses as a valid date
      const parsed = new Date(logged.timestamp);
      expect(parsed.getTime()).not.toBeNaN();
      // Verify ISO-8601 format (ends with Z or has timezone offset)
      expect(logged.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should support all phase values', () => {
      const usage: TokenUsage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

      logTokenUsage('openai', 'gpt-4', 1, usage, 'single');
      logTokenUsage('openai', 'gpt-4', 1, usage, 'chunk');
      logTokenUsage('openai', 'gpt-4', 1, usage, 'combine');

      expect(consoleSpy).toHaveBeenCalledTimes(3);
      expect(JSON.parse(consoleSpy.mock.calls[0][0]).phase).toBe('single');
      expect(JSON.parse(consoleSpy.mock.calls[1][0]).phase).toBe('chunk');
      expect(JSON.parse(consoleSpy.mock.calls[2][0]).phase).toBe('combine');
    });
  });

  describe('logAggregatedTokenUsage', () => {
    it('should emit structured JSON with _type TOKEN_USAGE_TOTAL', () => {
      const usages: TokenUsage[] = [
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      ];

      logAggregatedTokenUsage('openai', 'gpt-3.5-turbo', 12345, usages, 1);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged._type).toBe('TOKEN_USAGE_TOTAL');
    });

    it('should sum token counts across multiple usages', () => {
      const usages: TokenUsage[] = [
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        { inputTokens: 200, outputTokens: 80, totalTokens: 280 },
        { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
      ];

      logAggregatedTokenUsage('bedrock', 'claude-3-haiku', 99999, usages, 3);

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged.inputTokens).toBe(350);
      expect(logged.outputTokens).toBe(160);
      expect(logged.totalTokens).toBe(510);
      expect(logged.apiCallCount).toBe(3);
    });

    it('should include all required fields', () => {
      const usages: TokenUsage[] = [
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      ];

      logAggregatedTokenUsage('gemini', 'gemini-2.5-flash', 12345, usages, 1);

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged._type).toBe('TOKEN_USAGE_TOTAL');
      expect(logged.provider).toBe('gemini');
      expect(logged.model).toBe('gemini-2.5-flash');
      expect(logged.chatId).toBe(12345);
      expect(logged.apiCallCount).toBe(1);
      expect(logged.timestamp).toBeDefined();
    });

    it('should handle empty usages array', () => {
      logAggregatedTokenUsage('openai', 'gpt-4', 12345, [], 0);

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged.inputTokens).toBe(0);
      expect(logged.outputTokens).toBe(0);
      expect(logged.totalTokens).toBe(0);
      expect(logged.apiCallCount).toBe(0);
    });

    it('should include ISO-8601 timestamp', () => {
      logAggregatedTokenUsage('openai', 'gpt-4', 12345, [], 0);

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      const parsed = new Date(logged.timestamp);
      expect(parsed.getTime()).not.toBeNaN();
      expect(logged.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
