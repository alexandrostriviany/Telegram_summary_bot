/**
 * AI Provider Interface and Factory
 * 
 * This module defines the provider-agnostic interface for AI summarization
 * and provides a factory function to create the appropriate provider based
 * on configuration.
 * 
 * @module ai/ai-provider
 * 
 * **Validates: Requirements 5.1** - Common interface for summarization regardless of provider
 * **Validates: Requirements 5.2** - Support for OpenAI provider
 * **Validates: Requirements 5.3** - Support for AWS Bedrock with Claude
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Options for customizing the summarization behavior
 * 
 * These options allow fine-tuning of the AI model's output characteristics.
 */
export interface SummarizeOptions {
  /**
   * Maximum number of tokens to generate in the response.
   * Higher values allow for longer summaries but increase cost.
   * Default varies by provider.
   */
  maxTokens?: number;
  
  /**
   * Controls randomness in the output (0.0 to 1.0).
   * Lower values make output more deterministic and focused.
   * Higher values make output more creative and varied.
   * Default: 0.3 (relatively focused for summarization)
   */
  temperature?: number;
}

/**
 * Provider-agnostic interface for AI summarization
 * 
 * This interface abstracts the underlying AI provider (OpenAI, Bedrock, etc.)
 * allowing the application to switch providers without changing business logic.
 * 
 * **Validates: Requirements 5.1** - Common interface for summarization
 */
export interface AIProvider {
  /**
   * Generate a summary of the provided messages
   * 
   * @param messages - Array of message strings to summarize
   * @param options - Optional configuration for the summarization
   * @returns Promise resolving to the generated summary text
   * @throws AIProviderError if summarization fails
   */
  summarize(messages: string[], options?: SummarizeOptions): Promise<string>;
  
  /**
   * Get the maximum number of context tokens supported by this provider
   * 
   * This is used to determine when messages need to be chunked for
   * hierarchical summarization.
   * 
   * @returns Maximum number of tokens that can be sent in a single request
   */
  getMaxContextTokens(): number;
}

/**
 * Supported AI provider types
 */
export type AIProviderType = 'openai' | 'bedrock';

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error thrown when AI provider operations fail
 * 
 * This error wraps provider-specific errors and provides a consistent
 * interface for error handling throughout the application.
 * 
 * **Validates: Requirements 5.4** - Graceful error handling
 */
export class AIProviderError extends Error {
  /** The underlying error from the provider, if available */
  public readonly cause?: Error;
  
  /** The provider type that generated the error */
  public readonly provider: AIProviderType;
  
  constructor(message: string, provider: AIProviderType, cause?: Error) {
    super(message);
    // Restore prototype chain - required for proper instanceof checks
    // See: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html
    Object.setPrototypeOf(this, AIProviderError.prototype);
    this.name = 'AIProviderError';
    this.provider = provider;
    this.cause = cause;
    
    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AIProviderError);
    }
  }
}

/**
 * Error thrown when the AI provider configuration is invalid
 */
export class AIProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    // Restore prototype chain - required for proper instanceof checks
    Object.setPrototypeOf(this, AIProviderConfigError.prototype);
    this.name = 'AIProviderConfigError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AIProviderConfigError);
    }
  }
}

// ============================================================================
// Provider Implementations
// ============================================================================

// Note: OpenAIProvider is imported dynamically in createAIProvider to avoid circular dependency
// Export it here for external use
export { OpenAIProvider } from './openai-provider';

// Export BedrockProvider from its dedicated module
export { BedrockProvider } from './bedrock-provider';

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an AI provider instance based on the specified type
 * 
 * This factory function creates the appropriate provider implementation
 * based on the provider type. It reads from the LLM_PROVIDER environment
 * variable if no type is explicitly provided.
 * 
 * @param providerType - The type of provider to create ('openai' or 'bedrock')
 *                       If not provided, reads from LLM_PROVIDER env var
 * @returns An AIProvider instance for the specified type
 * @throws AIProviderConfigError if the provider type is invalid or not configured
 * 
 * **Validates: Requirements 5.1** - Common interface for summarization
 * **Validates: Requirements 5.2** - OpenAI provider selection
 * **Validates: Requirements 5.3** - Bedrock provider selection
 * 
 * @example
 * // Create provider from environment variable
 * const provider = createAIProvider();
 * 
 * @example
 * // Create specific provider
 * const openaiProvider = createAIProvider('openai');
 * const bedrockProvider = createAIProvider('bedrock');
 */
export function createAIProvider(providerType?: AIProviderType): AIProvider {
  // If no provider type specified, read from environment variable
  const type = providerType ?? getProviderTypeFromEnv();
  
  switch (type) {
    case 'openai':
      // Use require to avoid circular dependency at module load time
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { OpenAIProvider: OpenAIProviderClass } = require('./openai-provider');
      return new OpenAIProviderClass();
    case 'bedrock':
      // Use require to avoid circular dependency at module load time
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { BedrockProvider: BedrockProviderClass } = require('./bedrock-provider');
      return new BedrockProviderClass();
    default:
      // This should never happen due to TypeScript, but handle it for runtime safety
      throw new AIProviderConfigError(
        `Invalid AI provider type: ${type}. Supported types are 'openai' and 'bedrock'.`
      );
  }
}

/**
 * Get the AI provider type from the LLM_PROVIDER environment variable
 * 
 * @returns The provider type from the environment
 * @throws AIProviderConfigError if the environment variable is not set or invalid
 */
export function getProviderTypeFromEnv(): AIProviderType {
  const envValue = process.env.LLM_PROVIDER;
  
  if (!envValue) {
    throw new AIProviderConfigError(
      'LLM_PROVIDER environment variable is not set. ' +
      'Please set it to "openai" or "bedrock".'
    );
  }
  
  const normalizedValue = envValue.toLowerCase().trim();
  
  if (normalizedValue !== 'openai' && normalizedValue !== 'bedrock') {
    throw new AIProviderConfigError(
      `Invalid LLM_PROVIDER value: "${envValue}". ` +
      'Supported values are "openai" and "bedrock".'
    );
  }
  
  return normalizedValue as AIProviderType;
}

/**
 * Check if a valid AI provider is configured
 * 
 * This utility function can be used to verify configuration before
 * attempting to create a provider.
 * 
 * @returns true if a valid provider is configured, false otherwise
 */
export function isAIProviderConfigured(): boolean {
  try {
    getProviderTypeFromEnv();
    return true;
  } catch {
    return false;
  }
}
