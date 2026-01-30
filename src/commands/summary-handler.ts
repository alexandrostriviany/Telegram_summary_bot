/**
 * Summary Command Handler for Telegram Summary Bot
 * 
 * This module provides the /summary command handler with parameter parsing
 * for time-based (e.g., "1h", "30m") and count-based (e.g., "50", "100") ranges.
 * 
 * @module commands/summary-handler
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */

import { Message, MessageRange } from '../types';
import { CommandHandler } from './command-router';
import { handleError, formatErrorForTelegram } from '../errors/error-handler';

/**
 * Default summary time window in hours when no parameter is provided
 * 
 * **Validates: Requirements 3.1**
 */
export const DEFAULT_SUMMARY_HOURS = 24;

/**
 * Regular expression for parsing time parameters
 * Matches formats like "1h", "2h", "30m", "45m"
 */
const TIME_PATTERN = /^(\d+)(h|m)$/i;

/**
 * Regular expression for parsing count parameters
 * Matches positive integers like "50", "100"
 */
const COUNT_PATTERN = /^(\d+)$/;

/**
 * Maximum allowed value for time parameter (in hours)
 * Prevents unreasonably large time ranges
 */
const MAX_TIME_HOURS = 168; // 1 week

/**
 * Maximum allowed value for count parameter
 * Prevents unreasonably large message counts
 */
const MAX_COUNT = 10000;

/**
 * Parse a time parameter string into hours
 * 
 * Converts time strings like "1h", "2h", "30m" into their equivalent in hours.
 * Minutes are converted to fractional hours (e.g., "30m" → 0.5).
 * 
 * @param arg - The time parameter string to parse (e.g., "1h", "30m")
 * @returns The time value in hours, or null if the format is invalid
 * 
 * @example
 * parseTimeParameter("1h")  // Returns 1
 * parseTimeParameter("2h")  // Returns 2
 * parseTimeParameter("30m") // Returns 0.5
 * parseTimeParameter("90m") // Returns 1.5
 * parseTimeParameter("abc") // Returns null
 * 
 * **Validates: Requirements 3.2**
 */
export function parseTimeParameter(arg: string): number | null {
  if (!arg) {
    return null;
  }

  const match = arg.trim().match(TIME_PATTERN);
  if (!match) {
    return null;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  if (value <= 0) {
    return null;
  }

  // Validate against maximum allowed value
  if (unit === 'h' && value > MAX_TIME_HOURS) {
    return null;
  }
  if (unit === 'm' && value > MAX_TIME_HOURS * 60) {
    return null;
  }

  if (unit === 'h') {
    return value;
  } else if (unit === 'm') {
    // Convert minutes to hours
    return value / 60;
  }

  return null;
}

/**
 * Parse a count parameter string into a number
 * 
 * Converts count strings like "50", "100" into their numeric values.
 * Only positive integers are valid.
 * 
 * @param arg - The count parameter string to parse (e.g., "50", "100")
 * @returns The count value as a number, or null if the format is invalid
 * 
 * @example
 * parseCountParameter("50")  // Returns 50
 * parseCountParameter("100") // Returns 100
 * parseCountParameter("0")   // Returns null (must be positive)
 * parseCountParameter("-5")  // Returns null (must be positive)
 * parseCountParameter("abc") // Returns null
 * 
 * **Validates: Requirements 3.3**
 */
export function parseCountParameter(arg: string): number | null {
  if (!arg) {
    return null;
  }

  const trimmed = arg.trim();
  const match = trimmed.match(COUNT_PATTERN);
  if (!match) {
    return null;
  }

  const value = parseInt(match[1], 10);
  
  // Must be a positive integer
  if (value <= 0) {
    return null;
  }

  // Validate against maximum allowed value
  if (value > MAX_COUNT) {
    return null;
  }

  return value;
}

/**
 * Parse a summary parameter and determine if it's a time or count range
 * 
 * This function attempts to parse the argument as either a time parameter
 * (e.g., "1h", "30m") or a count parameter (e.g., "50", "100").
 * If no argument is provided, it returns the default 24-hour time range.
 * 
 * @param arg - The parameter string to parse, or undefined/empty for default
 * @returns A MessageRange object with type and value, or null if invalid
 * 
 * @example
 * parseSummaryParameter(undefined) // Returns { type: 'time', value: 24 }
 * parseSummaryParameter("")        // Returns { type: 'time', value: 24 }
 * parseSummaryParameter("1h")      // Returns { type: 'time', value: 1 }
 * parseSummaryParameter("30m")     // Returns { type: 'time', value: 0.5 }
 * parseSummaryParameter("50")      // Returns { type: 'count', value: 50 }
 * parseSummaryParameter("invalid") // Returns null
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */
export function parseSummaryParameter(arg?: string): MessageRange | null {
  // Default to 24 hours when no parameter is provided
  if (!arg || arg.trim() === '') {
    return {
      type: 'time',
      value: DEFAULT_SUMMARY_HOURS,
    };
  }

  const trimmedArg = arg.trim();

  // First, try to parse as a time parameter (e.g., "1h", "30m")
  const timeValue = parseTimeParameter(trimmedArg);
  if (timeValue !== null) {
    return {
      type: 'time',
      value: timeValue,
    };
  }

  // Then, try to parse as a count parameter (e.g., "50", "100")
  const countValue = parseCountParameter(trimmedArg);
  if (countValue !== null) {
    return {
      type: 'count',
      value: countValue,
    };
  }

  // Invalid parameter format
  return null;
}

/**
 * Error message for invalid summary parameters
 */
const INVALID_PARAMETER_MESSAGE = `❌ Invalid parameter format.

Usage:
• /summary - Summarize last 24 hours (default)
• /summary 2h - Summarize last 2 hours
• /summary 30m - Summarize last 30 minutes
• /summary 50 - Summarize last 50 messages

Type /help for more information.`;

/**
 * Summary Command Handler
 * 
 * Handles the /summary command by parsing parameters and generating summaries.
 * Supports time-based ranges (e.g., "1h", "30m") and count-based ranges (e.g., "50").
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */
export class SummaryHandler implements CommandHandler {
  private sendMessage: (chatId: number, text: string) => Promise<void>;
  private generateSummary: (chatId: number, range: MessageRange) => Promise<string>;

  /**
   * Create a new SummaryHandler instance
   * 
   * @param sendMessage - Function to send messages to Telegram chats
   * @param generateSummary - Function to generate summaries for a chat
   */
  constructor(
    sendMessage: (chatId: number, text: string) => Promise<void>,
    generateSummary: (chatId: number, range: MessageRange) => Promise<string>
  ) {
    this.sendMessage = sendMessage;
    this.generateSummary = generateSummary;
  }

  /**
   * Execute the /summary command
   * 
   * Parses the command arguments to determine the message range,
   * generates a summary, and sends it to the chat.
   * 
   * @param message - The Telegram message containing the command
   * @param args - Array of arguments parsed from the command
   * 
   * **Validates: Requirements 3.1** - Default 24h when no parameter
   * **Validates: Requirements 3.2** - Parse time parameters
   * **Validates: Requirements 3.3** - Parse count parameters
   */
  async execute(message: Message, args: string[]): Promise<void> {
    const chatId = message.chat.id;
    
    // Parse the first argument (if any)
    const arg = args.length > 0 ? args[0] : undefined;
    const range = parseSummaryParameter(arg);

    if (range === null) {
      // Invalid parameter format
      await this.sendMessage(chatId, INVALID_PARAMETER_MESSAGE);
      return;
    }

    try {
      // Generate and send the summary
      const summary = await this.generateSummary(chatId, range);
      await this.sendMessage(chatId, summary);
    } catch (error) {
      // Use centralized error handling
      const errorResponse = handleError(error instanceof Error ? error : new Error(String(error)));
      const userMessage = formatErrorForTelegram(errorResponse);
      await this.sendMessage(chatId, userMessage);
    }
  }
}

/**
 * Create a SummaryHandler with the given dependencies
 * 
 * @param sendMessage - Function to send messages to Telegram chats
 * @param generateSummary - Function to generate summaries for a chat
 * @returns Configured SummaryHandler instance
 */
export function createSummaryHandler(
  sendMessage: (chatId: number, text: string) => Promise<void>,
  generateSummary: (chatId: number, range: MessageRange) => Promise<string>
): SummaryHandler {
  return new SummaryHandler(sendMessage, generateSummary);
}
