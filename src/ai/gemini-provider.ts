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

import { AIProvider, AIProviderError, SummarizeOptions } from './ai-provider';
import { SUMMARY_SYSTEM_PROMPT } from './prompts';

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
    responseSchema?: Record<string, unknown>;
  };
}

/**
 * Gemini generateContent API response format
 */
interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>;
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
const DEFAULT_MAX_TOKENS = 500;

/** Default temperature for focused summarization */
const DEFAULT_TEMPERATURE = 0.3;

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 30000;

/** Maximum number of retries for transient errors (429, 5xx) */
const MAX_RETRIES = 3;

/** Base delay in milliseconds for exponential backoff */
const RETRY_BASE_DELAY_MS = 1000;

/** JSON schema enforced at the API level for structured output */
const SUMMARY_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overview: { type: 'STRING', description: '1-2 sentence overview of the conversation' },
    topics: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Topic name' },
          points: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Key points with @username attribution',
          },
        },
        required: ['title', 'points'],
      },
      description: '3-5 main topics',
    },
    questions: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Open/unresolved questions, empty array if none',
    },
  },
  required: ['overview', 'topics', 'questions'],
};

// ============================================================================
// Gemini Provider Implementation
// ============================================================================

/**
 * Google Gemini Provider Implementation
 *
 * Uses Gemini 2.0 Flash for cost-efficient summarization.
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

  /**
   * Create a new Gemini provider instance
   *
   * @param apiKey - Gemini API key (defaults to GEMINI_API_KEY env var)
   * @param model - Model to use (defaults to LLM_MODEL env var, then gemini-2.0-flash)
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
  }

  /**
   * Generate a summary of the provided messages using Gemini's API
   *
   * @param messages - Array of message strings to summarize
   * @param options - Optional configuration for the summarization
   * @returns Promise resolving to the generated summary text
   * @throws AIProviderError if the API call fails
   */
  async summarize(messages: string[], options?: SummarizeOptions): Promise<string> {
    if (messages.length === 0) {
      return '🧵 **Summary**\nNo messages to summarize.';
    }

    const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = options?.temperature ?? DEFAULT_TEMPERATURE;

    const formattedMessages = messages.join('\n');
    const userPrompt = `Please summarize the following chat conversation:\n\n${formattedMessages}`;

    const requestBody: GeminiRequest = {
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      systemInstruction: {
        parts: [{ text: SUMMARY_SYSTEM_PROMPT }],
      },
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: temperature,
        responseMimeType: 'application/json',
        responseSchema: SUMMARY_RESPONSE_SCHEMA,
      },
    };

    try {
      const response = await this.makeApiRequest(requestBody);
      return this.extractSummaryFromResponse(response);
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
   * Make an API request to Gemini
   *
   * @param requestBody - The request body to send
   * @returns Promise resolving to the API response
   * @throws AIProviderError if the request fails
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
   *
   * @param response - The fetch response object
   * @throws AIProviderError with appropriate user-friendly message
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
   * Extract the summary text from the API response
   *
   * @param response - The API response
   * @returns The summary text
   * @throws AIProviderError if the response is invalid
   */
  private extractSummaryFromResponse(response: GeminiResponse): string {
    if (!response.candidates || response.candidates.length === 0) {
      throw new AIProviderError(
        'Unable to generate summary. Please try again.',
        'gemini'
      );
    }

    const content = response.candidates[0]?.content?.parts?.[0]?.text;
    if (!content) {
      throw new AIProviderError(
        'Unable to generate summary. Please try again.',
        'gemini'
      );
    }

    return content.trim();
  }

  /**
   * Estimate the number of tokens in a text string
   *
   * @param text - The text to estimate tokens for
   * @returns Estimated token count
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Create a Gemini provider instance with default configuration
 *
 * @returns A new GeminiProvider instance
 * @throws AIProviderError if API key is not configured
 */
export function createGeminiProvider(): GeminiProvider {
  return new GeminiProvider();
}
