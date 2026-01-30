/**
 * OpenAI Provider Implementation
 * 
 * This module implements the AIProvider interface using OpenAI's GPT-3.5-turbo model.
 * It provides cost-efficient summarization with configurable parameters.
 * 
 * @module ai/openai-provider
 * 
 * **Validates: Requirements 5.2** - When LLM_PROVIDER is "openai", use OpenAI API
 * **Validates: Requirements 5.4** - If AI_Provider fails, respond with user-friendly error message
 */

import fetch, { Response } from 'node-fetch';
import { AIProvider, AIProviderError, SummarizeOptions } from './ai-provider';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * OpenAI Chat Completion API request message format
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * OpenAI Chat Completion API request body
 */
interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  temperature: number;
}

/**
 * OpenAI Chat Completion API response format
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
 * OpenAI API error response format
 */
interface OpenAIErrorResponse {
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

/** OpenAI API endpoint for chat completions */
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/** Model to use for summarization - GPT-3.5-turbo for cost efficiency */
const MODEL = 'gpt-3.5-turbo';

/** Maximum context tokens for GPT-3.5-turbo (4K context window) */
const MAX_CONTEXT_TOKENS = 4096;

/** Default max tokens for response generation */
const DEFAULT_MAX_TOKENS = 500;

/** Default temperature for focused summarization */
const DEFAULT_TEMPERATURE = 0.3;

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 30000;

// ============================================================================
// Summarization Prompt
// ============================================================================

/**
 * System prompt for chat summarization
 * 
 * This prompt instructs the AI to generate structured summaries with:
 * - Topic headers
 * - Bullet points for key information
 * - Open questions section
 */
const SYSTEM_PROMPT = `You are a helpful assistant that summarizes group chat conversations.

**CRITICAL: You MUST write your entire response in the SAME LANGUAGE as the chat messages.**
- First, identify the language of the messages (e.g., Ukrainian, Russian, English, etc.)
- Then write ALL parts of your summary in that language, including headers and labels
- Do NOT use English if the messages are in another language
- Example: If messages are in Ukrainian, write "🧵 *Підсумок*" not "🧵 *Summary*"

**TELEGRAM MARKDOWN FORMATTING (MANDATORY):**
- Use *single asterisks* for bold (NOT **double**)
- Use _underscores_ for italic
- Do NOT nest formatting (no bold inside italic or vice versa)
- Escape these characters with backslash when used literally: _ * \` [
- Keep formatting simple and minimal

**Attribution:**
- Use participant names when describing who said, proposed, or did something
- For forwarded messages (marked as "forwarded from X"), attribute the content to the original author X

Your task is to create a concise, well-structured summary of the provided chat messages.

Format your summary as follows:
1. Start with a brief overview (1-2 sentences)
2. List the main topics discussed with bullet points
3. For each topic, include key points, who proposed them, and any decisions made
4. End with an "Open Questions" section listing any unresolved questions

Guidelines:
- Be concise but capture all important information
- Group related messages into topics
- Preserve important context and decisions
- Identify action items and who is responsible
- Note any questions that were asked but not answered
- Attribute proposals and opinions to specific people

Output format (translate labels to match message language):
🧵 *Summary*
[Brief overview]

*Topics Discussed:*
• *[Topic 1]* – [Key points with attribution]
• *[Topic 2]* – [Key points with attribution]

❓ *Open Questions:*
• [Question 1]

If there are no open questions, omit that section.`;

// ============================================================================
// OpenAI Provider Implementation
// ============================================================================

/**
 * OpenAI Provider Implementation
 * 
 * Uses GPT-3.5-turbo for cost-efficient summarization (~$0.002/1K tokens).
 * Implements the AIProvider interface for seamless integration with the
 * summary engine.
 * 
 * **Validates: Requirements 5.2** - OpenAI API support
 * **Validates: Requirements 5.4** - Graceful error handling
 */
export class OpenAIProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly model: string;
  private readonly maxContextTokens: number;

  /**
   * Create a new OpenAI provider instance
   * 
   * @param apiKey - OpenAI API key (defaults to OPENAI_API_KEY env var)
   * @param apiUrl - OpenAI API URL (defaults to standard endpoint)
   * @param model - Model to use (defaults to gpt-3.5-turbo)
   * @throws AIProviderError if API key is not configured
   */
  constructor(
    apiKey?: string,
    apiUrl: string = OPENAI_API_URL,
    model: string = MODEL
  ) {
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.apiUrl = apiUrl;
    this.model = model;
    this.maxContextTokens = MAX_CONTEXT_TOKENS;

    if (!this.apiKey) {
      throw new AIProviderError(
        'OpenAI API key is not configured. Please set the OPENAI_API_KEY environment variable.',
        'openai'
      );
    }
  }

  /**
   * Generate a summary of the provided messages using OpenAI's API
   * 
   * @param messages - Array of message strings to summarize
   * @param options - Optional configuration for the summarization
   * @returns Promise resolving to the generated summary text
   * @throws AIProviderError if the API call fails
   * 
   * **Validates: Requirements 5.2** - Use OpenAI API for summarization
   * **Validates: Requirements 5.4** - Handle API errors gracefully
   */
  async summarize(messages: string[], options?: SummarizeOptions): Promise<string> {
    if (messages.length === 0) {
      return '🧵 **Summary**\nNo messages to summarize.';
    }

    const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = options?.temperature ?? DEFAULT_TEMPERATURE;

    // Format messages for the prompt
    const formattedMessages = messages.join('\n');
    const userPrompt = `Please summarize the following chat conversation:\n\n${formattedMessages}`;

    const requestBody: ChatCompletionRequest = {
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: temperature,
    };

    try {
      const response = await this.makeApiRequest(requestBody);
      return this.extractSummaryFromResponse(response);
    } catch (error) {
      // Re-throw AIProviderError as-is
      if (error instanceof AIProviderError) {
        throw error;
      }
      // Wrap other errors
      throw new AIProviderError(
        'Failed to generate summary. Please try again later.',
        'openai',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Get the maximum number of context tokens supported by this provider
   * 
   * @returns 4096 tokens (GPT-3.5-turbo context window)
   */
  getMaxContextTokens(): number {
    return this.maxContextTokens;
  }

  /**
   * Make an API request to OpenAI
   * 
   * @param requestBody - The request body to send
   * @returns Promise resolving to the API response
   * @throws AIProviderError if the request fails
   */
  private async makeApiRequest(requestBody: ChatCompletionRequest): Promise<ChatCompletionResponse> {
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
        await this.handleErrorResponse(response);
      }

      const data = await response.json() as ChatCompletionResponse;
      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AIProviderError(
          'Request timed out. Please try again.',
          'openai',
          error
        );
      }

      // Handle network errors
      if (error instanceof Error && error.message.includes('fetch')) {
        throw new AIProviderError(
          'Unable to connect to OpenAI. Please check your internet connection.',
          'openai',
          error
        );
      }

      // Re-throw AIProviderError as-is
      if (error instanceof AIProviderError) {
        throw error;
      }

      // Wrap other errors
      throw new AIProviderError(
        'An unexpected error occurred while generating the summary.',
        'openai',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Handle error responses from the OpenAI API
   * 
   * @param response - The fetch response object
   * @throws AIProviderError with appropriate user-friendly message
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = 'Unable to generate summary. Please try again later.';

    try {
      const errorData = await response.json() as OpenAIErrorResponse;
      
      // Map specific error types to user-friendly messages
      // Never expose API keys, internal codes, or technical details
      switch (response.status) {
        case 401:
          errorMessage = 'Authentication failed. Please contact the administrator.';
          break;
        case 429:
          errorMessage = 'Too many requests. Please wait a moment and try again.';
          break;
        case 500:
        case 502:
        case 503:
          errorMessage = 'OpenAI service is temporarily unavailable. Please try again later.';
          break;
        case 400:
          // Handle specific 400 errors without exposing details
          if (errorData.error?.code === 'context_length_exceeded') {
            errorMessage = 'The conversation is too long to summarize at once. Please try a shorter time range.';
          } else {
            errorMessage = 'Unable to process the request. Please try again.';
          }
          break;
        default:
          errorMessage = 'Unable to generate summary. Please try again later.';
      }

      // Log the actual error for debugging (but don't expose to user)
      console.error('OpenAI API error:', {
        status: response.status,
        type: errorData.error?.type,
        code: errorData.error?.code,
        // Don't log the full message as it might contain sensitive info
      });
    } catch {
      // If we can't parse the error response, use the generic message
      console.error('OpenAI API error: Unable to parse error response', {
        status: response.status,
      });
    }

    throw new AIProviderError(errorMessage, 'openai');
  }

  /**
   * Extract the summary text from the API response
   * 
   * @param response - The API response
   * @returns The summary text
   * @throws AIProviderError if the response is invalid
   */
  private extractSummaryFromResponse(response: ChatCompletionResponse): string {
    if (!response.choices || response.choices.length === 0) {
      throw new AIProviderError(
        'Unable to generate summary. Please try again.',
        'openai'
      );
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new AIProviderError(
        'Unable to generate summary. Please try again.',
        'openai'
      );
    }

    return content.trim();
  }

  /**
   * Estimate the number of tokens in a text string
   * 
   * This is a rough estimation using the rule of thumb that
   * 1 token ≈ 4 characters for English text.
   * 
   * @param text - The text to estimate tokens for
   * @returns Estimated token count
   */
  static estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    // This is a conservative estimate to avoid exceeding limits
    return Math.ceil(text.length / 4);
  }
}

/**
 * Create an OpenAI provider instance with default configuration
 * 
 * @returns A new OpenAIProvider instance
 * @throws AIProviderError if API key is not configured
 */
export function createOpenAIProvider(): OpenAIProvider {
  return new OpenAIProvider();
}
