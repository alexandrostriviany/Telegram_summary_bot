/**
 * Unit Tests for Start Command Handler
 *
 * Tests the /start command handler including:
 * - Group context: brief acknowledgement
 * - Private chat: onboarding welcome with reply keyboard
 * - Deep link: auto-trigger linking flow
 *
 * @module commands/start-handler.test
 */

import { Message } from '../types';
import {
  StartHandler,
  createStartHandler,
  WELCOME_MESSAGE,
  GROUP_START_MESSAGE,
  START_REPLY_KEYBOARD,
} from './start-handler';
import { TelegramClient } from '../telegram/telegram-client';
import { TopicLinkStore } from '../store/topic-link-store';
import { MembershipService } from '../services/membership-service';
// ---- helpers ----

function createMockTelegramClient(): jest.Mocked<TelegramClient> {
  return {
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendInlineKeyboard: jest.fn().mockResolvedValue(undefined),
    sendWithReplyKeyboard: jest.fn().mockResolvedValue(undefined),
    createForumTopic: jest.fn().mockResolvedValue({ message_thread_id: 999, name: 'Test', icon_color: 0 }),
    editForumTopic: jest.fn().mockResolvedValue(undefined),
    deleteForumTopic: jest.fn().mockResolvedValue(undefined),
    closeForumTopic: jest.fn().mockResolvedValue(undefined),
    reopenForumTopic: jest.fn().mockResolvedValue(undefined),
    getChat: jest.fn().mockResolvedValue({ id: -100, type: 'supergroup', title: 'Test Group' }),
    getChatMember: jest.fn().mockResolvedValue({ status: 'member', user: { id: 1, first_name: 'U' } }),
    answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
    setMyCommands: jest.fn().mockResolvedValue(undefined),
    getMe: jest.fn().mockResolvedValue({ id: 123, is_bot: true, first_name: 'Bot' }),
  };
}

function createMockTopicLinkStore(): jest.Mocked<TopicLinkStore> {
  return {
    createLink: jest.fn().mockResolvedValue(undefined),
    getLink: jest.fn().mockResolvedValue(null),
    getLinkByGroup: jest.fn().mockResolvedValue(null),
    getUserLinks: jest.fn().mockResolvedValue([]),
    deleteLink: jest.fn().mockResolvedValue(undefined),
    updateStatus: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockMembershipService(): jest.Mocked<MembershipService> {
  return {
    isGroupMember: jest.fn().mockResolvedValue(true),
    getMemberStatus: jest.fn().mockResolvedValue({ isMember: true, status: 'member' }),
  };
}

function makePrivateMessage(overrides: Partial<Message> = {}): Message {
  return {
    message_id: 1,
    chat: { id: 100, type: 'private' },
    from: { id: 42, first_name: 'Alice' },
    date: Math.floor(Date.now() / 1000),
    text: '/start',
    ...overrides,
  };
}

function makeGroupMessage(overrides: Partial<Message> = {}): Message {
  return {
    message_id: 2,
    chat: { id: -200, type: 'supergroup', title: 'Dev Chat' },
    from: { id: 42, first_name: 'Alice' },
    date: Math.floor(Date.now() / 1000),
    text: '/start',
    ...overrides,
  };
}

// ---- tests ----

describe('StartHandler', () => {
  let mockSendMessage: jest.Mock;
  let mockTelegramClient: jest.Mocked<TelegramClient>;
  let mockTopicLinkStore: jest.Mocked<TopicLinkStore>;
  let mockMembershipService: jest.Mocked<MembershipService>;
  let handler: StartHandler;

  beforeEach(() => {
    mockSendMessage = jest.fn().mockResolvedValue(undefined);
    mockTelegramClient = createMockTelegramClient();
    mockTopicLinkStore = createMockTopicLinkStore();
    mockMembershipService = createMockMembershipService();
    handler = new StartHandler(
      mockSendMessage,
      mockTelegramClient,
      mockTopicLinkStore,
      mockMembershipService,
    );
  });

  describe('group context', () => {
    it('should send a brief active message in group chat', async () => {
      const message = makeGroupMessage();
      await handler.execute(message, []);

      expect(mockSendMessage).toHaveBeenCalledWith(-200, GROUP_START_MESSAGE);
    });

    it('should not send reply keyboard in group chat', async () => {
      const message = makeGroupMessage();
      await handler.execute(message, []);

      expect(mockTelegramClient.sendWithReplyKeyboard).not.toHaveBeenCalled();
    });
  });

  describe('private chat onboarding (no args)', () => {
    it('should send welcome message via sendMessage', async () => {
      const message = makePrivateMessage();
      await handler.execute(message, []);

      expect(mockSendMessage).toHaveBeenCalledWith(100, WELCOME_MESSAGE);
    });

  });

  describe('deep link: /start link_<chatId>', () => {
    it('should create topic and link for valid deep link', async () => {
      const message = makePrivateMessage();
      mockMembershipService.isGroupMember.mockResolvedValue(true);
      mockTopicLinkStore.getLinkByGroup.mockResolvedValue(null);
      mockTelegramClient.getChat.mockResolvedValue({ id: -300, type: 'supergroup', title: 'My Group' });
      mockTelegramClient.createForumTopic.mockResolvedValue({
        message_thread_id: 555,
        name: 'My Group',
        icon_color: 0,
      });

      await handler.execute(message, ['link_-300']);

      expect(mockMembershipService.isGroupMember).toHaveBeenCalledWith(-300, 42);
      expect(mockTelegramClient.createForumTopic).toHaveBeenCalledWith(100, 'My Group');
      expect(mockTopicLinkStore.createLink).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 42,
          topicThreadId: 555,
          groupChatId: -300,
          groupTitle: 'My Group',
          privateChatId: 100,
          status: 'active',
        }),
      );
      expect(mockTelegramClient.sendMessage).toHaveBeenCalledWith(
        100,
        expect.stringContaining('My Group'),
        555,
      );
    });

    it('should reject deep link if user is not a member', async () => {
      const message = makePrivateMessage();
      mockMembershipService.isGroupMember.mockResolvedValue(false);

      await handler.execute(message, ['link_-300']);

      expect(mockSendMessage).toHaveBeenCalledWith(100, 'You are not a member of that group.');
      expect(mockTopicLinkStore.createLink).not.toHaveBeenCalled();
    });

    it('should inform user if group is already linked', async () => {
      const message = makePrivateMessage();
      mockMembershipService.isGroupMember.mockResolvedValue(true);
      mockTopicLinkStore.getLinkByGroup.mockResolvedValue({
        userId: 42,
        topicThreadId: 111,
        groupChatId: -300,
        groupTitle: 'Existing Group',
        privateChatId: 100,
        linkedAt: Date.now(),
        status: 'active',
      });

      await handler.execute(message, ['link_-300']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        expect.stringContaining('already have a link'),
      );
      expect(mockTelegramClient.createForumTopic).not.toHaveBeenCalled();
    });

    it('should handle invalid deep link payload', async () => {
      const message = makePrivateMessage();

      await handler.execute(message, ['link_notanumber']);

      expect(mockSendMessage).toHaveBeenCalledWith(100, 'Invalid link. Please try again from the group.');
    });

    it('should handle missing from field', async () => {
      const message = makePrivateMessage({ from: undefined });

      await handler.execute(message, ['link_-300']);

      expect(mockSendMessage).toHaveBeenCalledWith(100, 'Could not identify user.');
    });

    it('should handle forum topic creation failure', async () => {
      const message = makePrivateMessage();
      mockMembershipService.isGroupMember.mockResolvedValue(true);
      mockTelegramClient.createForumTopic.mockRejectedValue(new Error('API error'));

      await handler.execute(message, ['link_-300']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        'Failed to create a topic. Please try /link instead.',
      );
    });

    it('should use fallback group title when getChat fails', async () => {
      const message = makePrivateMessage();
      mockMembershipService.isGroupMember.mockResolvedValue(true);
      mockTelegramClient.getChat.mockRejectedValue(new Error('getChat failed'));
      mockTelegramClient.createForumTopic.mockResolvedValue({
        message_thread_id: 777,
        name: 'Group -300',
        icon_color: 0,
      });

      await handler.execute(message, ['link_-300']);

      expect(mockTelegramClient.createForumTopic).toHaveBeenCalledWith(100, 'Group -300');
      expect(mockTopicLinkStore.createLink).toHaveBeenCalledWith(
        expect.objectContaining({ groupTitle: 'Group -300' }),
      );
    });
  });
});

describe('WELCOME_MESSAGE', () => {
  it('should mention Summary Bot', () => {
    expect(WELCOME_MESSAGE).toContain('Summary Bot');
  });

  it('should mention /summary command', () => {
    expect(WELCOME_MESSAGE).toContain('/summary');
  });

  it('should mention /help command', () => {
    expect(WELCOME_MESSAGE).toContain('/help');
  });

  it('should use HTML bold tags', () => {
    expect(WELCOME_MESSAGE).toContain('<b>');
    expect(WELCOME_MESSAGE).toContain('</b>');
  });
});

describe('START_REPLY_KEYBOARD', () => {
  it('should have 2 rows of buttons', () => {
    expect(START_REPLY_KEYBOARD.keyboard).toHaveLength(2);
  });

  it('should have 2 buttons per row', () => {
    for (const row of START_REPLY_KEYBOARD.keyboard) {
      expect(row).toHaveLength(2);
    }
  });

  it('should have resize_keyboard enabled', () => {
    expect(START_REPLY_KEYBOARD.resize_keyboard).toBe(true);
  });

  it('should have is_persistent enabled', () => {
    expect(START_REPLY_KEYBOARD.is_persistent).toBe(true);
  });
});

describe('createStartHandler', () => {
  it('should create a StartHandler instance', () => {
    const handler = createStartHandler(
      jest.fn(),
      createMockTelegramClient(),
      createMockTopicLinkStore(),
      createMockMembershipService(),
    );
    expect(handler).toBeInstanceOf(StartHandler);
  });
});
