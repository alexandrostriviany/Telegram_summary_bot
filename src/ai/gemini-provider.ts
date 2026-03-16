/**
 * Google Gemini Provider Implementation
 *
 * This module implements the AIProvider interface using Google's Gemini API.
 * It provides cost-efficient summarization with configurable parameters.
 *
 * @module ai/gemini-provider
 *
 * **Validates: Requirements 5.2** - When LLM_PROVIDER is "gemini", use Gemini API
 * **Validates: Requirements 5.4** - If AI_Provider fails, respond with user-friendly error message
 */

import { AIProvider, AIProviderError, SummarizeOptions, SummarizeResult, TokenUsage } from './ai-provider';
import { SUMMARY_SYSTEM_PROMPT, SUMMARY_RESPONSE_SCHEMA } from './prompts';
import { GeminiContextCache, createGeminiContextCache } from './gemini-context-cache';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Gemini generateContent API request body
 */
interface GeminiRequest {
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }>;
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
  generationConfig: {
    maxOutputTokens: number;
    temperature: number;
    responseMimeType?: string;
    responseSchema?: object;
    thinkingConfig?: {
      thinkingBudget: number;
    };
  };
  cachedContent?: string;
}

/**
 * Gemini generateContent API response format
 */
interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string; thought?: boolean }>;
      role: string;
    };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Gemini API error response format
 */
interface GeminiErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
  };
}

// ============================================================================
// Constants
// ============================================================================

/** Gemini API base URL */
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Default model for Gemini provider */
const DEFAULT_MODEL = 'gemini-2.5-flash';

/** Maximum context tokens (conservative limit) */
const MAX_CONTEXT_TOKENS = 8192;

/** Default max tokens for response generation */
const DEFAULT_MAX_TOKENS = 2048;

/** Default temperature for focused summarization */
const DEFAULT_TEMPERATURE = 0.3;

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 30000;

/** Maximum number of retries for transient errors (429, 5xx) */
const MAX_RETRIES = 3;

/** Base delay in milliseconds for exponential backoff */
const RETRY_BASE_DELAY_MS = 1000;

// ============================================================================
// Gemini Provider Implementation
// ============================================================================

/**
 * Google Gemini Provider Implementation
 *
 * Uses Gemini 2.5 Flash for cost-efficient summarization.
 * Implements the AIProvider interface for seamless integration with the
 * summary engine.
 *
 * **Validates: Requirements 5.2** - Gemini API support
 * **Validates: Requirements 5.4** - Graceful error handling
 */
export class GeminiProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxContextTokens: number;
  private readonly contextCache: GeminiContextCache;

  /**
   * Create a new Gemini provider instance
   *
   * @param apiKey - Gemini API key (defaults to GEMINI_API_KEY env var)
   * @param model - Model to use (defaults to LLM_MODEL env var, then gemini-2.5-flash)
   * @throws AIProviderError if API key is not configured
   */
  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? process.env.GEMINI_API_KEY ?? '';
    this.model = model ?? process.env.LLM_MODEL ?? DEFAULT_MODEL;
    this.maxContextTokens = MAX_CONTEXT_TOKENS;

    if (!this.apiKey) {
      throw new AIProviderError(
        'Gemini API key is not configured. Please set the GEMINI_API_KEY environment variable.',
        'gemini'
      );
    }

    this.contextCache = createGeminiContextCache(this.apiKey, this.model);
  }

  /**
   * Generate a summary of the provided messages using Gemini's API
   *
   * @param messages - Array of message strings to summarize
   * @param options - Optional configuration for the summarization
   * @returns Promise resolving to the generated summary text
   * @throws AIProviderError if the API call fails
   */
  async summarize(messages: string[], options?: SummarizeOptions): Promise<SummarizeResult> {
    if (messages.length === 0) {
      return { text: '{"t":[],"q":[]}' };
    }

    const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = options?.temperature ?? DEFAULT_TEMPERATURE;

    const formattedMessages = messages.join('\n');
    const userPrompt = `Summarize:\n\n${formattedMessages}`;

    // Try to use cached system instruction
    let cachedContentName: string | null = null;
    try {
      cachedContentName = await this.contextCache.getCachedContentName();
    } catch {
      // Never let caching break summarization
    }

    const requestBody: GeminiRequest = {
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      // Only include systemInstruction if NOT using cached content
      ...(cachedContentName ? {} : {
        systemInstruction: {
          parts: [{ text: SUMMARY_SYSTEM_PROMPT }],
        },
      }),
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: temperature,
        responseMimeType: 'application/json',
        responseSchema: SUMMARY_RESPONSE_SCHEMA,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    };

    // If using cached content, add it to the request
    if (cachedContentName) {
      requestBody.cachedContent = cachedContentName;
      console.log('Using Gemini cached content:', cachedContentName);
    }

    try {
      const response = await this.makeApiRequest(requestBody);
      const text = this.extractSummaryFromResponse(response);
      console.log('Gemini raw summary response:', text);
      const usage = this.extractUsageFromResponse(response);
      return { text, usage };
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }
      throw new AIProviderError(
        'Failed to generate summary. Please try again later.',
        'gemini',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Get the maximum number of context tokens supported by this provider
   *
   * @returns 8192 tokens (conservative limit)
   */
  getMaxContextTokens(): number {
    return this.maxContextTokens;
  }

  /**
   * Make an API request to Gemini with retry and exponential backoff
   */
  private async makeApiRequest(requestBody: GeminiRequest): Promise<GeminiResponse> {
    const url = `${GEMINI_API_BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`;
    let lastError: AIProviderError | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`Gemini API retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const isRetryable = response.status === 429 || response.status >= 500;
          if (isRetryable && attempt < MAX_RETRIES) {
            console.error(`Gemini API error (status ${response.status}), will retry`);
            lastError = new AIProviderError(
              `Gemini API returned status ${response.status}`,
              'gemini'
            );
            continue;
          }
          await this.handleErrorResponse(response);
        }

        const data = await response.json() as GeminiResponse;
        return data;
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === 'AbortError') {
          throw new AIProviderError(
            'Request timed out. Please try again.',
            'gemini',
            error
          );
        }

        if (error instanceof Error && error.message.includes('fetch')) {
          throw new AIProviderError(
            'Unable to connect to Gemini. Please check your internet connection.',
            'gemini',
            error
          );
        }

        if (error instanceof AIProviderError) {
          throw error;
        }

        throw new AIProviderError(
          'An unexpected error occurred while generating the summary.',
          'gemini',
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }

    throw lastError ?? new AIProviderError(
      'Failed after retries. Please try again later.',
      'gemini'
    );
  }

  /**
   * Handle error responses from the Gemini API
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = 'Unable to generate summary. Please try again later.';

    try {
      const errorData = await response.json() as GeminiErrorResponse;

      switch (response.status) {
        case 400:
          if (errorData.error?.message?.toLowerCase().includes('token') ||
              errorData.error?.message?.toLowerCase().includes('length')) {
            errorMessage = 'The conversation is too long to summarize at once. Please try a shorter time range.';
          } else {
            errorMessage = 'Unable to process the request. Please try again.';
          }
          break;
        case 401:
        case 403:
          errorMessage = 'Authentication failed. Please contact the administrator.';
          break;
        case 429:
          errorMessage = 'Too many requests. Please wait a moment and try again.';
          break;
        case 500:
        case 502:
        case 503:
          errorMessage = 'Gemini service is temporarily unavailable. Please try again later.';
          break;
        default:
          errorMessage = 'Unable to generate summary. Please try again later.';
      }

      console.error('Gemini API error:', {
        status: response.status,
        errorStatus: errorData.error?.status,
      });
    } catch {
      console.error('Gemini API error: Unable to parse error response', {
        status: response.status,
      });
    }

    throw new AIProviderError(errorMessage, 'gemini');
  }

  /**
   * Extract the summary text from the API response.
   * Skips thinking parts from Gemini 2.5 models.
   */
  private extractSummaryFromResponse(response: GeminiResponse): string {
    if (!response.candidates || response.candidates.length === 0) {
      throw new AIProviderError(
        'Unable to generate summary. Please try again.',
        'gemini'
      );
    }

    const parts = response.candidates[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      throw new AIProviderError(
        'Unable to generate summary. Please try again.',
        'gemini'
      );
    }

    // Warn if the response was truncated by the token limit
    const finishReason = response.candidates[0]?.finishReason;
    if (finishReason === 'MAX_TOKENS') {
      console.warn('Gemini response was truncated by maxOutputTokens limit');
    }

    // Gemini 2.5 models include thinking parts (thought: true) before the actual response.
    const contentPart = parts.find(part => !part.thought && part.text);
    const content = contentPart?.text;

    if (!content) {
      throw new AIProviderError(
        'Unable to generate summary. Please try again.',
        'gemini'
      );
    }

    return content.trim();
  }

  /**
   * Extract token usage from the API response
   *
   * @param response - The API response
   * @returns TokenUsage if available, undefined otherwise
   */
  private extractUsageFromResponse(response: GeminiResponse): TokenUsage | undefined {
    if (!response.usageMetadata) {
      return undefined;
    }
    return {
      inputTokens: response.usageMetadata.promptTokenCount,
      outputTokens: response.usageMetadata.candidatesTokenCount,
      totalTokens: response.usageMetadata.totalTokenCount,
    };
  }

  /**
   * Estimate the number of tokens in a text string
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Create a Gemini provider instance with default configuration
 */
export function createGeminiProvider(): GeminiProvider {
  return new GeminiProvider();
}
