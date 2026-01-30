/**
 * AWS Bedrock Provider Implementation
 * 
 * This module implements the AIProvider interface using AWS Bedrock's Claude 3 Haiku model.
 * It provides cost-efficient summarization with configurable parameters.
 * 
 * @module ai/bedrock-provider
 * 
 * **Validates: Requirements 5.3** - When LLM_PROVIDER is "bedrock", use AWS Bedrock with Claude
 * **Validates: Requirements 5.4** - If AI_Provider fails, respond with user-friendly error message
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
} from '@aws-sdk/client-bedrock-runtime';
import { AIProvider, AIProviderError, SummarizeOptions } from './ai-provider';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Claude API request body format for Bedrock
 */
interface ClaudeRequestBody {
  anthropic_version: string;
  max_tokens: number;
  temperature: number;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  system?: string;
}

/**
 * Claude API response format from Bedrock
 */
interface ClaudeResponseBody {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

/** Claude 3 Haiku model ID for cost efficiency and better performance */
const MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';

/** Anthropic API version for Bedrock */
const ANTHROPIC_VERSION = 'bedrock-2023-05-31';

/** Maximum context tokens for Claude 3 Haiku (200K context window, limited for cost) */
const MAX_CONTEXT_TOKENS = 8192;

/** Default max tokens for response generation */
const DEFAULT_MAX_TOKENS = 500;

/** Default temperature for focused summarization */
const DEFAULT_TEMPERATURE = 0.3;

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
// Bedrock Provider Implementation
// ============================================================================

/**
 * AWS Bedrock Provider Implementation
 * 
 * Uses Claude 3 Haiku for cost-efficient summarization (~$0.00025/1K input tokens).
 * Implements the AIProvider interface for seamless integration with the
 * summary engine.
 * 
 * **Validates: Requirements 5.3** - AWS Bedrock with Claude support
 * **Validates: Requirements 5.4** - Graceful error handling
 */
export class BedrockProvider implements AIProvider {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;
  private readonly maxContextTokens: number;

  /**
   * Create a new Bedrock provider instance
   * 
   * @param region - AWS region (defaults to AWS_REGION env var or us-east-1)
   * @param modelId - Model ID to use (defaults to Claude 3 Haiku)
   * @param client - Optional pre-configured BedrockRuntimeClient for testing
   */
  constructor(
    region?: string,
    modelId: string = MODEL_ID,
    client?: BedrockRuntimeClient
  ) {
    const awsRegion = region ?? process.env.AWS_REGION ?? 'us-east-1';
    
    this.client = client ?? new BedrockRuntimeClient({
      region: awsRegion,
    });
    
    this.modelId = modelId;
    this.maxContextTokens = MAX_CONTEXT_TOKENS;
  }

  /**
   * Generate a summary of the provided messages using AWS Bedrock's Claude API
   * 
   * @param messages - Array of message strings to summarize
   * @param options - Optional configuration for the summarization
   * @returns Promise resolving to the generated summary text
   * @throws AIProviderError if the API call fails
   * 
   * **Validates: Requirements 5.3** - Use AWS Bedrock with Claude for summarization
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

    const requestBody: ClaudeRequestBody = {
      anthropic_version: ANTHROPIC_VERSION,
      max_tokens: maxTokens,
      temperature: temperature,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    };

    try {
      const response = await this.invokeModel(requestBody);
      return this.extractSummaryFromResponse(response);
    } catch (error) {
      // Re-throw AIProviderError as-is
      if (error instanceof AIProviderError) {
        throw error;
      }
      // Wrap other errors
      throw new AIProviderError(
        'Failed to generate summary. Please try again later.',
        'bedrock',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Get the maximum number of context tokens supported by this provider
   * 
   * @returns 8192 tokens (limited for cost efficiency)
   */
  getMaxContextTokens(): number {
    return this.maxContextTokens;
  }

  /**
   * Invoke the Bedrock model with the given request body
   * 
   * @param requestBody - The request body to send
   * @returns Promise resolving to the parsed response
   * @throws AIProviderError if the request fails
   */
  private async invokeModel(requestBody: ClaudeRequestBody): Promise<ClaudeResponseBody> {
    const input: InvokeModelCommandInput = {
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    };

    try {
      const command = new InvokeModelCommand(input);
      const response = await this.client.send(command);

      if (!response.body) {
        throw new AIProviderError(
          'Unable to generate summary. Please try again.',
          'bedrock'
        );
      }

      // Parse the response body
      const responseText = new TextDecoder().decode(response.body);
      const parsedResponse = JSON.parse(responseText) as ClaudeResponseBody;
      
      return parsedResponse;
    } catch (error) {
      // Re-throw AIProviderError as-is
      if (error instanceof AIProviderError) {
        throw error;
      }

      // Handle specific AWS SDK errors
      const errorMessage = this.mapErrorToUserMessage(error);
      throw new AIProviderError(
        errorMessage,
        'bedrock',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Map AWS SDK errors to user-friendly messages
   * 
   * @param error - The error to map
   * @returns User-friendly error message
   */
  private mapErrorToUserMessage(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'Unable to generate summary. Please try again later.';
    }

    const errorName = error.name;
    const errorMessage = error.message.toLowerCase();

    // Map specific error types to user-friendly messages
    // Never expose API keys, internal codes, or technical details
    
    // Access/Authentication errors
    if (errorName === 'AccessDeniedException' || errorMessage.includes('access denied')) {
      return 'Access denied. Please contact the administrator.';
    }
    
    if (errorName === 'UnrecognizedClientException' || errorMessage.includes('credentials')) {
      return 'Authentication failed. Please contact the administrator.';
    }

    // Throttling/Rate limiting
    if (errorName === 'ThrottlingException' || errorMessage.includes('throttl')) {
      return 'Too many requests. Please wait a moment and try again.';
    }

    // Service unavailable
    if (errorName === 'ServiceUnavailableException' || 
        errorName === 'InternalServerException' ||
        errorMessage.includes('service unavailable') ||
        errorMessage.includes('internal server')) {
      return 'AWS Bedrock service is temporarily unavailable. Please try again later.';
    }

    // Model not found
    if (errorName === 'ResourceNotFoundException' || errorMessage.includes('model not found')) {
      return 'The AI model is not available. Please contact the administrator.';
    }

    // Validation errors (e.g., context too long)
    if (errorName === 'ValidationException') {
      if (errorMessage.includes('token') || errorMessage.includes('length')) {
        return 'The conversation is too long to summarize at once. Please try a shorter time range.';
      }
      return 'Unable to process the request. Please try again.';
    }

    // Timeout errors
    if (errorName === 'TimeoutError' || errorMessage.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }

    // Network errors
    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return 'Unable to connect to AWS Bedrock. Please check your internet connection.';
    }

    // Log the actual error for debugging (but don't expose to user)
    console.error('Bedrock API error:', {
      name: errorName,
      // Don't log the full message as it might contain sensitive info
    });

    // Default message
    return 'Unable to generate summary. Please try again later.';
  }

  /**
   * Extract the summary text from the API response
   * 
   * @param response - The API response
   * @returns The summary text
   * @throws AIProviderError if the response is invalid
   */
  private extractSummaryFromResponse(response: ClaudeResponseBody): string {
    if (!response.content || response.content.length === 0) {
      throw new AIProviderError(
        'Unable to generate summary. Please try again.',
        'bedrock'
      );
    }

    // Find the text content in the response
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || !textContent.text) {
      throw new AIProviderError(
        'Unable to generate summary. Please try again.',
        'bedrock'
      );
    }

    return textContent.text.trim();
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
 * Create a Bedrock provider instance with default configuration
 * 
 * @returns A new BedrockProvider instance
 */
export function createBedrockProvider(): BedrockProvider {
  return new BedrockProvider();
}
