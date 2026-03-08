/**
 * Start Command Handler for Telegram Summary Bot
 *
 * Handles the /start command with different behaviors:
 * - Group chat: brief message about being active
 * - Private chat (no args): onboarding welcome with reply keyboard
 * - Private chat with deep link (link_<chatId>): auto-trigger linking flow
 *
 * @module commands/start-handler
 */

import { Message, ReplyKeyboardMarkup } from '../types';
import { CommandHandler } from './command-router';
import { TelegramClient } from '../telegram/telegram-client';
import { TopicLinkStore } from '../store/topic-link-store';
import { MembershipService } from '../services/membership-service';

/**
 * Reply keyboard shown to users in private chat
 */
export const START_REPLY_KEYBOARD: ReplyKeyboardMarkup = {
  keyboard: [
    [{ text: '\u{1F517} Link Group' }, { text: '\u{1F4CB} My Groups' }],
    [{ text: '\u{1F4CA} Credits' }, { text: '\u2753 Help' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

/**
 * Welcome message for private chat onboarding (HTML format)
 */
export const WELCOME_MESSAGE = `<b>\u{1F44B} Welcome to Summary Bot!</b>

I generate AI-powered summaries of your group chats \u2014 delivered privately here.

<b>Quick Start:</b>
1. Tap <b>\u{1F517} Link Group</b> to connect a group
2. Open the group's topic
3. Use /summary to get a private summary

Use the buttons below or type /help for more info.`;

/**
 * Message sent when /start is used in a group chat
 */
export const GROUP_START_MESSAGE =
  "I'm active here! Use /summary to get a chat summary, or DM me for private summaries.";

/**
 * Start Command Handler
 *
 * Routes /start to the appropriate flow based on context:
 * group, private onboarding, or deep-link auto-linking.
 */
export class StartHandler implements CommandHandler {
  constructor(
    private readonly sendMessage: (chatId: number, text: string) => Promise<void>,
    private readonly telegramClient: TelegramClient,
    private readonly topicLinkStore: TopicLinkStore,
    private readonly membershipService: MembershipService,
  ) {}

  async execute(message: Message, args: string[]): Promise<void> {
    const chatId = message.chat.id;

    // Group context: brief acknowledgement
    if (message.chat.type !== 'private') {
      await this.sendMessage(chatId, GROUP_START_MESSAGE);
      return;
    }

    // Deep link: /start link_<groupChatId>
    if (args.length > 0 && args[0].startsWith('link_')) {
      await this.handleDeepLink(message, args[0]);
      return;
    }

    // Private chat onboarding: welcome + reply keyboard
    await this.telegramClient.sendWithReplyKeyboard(
      chatId,
      WELCOME_MESSAGE,
      START_REPLY_KEYBOARD,
    );
  }

  /**
   * Handle a deep link payload like "link_-1001234567890".
   * Verifies membership and triggers the linking flow.
   */
  private async handleDeepLink(message: Message, payload: string): Promise<void> {
    const chatId = message.chat.id;
    const userId = message.from?.id;

    if (!userId) {
      await this.sendMessage(chatId, 'Could not identify user.');
      return;
    }

    const groupChatIdStr = payload.slice('link_'.length);
    const groupChatId = parseInt(groupChatIdStr, 10);

    if (isNaN(groupChatId)) {
      await this.sendMessage(chatId, 'Invalid link. Please try again from the group.');
      return;
    }

    // Verify user is a member of the group
    const isMember = await this.membershipService.isGroupMember(groupChatId, userId);
    if (!isMember) {
      await this.sendMessage(chatId, 'You are not a member of that group.');
      return;
    }

    // Check if already linked
    const existingLink = await this.topicLinkStore.getLinkByGroup(userId, groupChatId);
    if (existingLink) {
      await this.sendMessage(
        chatId,
        `You already have a link to <b>${existingLink.groupTitle}</b>. Use /groups to see your links.`,
      );
      return;
    }

    // Fetch group title
    let groupTitle = `Group ${groupChatId}`;
    try {
      const chatInfo = await this.telegramClient.getChat(groupChatId);
      groupTitle = chatInfo.title ?? groupTitle;
    } catch {
      // Use fallback title
    }

    // Create a forum topic for this group
    let topicThreadId: number;
    try {
      const forumTopic = await this.telegramClient.createForumTopic(chatId, groupTitle);
      topicThreadId = forumTopic.message_thread_id;
    } catch (error) {
      console.error('Failed to create forum topic for deep link:', error);
      await this.sendMessage(chatId, 'Failed to create a topic. Please try /link instead.');
      return;
    }

    // Store the link
    await this.topicLinkStore.createLink({
      userId,
      topicThreadId,
      groupChatId,
      groupTitle,
      privateChatId: chatId,
      linkedAt: Date.now(),
      status: 'active',
    });

    // Confirm in the new topic
    await this.telegramClient.sendMessage(
      chatId,
      `Linked to <b>${groupTitle}</b>. Summaries for this group will appear here.`,
      topicThreadId,
    );
  }
}

/**
 * Factory function to create a StartHandler
 */
export function createStartHandler(
  sendMessage: (chatId: number, text: string) => Promise<void>,
  telegramClient: TelegramClient,
  topicLinkStore: TopicLinkStore,
  membershipService: MembershipService,
): StartHandler {
  return new StartHandler(sendMessage, telegramClient, topicLinkStore, membershipService);
}
