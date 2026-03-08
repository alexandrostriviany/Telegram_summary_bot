/**
 * Membership verification service
 *
 * Wraps TelegramClient.getChatMember to provide group membership checks
 * for private topic summary access control.
 *
 * @module services/membership-service
 */

import { TelegramClient } from '../telegram/telegram-client';
import { ChatMember } from '../types';

/**
 * Possible outcomes when checking membership status
 */
export type MemberStatus =
  | { isMember: true; status: ChatMember['status'] }
  | { isMember: false; reason: 'not_member' | 'error' };

/**
 * Interface for verifying group membership
 */
export interface MembershipService {
  /**
   * Check if a user is an active member of a group chat
   *
   * @param groupChatId - The group/supergroup chat ID
   * @param userId - The user ID to check
   * @returns true if the user is creator, administrator, member, or restricted with is_member=true
   */
  isGroupMember(groupChatId: number, userId: number): Promise<boolean>;

  /**
   * Get detailed membership status for a user in a group chat
   *
   * @param groupChatId - The group/supergroup chat ID
   * @param userId - The user ID to check
   * @returns MemberStatus with membership details or error reason
   */
  getMemberStatus(groupChatId: number, userId: number): Promise<MemberStatus>;
}

/** Statuses that grant summary access */
const ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  'creator',
  'administrator',
  'member',
]);

/**
 * Implementation of MembershipService using TelegramClient
 */
export class TelegramMembershipService implements MembershipService {
  constructor(private readonly telegramClient: TelegramClient) {}

  async isGroupMember(groupChatId: number, userId: number): Promise<boolean> {
    const status = await this.getMemberStatus(groupChatId, userId);
    return status.isMember;
  }

  async getMemberStatus(groupChatId: number, userId: number): Promise<MemberStatus> {
    let chatMember: ChatMember;
    try {
      chatMember = await this.telegramClient.getChatMember(groupChatId, userId);
    } catch (error) {
      console.error(
        `Failed to get chat member (chat=${groupChatId}, user=${userId}):`,
        error instanceof Error ? error.message : String(error)
      );
      return { isMember: false, reason: 'error' };
    }

    if (ACTIVE_STATUSES.has(chatMember.status)) {
      return { isMember: true, status: chatMember.status };
    }

    if (chatMember.status === 'restricted' && chatMember.is_member === true) {
      return { isMember: true, status: 'restricted' };
    }

    return { isMember: false, reason: 'not_member' };
  }
}

/**
 * Factory function to create a MembershipService instance
 *
 * @param telegramClient - The Telegram client to use for API calls
 * @returns A configured MembershipService instance
 */
export function createMembershipService(telegramClient: TelegramClient): MembershipService {
  return new TelegramMembershipService(telegramClient);
}
