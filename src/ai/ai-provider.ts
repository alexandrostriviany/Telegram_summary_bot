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
 * Token usage information returned by AI providers
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Result of an AI summarization call, including the text and optional token usage
 */
export interface SummarizeResult {
  text: string;
  usage?: TokenUsage;
}

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
  summarize(messages: string[], options?: SummarizeOptions): Promise<SummarizeResult>;
  
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
export type AIProviderType = 'openai' | 'bedrock' | 'gemini' | 'grok';

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

// Export GeminiProvider from its dedicated module
export { GeminiProvider } from './gemini-provider';

// Export GrokProvider from its dedicated module
export { GrokProvider } from './grok-provider';

// Export FallbackProvider and helpers
export { FallbackProvider, FallbackProviderEntry, isQuotaOrRateLimitError } from './fallback-provider';

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
    case 'gemini':
      // Use require to avoid circular dependency at module load time
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { GeminiProvider: GeminiProviderClass } = require('./gemini-provider');
      return new GeminiProviderClass();
    case 'grok':
      // Use require to avoid circular dependency at module load time
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { GrokProvider: GrokProviderClass } = require('./grok-provider');
      return new GrokProviderClass();
    default:
      // This should never happen due to TypeScript, but handle it for runtime safety
      throw new AIProviderConfigError(
        `Invalid AI provider type: ${type}. Supported types are 'openai', 'bedrock', 'gemini', and 'grok'.`
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
      'Please set it to "openai", "bedrock", "gemini", or "grok".'
    );
  }

  const normalizedValue = envValue.toLowerCase().trim();

  if (normalizedValue !== 'openai' && normalizedValue !== 'bedrock' && normalizedValue !== 'gemini' && normalizedValue !== 'grok') {
    throw new AIProviderConfigError(
      `Invalid LLM_PROVIDER value: "${envValue}". ` +
      'Supported values are "openai", "bedrock", "gemini", and "grok".'
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

// ============================================================================
// Fallback Chain Support
// ============================================================================

const VALID_PROVIDER_TYPES = new Set<string>(['openai', 'bedrock', 'gemini', 'grok']);

/**
 * Parse the LLM_PROVIDER_FALLBACK environment variable into a list of provider types.
 *
 * The variable should contain a comma-separated list of provider names, e.g.
 * "grok,openai" meaning: if the primary fails, try grok, then openai.
 *
 * Invalid provider names are logged and skipped.
 *
 * @returns Array of valid fallback provider types (may be empty)
 */
export function parseFallbackChain(): AIProviderType[] {
  const raw = process.env.LLM_PROVIDER_FALLBACK;
  if (!raw) return [];

  const types: AIProviderType[] = [];
  for (const part of raw.split(',')) {
    const normalized = part.toLowerCase().trim();
    if (!normalized) continue;
    if (VALID_PROVIDER_TYPES.has(normalized)) {
      types.push(normalized as AIProviderType);
    } else {
      console.warn(`Ignoring invalid provider in LLM_PROVIDER_FALLBACK: "${part}"`);
    }
  }
  return types;
}

/**
 * Create an AI provider with optional fallback chain.
 *
 * If LLM_PROVIDER_FALLBACK is set, wraps the primary provider in a
 * FallbackProvider that tries additional providers on quota/rate-limit errors.
 *
 * @param primaryType - The primary provider type
 * @returns An AIProvider (either a single provider or a FallbackProvider)
 */
export function createAIProviderWithFallback(primaryType?: AIProviderType): { provider: AIProvider; providerType: AIProviderType } {
  const type = primaryType ?? getProviderTypeFromEnv();
  const fallbackTypes = parseFallbackChain();

  // If no fallback chain, return the primary provider directly
  if (fallbackTypes.length === 0) {
    return { provider: createAIProvider(type), providerType: type };
  }

  // Build the full chain: primary + fallbacks
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { FallbackProvider: FallbackProviderClass } = require('./fallback-provider');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  type FPEntry = import('./fallback-provider').FallbackProviderEntry;

  const chain: FPEntry[] = [];

  // Try to create the primary provider
  try {
    chain.push({ type, provider: createAIProvider(type) });
  } catch (error) {
    console.warn(`Failed to create primary provider ${type}, skipping: ${error instanceof Error ? error.message : error}`);
  }

  // Try to create each fallback provider
  for (const fbType of fallbackTypes) {
    if (fbType === type) continue; // skip duplicate of primary
    try {
      chain.push({ type: fbType, provider: createAIProvider(fbType) });
    } catch (error) {
      console.warn(`Failed to create fallback provider ${fbType}, skipping: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (chain.length === 0) {
    throw new AIProviderConfigError('No providers could be initialized in the fallback chain.');
  }

  if (chain.length === 1) {
    // Only one provider survived, no need for fallback wrapper
    return { provider: chain[0].provider, providerType: chain[0].type };
  }

  console.log(`AI provider fallback chain: ${chain.map(e => e.type).join(' -> ')}`);
  return { provider: new FallbackProviderClass(chain), providerType: type };
}
