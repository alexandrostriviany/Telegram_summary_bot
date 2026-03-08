/**
 * Unit Tests for Unlink Command Handler
 *
 * @module commands/unlink-handler.test
 */

import {
  UnlinkHandler,
  UNLINK_CONFIRM_PREFIX,
  UNLINK_CANCEL_PREFIX,
} from './unlink-handler';
import { TopicLinkStore, TopicLink } from '../store/topic-link-store';
import { TelegramClient } from '../telegram/telegram-client';
import { Message } from '../types';

describe('UnlinkHandler', () => {
  let mockSendMessage: jest.Mock;
  let mockTopicLinkStore: jest.Mocked<TopicLinkStore>;
  let mockTelegramClient: jest.Mocked<TelegramClient>;
  let handler: UnlinkHandler;

  const sampleLink: TopicLink = {
    userId: 100,
    topicThreadId: 7,
    groupChatId: -1001234567890,
    groupTitle: 'Dev Team Chat',
    privateChatId: 100,
    linkedAt: 1700000000000,
    status: 'active',
  };

  beforeEach(() => {
    mockSendMessage = jest.fn().mockResolvedValue(undefined);
    mockTopicLinkStore = {
      createLink: jest.fn().mockResolvedValue(undefined),
      getLink: jest.fn().mockResolvedValue(null),
      getUserLinks: jest.fn().mockResolvedValue([]),
      getLinkByGroup: jest.fn().mockResolvedValue(null),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      deleteLink: jest.fn().mockResolvedValue(undefined),
    };
    mockTelegramClient = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      createForumTopic: jest.fn(),
      editForumTopic: jest.fn().mockResolvedValue(undefined),
      deleteForumTopic: jest.fn().mockResolvedValue(undefined),
      closeForumTopic: jest.fn().mockResolvedValue(undefined),
      reopenForumTopic: jest.fn().mockResolvedValue(undefined),
      getChat: jest.fn().mockResolvedValue({ id: 0, type: 'supergroup', title: 'Test Group' }),
      getChatMember: jest.fn(),
      sendInlineKeyboard: jest.fn().mockResolvedValue(undefined),
      answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
    };
    handler = new UnlinkHandler(mockSendMessage, mockTopicLinkStore, mockTelegramClient);
  });

  describe('execute', () => {
    it('should reject if not in private chat', async () => {
      const message: Message = {
        message_id: 1,
        chat: { id: -200, type: 'group' },
        from: { id: 100, first_name: 'John' },
        date: Math.floor(Date.now() / 1000),
        text: '/unlink',
      };

      await handler.execute(message, []);

      expect(mockSendMessage).toHaveBeenCalledWith(
        -200,
        expect.stringContaining('can only be used inside a linked topic')
      );
      expect(mockTopicLinkStore.getLink).not.toHaveBeenCalled();
    });

    it('should reject if no message_thread_id in private chat', async () => {
      const message: Message = {
        message_id: 1,
        chat: { id: 100, type: 'private' },
        from: { id: 100, first_name: 'John' },
        date: Math.floor(Date.now() / 1000),
        text: '/unlink',
      };

      await handler.execute(message, []);

      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        expect.stringContaining('can only be used inside a linked topic')
      );
    });

    it('should reject if no from field', async () => {
      const message: Message = {
        message_id: 1,
        chat: { id: 100, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: '/unlink',
        message_thread_id: 7,
      };

      await handler.execute(message, []);

      expect(mockSendMessage).toHaveBeenCalledWith(100, 'Unable to identify the user.');
    });

    it('should send error if topic is not linked', async () => {
      mockTopicLinkStore.getLink.mockResolvedValueOnce(null);

      const message: Message = {
        message_id: 1,
        chat: { id: 100, type: 'private' },
        from: { id: 100, first_name: 'John' },
        date: Math.floor(Date.now() / 1000),
        text: '/unlink',
        message_thread_id: 7,
      };

      await handler.execute(message, []);

      expect(mockTopicLinkStore.getLink).toHaveBeenCalledWith(100, 7);
      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        expect.stringContaining('not linked to any group')
      );
    });

    it('should show confirmation keyboard when topic is linked', async () => {
      mockTopicLinkStore.getLink.mockResolvedValueOnce(sampleLink);

      const message: Message = {
        message_id: 1,
        chat: { id: 100, type: 'private' },
        from: { id: 100, first_name: 'John' },
        date: Math.floor(Date.now() / 1000),
        text: '/unlink',
        message_thread_id: 7,
      };

      await handler.execute(message, []);

      expect(mockTelegramClient.sendInlineKeyboard).toHaveBeenCalledWith(
        100,
        expect.stringContaining('Dev Team Chat'),
        {
          inline_keyboard: [
            [
              {
                text: 'Yes, unlink',
                callback_data: `${UNLINK_CONFIRM_PREFIX}100:7`,
              },
              {
                text: 'Cancel',
                callback_data: `${UNLINK_CANCEL_PREFIX}100:7`,
              },
            ],
          ],
        },
        7
      );
    });
  });

  describe('handleConfirm', () => {
    it('should delete link, delete topic, and send confirmation', async () => {
      mockTopicLinkStore.getLink.mockResolvedValueOnce(sampleLink);

      await handler.handleConfirm(100, 7, 100, 'callback-123');

      expect(mockTopicLinkStore.deleteLink).toHaveBeenCalledWith(100, 7);
      expect(mockTelegramClient.deleteForumTopic).toHaveBeenCalledWith(100, 7);
      expect(mockTelegramClient.answerCallbackQuery).toHaveBeenCalledWith(
        'callback-123',
        'Unlinked successfully.'
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        expect.stringContaining('Dev Team Chat')
      );
    });

    it('should answer callback with error if link not found', async () => {
      mockTopicLinkStore.getLink.mockResolvedValueOnce(null);

      await handler.handleConfirm(100, 7, 100, 'callback-123');

      expect(mockTelegramClient.answerCallbackQuery).toHaveBeenCalledWith(
        'callback-123',
        'Link not found.'
      );
      expect(mockTopicLinkStore.deleteLink).not.toHaveBeenCalled();
    });

    it('should still proceed if deleteForumTopic fails', async () => {
      mockTopicLinkStore.getLink.mockResolvedValueOnce(sampleLink);
      mockTelegramClient.deleteForumTopic.mockRejectedValueOnce(new Error('Topic not found'));

      await handler.handleConfirm(100, 7, 100, 'callback-123');

      expect(mockTopicLinkStore.deleteLink).toHaveBeenCalledWith(100, 7);
      expect(mockTelegramClient.answerCallbackQuery).toHaveBeenCalledWith(
        'callback-123',
        'Unlinked successfully.'
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        expect.stringContaining('Dev Team Chat')
      );
    });
  });

  describe('handleCancel', () => {
    it('should answer callback query with cancellation message', async () => {
      await handler.handleCancel('callback-456');

      expect(mockTelegramClient.answerCallbackQuery).toHaveBeenCalledWith(
        'callback-456',
        'Unlink cancelled.'
      );
    });
  });
});
