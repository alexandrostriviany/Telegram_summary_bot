/**
 * Unit tests for MembershipService
 *
 * Tests the TelegramMembershipService implementation with mocked TelegramClient.
 *
 * @module services/membership-service.test
 */

import { TelegramMembershipService } from './membership-service';
import { TelegramClient, TelegramApiError } from '../telegram/telegram-client';

function createMockTelegramClient(): jest.Mocked<TelegramClient> {
  return {
    sendMessage: jest.fn(),
    createForumTopic: jest.fn(),
    deleteForumTopic: jest.fn(),
    closeForumTopic: jest.fn(),
    reopenForumTopic: jest.fn(),
    getChat: jest.fn(),
    getChatMember: jest.fn(),
    sendInlineKeyboard: jest.fn(),
    answerCallbackQuery: jest.fn(),
  };
}

describe('TelegramMembershipService', () => {
  const groupChatId = -1001234567890;
  const userId = 42;
  let mockClient: jest.Mocked<TelegramClient>;
  let service: TelegramMembershipService;

  beforeEach(() => {
    mockClient = createMockTelegramClient();
    service = new TelegramMembershipService(mockClient);
  });

  describe('isGroupMember()', () => {
    it('should return true for creator', async () => {
      mockClient.getChatMember.mockResolvedValueOnce({
        status: 'creator',
        user: { id: userId, first_name: 'Owner' },
      });

      const result = await service.isGroupMember(groupChatId, userId);

      expect(result).toBe(true);
      expect(mockClient.getChatMember).toHaveBeenCalledWith(groupChatId, userId);
    });

    it('should return true for administrator', async () => {
      mockClient.getChatMember.mockResolvedValueOnce({
        status: 'administrator',
        user: { id: userId, first_name: 'Admin' },
      });

      expect(await service.isGroupMember(groupChatId, userId)).toBe(true);
    });

    it('should return true for member', async () => {
      mockClient.getChatMember.mockResolvedValueOnce({
        status: 'member',
        user: { id: userId, first_name: 'Member' },
      });

      expect(await service.isGroupMember(groupChatId, userId)).toBe(true);
    });

    it('should return true for restricted user with is_member=true', async () => {
      mockClient.getChatMember.mockResolvedValueOnce({
        status: 'restricted',
        user: { id: userId, first_name: 'Restricted' },
        is_member: true,
      });

      expect(await service.isGroupMember(groupChatId, userId)).toBe(true);
    });

    it('should return false for restricted user with is_member=false', async () => {
      mockClient.getChatMember.mockResolvedValueOnce({
        status: 'restricted',
        user: { id: userId, first_name: 'Restricted' },
        is_member: false,
      });

      expect(await service.isGroupMember(groupChatId, userId)).toBe(false);
    });

    it('should return false for restricted user without is_member', async () => {
      mockClient.getChatMember.mockResolvedValueOnce({
        status: 'restricted',
        user: { id: userId, first_name: 'Restricted' },
      });

      expect(await service.isGroupMember(groupChatId, userId)).toBe(false);
    });

    it('should return false for left user', async () => {
      mockClient.getChatMember.mockResolvedValueOnce({
        status: 'left',
        user: { id: userId, first_name: 'Left' },
      });

      expect(await service.isGroupMember(groupChatId, userId)).toBe(false);
    });

    it('should return false for kicked user', async () => {
      mockClient.getChatMember.mockResolvedValueOnce({
        status: 'kicked',
        user: { id: userId, first_name: 'Kicked' },
      });

      expect(await service.isGroupMember(groupChatId, userId)).toBe(false);
    });

    it('should return false when getChatMember throws', async () => {
      mockClient.getChatMember.mockRejectedValueOnce(
        new TelegramApiError('Bad Request: user not found', 400)
      );

      expect(await service.isGroupMember(groupChatId, userId)).toBe(false);
    });

    it('should return false when bot is not in the group', async () => {
      mockClient.getChatMember.mockRejectedValueOnce(
        new TelegramApiError('Forbidden: bot is not a member', 403)
      );

      expect(await service.isGroupMember(groupChatId, userId)).toBe(false);
    });
  });

  describe('getMemberStatus()', () => {
    it('should return isMember=true with status for creator', async () => {
      mockClient.getChatMember.mockResolvedValueOnce({
        status: 'creator',
        user: { id: userId, first_name: 'Owner' },
      });

      const result = await service.getMemberStatus(groupChatId, userId);

      expect(result).toEqual({ isMember: true, status: 'creator' });
    });

    it('should return isMember=true with status for administrator', async () => {
      mockClient.getChatMember.mockResolvedValueOnce({
        status: 'administrator',
        user: { id: userId, first_name: 'Admin' },
      });

      const result = await service.getMemberStatus(groupChatId, userId);

      expect(result).toEqual({ isMember: true, status: 'administrator' });
    });

    it('should return isMember=true with status for member', async () => {
      mockClient.getChatMember.mockResolvedValueOnce({
        status: 'member',
        user: { id: userId, first_name: 'User' },
      });

      const result = await service.getMemberStatus(groupChatId, userId);

      expect(result).toEqual({ isMember: true, status: 'member' });
    });

    it('should return isMember=true for restricted with is_member=true', async () => {
      mockClient.getChatMember.mockResolvedValueOnce({
        status: 'restricted',
        user: { id: userId, first_name: 'Restricted' },
        is_member: true,
      });

      const result = await service.getMemberStatus(groupChatId, userId);

      expect(result).toEqual({ isMember: true, status: 'restricted' });
    });

    it('should return not_member for restricted with is_member=false', async () => {
      mockClient.getChatMember.mockResolvedValueOnce({
        status: 'restricted',
        user: { id: userId, first_name: 'Restricted' },
        is_member: false,
      });

      const result = await service.getMemberStatus(groupChatId, userId);

      expect(result).toEqual({ isMember: false, reason: 'not_member' });
    });

    it('should return not_member for left status', async () => {
      mockClient.getChatMember.mockResolvedValueOnce({
        status: 'left',
        user: { id: userId, first_name: 'Left' },
      });

      const result = await service.getMemberStatus(groupChatId, userId);

      expect(result).toEqual({ isMember: false, reason: 'not_member' });
    });

    it('should return not_member for kicked status', async () => {
      mockClient.getChatMember.mockResolvedValueOnce({
        status: 'kicked',
        user: { id: userId, first_name: 'Kicked' },
      });

      const result = await service.getMemberStatus(groupChatId, userId);

      expect(result).toEqual({ isMember: false, reason: 'not_member' });
    });

    it('should return error reason when API call fails', async () => {
      mockClient.getChatMember.mockRejectedValueOnce(
        new TelegramApiError('Bad Request: chat not found', 400)
      );

      const result = await service.getMemberStatus(groupChatId, userId);

      expect(result).toEqual({ isMember: false, reason: 'error' });
    });

    it('should return error reason for non-TelegramApiError', async () => {
      mockClient.getChatMember.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.getMemberStatus(groupChatId, userId);

      expect(result).toEqual({ isMember: false, reason: 'error' });
    });
  });
});
