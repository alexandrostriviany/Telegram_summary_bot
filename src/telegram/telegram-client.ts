/**
 * Telegram Bot API Client
 * 
 * Provides a wrapper for Telegram Bot API calls with retry logic,
 * error handling, and HTML formatting support.
 * 
 * @module telegram/telegram-client
 */

/**
 * Maximum message length allowed by Telegram
 * Messages longer than this will be truncated
 */
const MAX_MESSAGE_LENGTH = 4096;

/**
 * Truncation suffix to indicate message was cut off
 */
const TRUNCATION_SUFFIX = '\n\n... (message truncated)';

/**
 * Interface for Telegram Bot API client
 * 
 * **Validates: Requirements 1.1** - Send messages to Telegram chats
 */
export interface TelegramClient {
  /**
   * Send a message to a Telegram chat
   * 
   * @param chatId - The chat ID to send the message to
   * @param text - The message text (supports HTML)
   */
  sendMessage(chatId: number, text: string): Promise<void>;
}

/**
 * Configuration options for TelegramBotClient
 */
export interface TelegramClientConfig {
  /** Telegram Bot API token */
  botToken: string;
  /** Number of retry attempts for failed API calls (default: 2) */
  maxRetries?: number;
  /** Base delay in milliseconds between retries (default: 500) */
  baseDelayMs?: number;
  /** Telegram API base URL (default: https://api.telegram.org/bot) */
  apiBaseUrl?: string;
}

/**
 * Error thrown when Telegram API calls fail
 */
export class TelegramApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorDescription?: string
  ) {
    super(message);
    // Restore prototype chain - required for proper instanceof checks
    Object.setPrototypeOf(this, TelegramApiError.prototype);
    this.name = 'TelegramApiError';
  }
}

/**
 * Telegram Bot API response structure
 */
interface TelegramApiResponse {
  ok: boolean;
  description?: string;
  result?: unknown;
  error_code?: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  maxRetries: 2,
  baseDelayMs: 500,
  apiBaseUrl: 'https://api.telegram.org/bot',
};

/**
 * Implementation of TelegramClient using the Telegram Bot API
 * 
 * Features:
 * - Retry logic with exponential backoff (2 retries, 500ms base delay)
 * - Markdown formatting support
 * - Error handling for API failures
 * 
 * **Validates: Requirements 1.1, 3.4, 3.5**
 */
export class TelegramBotClient implements TelegramClient {
  private readonly botToken: string;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly apiBaseUrl: string;

  constructor(config: TelegramClientConfig) {
    if (!config.botToken) {
      throw new Error('Bot token is required');
    }

    this.botToken = config.botToken;
    this.maxRetries = config.maxRetries ?? DEFAULT_CONFIG.maxRetries;
    this.baseDelayMs = config.baseDelayMs ?? DEFAULT_CONFIG.baseDelayMs;
    this.apiBaseUrl = config.apiBaseUrl ?? DEFAULT_CONFIG.apiBaseUrl;
  }

  /**
   * Send a message to a Telegram chat with retry logic
   * 
   * @param chatId - The chat ID to send the message to
   * @param text - The message text (supports HTML)
   * @throws TelegramApiError if all retry attempts fail
   * 
   * **Validates: Requirements 1.1** - Send messages to Telegram chats
   * **Validates: Requirements 3.4** - Format summaries with topic headers, bullet points
   * **Validates: Requirements 3.5** - Handle no messages found case
   */
  async sendMessage(chatId: number, text: string): Promise<void> {
    const url = `${this.apiBaseUrl}${this.botToken}/sendMessage`;
    
    // Truncate message if it exceeds Telegram's limit
    let messageText = text;
    if (text.length > MAX_MESSAGE_LENGTH) {
      const maxLength = MAX_MESSAGE_LENGTH - TRUNCATION_SUFFIX.length;
      messageText = text.substring(0, maxLength) + TRUNCATION_SUFFIX;
      console.warn(`Message truncated from ${text.length} to ${messageText.length} characters`);
    }
    
    // Use HTML mode instead of Markdown for more robust formatting
    const bodyWithHtml = {
      chat_id: chatId,
      text: messageText,
      parse_mode: 'HTML',
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await this.makeApiCall(url, bodyWithHtml);
        return; // Success - exit the retry loop
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Log the error for debugging
        console.error(
          `Telegram API call failed (attempt ${attempt + 1}/${this.maxRetries + 1}):`,
          lastError.message
        );

        // If it's an HTML parsing error (400 with "can't parse entities"), 
        // try sending without parse_mode instead of retrying
        if (lastError instanceof TelegramApiError && 
            lastError.statusCode === 400 && 
            lastError.errorDescription?.includes("can't parse entities")) {
          console.log('HTML parsing failed, retrying without parse_mode');
          try {
            const bodyWithoutParseMode = {
              chat_id: chatId,
              text: this.stripHtml(text),
            };
            await this.makeApiCall(url, bodyWithoutParseMode);
            return; // Success without HTML
          } catch (plainError) {
            lastError = plainError instanceof Error ? plainError : new Error(String(plainError));
            console.error('Plain text send also failed:', lastError.message);
          }
        }

        // Don't retry on the last attempt
        if (attempt < this.maxRetries) {
          // Calculate delay with exponential backoff
          const delay = this.calculateBackoffDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted - throw the last error
    throw lastError ?? new TelegramApiError('Unknown error', 500);
  }

  /**
   * Strip HTML formatting from text
   * 
   * @param text - Text with HTML
   * @returns Plain text without HTML
   */
  private stripHtml(text: string): string {
    return text
      // Remove HTML tags
      .replace(/<b>([^<]+)<\/b>/g, '$1')
      .replace(/<strong>([^<]+)<\/strong>/g, '$1')
      .replace(/<i>([^<]+)<\/i>/g, '$1')
      .replace(/<em>([^<]+)<\/em>/g, '$1')
      .replace(/<u>([^<]+)<\/u>/g, '$1')
      .replace(/<s>([^<]+)<\/s>/g, '$1')
      .replace(/<code>([^<]+)<\/code>/g, '$1')
      .replace(/<pre>([^<]+)<\/pre>/g, '$1')
      .replace(/<a[^>]*>([^<]+)<\/a>/g, '$1');
  }

  /**
   * Make an API call to the Telegram Bot API
   * 
   * @param url - The API endpoint URL
   * @param body - The request body
   * @throws TelegramApiError if the API call fails
   */
  private async makeApiCall(url: string, body: object): Promise<void> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorDescription: string | undefined;
      
      try {
        const errorBody = await response.json() as TelegramApiResponse;
        errorDescription = errorBody.description;
      } catch {
        // Ignore JSON parsing errors for error response
      }

      throw new TelegramApiError(
        `Telegram API error: ${response.status}${errorDescription ? ` - ${errorDescription}` : ''}`,
        response.status,
        errorDescription
      );
    }

    // Verify the response indicates success
    const responseBody = await response.json() as TelegramApiResponse;
    if (!responseBody.ok) {
      throw new TelegramApiError(
        `Telegram API returned error: ${responseBody.description ?? 'Unknown error'}`,
        responseBody.error_code ?? 500,
        responseBody.description
      );
    }
  }

  /**
   * Calculate the backoff delay for a retry attempt
   * Uses exponential backoff: baseDelay * 2^attempt
   * 
   * @param attempt - The current retry attempt (0-indexed)
   * @returns The delay in milliseconds
   */
  private calculateBackoffDelay(attempt: number): number {
    return this.baseDelayMs * Math.pow(2, attempt);
  }

  /**
   * Sleep for a specified duration
   * 
   * @param ms - Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create a TelegramClient instance
 * 
 * @param botToken - Optional bot token (defaults to TELEGRAM_BOT_TOKEN env var)
 * @returns A configured TelegramClient instance
 */
export function createTelegramClient(botToken?: string): TelegramClient {
  const token = botToken ?? process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
  }

  return new TelegramBotClient({ botToken: token });
}
