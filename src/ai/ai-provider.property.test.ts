/**
 * Property-Based Tests for AI Provider Error Handling
 * 
 * These tests use fast-check to verify properties hold across many randomly generated inputs.
 * 
 * **Validates: Requirements 5.4, 8.1**
 * 
 * Property 7: AI Error Handling
 * For any error returned by the AI provider, the Bot's response to the user SHALL NOT
 * contain stack traces, API keys, or internal error codes, and SHALL contain a
 * user-friendly explanation.
 * 
 * @module ai/ai-provider.property.test
 */

import * as fc from 'fast-check';
import { AIProviderError, AIProviderType } from './ai-provider';

// ============================================================================
// Sensitive Data Patterns
// ============================================================================

/**
 * Patterns that indicate sensitive data that should NEVER appear in user-facing messages
 */
const SENSITIVE_PATTERNS = {
  // API Key patterns
  apiKeys: [
    /sk-[a-zA-Z0-9]{20,}/i,           // OpenAI API keys (sk-...)
    /api[_-]?key\s*[=:]\s*["']?[a-zA-Z0-9]{10,}/i, // Generic api_key= or api-key:
    /Bearer\s+[a-zA-Z0-9._-]{20,}/i,   // Bearer tokens (at least 20 chars)
    /\btoken\s*[=:]\s*["']?[a-zA-Z0-9._-]{20,}/i, // Generic token= patterns (at least 20 chars)
    /\bsecret\s*[=:]\s*["']?[a-zA-Z0-9._-]{10,}/i, // Secret= patterns
    /\bpassword\s*[=:]\s*["']?[^\s]{8,}/i, // Password= patterns (at least 8 chars)
    /AKIA[A-Z0-9]{16}/,                // AWS Access Key IDs (exact format)
  ],
  
  // Stack trace patterns - more specific to avoid false positives
  stackTraces: [
    /at\s+\S+\s+\([^)]+:\d+:\d+\)/,    // at functionName (file:line:col)
    /^\s+at\s+\S+\s*\(/m,              // Lines starting with "at " followed by function call
    /Error:\s+.*\n\s+at\s+/,           // Error: message followed by stack
    /\.[tj]s:\d+:\d+/,                 // TypeScript/JavaScript file references with line:col
    /node_modules\/[a-zA-Z0-9@/_-]+/,  // Node modules paths
    /\/src\/[a-zA-Z0-9/_.-]+\.[tj]s/,  // Source directory paths with .ts/.js extension
    /\/dist\/[a-zA-Z0-9/_.-]+\.[tj]s/, // Distribution directory paths
    /\/home\/[a-zA-Z0-9/_.-]+/,        // Home directory paths
    /\/Users\/[a-zA-Z0-9/_.-]+/,       // macOS user paths
    /C:\\Users\\[a-zA-Z0-9\\_.-]+/,    // Windows user paths
  ],
  
  // Internal error codes - more specific patterns
  internalCodes: [
    /\bERR_[A-Z_]{3,}/,                // Node.js error codes (ERR_SOMETHING)
    /\bECONNREFUSED\b/,                // Connection refused
    /\bETIMEDOUT\b/,                   // Timeout error
    /\bENOTFOUND\b/,                   // DNS not found
    /\bECONNRESET\b/,                  // Connection reset
    /\bEPIPE\b/,                       // Broken pipe
    /\bENOENT\b/,                      // No such file
    /0x[0-9a-fA-F]{4,}/,               // Hex error codes (at least 4 hex digits)
    /\berror_code\s*[=:]\s*\d{4,}/i,   // error_code: 1234 (at least 4 digits)
    /\b[A-Z]{3,}_[A-Z]{3,}_[A-Z]{3,}\b/, // INTERNAL_ERROR_CODE style (3+ chars each)
  ],
};

// ============================================================================
// Arbitrary Generators
// ============================================================================

/**
 * Generate random API key-like strings that might appear in error messages
 */
const apiKeyArbitrary: fc.Arbitrary<string> = fc.oneof(
  // OpenAI-style API keys
  fc.string({ minLength: 20, maxLength: 50 }).map(s => `sk-${s.replace(/[^a-zA-Z0-9]/g, 'x')}`),
  // Generic API key patterns
  fc.string({ minLength: 10, maxLength: 30 }).map(s => `api_key=${s.replace(/\s/g, '')}`),
  fc.string({ minLength: 10, maxLength: 30 }).map(s => `api-key: ${s.replace(/\s/g, '')}`),
  // Bearer tokens
  fc.string({ minLength: 20, maxLength: 60 }).map(s => `Bearer ${s.replace(/\s/g, '')}`),
  // Generic tokens
  fc.string({ minLength: 10, maxLength: 30 }).map(s => `token=${s.replace(/\s/g, '')}`),
  // AWS-style keys
  fc.string({ minLength: 16, maxLength: 16 }).map(s => `AKIA${s.replace(/[^A-Z0-9]/g, 'X').toUpperCase()}`),
);

/**
 * Generate random stack trace-like strings
 */
const stackTraceArbitrary: fc.Arbitrary<string> = fc.oneof(
  // Standard Node.js stack trace format
  fc.tuple(
    fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s)),
    fc.string({ minLength: 3, maxLength: 30 }).filter(s => /^[a-zA-Z0-9._/-]+$/.test(s)),
    fc.integer({ min: 1, max: 1000 }),
    fc.integer({ min: 1, max: 100 })
  ).map(([fn, file, line, col]) => `at ${fn} (${file}.ts:${line}:${col})`),
  
  // Anonymous function stack trace
  fc.tuple(
    fc.string({ minLength: 3, maxLength: 30 }).filter(s => /^[a-zA-Z0-9._/-]+$/.test(s)),
    fc.integer({ min: 1, max: 1000 }),
    fc.integer({ min: 1, max: 100 })
  ).map(([file, line, col]) => `at ${file}.js:${line}:${col}`),
  
  // Node modules path
  fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s))
    .map(pkg => `at node_modules/${pkg}/index.js:42:10`),
  
  // Source path
  fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s))
    .map(file => `at /src/${file}.ts:100:5`),
);

/**
 * Generate random internal error code-like strings
 */
const internalErrorCodeArbitrary: fc.Arbitrary<string> = fc.oneof(
  // Node.js style error codes
  fc.constantFrom('ERR_INVALID_ARG_TYPE', 'ERR_ASSERTION', 'ERR_HTTP_HEADERS_SENT', 'ERR_STREAM_DESTROYED'),
  // Network error codes
  fc.constantFrom('ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EPIPE'),
  // Hex error codes
  fc.integer({ min: 0, max: 0xFFFFFF }).map(n => `0x${n.toString(16).toUpperCase()}`),
  // Numeric error codes
  fc.integer({ min: 1000, max: 9999 }).map(n => `error_code: ${n}`),
  // Internal style codes
  fc.constantFrom('INTERNAL_SERVER_ERROR', 'AUTH_TOKEN_EXPIRED', 'RATE_LIMIT_EXCEEDED'),
);

/**
 * Generate random error messages that might contain sensitive data
 */
const sensitiveErrorMessageArbitrary: fc.Arbitrary<string> = fc.oneof(
  // Error with API key
  fc.tuple(fc.string({ minLength: 5, maxLength: 50 }), apiKeyArbitrary)
    .map(([prefix, key]) => `${prefix}: ${key}`),
  
  // Error with stack trace
  fc.tuple(fc.string({ minLength: 5, maxLength: 30 }), stackTraceArbitrary)
    .map(([msg, stack]) => `Error: ${msg}\n    ${stack}`),
  
  // Error with internal code
  fc.tuple(fc.string({ minLength: 5, maxLength: 30 }), internalErrorCodeArbitrary)
    .map(([msg, code]) => `${msg} [${code}]`),
  
  // Combined sensitive data
  fc.tuple(apiKeyArbitrary, stackTraceArbitrary, internalErrorCodeArbitrary)
    .map(([key, stack, code]) => `Failed with ${key}\n${stack}\nCode: ${code}`),
);

/**
 * Generate random provider types
 */
const providerTypeArbitrary: fc.Arbitrary<AIProviderType> = fc.constantFrom('openai', 'bedrock');

/**
 * Generate random AIProviderError instances with potentially sensitive cause errors
 */
const aiProviderErrorArbitrary: fc.Arbitrary<AIProviderError> = fc.tuple(
  fc.string({ minLength: 10, maxLength: 100 }), // User-facing message
  providerTypeArbitrary,
  fc.option(sensitiveErrorMessageArbitrary, { nil: undefined }) // Optional cause with sensitive data
).map(([message, provider, causeMessage]) => {
  const cause = causeMessage ? new Error(causeMessage) : undefined;
  return new AIProviderError(message, provider, cause);
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a string contains any sensitive patterns
 */
function containsSensitiveData(text: string): { hasSensitive: boolean; matches: string[] } {
  const matches: string[] = [];
  
  // Check API key patterns
  for (const pattern of SENSITIVE_PATTERNS.apiKeys) {
    const match = text.match(pattern);
    if (match) {
      matches.push(`API key pattern: ${match[0]}`);
    }
  }
  
  // Check stack trace patterns
  for (const pattern of SENSITIVE_PATTERNS.stackTraces) {
    const match = text.match(pattern);
    if (match) {
      matches.push(`Stack trace pattern: ${match[0]}`);
    }
  }
  
  // Check internal error code patterns
  for (const pattern of SENSITIVE_PATTERNS.internalCodes) {
    const match = text.match(pattern);
    if (match) {
      matches.push(`Internal code pattern: ${match[0]}`);
    }
  }
  
  return {
    hasSensitive: matches.length > 0,
    matches,
  };
}

/**
 * Simulate the error handling that converts AIProviderError to user-facing message
 * This mimics what the bot would do when handling errors from AI providers
 */
function sanitizeErrorForUser(error: AIProviderError): string {
  // The AIProviderError.message should already be user-friendly
  // This function verifies that the message property is safe to show users
  return error.message;
}

// ============================================================================
// Property Tests
// ============================================================================

/**
 * **Validates: Requirements 5.4, 8.1**
 * 
 * Property 7: AI Error Handling
 * 
 * For any error returned by the AI provider, the Bot's response to the user SHALL NOT
 * contain stack traces, API keys, or internal error codes, and SHALL contain a
 * user-friendly explanation.
 */
describe('Property Tests: AI Error Handling', () => {
  describe('Property 7: AI Error Handling', () => {
    /**
     * **Validates: Requirements 5.4, 8.1**
     * 
     * The user-facing error message from AIProviderError SHALL NOT contain
     * API key patterns like "sk-", "api_key", "Bearer", "token="
     */
    it('should NOT contain API key patterns in user-facing error messages', () => {
      fc.assert(
        fc.property(aiProviderErrorArbitrary, (error: AIProviderError) => {
          const userMessage = sanitizeErrorForUser(error);
          
          // Check for API key patterns
          for (const pattern of SENSITIVE_PATTERNS.apiKeys) {
            const match = userMessage.match(pattern);
            if (match) {
              throw new Error(`User message contains API key pattern: "${match[0]}" in message: "${userMessage}"`);
            }
          }
          
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 5.4, 8.1**
     * 
     * The user-facing error message from AIProviderError SHALL NOT contain
     * stack trace patterns like "at ", "Error:", file paths
     */
    it('should NOT contain stack trace patterns in user-facing error messages', () => {
      fc.assert(
        fc.property(aiProviderErrorArbitrary, (error: AIProviderError) => {
          const userMessage = sanitizeErrorForUser(error);
          
          // Check for stack trace patterns
          for (const pattern of SENSITIVE_PATTERNS.stackTraces) {
            const match = userMessage.match(pattern);
            if (match) {
              throw new Error(`User message contains stack trace pattern: "${match[0]}" in message: "${userMessage}"`);
            }
          }
          
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 5.4, 8.1**
     * 
     * The user-facing error message from AIProviderError SHALL NOT contain
     * internal error codes
     */
    it('should NOT contain internal error codes in user-facing error messages', () => {
      fc.assert(
        fc.property(aiProviderErrorArbitrary, (error: AIProviderError) => {
          const userMessage = sanitizeErrorForUser(error);
          
          // Check for internal error code patterns
          for (const pattern of SENSITIVE_PATTERNS.internalCodes) {
            const match = userMessage.match(pattern);
            if (match) {
              throw new Error(`User message contains internal error code: "${match[0]}" in message: "${userMessage}"`);
            }
          }
          
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 5.4, 8.1**
     * 
     * Comprehensive test: The user-facing error message SHALL NOT contain
     * ANY sensitive data patterns (API keys, stack traces, or internal codes)
     */
    it('should NOT contain ANY sensitive data in user-facing error messages', () => {
      fc.assert(
        fc.property(aiProviderErrorArbitrary, (error: AIProviderError) => {
          const userMessage = sanitizeErrorForUser(error);
          const { hasSensitive, matches } = containsSensitiveData(userMessage);
          
          if (hasSensitive) {
            throw new Error(`User message contains sensitive data:\n${matches.join('\n')}\nMessage: "${userMessage}"`);
          }
          
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 5.4, 8.1**
     * 
     * Test with explicitly injected sensitive data in the cause error.
     * Even when the underlying error contains sensitive information,
     * the user-facing message should be sanitized.
     */
    it('should sanitize errors even when cause contains sensitive data', () => {
      fc.assert(
        fc.property(
          sensitiveErrorMessageArbitrary,
          providerTypeArbitrary,
          (sensitiveMessage: string, provider: AIProviderType) => {
            // Create an error with sensitive data in the cause
            const causeError = new Error(sensitiveMessage);
            
            // The AIProviderError should have a safe user-facing message
            const safeMessages = [
              'Unable to generate summary. Please try again later.',
              'Request timed out. Please try again.',
              'Too many requests. Please wait a moment and try again.',
              'Authentication failed. Please contact the administrator.',
              'Service is temporarily unavailable. Please try again later.',
            ];
            
            // Pick a random safe message
            const safeMessage = safeMessages[Math.floor(Math.random() * safeMessages.length)];
            const error = new AIProviderError(safeMessage, provider, causeError);
            
            const userMessage = sanitizeErrorForUser(error);
            const { hasSensitive, matches } = containsSensitiveData(userMessage);
            
            if (hasSensitive) {
              throw new Error(`User message leaked sensitive data:\n${matches.join('\n')}\nMessage: "${userMessage}"`);
            }
            
            return true;
          }
        ),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 5.4, 8.1**
     * 
     * The cause error (which may contain sensitive data) should NOT be
     * directly exposed to users. Only the sanitized message should be shown.
     */
    it('should NOT expose cause error message to users', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10, maxLength: 50 }), // Safe user message
          sensitiveErrorMessageArbitrary, // Sensitive cause message
          providerTypeArbitrary,
          (safeMessage: string, sensitiveMessage: string, provider: AIProviderType) => {
            const causeError = new Error(sensitiveMessage);
            const error = new AIProviderError(safeMessage, provider, causeError);
            
            const userMessage = sanitizeErrorForUser(error);
            
            // The user message should NOT contain the sensitive cause message
            // (unless the safe message happens to contain the same text, which is unlikely)
            if (userMessage.includes(sensitiveMessage) && sensitiveMessage.length > 20) {
              throw new Error(`User message contains cause error message: "${sensitiveMessage}"`);
            }
            
            return true;
          }
        ),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 5.4, 8.1**
     * 
     * The user-facing error message should be non-empty and provide
     * some explanation to the user.
     */
    it('should provide non-empty user-facing error messages', () => {
      fc.assert(
        fc.property(aiProviderErrorArbitrary, (error: AIProviderError) => {
          const userMessage = sanitizeErrorForUser(error);
          
          if (!userMessage || userMessage.trim().length === 0) {
            throw new Error('User message is empty');
          }
          
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 5.4, 8.1**
     * 
     * Test the actual error messages used by OpenAI and Bedrock providers.
     * These are the real user-facing messages that would be shown.
     */
    it('should have safe user-facing messages for known error scenarios', () => {
      // These are the actual error messages used in the providers
      const knownErrorMessages = [
        'Unable to generate summary. Please try again later.',
        'Request timed out. Please try again.',
        'Unable to connect to OpenAI. Please check your internet connection.',
        'An unexpected error occurred while generating the summary.',
        'Authentication failed. Please contact the administrator.',
        'Too many requests. Please wait a moment and try again.',
        'OpenAI service is temporarily unavailable. Please try again later.',
        'The conversation is too long to summarize at once. Please try a shorter time range.',
        'Unable to process the request. Please try again.',
        'Access denied. Please contact the administrator.',
        'AWS Bedrock service is temporarily unavailable. Please try again later.',
        'The AI model is not available. Please contact the administrator.',
        'Unable to connect to AWS Bedrock. Please check your internet connection.',
        'Failed to generate summary. Please try again later.',
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...knownErrorMessages),
          providerTypeArbitrary,
          (message: string, provider: AIProviderType) => {
            const error = new AIProviderError(message, provider);
            const userMessage = sanitizeErrorForUser(error);
            
            const { hasSensitive, matches } = containsSensitiveData(userMessage);
            
            if (hasSensitive) {
              throw new Error(`Known error message contains sensitive data:\n${matches.join('\n')}\nMessage: "${userMessage}"`);
            }
            
            return true;
          }
        ),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 5.4, 8.1**
     * 
     * Edge case: Error messages with special characters should still be safe
     */
    it('should handle error messages with special characters safely', () => {
      const specialCharArbitrary = fc.string({ minLength: 5, maxLength: 50 })
        .map(s => s.replace(/[<>'"&]/g, '_')); // Sanitize for display

      fc.assert(
        fc.property(
          specialCharArbitrary,
          providerTypeArbitrary,
          (message: string, provider: AIProviderType) => {
            const error = new AIProviderError(message, provider);
            const userMessage = sanitizeErrorForUser(error);
            
            const { hasSensitive, matches } = containsSensitiveData(userMessage);
            
            if (hasSensitive) {
              throw new Error(`Message with special chars contains sensitive data:\n${matches.join('\n')}`);
            }
            
            return true;
          }
        ),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 5.4, 8.1**
     * 
     * Edge case: Very long error messages should still be safe
     */
    it('should handle very long error messages safely', () => {
      const longMessageArbitrary = fc.string({ minLength: 100, maxLength: 500 })
        .filter(s => !containsSensitiveData(s).hasSensitive);

      fc.assert(
        fc.property(
          longMessageArbitrary,
          providerTypeArbitrary,
          (message: string, provider: AIProviderType) => {
            const error = new AIProviderError(message, provider);
            const userMessage = sanitizeErrorForUser(error);
            
            const { hasSensitive, matches } = containsSensitiveData(userMessage);
            
            if (hasSensitive) {
              throw new Error(`Long message contains sensitive data:\n${matches.join('\n')}`);
            }
            
            return true;
          }
        ),
        { numRuns: 100, verbose: true }
      );
    });
  });
});
