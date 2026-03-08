/**
 * Unlink Command Handler for Telegram Summary Bot
 *
 * Handles the /unlink command which removes the link between a private chat
 * topic and a group chat. Only works inside a linked topic in private chat.
 * Shows a confirmation inline keyboard before proceeding.
 *
 * @module commands/unlink-handler
 */

import { Message, InlineKeyboardMarkup } from '../types';
import { CommandHandler } from './command-router';
import { TopicLinkStore } from '../store/topic-link-store';
import { TelegramClient } from '../telegram/telegram-client';

/**
 * Callback data prefix for unlink confirmation
 */
export const UNLINK_CONFIRM_PREFIX = 'unlink:confirm:';

/**
 * Callback data prefix for unlink cancellation
 */
export const UNLINK_CANCEL_PREFIX = 'unlink:cancel:';

/**
 * Unlink Command Handler
 *
 * Removes the link between a private chat topic and a group chat.
 * Only works inside a linked topic in private chat (message.chat.type === 'private'
 * and message.message_thread_id is present).
 */
export class UnlinkHandler implements CommandHandler {
  private sendMessage: (chatId: number, text: string) => Promise<void>;
  private topicLinkStore: TopicLinkStore;
  private telegramClient: TelegramClient;

  constructor(
    sendMessage: (chatId: number, text: string) => Promise<void>,
    topicLinkStore: TopicLinkStore,
    telegramClient: TelegramClient
  ) {
    this.sendMessage = sendMessage;
    this.topicLinkStore = topicLinkStore;
    this.telegramClient = telegramClient;
  }

  async execute(message: Message, _args: string[]): Promise<void> {
    const chatId = message.chat.id;
    const userId = message.from?.id;
    const topicThreadId = message.message_thread_id;

    // Only works in private chat topics
    if (message.chat.type !== 'private' || !topicThreadId) {
      await this.sendMessage(
        chatId,
        'The /unlink command can only be used inside a linked topic in your private chat with the bot.'
      );
      return;
    }

    if (!userId) {
      await this.sendMessage(chatId, 'Unable to identify the user.');
      return;
    }

    // Look up the link
    const link = await this.topicLinkStore.getLink(userId, topicThreadId);

    if (!link) {
      await this.sendMessage(
        chatId,
        'This topic is not linked to any group. Nothing to unlink.'
      );
      return;
    }

    // Show confirmation inline keyboard
    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          {
            text: 'Yes, unlink',
            callback_data: `${UNLINK_CONFIRM_PREFIX}${userId}:${topicThreadId}`,
          },
          {
            text: 'Cancel',
            callback_data: `${UNLINK_CANCEL_PREFIX}${userId}:${topicThreadId}`,
          },
        ],
      ],
    };

    await this.telegramClient.sendInlineKeyboard(
      chatId,
      `Unlink <b>${link.groupTitle}</b>? This will remove the topic and all its messages.`,
      keyboard,
      topicThreadId
    );
  }

  /**
   * Handle the confirmation callback for unlinking a topic.
   * Called when the user presses "Yes, unlink" on the inline keyboard.
   *
   * @param userId - The user who initiated the unlink
   * @param topicThreadId - The topic thread ID to unlink
   * @param privateChatId - The private chat ID where the topic lives
   * @param callbackQueryId - The callback query ID to answer
   */
  async handleConfirm(
    userId: number,
    topicThreadId: number,
    privateChatId: number,
    callbackQueryId: string
  ): Promise<void> {
    const link = await this.topicLinkStore.getLink(userId, topicThreadId);

    if (!link) {
      await this.telegramClient.answerCallbackQuery(callbackQueryId, 'Link not found.');
      return;
    }

    // Delete the link from the store
    await this.topicLinkStore.deleteLink(userId, topicThreadId);

    // Delete the forum topic
    try {
      await this.telegramClient.deleteForumTopic(privateChatId, topicThreadId);
    } catch (error) {
      console.error(
        `Failed to delete forum topic (chat=${privateChatId}, thread=${topicThreadId}):`,
        error instanceof Error ? error.message : String(error)
      );
    }

    // Answer the callback query
    await this.telegramClient.answerCallbackQuery(callbackQueryId, 'Unlinked successfully.');

    // Send confirmation in General topic (no threadId = General)
    await this.sendMessage(
      privateChatId,
      `Unlinked <b>${link.groupTitle}</b>.`
    );
  }

  /**
   * Handle the cancellation callback for unlinking a topic.
   * Called when the user presses "Cancel" on the inline keyboard.
   *
   * @param callbackQueryId - The callback query ID to answer
   */
  async handleCancel(callbackQueryId: string): Promise<void> {
    await this.telegramClient.answerCallbackQuery(callbackQueryId, 'Unlink cancelled.');
  }
}

/**
 * Create an UnlinkHandler with the given dependencies
 */
export function createUnlinkHandler(
  sendMessage: (chatId: number, text: string) => Promise<void>,
  topicLinkStore: TopicLinkStore,
  telegramClient: TelegramClient
): UnlinkHandler {
  return new UnlinkHandler(sendMessage, topicLinkStore, telegramClient);
}
