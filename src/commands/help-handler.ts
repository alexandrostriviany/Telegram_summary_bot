/**
 * Help Command Handler for Telegram Summary Bot
 * 
 * This module provides the /help command handler that displays available commands,
 * usage examples, and privacy information about data retention.
 * 
 * @module commands/help-handler
 * 
 * **Validates: Requirements 4.1, 4.2**
 */

import { Message } from '../types';
import { CommandHandler } from './command-router';

/**
 * Data retention period in hours
 * Messages are automatically deleted after this period
 */
export const DATA_RETENTION_HOURS = 72;

/**
 * Help message text with available commands and privacy information
 * 
 * Formatted for Telegram readability with emojis and clear sections.
 * Uses Markdown formatting (the TelegramClient uses Markdown by default).
 * 
 * **Validates: Requirements 4.1** - List of available commands and their usage
 * **Validates: Requirements 4.2** - Privacy information explaining data retention
 */
export const HELP_MESSAGE = `📚 *Telegram Summary Bot Help*

🤖 *Available Commands*

• \`/summary\` - Summarize messages from the last 24 hours (default)
• \`/summary 2h\` - Summarize messages from the last 2 hours
• \`/summary 30m\` - Summarize messages from the last 30 minutes
• \`/summary 50\` - Summarize the last 50 messages
• \`/help\` - Show this help message

📝 *Usage Examples*

1️⃣ *Catch up on recent discussions:*
   Just type \`/summary\` to get a summary of the last 24 hours.

2️⃣ *Quick update after a meeting:*
   Use \`/summary 1h\` to see what happened in the last hour.

3️⃣ *Review specific number of messages:*
   Use \`/summary 100\` to summarize the last 100 messages.

🔒 *Privacy Information*

• Messages are stored temporarily for summarization purposes only.
• All messages are automatically deleted after ${DATA_RETENTION_HOURS} hours.
• No message content is shared with third parties.
• Only text messages are stored; media and stickers are ignored.
• The bot uses AI to generate summaries but does not retain conversation history beyond the ${DATA_RETENTION_HOURS}-hour window.

💡 *Tips*

• The bot must have Privacy Mode disabled to read group messages.
• Summaries include topic headers, key points, and open questions.
• For best results, use the bot in active group chats.

Need more help? Contact the bot administrator.`;

/**
 * Help Command Handler
 * 
 * Handles the /help command by sending a formatted help message with:
 * - List of available commands
 * - Usage examples for each command
 * - Privacy information about data retention
 * 
 * **Validates: Requirements 4.1, 4.2**
 */
export class HelpHandler implements CommandHandler {
  private sendMessage: (chatId: number, text: string) => Promise<void>;

  /**
   * Create a new HelpHandler instance
   * 
   * @param sendMessage - Function to send messages to Telegram chats
   */
  constructor(
    sendMessage: (chatId: number, text: string) => Promise<void>
  ) {
    this.sendMessage = sendMessage;
  }

  /**
   * Execute the /help command
   * 
   * Sends the help message to the chat. The TelegramClient uses Markdown
   * formatting by default.
   * 
   * @param message - The Telegram message containing the command
   * @param args - Array of arguments (ignored for /help command)
   * 
   * **Validates: Requirements 4.1** - Respond with list of available commands
   * **Validates: Requirements 4.2** - Include privacy information
   */
  async execute(message: Message, _args: string[]): Promise<void> {
    const chatId = message.chat.id;
    await this.sendMessage(chatId, HELP_MESSAGE);
  }
}

/**
 * Get a plain text version of the help message (fallback if Markdown fails)
 * 
 * @returns Plain text help message without Markdown formatting
 */
export function getPlainTextHelpMessage(): string {
  return `📚 Telegram Summary Bot Help

🤖 Available Commands

• /summary - Summarize messages from the last 24 hours (default)
• /summary 2h - Summarize messages from the last 2 hours
• /summary 30m - Summarize messages from the last 30 minutes
• /summary 50 - Summarize the last 50 messages
• /help - Show this help message

📝 Usage Examples

1️⃣ Catch up on recent discussions:
   Just type /summary to get a summary of the last 24 hours.

2️⃣ Quick update after a meeting:
   Use /summary 1h to see what happened in the last hour.

3️⃣ Review specific number of messages:
   Use /summary 100 to summarize the last 100 messages.

🔒 Privacy Information

• Messages are stored temporarily for summarization purposes only.
• All messages are automatically deleted after ${DATA_RETENTION_HOURS} hours.
• No message content is shared with third parties.
• Only text messages are stored; media and stickers are ignored.
• The bot uses AI to generate summaries but does not retain conversation history beyond the ${DATA_RETENTION_HOURS}-hour window.

💡 Tips

• The bot must have Privacy Mode disabled to read group messages.
• Summaries include topic headers, key points, and open questions.
• For best results, use the bot in active group chats.

Need more help? Contact the bot administrator.`;
}

/**
 * Create a HelpHandler with the given dependencies
 * 
 * @param sendMessage - Function to send messages to Telegram chats
 * @returns Configured HelpHandler instance
 */
export function createHelpHandler(
  sendMessage: (chatId: number, text: string) => Promise<void>
): HelpHandler {
  return new HelpHandler(sendMessage);
}
