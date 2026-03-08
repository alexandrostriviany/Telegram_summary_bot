/**
 * Help Command Handler for Telegram Summary Bot
 *
 * Context-aware /help command: shows compact help in groups,
 * full help with private commands in DMs.
 * Uses HTML formatting (matching TelegramClient's parse_mode).
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
 * Compact help message for group chats.
 * Shows only group-relevant commands.
 */
export const GROUP_HELP_MESSAGE = `<b>📚 Summary Bot</b>

<b>Commands:</b>
/summary — Summarize last 24h (default)
/summary 2h — Last 2 hours
/summary 50 — Last 50 messages
/credits — Check remaining credits

💡 DM me for private per-group summaries!`;

/**
 * Full help message for private chats.
 * Includes private commands, linking instructions, and privacy info.
 */
export const PRIVATE_HELP_MESSAGE = `<b>📚 Summary Bot Help</b>

<b>📋 Summary Commands:</b>
/summary — Summarize last 24h (default)
/summary 2h — Last 2 hours
/summary 30m — Last 30 minutes
/summary 50 — Last 50 messages

<b>🔗 Private Summaries:</b>
/link — Link a group to this chat
/unlink — Remove a group link
/groups — List linked groups

<b>📊 Account:</b>
/credits — Check remaining credits

<b>💡 How it works:</b>
1. Tap <b>🔗 Link Group</b> to connect a group
2. Open the group's topic
3. Use /summary for a private summary

🔒 Messages auto-delete after ${DATA_RETENTION_HOURS}h. No data is shared.`;

/**
 * Help Command Handler
 *
 * Context-aware: sends compact help in group chats, full help in private chats.
 *
 * **Validates: Requirements 4.1, 4.2**
 */
export class HelpHandler implements CommandHandler {
  private sendMessage: (chatId: number, text: string) => Promise<void>;

  constructor(
    sendMessage: (chatId: number, text: string) => Promise<void>
  ) {
    this.sendMessage = sendMessage;
  }

  /**
   * Execute the /help command
   *
   * Checks message.chat.type and sends the appropriate help variant.
   */
  async execute(message: Message, _args: string[]): Promise<void> {
    const chatId = message.chat.id;
    const helpText = message.chat.type === 'private'
      ? PRIVATE_HELP_MESSAGE
      : GROUP_HELP_MESSAGE;
    await this.sendMessage(chatId, helpText);
  }
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
