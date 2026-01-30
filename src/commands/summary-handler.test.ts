/**
 * Unit Tests for Summary Command Handler
 * 
 * Tests the /summary command parameter parsing functionality including:
 * - Time parameter parsing (e.g., "1h", "30m")
 * - Count parameter parsing (e.g., "50", "100")
 * - Default behavior when no parameter is provided
 * - SummaryHandler class execution
 * 
 * @module commands/summary-handler.test
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */

import {
  parseTimeParameter,
  parseCountParameter,
  parseSummaryParameter,
  SummaryHandler,
  DEFAULT_SUMMARY_HOURS,
} from './summary-handler';
import { Message } from '../types';

describe('parseTimeParameter', () => {
  describe('valid hour formats', () => {
    it('should parse "1h" as 1 hour', () => {
      expect(parseTimeParameter('1h')).toBe(1);
    });

    it('should parse "2h" as 2 hours', () => {
      expect(parseTimeParameter('2h')).toBe(2);
    });

    it('should parse "24h" as 24 hours', () => {
      expect(parseTimeParameter('24h')).toBe(24);
    });

    it('should parse uppercase "1H" as 1 hour', () => {
      expect(parseTimeParameter('1H')).toBe(1);
    });

    it('should handle whitespace around the parameter', () => {
      expect(parseTimeParameter('  2h  ')).toBe(2);
    });
  });

  describe('valid minute formats', () => {
    it('should parse "30m" as 0.5 hours', () => {
      expect(parseTimeParameter('30m')).toBe(0.5);
    });

    it('should parse "60m" as 1 hour', () => {
      expect(parseTimeParameter('60m')).toBe(1);
    });

    it('should parse "90m" as 1.5 hours', () => {
      expect(parseTimeParameter('90m')).toBe(1.5);
    });

    it('should parse "15m" as 0.25 hours', () => {
      expect(parseTimeParameter('15m')).toBe(0.25);
    });

    it('should parse uppercase "30M" as 0.5 hours', () => {
      expect(parseTimeParameter('30M')).toBe(0.5);
    });
  });

  describe('invalid formats', () => {
    it('should return null for empty string', () => {
      expect(parseTimeParameter('')).toBeNull();
    });

    it('should return null for null-like input', () => {
      expect(parseTimeParameter(null as unknown as string)).toBeNull();
      expect(parseTimeParameter(undefined as unknown as string)).toBeNull();
    });

    it('should return null for plain numbers', () => {
      expect(parseTimeParameter('50')).toBeNull();
    });

    it('should return null for invalid units', () => {
      expect(parseTimeParameter('1d')).toBeNull();
      expect(parseTimeParameter('1s')).toBeNull();
      expect(parseTimeParameter('1w')).toBeNull();
    });

    it('should return null for zero values', () => {
      expect(parseTimeParameter('0h')).toBeNull();
      expect(parseTimeParameter('0m')).toBeNull();
    });

    it('should return null for negative values', () => {
      expect(parseTimeParameter('-1h')).toBeNull();
      expect(parseTimeParameter('-30m')).toBeNull();
    });

    it('should return null for non-numeric values', () => {
      expect(parseTimeParameter('abch')).toBeNull();
      expect(parseTimeParameter('h')).toBeNull();
      expect(parseTimeParameter('m')).toBeNull();
    });

    it('should return null for decimal values', () => {
      expect(parseTimeParameter('1.5h')).toBeNull();
      expect(parseTimeParameter('30.5m')).toBeNull();
    });
  });
});

describe('parseCountParameter', () => {
  describe('valid count formats', () => {
    it('should parse "50" as 50', () => {
      expect(parseCountParameter('50')).toBe(50);
    });

    it('should parse "100" as 100', () => {
      expect(parseCountParameter('100')).toBe(100);
    });

    it('should parse "1" as 1', () => {
      expect(parseCountParameter('1')).toBe(1);
    });

    it('should parse "500" as 500', () => {
      expect(parseCountParameter('500')).toBe(500);
    });

    it('should handle whitespace around the parameter', () => {
      expect(parseCountParameter('  50  ')).toBe(50);
    });
  });

  describe('invalid count formats', () => {
    it('should return null for empty string', () => {
      expect(parseCountParameter('')).toBeNull();
    });

    it('should return null for null-like input', () => {
      expect(parseCountParameter(null as unknown as string)).toBeNull();
      expect(parseCountParameter(undefined as unknown as string)).toBeNull();
    });

    it('should return null for zero', () => {
      expect(parseCountParameter('0')).toBeNull();
    });

    it('should return null for negative numbers', () => {
      expect(parseCountParameter('-50')).toBeNull();
    });

    it('should return null for decimal numbers', () => {
      expect(parseCountParameter('50.5')).toBeNull();
    });

    it('should return null for time formats', () => {
      expect(parseCountParameter('1h')).toBeNull();
      expect(parseCountParameter('30m')).toBeNull();
    });

    it('should return null for non-numeric strings', () => {
      expect(parseCountParameter('abc')).toBeNull();
      expect(parseCountParameter('fifty')).toBeNull();
    });

    it('should return null for mixed formats', () => {
      expect(parseCountParameter('50messages')).toBeNull();
      expect(parseCountParameter('50 messages')).toBeNull();
    });
  });
});

describe('parseSummaryParameter', () => {
  describe('default behavior (no parameter)', () => {
    /**
     * **Validates: Requirements 3.1**
     */
    it('should return default 24 hours when no parameter is provided', () => {
      const result = parseSummaryParameter(undefined);
      expect(result).toEqual({ type: 'time', value: DEFAULT_SUMMARY_HOURS });
    });

    it('should return default 24 hours for empty string', () => {
      const result = parseSummaryParameter('');
      expect(result).toEqual({ type: 'time', value: DEFAULT_SUMMARY_HOURS });
    });

    it('should return default 24 hours for whitespace-only string', () => {
      const result = parseSummaryParameter('   ');
      expect(result).toEqual({ type: 'time', value: DEFAULT_SUMMARY_HOURS });
    });
  });

  describe('time parameter parsing', () => {
    /**
     * **Validates: Requirements 3.2**
     */
    it('should parse "1h" as time range of 1 hour', () => {
      const result = parseSummaryParameter('1h');
      expect(result).toEqual({ type: 'time', value: 1 });
    });

    it('should parse "2h" as time range of 2 hours', () => {
      const result = parseSummaryParameter('2h');
      expect(result).toEqual({ type: 'time', value: 2 });
    });

    it('should parse "30m" as time range of 0.5 hours', () => {
      const result = parseSummaryParameter('30m');
      expect(result).toEqual({ type: 'time', value: 0.5 });
    });

    it('should parse "90m" as time range of 1.5 hours', () => {
      const result = parseSummaryParameter('90m');
      expect(result).toEqual({ type: 'time', value: 1.5 });
    });
  });

  describe('count parameter parsing', () => {
    /**
     * **Validates: Requirements 3.3**
     */
    it('should parse "50" as count range of 50', () => {
      const result = parseSummaryParameter('50');
      expect(result).toEqual({ type: 'count', value: 50 });
    });

    it('should parse "100" as count range of 100', () => {
      const result = parseSummaryParameter('100');
      expect(result).toEqual({ type: 'count', value: 100 });
    });

    it('should parse "1" as count range of 1', () => {
      const result = parseSummaryParameter('1');
      expect(result).toEqual({ type: 'count', value: 1 });
    });
  });

  describe('invalid parameters', () => {
    it('should return null for invalid format', () => {
      expect(parseSummaryParameter('invalid')).toBeNull();
    });

    it('should return null for negative numbers', () => {
      expect(parseSummaryParameter('-50')).toBeNull();
    });

    it('should return null for zero', () => {
      expect(parseSummaryParameter('0')).toBeNull();
    });

    it('should return null for unsupported time units', () => {
      expect(parseSummaryParameter('1d')).toBeNull();
      expect(parseSummaryParameter('1w')).toBeNull();
    });
  });
});

describe('SummaryHandler', () => {
  let mockSendMessage: jest.Mock;
  let mockGenerateSummary: jest.Mock;
  let handler: SummaryHandler;

  const createMockMessage = (chatId: number): Message => ({
    message_id: 1,
    chat: { id: chatId, type: 'group' },
    date: Math.floor(Date.now() / 1000),
    text: '/summary',
  });

  beforeEach(() => {
    mockSendMessage = jest.fn().mockResolvedValue(undefined);
    mockGenerateSummary = jest.fn().mockResolvedValue('📝 Summary content');
    handler = new SummaryHandler(mockSendMessage, mockGenerateSummary);
  });

  describe('execute with no arguments', () => {
    /**
     * **Validates: Requirements 3.1**
     */
    it('should use default 24 hours when no argument is provided', async () => {
      const message = createMockMessage(123);
      
      await handler.execute(message, []);

      expect(mockGenerateSummary).toHaveBeenCalledWith(123, {
        type: 'time',
        value: DEFAULT_SUMMARY_HOURS,
      });
      expect(mockSendMessage).toHaveBeenCalledWith(123, '📝 Summary content');
    });
  });

  describe('execute with time arguments', () => {
    /**
     * **Validates: Requirements 3.2**
     */
    it('should parse "1h" and generate summary for 1 hour', async () => {
      const message = createMockMessage(456);
      
      await handler.execute(message, ['1h']);

      expect(mockGenerateSummary).toHaveBeenCalledWith(456, {
        type: 'time',
        value: 1,
      });
    });

    it('should parse "30m" and generate summary for 0.5 hours', async () => {
      const message = createMockMessage(456);
      
      await handler.execute(message, ['30m']);

      expect(mockGenerateSummary).toHaveBeenCalledWith(456, {
        type: 'time',
        value: 0.5,
      });
    });
  });

  describe('execute with count arguments', () => {
    /**
     * **Validates: Requirements 3.3**
     */
    it('should parse "50" and generate summary for 50 messages', async () => {
      const message = createMockMessage(789);
      
      await handler.execute(message, ['50']);

      expect(mockGenerateSummary).toHaveBeenCalledWith(789, {
        type: 'count',
        value: 50,
      });
    });

    it('should parse "100" and generate summary for 100 messages', async () => {
      const message = createMockMessage(789);
      
      await handler.execute(message, ['100']);

      expect(mockGenerateSummary).toHaveBeenCalledWith(789, {
        type: 'count',
        value: 100,
      });
    });
  });

  describe('execute with invalid arguments', () => {
    it('should send error message for invalid parameter', async () => {
      const message = createMockMessage(123);
      
      await handler.execute(message, ['invalid']);

      expect(mockGenerateSummary).not.toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('Invalid parameter format')
      );
    });

    it('should send error message for zero count', async () => {
      const message = createMockMessage(123);
      
      await handler.execute(message, ['0']);

      expect(mockGenerateSummary).not.toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('Invalid parameter format')
      );
    });
  });

  describe('error handling', () => {
    it('should send error message when summary generation fails', async () => {
      const message = createMockMessage(123);
      mockGenerateSummary.mockRejectedValue(new Error('AI provider error'));
      
      await handler.execute(message, []);

      // Centralized error handler returns user-friendly messages with ❌ prefix
      expect(mockSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringMatching(/^❌\s+.+/)
      );
      // Verify generateSummary was called before the error
      expect(mockGenerateSummary).toHaveBeenCalled();
    });

    it('should use centralized error handler for NoMessagesError', async () => {
      const message = createMockMessage(123);
      const noMessagesError = new Error('No messages found');
      noMessagesError.name = 'NoMessagesError';
      mockGenerateSummary.mockRejectedValue(noMessagesError);
      
      await handler.execute(message, []);

      // Should get user-friendly message for no messages
      expect(mockSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('❌')
      );
    });
  });

  describe('only uses first argument', () => {
    it('should ignore additional arguments', async () => {
      const message = createMockMessage(123);
      
      await handler.execute(message, ['1h', 'extra', 'args']);

      expect(mockGenerateSummary).toHaveBeenCalledWith(123, {
        type: 'time',
        value: 1,
      });
    });
  });
});
