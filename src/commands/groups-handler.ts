/**
 * Groups Command Handler for Telegram Summary Bot
 *
 * Handles the /groups command which lists all groups linked to the user's
 * private chat topics. Works in private chat (General topic or any context).
 *
 * @module commands/groups-handler
 */

import { Message } from '../types';
import { CommandHandler } from './command-router';
import { TopicLinkStore, TopicLink } from '../store/topic-link-store';

/**
 * Groups Command Handler
 *
 * Lists all groups currently linked to private chat topics for the user.
 * Shows group name and status (active/closed).
 */
export class GroupsHandler implements CommandHandler {
  private sendMessage: (chatId: number, text: string) => Promise<void>;
  private topicLinkStore: TopicLinkStore;

  constructor(
    sendMessage: (chatId: number, text: string) => Promise<void>,
    topicLinkStore: TopicLinkStore
  ) {
    this.sendMessage = sendMessage;
    this.topicLinkStore = topicLinkStore;
  }

  async execute(message: Message, _args: string[]): Promise<void> {
    const chatId = message.chat.id;
    const userId = message.from?.id;

    // Only works in private chat
    if (message.chat.type !== 'private') {
      await this.sendMessage(
        chatId,
        'The /groups command can only be used in your private chat with the bot.'
      );
      return;
    }

    if (!userId) {
      await this.sendMessage(chatId, 'Unable to identify the user.');
      return;
    }

    const links = await this.topicLinkStore.getUserLinks(userId);

    if (links.length === 0) {
      await this.sendMessage(
        chatId,
        'No groups linked yet. Use /link to get started.'
      );
      return;
    }

    const groupList = this.formatGroupList(links);
    await this.sendMessage(chatId, groupList);
  }

  /**
   * Format the list of linked groups for display
   */
  private formatGroupList(links: TopicLink[]): string {
    const lines: string[] = ['<b>Linked Groups</b>', ''];

    for (const link of links) {
      const statusIndicator = link.status === 'active' ? '🟢' : '🔴';
      const statusLabel = link.status === 'active' ? 'active' : 'closed';
      lines.push(`${statusIndicator} <b>${link.groupTitle}</b> — ${statusLabel}`);
    }

    lines.push('');
    lines.push('Use /summary inside a group topic to get a private summary.');
    lines.push('Use /unlink inside a topic to remove the link.');

    return lines.join('\n');
  }
}

/**
 * Create a GroupsHandler with the given dependencies
 */
export function createGroupsHandler(
  sendMessage: (chatId: number, text: string) => Promise<void>,
  topicLinkStore: TopicLinkStore
): GroupsHandler {
  return new GroupsHandler(sendMessage, topicLinkStore);
}
