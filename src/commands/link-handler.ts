/**
 * Link Command Handler for Telegram Summary Bot
 *
 * Handles the /link command which allows users to link a group chat
 * to a private forum topic for receiving per-group summaries.
 * Also handles the callback query when a user selects a group from
 * the inline keyboard.
 *
 * @module commands/link-handler
 */

import { Message } from '../types';
import { CommandHandler } from './command-router';
import { TelegramClient } from '../telegram/telegram-client';
import { TopicLinkStore, TopicLink } from '../store/topic-link-store';
import { MembershipService } from '../services/membership-service';

/**
 * Represents a candidate group that can be linked
 */
export interface CandidateGroup {
  chatId: number;
  title: string;
}

/**
 * Callback data prefix for link actions
 */
const LINK_CALLBACK_PREFIX = 'link:';

/**
 * Message shown when no groups are available to link
 */
const NO_GROUPS_MESSAGE = 'No groups available to link. Make sure the bot is added to a group where you are also a member.';

/**
 * Message shown when all groups are already linked
 */
const ALL_LINKED_MESSAGE = 'All your groups are already linked. Use /groups to see your linked groups.';

/**
 * Message shown when /link is used outside a private chat
 */
const PRIVATE_ONLY_MESSAGE = 'The /link command can only be used in a private chat with the bot.';

/**
 * Function type for retrieving candidate groups for a user
 */
export type GetCandidateGroups = (userId: number) => Promise<CandidateGroup[]>;

/**
 * Link Command Handler
 *
 * Presents an inline keyboard of available groups for the user to link
 * to a private forum topic.
 */
export class LinkHandler implements CommandHandler {
  constructor(
    private readonly telegramClient: TelegramClient,
    private readonly topicLinkStore: TopicLinkStore,
    private readonly membershipService: MembershipService,
    private readonly getCandidateGroups: GetCandidateGroups,
  ) {}

  async execute(message: Message, _args: string[]): Promise<void> {
    const chatId = message.chat.id;
    const userId = message.from?.id;

    if (message.chat.type !== 'private') {
      await this.telegramClient.sendMessage(chatId, PRIVATE_ONLY_MESSAGE);
      return;
    }

    if (!userId) {
      await this.telegramClient.sendMessage(chatId, 'Could not identify user.');
      return;
    }

    // Get candidate groups the user might belong to
    const candidates = await this.getCandidateGroups(userId);
    if (candidates.length === 0) {
      await this.telegramClient.sendMessage(chatId, NO_GROUPS_MESSAGE);
      return;
    }

    // Verify current membership for each candidate
    const verifiedGroups: CandidateGroup[] = [];
    for (const group of candidates) {
      const isMember = await this.membershipService.isGroupMember(group.chatId, userId);
      if (isMember) {
        verifiedGroups.push(group);
      }
    }

    if (verifiedGroups.length === 0) {
      await this.telegramClient.sendMessage(chatId, NO_GROUPS_MESSAGE);
      return;
    }

    // Filter out already-linked groups
    const existingLinks = await this.topicLinkStore.getUserLinks(userId);
    const linkedGroupIds = new Set(existingLinks.map(link => link.groupChatId));
    const unlinkableGroups = verifiedGroups.filter(g => !linkedGroupIds.has(g.chatId));

    if (unlinkableGroups.length === 0) {
      await this.telegramClient.sendMessage(chatId, ALL_LINKED_MESSAGE);
      return;
    }

    // Build inline keyboard with one button per group
    // If /link is called inside a topic, include the topicThreadId in callback_data
    // so the callback handler links that existing topic instead of creating a new one
    const topicThreadId = message.message_thread_id;
    const buttons = unlinkableGroups.map(group => ([{
      text: group.title,
      callback_data: topicThreadId
        ? `${LINK_CALLBACK_PREFIX}${group.chatId}:${topicThreadId}`
        : `${LINK_CALLBACK_PREFIX}${group.chatId}`,
    }]));

    await this.telegramClient.sendInlineKeyboard(
      chatId,
      'Select a group to link to this topic:',
      { inline_keyboard: buttons },
      topicThreadId,
    );
  }
}

/**
 * Handle the callback query when a user presses a link button
 *
 * @param callbackQueryId - The callback query ID to answer
 * @param callbackData - The callback data string (e.g., "link:-1001234567890")
 * @param userId - The user who pressed the button
 * @param privateChatId - The private chat ID where the button was pressed
 * @param groupTitle - The title of the group being linked
 * @param telegramClient - The Telegram client
 * @param topicLinkStore - The topic link store
 */
export async function handleLinkCallback(
  callbackQueryId: string,
  callbackData: string,
  userId: number,
  privateChatId: number,
  telegramClient: TelegramClient,
  topicLinkStore: TopicLinkStore,
): Promise<void> {
  if (!callbackData.startsWith(LINK_CALLBACK_PREFIX)) {
    await telegramClient.answerCallbackQuery(callbackQueryId, 'Invalid action.');
    return;
  }

  // Parse callback data: "link:<groupChatId>" or "link:<groupChatId>:<existingTopicThreadId>"
  const parts = callbackData.slice(LINK_CALLBACK_PREFIX.length).split(':');
  const groupChatId = parseInt(parts[0], 10);
  const existingTopicThreadId = parts[1] ? parseInt(parts[1], 10) : undefined;

  if (isNaN(groupChatId)) {
    await telegramClient.answerCallbackQuery(callbackQueryId, 'Invalid group.');
    return;
  }

  // Check if already linked
  const existingLink = await topicLinkStore.getLinkByGroup(userId, groupChatId);
  if (existingLink) {
    await telegramClient.answerCallbackQuery(callbackQueryId, 'This group is already linked.');
    return;
  }

  // Fetch the real group title via Telegram API
  let groupTitle = `Group ${groupChatId}`;
  try {
    const chatInfo = await telegramClient.getChat(groupChatId);
    groupTitle = chatInfo.title ?? groupTitle;
  } catch {
    // Use fallback title if getChat fails
  }

  let topicThreadId: number;
  if (existingTopicThreadId && !isNaN(existingTopicThreadId)) {
    // /link was called inside an existing topic — use that topic
    topicThreadId = existingTopicThreadId;
    // Rename the topic to match the group title
    try {
      await telegramClient.editForumTopic(privateChatId, topicThreadId, groupTitle);
    } catch {
      // Renaming is best-effort — continue even if it fails
    }
  } else {
    // /link from General topic — create a new topic
    try {
      const forumTopic = await telegramClient.createForumTopic(privateChatId, groupTitle);
      topicThreadId = forumTopic.message_thread_id;
    } catch (error) {
      console.error('Failed to create forum topic:', error);
      await telegramClient.answerCallbackQuery(callbackQueryId, 'Failed to create topic. Please try again.');
      return;
    }
  }

  // Store the link
  const link: TopicLink = {
    userId,
    topicThreadId,
    groupChatId,
    groupTitle,
    privateChatId,
    linkedAt: Date.now(),
    status: 'active',
  };

  await topicLinkStore.createLink(link);

  // Send confirmation in the new topic
  await telegramClient.sendMessage(
    privateChatId,
    `Linked to <b>${groupTitle}</b>. Summaries for this group will appear here.`,
    topicThreadId,
  );

  await telegramClient.answerCallbackQuery(callbackQueryId, 'Group linked!');
}

/**
 * Parse link callback data to extract the group chat ID
 *
 * @param callbackData - The callback data string
 * @returns The group chat ID, or null if invalid
 */
export function parseLinkCallbackData(callbackData: string): number | null {
  if (!callbackData.startsWith(LINK_CALLBACK_PREFIX)) {
    return null;
  }
  const id = parseInt(callbackData.slice(LINK_CALLBACK_PREFIX.length), 10);
  return isNaN(id) ? null : id;
}

/**
 * Factory function to create a LinkHandler
 */
export function createLinkHandler(
  telegramClient: TelegramClient,
  topicLinkStore: TopicLinkStore,
  membershipService: MembershipService,
  getCandidateGroups: GetCandidateGroups,
): LinkHandler {
  return new LinkHandler(telegramClient, topicLinkStore, membershipService, getCandidateGroups);
}
