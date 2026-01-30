/**
 * Unit Tests for Centralized Error Handling
 * 
 * Tests the error handling module to ensure:
 * - Custom error classes work correctly
 * - Error categorization is accurate
 * - User-friendly messages are returned
 * - Sensitive data is never exposed
 * 
 * @module errors/error-handler.test
 * 
 * **Validates: Requirements 8.1, 8.2, 8.3**
 */

import {
  ErrorResponse,
  ErrorCode,
  BotError,
  NoMessagesError,
  AIProviderError,
  AIProviderTimeoutError,
  DynamoDBError,
  InvalidCommandError,
  TelegramAPIError,
  ConfigurationError,
  handleError,
  getErrorCode,
  getUserFriendlyMessage,
  containsSensitiveData,
  sanitizeMessage,
  formatErrorForTelegram,
  isBotError,
  isNoMessagesError,
  isRetryableError,
} from './error-handler';

// ============================================================================
// Custom Error Classes Tests
// ============================================================================

describe('Custom Error Classes', () => {
  describe('NoMessagesError', () => {
    it('should create error with default message', () => {
      const error = new NoMessagesError();
      
      expect(error.name).toBe('NoMessagesError');
      expect(error.message).toBe('No messages found in the specified range.');
      expect(error.errorCode).toBe(ErrorCode.NO_MESSAGES);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BotError);
    });

    it('should create error with custom message', () => {
      const error = new NoMessagesError('Custom no messages error');
      
      expect(error.message).toBe('Custom no messages error');
      expect(error.errorCode).toBe(ErrorCode.NO_MESSAGES);
    });
  });

  describe('AIProviderError', () => {
    it('should create error with message and provider', () => {
      const error = new AIProviderError('API call failed', 'openai');
      
      expect(error.name).toBe('AIProviderError');
      expect(error.message).toBe('API call failed');
      expect(error.provider).toBe('openai');
      expect(error.errorCode).toBe(ErrorCode.AI_PROVIDER_ERROR);
    });

    it('should create error with cause', () => {
      const cause = new Error('Network error');
      const error = new AIProviderError('API call failed', 'bedrock', cause);
      
      expect(error.cause).toBe(cause);
    });
  });

  describe('AIProviderTimeoutError', () => {
    it('should create error with default message', () => {
      const error = new AIProviderTimeoutError();
      
      expect(error.name).toBe('AIProviderTimeoutError');
      expect(error.message).toBe('AI provider request timed out.');
      expect(error.errorCode).toBe(ErrorCode.AI_PROVIDER_TIMEOUT);
    });

    it('should create error with custom message and provider', () => {
      const error = new AIProviderTimeoutError('Request timed out after 30s', 'openai');
      
      expect(error.message).toBe('Request timed out after 30s');
      expect(error.provider).toBe('openai');
    });
  });

  describe('DynamoDBError', () => {
    it('should create error with operation', () => {
      const error = new DynamoDBError('Query failed', 'query');
      
      expect(error.name).toBe('DynamoDBError');
      expect(error.message).toBe('Query failed');
      expect(error.operation).toBe('query');
      expect(error.errorCode).toBe(ErrorCode.DYNAMODB_ERROR);
    });
  });

  describe('InvalidCommandError', () => {
    it('should create error with command', () => {
      const error = new InvalidCommandError('Unknown command', '/unknown');
      
      expect(error.name).toBe('InvalidCommandError');
      expect(error.message).toBe('Unknown command');
      expect(error.command).toBe('/unknown');
      expect(error.errorCode).toBe(ErrorCode.INVALID_COMMAND);
    });
  });

  describe('TelegramAPIError', () => {
    it('should create error with method', () => {
      const error = new TelegramAPIError('Failed to send message', 'sendMessage');
      
      expect(error.name).toBe('TelegramAPIError');
      expect(error.message).toBe('Failed to send message');
      expect(error.method).toBe('sendMessage');
      expect(error.errorCode).toBe(ErrorCode.TELEGRAM_API_ERROR);
    });
  });

  describe('ConfigurationError', () => {
    it('should create error with config key', () => {
      const error = new ConfigurationError('Missing API key', 'OPENAI_API_KEY');
      
      expect(error.name).toBe('ConfigurationError');
      expect(error.message).toBe('Missing API key');
      expect(error.configKey).toBe('OPENAI_API_KEY');
      expect(error.errorCode).toBe(ErrorCode.CONFIGURATION_ERROR);
    });
  });
});

// ============================================================================
// Error Code Detection Tests
// ============================================================================

describe('getErrorCode', () => {
  it('should return correct code for BotError instances', () => {
    expect(getErrorCode(new NoMessagesError())).toBe(ErrorCode.NO_MESSAGES);
    expect(getErrorCode(new AIProviderError('test'))).toBe(ErrorCode.AI_PROVIDER_ERROR);
    expect(getErrorCode(new AIProviderTimeoutError())).toBe(ErrorCode.AI_PROVIDER_TIMEOUT);
    expect(getErrorCode(new DynamoDBError('test'))).toBe(ErrorCode.DYNAMODB_ERROR);
    expect(getErrorCode(new InvalidCommandError('test'))).toBe(ErrorCode.INVALID_COMMAND);
    expect(getErrorCode(new TelegramAPIError('test'))).toBe(ErrorCode.TELEGRAM_API_ERROR);
    expect(getErrorCode(new ConfigurationError('test'))).toBe(ErrorCode.CONFIGURATION_ERROR);
  });

  it('should detect NoMessagesError by name', () => {
    const error = new Error('No messages');
    error.name = 'NoMessagesError';
    
    expect(getErrorCode(error)).toBe(ErrorCode.NO_MESSAGES);
  });

  it('should detect AI provider errors by name', () => {
    const error = new Error('API failed');
    error.name = 'AIProviderError';
    
    expect(getErrorCode(error)).toBe(ErrorCode.AI_PROVIDER_ERROR);
  });

  it('should detect timeout errors by message', () => {
    const error = new Error('Request timed out');
    
    expect(getErrorCode(error)).toBe(ErrorCode.AI_PROVIDER_TIMEOUT);
  });

  it('should detect DynamoDB errors by message', () => {
    const error = new Error('DynamoDB query failed');
    
    expect(getErrorCode(error)).toBe(ErrorCode.DYNAMODB_ERROR);
  });

  it('should detect Telegram errors by name', () => {
    const error = new Error('API error');
    error.name = 'TelegramError';
    
    expect(getErrorCode(error)).toBe(ErrorCode.TELEGRAM_API_ERROR);
  });

  it('should detect configuration errors by message', () => {
    const error = new Error('Environment variable not set');
    
    expect(getErrorCode(error)).toBe(ErrorCode.CONFIGURATION_ERROR);
  });

  it('should return UNKNOWN_ERROR for unrecognized errors', () => {
    const error = new Error('Something random happened');
    
    expect(getErrorCode(error)).toBe(ErrorCode.UNKNOWN_ERROR);
  });
});

// ============================================================================
// User-Friendly Message Tests
// ============================================================================

describe('getUserFriendlyMessage', () => {
  it('should return correct message for NO_MESSAGES', () => {
    const message = getUserFriendlyMessage(ErrorCode.NO_MESSAGES);
    
    expect(message).toBe('No recent messages to summarize. Try a longer time range.');
  });

  it('should return correct message for AI_PROVIDER_ERROR', () => {
    const message = getUserFriendlyMessage(ErrorCode.AI_PROVIDER_ERROR);
    
    expect(message).toBe('Unable to generate summary right now. Please try again later.');
  });

  it('should return correct message for AI_PROVIDER_TIMEOUT', () => {
    const message = getUserFriendlyMessage(ErrorCode.AI_PROVIDER_TIMEOUT);
    
    expect(message).toBe('Summary generation is taking too long. Please try again.');
  });

  it('should return correct message for DYNAMODB_ERROR', () => {
    const message = getUserFriendlyMessage(ErrorCode.DYNAMODB_ERROR);
    
    expect(message).toBe('Something went wrong. Please try again.');
  });

  it('should return correct message for INVALID_COMMAND', () => {
    const message = getUserFriendlyMessage(ErrorCode.INVALID_COMMAND);
    
    expect(message).toBe('Invalid command. Use /help to see available commands.');
  });

  it('should return correct message for UNKNOWN_ERROR', () => {
    const message = getUserFriendlyMessage(ErrorCode.UNKNOWN_ERROR);
    
    expect(message).toBe('Something went wrong. Please try again.');
  });
});

// ============================================================================
// Sensitive Data Detection Tests
// ============================================================================

describe('containsSensitiveData', () => {
  it('should detect OpenAI API keys', () => {
    expect(containsSensitiveData('Error with key sk-abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
  });

  it('should detect Telegram bot tokens', () => {
    expect(containsSensitiveData('Token: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz_12345678')).toBe(true);
  });

  it('should detect AWS access keys', () => {
    expect(containsSensitiveData('Key: AKIAIOSFODNN7EXAMPLE')).toBe(true);
  });

  it('should detect stack traces', () => {
    expect(containsSensitiveData('at Object.handler (/var/task/handler.js:42:15)')).toBe(true);
  });

  it('should detect file paths with line numbers', () => {
    expect(containsSensitiveData('Error in /home/user/project/src/handler.ts:42:10')).toBe(true);
  });

  it('should detect AWS ARNs', () => {
    expect(containsSensitiveData('Resource: arn:aws:dynamodb:us-east-1:123456789:table/messages')).toBe(true);
  });

  it('should not flag normal text', () => {
    expect(containsSensitiveData('No messages found in the last 24 hours')).toBe(false);
  });

  it('should not flag short strings', () => {
    expect(containsSensitiveData('Error occurred')).toBe(false);
  });
});

// ============================================================================
// Message Sanitization Tests
// ============================================================================

describe('sanitizeMessage', () => {
  it('should redact OpenAI API keys', () => {
    const input = 'Failed with key sk-abcdefghijklmnopqrstuvwxyz123456';
    const result = sanitizeMessage(input);
    
    expect(result).not.toContain('sk-');
    expect(result).toContain('[REDACTED]');
  });

  it('should redact Telegram bot tokens', () => {
    const input = 'Token 123456789:ABCdefGHIjklMNOpqrsTUVwxyz_12345678 is invalid';
    const result = sanitizeMessage(input);
    
    expect(result).toContain('[REDACTED]');
    expect(result).not.toMatch(/\d{9,}:[a-zA-Z0-9_-]{35}/);
  });

  it('should redact file paths', () => {
    const input = 'Error at /var/task/src/handler.ts:42:15';
    const result = sanitizeMessage(input);
    
    expect(result).toContain('[REDACTED]');
  });

  it('should preserve non-sensitive text', () => {
    const input = 'No messages found';
    const result = sanitizeMessage(input);
    
    expect(result).toBe('No messages found');
  });

  it('should handle multiple sensitive items', () => {
    const input = 'Key sk-abc123def456ghi789jkl012mno345pqr failed at /path/file.ts:10:5';
    const result = sanitizeMessage(input);
    
    expect(result).not.toContain('sk-');
    expect(result).not.toContain('/path/');
    expect(result.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// handleError Tests
// ============================================================================

describe('handleError', () => {
  // Suppress console.error during tests
  const originalConsoleError = console.error;
  beforeEach(() => {
    console.error = jest.fn();
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('should return ErrorResponse for NoMessagesError', () => {
    const error = new NoMessagesError();
    const response = handleError(error);
    
    expect(response.success).toBe(false);
    expect(response.errorCode).toBe(ErrorCode.NO_MESSAGES);
    expect(response.userMessage).toBe('No recent messages to summarize. Try a longer time range.');
    expect(response.originalError).toBe(error);
  });

  it('should return ErrorResponse for AIProviderError', () => {
    const error = new AIProviderError('OpenAI API failed', 'openai');
    const response = handleError(error);
    
    expect(response.success).toBe(false);
    expect(response.errorCode).toBe(ErrorCode.AI_PROVIDER_ERROR);
    expect(response.userMessage).toBe('Unable to generate summary right now. Please try again later.');
  });

  it('should return ErrorResponse for AIProviderTimeoutError', () => {
    const error = new AIProviderTimeoutError();
    const response = handleError(error);
    
    expect(response.success).toBe(false);
    expect(response.errorCode).toBe(ErrorCode.AI_PROVIDER_TIMEOUT);
    expect(response.userMessage).toBe('Summary generation is taking too long. Please try again.');
  });

  it('should return ErrorResponse for DynamoDBError', () => {
    const error = new DynamoDBError('Query failed', 'query');
    const response = handleError(error);
    
    expect(response.success).toBe(false);
    expect(response.errorCode).toBe(ErrorCode.DYNAMODB_ERROR);
    expect(response.userMessage).toBe('Something went wrong. Please try again.');
  });

  it('should return ErrorResponse for unknown errors', () => {
    const error = new Error('Something unexpected');
    const response = handleError(error);
    
    expect(response.success).toBe(false);
    expect(response.errorCode).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(response.userMessage).toBe('Something went wrong. Please try again.');
  });

  it('should never expose sensitive data in user message', () => {
    const error = new Error('Failed with key sk-abcdefghijklmnopqrstuvwxyz123456');
    const response = handleError(error);
    
    expect(response.userMessage).not.toContain('sk-');
    expect(response.userMessage).not.toContain('abcdef');
  });

  it('should never expose stack traces in user message', () => {
    const error = new Error('Error occurred');
    error.stack = 'Error: Error occurred\n    at Object.handler (/var/task/handler.js:42:15)';
    const response = handleError(error);
    
    expect(response.userMessage).not.toContain('handler.js');
    expect(response.userMessage).not.toContain('/var/task');
    expect(response.userMessage).not.toContain('at Object');
  });

  it('should log error internally', () => {
    const error = new NoMessagesError();
    handleError(error);
    
    expect(console.error).toHaveBeenCalled();
  });
});

// ============================================================================
// formatErrorForTelegram Tests
// ============================================================================

describe('formatErrorForTelegram', () => {
  it('should format error response with emoji', () => {
    const response: ErrorResponse = {
      success: false,
      userMessage: 'No recent messages to summarize.',
      errorCode: ErrorCode.NO_MESSAGES,
    };
    
    const formatted = formatErrorForTelegram(response);
    
    expect(formatted).toBe('❌ No recent messages to summarize.');
  });

  it('should work with all error types', () => {
    const response: ErrorResponse = {
      success: false,
      userMessage: 'Something went wrong. Please try again.',
      errorCode: ErrorCode.UNKNOWN_ERROR,
    };
    
    const formatted = formatErrorForTelegram(response);
    
    expect(formatted).toContain('❌');
    expect(formatted).toContain('Something went wrong');
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('isBotError', () => {
  it('should return true for BotError instances', () => {
    expect(isBotError(new NoMessagesError())).toBe(true);
    expect(isBotError(new AIProviderError('test'))).toBe(true);
    expect(isBotError(new DynamoDBError('test'))).toBe(true);
  });

  it('should return false for regular errors', () => {
    expect(isBotError(new Error('test'))).toBe(false);
  });

  it('should return false for non-errors', () => {
    expect(isBotError('string')).toBe(false);
    expect(isBotError(null)).toBe(false);
    expect(isBotError(undefined)).toBe(false);
  });
});

describe('isNoMessagesError', () => {
  it('should return true for NoMessagesError', () => {
    expect(isNoMessagesError(new NoMessagesError())).toBe(true);
  });

  it('should return true for errors named NoMessagesError', () => {
    const error = new Error('No messages');
    error.name = 'NoMessagesError';
    
    expect(isNoMessagesError(error)).toBe(true);
  });

  it('should return false for other errors', () => {
    expect(isNoMessagesError(new Error('test'))).toBe(false);
    expect(isNoMessagesError(new AIProviderError('test'))).toBe(false);
  });
});

describe('isRetryableError', () => {
  it('should return true for timeout errors', () => {
    expect(isRetryableError(new AIProviderTimeoutError())).toBe(true);
  });

  it('should return true for AI provider errors', () => {
    expect(isRetryableError(new AIProviderError('test'))).toBe(true);
  });

  it('should return true for DynamoDB errors', () => {
    expect(isRetryableError(new DynamoDBError('test'))).toBe(true);
  });

  it('should return true for Telegram API errors', () => {
    expect(isRetryableError(new TelegramAPIError('test'))).toBe(true);
  });

  it('should return false for NoMessagesError', () => {
    expect(isRetryableError(new NoMessagesError())).toBe(false);
  });

  it('should return false for InvalidCommandError', () => {
    expect(isRetryableError(new InvalidCommandError('test'))).toBe(false);
  });

  it('should return false for ConfigurationError', () => {
    expect(isRetryableError(new ConfigurationError('test'))).toBe(false);
  });
});

// ============================================================================
// Integration Tests - Error Flow
// ============================================================================

describe('Error Handling Flow', () => {
  const originalConsoleError = console.error;
  beforeEach(() => {
    console.error = jest.fn();
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('should handle complete error flow for no messages scenario', () => {
    // Simulate the flow when no messages are found
    const error = new NoMessagesError();
    const response = handleError(error);
    const telegramMessage = formatErrorForTelegram(response);
    
    expect(response.success).toBe(false);
    expect(telegramMessage).toBe('❌ No recent messages to summarize. Try a longer time range.');
    expect(isNoMessagesError(error)).toBe(true);
    expect(isRetryableError(error)).toBe(false);
  });

  it('should handle complete error flow for AI timeout scenario', () => {
    // Simulate the flow when AI provider times out
    const error = new AIProviderTimeoutError('Request timed out after 30s', 'openai');
    const response = handleError(error);
    const telegramMessage = formatErrorForTelegram(response);
    
    expect(response.success).toBe(false);
    expect(telegramMessage).toBe('❌ Summary generation is taking too long. Please try again.');
    expect(isRetryableError(error)).toBe(true);
  });

  it('should handle complete error flow for generic error with sensitive data', () => {
    // Simulate an error that contains sensitive data
    const error = new Error('Failed to call API with key sk-test123456789012345678901234567890');
    const response = handleError(error);
    const telegramMessage = formatErrorForTelegram(response);
    
    // User message should not contain sensitive data
    expect(telegramMessage).not.toContain('sk-');
    expect(telegramMessage).not.toContain('test123');
    expect(telegramMessage).toBe('❌ Something went wrong. Please try again.');
  });
});
