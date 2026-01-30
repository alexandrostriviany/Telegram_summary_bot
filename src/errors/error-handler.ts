/**
 * Centralized Error Handling Module
 * 
 * This module provides custom error classes and a centralized error handling
 * function that maps errors to user-friendly messages while ensuring no
 * sensitive data is exposed to users.
 * 
 * @module errors/error-handler
 * 
 * **Validates: Requirements 8.1** - User-friendly error messages without technical details
 * **Validates: Requirements 8.2** - Clear explanation when no messages found
 * **Validates: Requirements 8.3** - Token overflow handling (via NoMessagesError)
 */

// Import AIProviderError from ai-provider for instanceof checks
import { AIProviderError as AIProviderErrorFromProvider } from '../ai/ai-provider';

// ============================================================================
// Error Response Interface
// ============================================================================

/**
 * Standardized error response format
 * 
 * Contains both user-facing message and internal details for logging.
 * Only the userMessage should be sent to users.
 */
export interface ErrorResponse {
  /** Indicates this is an error response */
  success: false;
  /** User-friendly message safe to display to users */
  userMessage: string;
  /** Internal error code for logging and debugging */
  errorCode: string;
  /** Original error for internal logging (not sent to user) */
  originalError?: Error;
}

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for categorizing errors internally
 */
export enum ErrorCode {
  NO_MESSAGES = 'NO_MESSAGES',
  AI_PROVIDER_ERROR = 'AI_PROVIDER_ERROR',
  AI_PROVIDER_TIMEOUT = 'AI_PROVIDER_TIMEOUT',
  DYNAMODB_ERROR = 'DYNAMODB_ERROR',
  INVALID_COMMAND = 'INVALID_COMMAND',
  TELEGRAM_API_ERROR = 'TELEGRAM_API_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Base class for all bot-specific errors
 * 
 * Provides a consistent interface for error handling with error codes.
 * Uses Object.setPrototypeOf to properly maintain prototype chain per TypeScript best practices.
 */
export abstract class BotError extends Error {
  /** Error code for categorization */
  public readonly errorCode: ErrorCode;
  /** Original error that caused this error, if any */
  public readonly cause?: Error;

  constructor(message: string, errorCode: ErrorCode, cause?: Error) {
    super(message);
    // Restore prototype chain - required for proper instanceof checks
    // See: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = this.constructor.name;
    this.errorCode = errorCode;
    this.cause = cause;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when no messages are found for summarization
 * 
 * **Validates: Requirements 8.2**
 */
export class NoMessagesError extends BotError {
  constructor(message: string = 'No messages found in the specified range.') {
    super(message, ErrorCode.NO_MESSAGES);
    this.name = 'NoMessagesError';
  }
}

/**
 * Error thrown when the AI provider fails to generate a summary
 * 
 * Note: This is a re-export alias for the AIProviderError from ai-provider.ts
 * to maintain backward compatibility. Use the one from ai-provider.ts for new code.
 * 
 * **Validates: Requirements 8.1**
 */
export class SummaryAIProviderError extends BotError {
  /** The AI provider that generated the error */
  public readonly provider?: string;

  constructor(message: string, provider?: string, cause?: Error) {
    super(message, ErrorCode.AI_PROVIDER_ERROR, cause);
    this.name = 'AIProviderError';
    this.provider = provider;
  }
}

// Re-export for backward compatibility
export { SummaryAIProviderError as AIProviderError };

/**
 * Error thrown when the AI provider times out
 * 
 * **Validates: Requirements 8.1**
 */
export class AIProviderTimeoutError extends BotError {
  /** The AI provider that timed out */
  public readonly provider?: string;

  constructor(message: string = 'AI provider request timed out.', provider?: string, cause?: Error) {
    super(message, ErrorCode.AI_PROVIDER_TIMEOUT, cause);
    this.name = 'AIProviderTimeoutError';
    this.provider = provider;
  }
}

/**
 * Error thrown when DynamoDB operations fail
 */
export class DynamoDBError extends BotError {
  /** The DynamoDB operation that failed */
  public readonly operation?: string;

  constructor(message: string, operation?: string, cause?: Error) {
    super(message, ErrorCode.DYNAMODB_ERROR, cause);
    this.name = 'DynamoDBError';
    this.operation = operation;
  }
}

/**
 * Error thrown when a command has invalid syntax
 */
export class InvalidCommandError extends BotError {
  /** The command that was invalid */
  public readonly command?: string;

  constructor(message: string, command?: string) {
    super(message, ErrorCode.INVALID_COMMAND);
    this.name = 'InvalidCommandError';
    this.command = command;
  }
}

/**
 * Error thrown when Telegram API calls fail
 */
export class TelegramAPIError extends BotError {
  /** The Telegram API method that failed */
  public readonly method?: string;

  constructor(message: string, method?: string, cause?: Error) {
    super(message, ErrorCode.TELEGRAM_API_ERROR, cause);
    this.name = 'TelegramAPIError';
    this.method = method;
  }
}

/**
 * Error thrown when configuration is invalid or missing
 */
export class ConfigurationError extends BotError {
  /** The configuration key that is invalid or missing */
  public readonly configKey?: string;

  constructor(message: string, configKey?: string) {
    super(message, ErrorCode.CONFIGURATION_ERROR);
    this.name = 'ConfigurationError';
    this.configKey = configKey;
  }
}

// ============================================================================
// User-Friendly Error Messages
// ============================================================================

/**
 * Mapping of error codes to user-friendly messages
 * 
 * These messages are safe to display to users and do not contain
 * any sensitive information or technical details.
 */
const USER_FRIENDLY_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.NO_MESSAGES]: 'No recent messages to summarize. Try a longer time range.',
  [ErrorCode.AI_PROVIDER_ERROR]: 'Unable to generate summary right now. Please try again later.',
  [ErrorCode.AI_PROVIDER_TIMEOUT]: 'Summary generation is taking too long. Please try again.',
  [ErrorCode.DYNAMODB_ERROR]: 'Something went wrong. Please try again.',
  [ErrorCode.INVALID_COMMAND]: 'Invalid command. Use /help to see available commands.',
  [ErrorCode.TELEGRAM_API_ERROR]: 'Unable to send message. Please try again.',
  [ErrorCode.CONFIGURATION_ERROR]: 'The bot is not properly configured. Please contact the administrator.',
  [ErrorCode.UNKNOWN_ERROR]: 'Something went wrong. Please try again.',
};

// ============================================================================
// Sensitive Data Patterns
// ============================================================================

/**
 * Patterns that indicate sensitive data that should never be exposed
 */
const SENSITIVE_PATTERNS = [
  // API keys and tokens
  /sk-[a-zA-Z0-9]{20,}/gi,           // OpenAI API keys
  /[a-zA-Z0-9]{32,}/gi,              // Generic long tokens
  /\d{9,}:[a-zA-Z0-9_-]{35}/gi,      // Telegram bot tokens
  /AKIA[0-9A-Z]{16}/gi,              // AWS access keys
  
  // Stack traces and internal paths
  /at\s+[\w.]+\s+\([^)]+\)/gi,       // Stack trace lines
  /\/[\w/.-]+\.(?:ts|js):\d+:\d+/gi, // File paths with line numbers
  /node_modules/gi,                   // Node modules paths
  
  // Environment variables and config
  /process\.env\.[A-Z_]+/gi,         // Environment variable references
  /AWS_[A-Z_]+/gi,                   // AWS environment variables
  
  // Database and internal identifiers
  /arn:aws:[a-z0-9:-]+/gi,           // AWS ARNs
  /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, // UUIDs
];

// ============================================================================
// Error Handling Functions
// ============================================================================

/**
 * Check if a string contains sensitive data
 * 
 * @param text - The text to check for sensitive data
 * @returns true if sensitive data is detected
 */
export function containsSensitiveData(text: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Sanitize a string by removing sensitive data
 * 
 * @param text - The text to sanitize
 * @returns Sanitized text with sensitive data replaced
 */
export function sanitizeMessage(text: string): string {
  let sanitized = text;
  
  for (const pattern of SENSITIVE_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  
  return sanitized;
}

/**
 * Determine the error code for an error
 * 
 * @param error - The error to categorize
 * @returns The appropriate error code
 */
export function getErrorCode(error: Error): ErrorCode {
  // Check for our custom error types
  if (error instanceof BotError) {
    return error.errorCode;
  }

  // Check for AIProviderError from ai-provider module
  if (error instanceof AIProviderErrorFromProvider) {
    const errorMessage = error.message?.toLowerCase() || '';
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return ErrorCode.AI_PROVIDER_TIMEOUT;
    }
    return ErrorCode.AI_PROVIDER_ERROR;
  }

  // Check error name for known error types
  const errorName = error.name?.toLowerCase() || '';
  const errorMessage = error.message?.toLowerCase() || '';

  // Check for NoMessagesError from summary-engine (legacy support)
  if (errorName === 'nomessageserror' || errorName.includes('nomessages')) {
    return ErrorCode.NO_MESSAGES;
  }

  // Check for AI provider errors
  if (errorName.includes('aiprovider') || errorName.includes('openai') || errorName.includes('bedrock')) {
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return ErrorCode.AI_PROVIDER_TIMEOUT;
    }
    return ErrorCode.AI_PROVIDER_ERROR;
  }

  // Check for timeout errors
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out') || errorMessage.includes('etimedout')) {
    return ErrorCode.AI_PROVIDER_TIMEOUT;
  }

  // Check for DynamoDB errors
  if (errorName.includes('dynamodb') || errorMessage.includes('dynamodb') || 
      errorMessage.includes('resourcenotfoundexception') || errorMessage.includes('conditionalcheckfailed')) {
    return ErrorCode.DYNAMODB_ERROR;
  }

  // Check for Telegram API errors
  if (errorName.includes('telegram') || errorMessage.includes('telegram')) {
    return ErrorCode.TELEGRAM_API_ERROR;
  }

  // Check for configuration errors
  if (errorMessage.includes('environment variable') || errorMessage.includes('not configured') ||
      errorMessage.includes('missing configuration')) {
    return ErrorCode.CONFIGURATION_ERROR;
  }

  return ErrorCode.UNKNOWN_ERROR;
}

/**
 * Get a user-friendly message for an error code
 * 
 * @param errorCode - The error code to get a message for
 * @returns User-friendly error message
 */
export function getUserFriendlyMessage(errorCode: ErrorCode): string {
  return USER_FRIENDLY_MESSAGES[errorCode] || USER_FRIENDLY_MESSAGES[ErrorCode.UNKNOWN_ERROR];
}

/**
 * Handle an error and return a standardized error response
 * 
 * This function:
 * 1. Categorizes the error by type
 * 2. Logs the full error internally
 * 3. Returns a sanitized user-friendly message
 * 
 * **Validates: Requirements 8.1** - Never expose internal details to users
 * **Validates: Requirements 8.2** - Clear explanation for no messages
 * 
 * @param error - The error to handle
 * @returns Standardized error response with user-friendly message
 */
export function handleError(error: Error): ErrorResponse {
  // Determine the error code
  const errorCode = getErrorCode(error);
  
  // Get the user-friendly message
  const userMessage = getUserFriendlyMessage(errorCode);
  
  // Log the full error internally (sanitized for logs)
  const sanitizedMessage = sanitizeMessage(error.message || 'Unknown error');
  console.error(`[${errorCode}] ${error.name}: ${sanitizedMessage}`, {
    errorCode,
    errorName: error.name,
    // Don't log the full stack trace to avoid sensitive path exposure
    hasStack: !!error.stack,
  });

  return {
    success: false,
    userMessage,
    errorCode,
    originalError: error,
  };
}

/**
 * Format an error response as a Telegram message
 * 
 * @param response - The error response to format
 * @returns Formatted error message for Telegram
 */
export function formatErrorForTelegram(response: ErrorResponse): string {
  return `❌ ${response.userMessage}`;
}

/**
 * Check if an error is a known bot error type
 * 
 * @param error - The error to check
 * @returns true if the error is a BotError instance
 */
export function isBotError(error: unknown): error is BotError {
  return error instanceof BotError;
}

/**
 * Check if an error indicates no messages were found
 * 
 * @param error - The error to check
 * @returns true if the error indicates no messages
 */
export function isNoMessagesError(error: unknown): boolean {
  if (error instanceof NoMessagesError) {
    return true;
  }
  if (error instanceof Error) {
    return error.name === 'NoMessagesError' || getErrorCode(error) === ErrorCode.NO_MESSAGES;
  }
  return false;
}

/**
 * Check if an error is retryable
 * 
 * Some errors (like timeouts) may be worth retrying, while others
 * (like invalid commands) should not be retried.
 * 
 * @param error - The error to check
 * @returns true if the error is potentially retryable
 */
export function isRetryableError(error: Error): boolean {
  const errorCode = getErrorCode(error);
  
  // These error types may succeed on retry
  const retryableCodes = [
    ErrorCode.AI_PROVIDER_TIMEOUT,
    ErrorCode.AI_PROVIDER_ERROR,
    ErrorCode.DYNAMODB_ERROR,
    ErrorCode.TELEGRAM_API_ERROR,
  ];
  
  return retryableCodes.includes(errorCode);
}
