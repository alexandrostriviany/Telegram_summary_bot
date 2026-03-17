/**
 * xAI Grok Provider Implementation
 *
 * This module implements the AIProvider interface using xAI's Grok API.
 * The Grok API is OpenAI-compatible (same chat completions format),
 * so this provider follows the same structure as the OpenAI provider.
 *
 * @module ai/grok-provider
 */

import { AIProvider, AIProviderError, SummarizeOptions, SummarizeResult, TokenUsage } from './ai-provider';
import { SUMMARY_SYSTEM_PROMPT } from './prompts';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Chat Completion API request message format (OpenAI-compatible)
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Chat Completion API request body (OpenAI-compatible)
 */
interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  temperature: number;
  response_format?: { type: string };
}

/**
 * Chat Completion API response format (OpenAI-compatible)
 */
interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * API error response format (OpenAI-compatible)
 */
interface GrokErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

// ============================================================================
// Constants
// ============================================================================

/** xAI Grok API endpoint */
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

/** Default model for Grok provider — cheapest non-reasoning option ($0.20/$0.50 per M tokens) */
const DEFAULT_MODEL = 'grok-4-fast-non-reasoning';

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
// Grok Provider Implementation
// ============================================================================

/**
 * xAI Grok Provider Implementation
 *
 * Uses Grok models via xAI's OpenAI-compatible API.
 * Implements the AIProvider interface for seamless integration with the
 * summary engine.
 */
export class GrokProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly model: string;
  private readonly maxContextTokens: number;

  /**
   * Create a new Grok provider instance
   *
   * @param apiKey - xAI API key (defaults to GROK_API_KEY env var)
   * @param apiUrl - API URL (defaults to xAI endpoint)
   * @param model - Model to use (defaults to LLM_MODEL env var, then grok-3-mini-fast)
   * @throws AIProviderError if API key is not configured
   */
  constructor(
    apiKey?: string,
    apiUrl: string = GROK_API_URL,
    model?: string
  ) {
    this.apiKey = apiKey ?? process.env.GROK_API_KEY ?? '';
    this.apiUrl = apiUrl;
    this.model = model ?? process.env.LLM_MODEL ?? DEFAULT_MODEL;
    this.maxContextTokens = MAX_CONTEXT_TOKENS;

    if (!this.apiKey) {
      throw new AIProviderError(
        'Grok API key is not configured. Please set the GROK_API_KEY environment variable.',
        'grok'
      );
    }
  }

  /**
   * Generate a summary of the provided messages using Grok's API
   *
   * @param messages - Array of message strings to summarize
   * @param options - Optional configuration for the summarization
   * @returns Promise resolving to the generated summary result
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

    const requestBody: ChatCompletionRequest = {
      model: this.model,
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: temperature,
      response_format: { type: 'json_object' },
    };

    try {
      const response = await this.makeApiRequest(requestBody);
      const text = this.extractSummaryFromResponse(response);
      console.log('Grok raw summary response:', text);
      const usage = this.extractUsageFromResponse(response);
      return { text, usage };
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }
      throw new AIProviderError(
        'Failed to generate summary. Please try again later.',
        'grok',
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
   * Make an API request to Grok with retry and exponential backoff
   */
  private async makeApiRequest(requestBody: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    let lastError: AIProviderError | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`Grok API retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const isRetryable = response.status === 429 || response.status >= 500;
          if (isRetryable && attempt < MAX_RETRIES) {
            console.error(`Grok API error (status ${response.status}), will retry`);
            lastError = new AIProviderError(
              `Grok API returned status ${response.status}`,
              'grok'
            );
            continue;
          }
          await this.handleErrorResponse(response);
        }

        const data = await response.json() as ChatCompletionResponse;
        return data;
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === 'AbortError') {
          throw new AIProviderError(
            'Request timed out. Please try again.',
            'grok',
            error
          );
        }

        if (error instanceof Error && error.message.includes('fetch')) {
          throw new AIProviderError(
            'Unable to connect to Grok. Please check your internet connection.',
            'grok',
            error
          );
        }

        if (error instanceof AIProviderError) {
          throw error;
        }

        throw new AIProviderError(
          'An unexpected error occurred while generating the summary.',
          'grok',
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }

    throw lastError ?? new AIProviderError(
      'Failed after retries. Please try again later.',
      'grok'
    );
  }

  /**
   * Handle error responses from the Grok API
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = 'Unable to generate summary. Please try again later.';

    try {
      const errorData = await response.json() as GrokErrorResponse;

      switch (response.status) {
        case 400:
          if (errorData.error?.code === 'context_length_exceeded' ||
              errorData.error?.message?.toLowerCase().includes('token') ||
              errorData.error?.message?.toLowerCase().includes('length')) {
            errorMessage = 'The conversation is too long to summarize at once. Please try a shorter time range.';
          } else {
            errorMessage = 'Unable to process the request. Please try again.';
          }
          break;
        case 401:
          errorMessage = 'Authentication failed. Please contact the administrator.';
          break;
        case 402:
          errorMessage = 'Grok API quota exhausted. Please try again later or contact the administrator.';
          break;
        case 429:
          errorMessage = 'Too many requests. Please wait a moment and try again.';
          break;
        case 500:
        case 502:
        case 503:
          errorMessage = 'Grok service is temporarily unavailable. Please try again later.';
          break;
        default:
          errorMessage = 'Unable to generate summary. Please try again later.';
      }

      console.error('Grok API error:', {
        status: response.status,
        type: errorData.error?.type,
        code: errorData.error?.code,
        message: errorData.error?.message,
      });
    } catch {
      console.error('Grok API error: Unable to parse error response', {
        status: response.status,
      });
    }

    throw new AIProviderError(errorMessage, 'grok');
  }

  /**
   * Extract the summary text from the API response
   */
  private extractSummaryFromResponse(response: ChatCompletionResponse): string {
    if (!response.choices || response.choices.length === 0) {
      throw new AIProviderError(
        'Unable to generate summary. Please try again.',
        'grok'
      );
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new AIProviderError(
        'Unable to generate summary. Please try again.',
        'grok'
      );
    }

    return content.trim();
  }

  /**
   * Extract token usage from the API response
   */
  private extractUsageFromResponse(response: ChatCompletionResponse): TokenUsage | undefined {
    if (!response.usage) {
      return undefined;
    }
    return {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
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
 * Create a Grok provider instance with default configuration
 */
export function createGrokProvider(): GrokProvider {
  return new GrokProvider();
}
