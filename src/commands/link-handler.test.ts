/**
 * Unit tests for Link Command Handler
 *
 * Tests the LinkHandler and handleLinkCallback implementations.
 *
 * @module commands/link-handler.test
 */

import {
  LinkHandler,
  handleLinkCallback,
  parseLinkCallbackData,
  CandidateGroup,
  GetCandidateGroups,
} from './link-handler';
import { TelegramClient } from '../telegram/telegram-client';
import { TopicLinkStore, TopicLink } from '../store/topic-link-store';
import { MembershipService } from '../services/membership-service';
import { Message } from '../types';

function createMockTelegramClient(): jest.Mocked<TelegramClient> {
  return {
    sendMessage: jest.fn().mockResolvedValue(undefined),
    createForumTopic: jest.fn(),
    deleteForumTopic: jest.fn(),
    closeForumTopic: jest.fn(),
    reopenForumTopic: jest.fn(),
    getChat: jest.fn().mockResolvedValue({ id: 0, type: 'supergroup', title: 'Test Group' }),
    getChatMember: jest.fn(),
    sendInlineKeyboard: jest.fn().mockResolvedValue(undefined),
    answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockTopicLinkStore(): jest.Mocked<TopicLinkStore> {
  return {
    createLink: jest.fn().mockResolvedValue(undefined),
    getLink: jest.fn().mockResolvedValue(null),
    getUserLinks: jest.fn().mockResolvedValue([]),
    getLinkByGroup: jest.fn().mockResolvedValue(null),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    deleteLink: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockMembershipService(): jest.Mocked<MembershipService> {
  return {
    isGroupMember: jest.fn().mockResolvedValue(true),
    getMemberStatus: jest.fn().mockResolvedValue({ isMember: true, status: 'member' as const }),
  };
}

function createPrivateMessage(overrides: Partial<Message> = {}): Message {
  return {
    message_id: 1,
    chat: { id: 100, type: 'private' },
    from: { id: 42, first_name: 'TestUser' },
    date: Math.floor(Date.now() / 1000),
    text: '/link',
    ...overrides,
  };
}

describe('LinkHandler', () => {
  let mockClient: jest.Mocked<TelegramClient>;
  let mockStore: jest.Mocked<TopicLinkStore>;
  let mockMembership: jest.Mocked<MembershipService>;
  let mockGetCandidates: jest.MockedFunction<GetCandidateGroups>;
  let handler: LinkHandler;

  const candidateGroups: CandidateGroup[] = [
    { chatId: -1001111111111, title: 'Group A' },
    { chatId: -1002222222222, title: 'Group B' },
  ];

  beforeEach(() => {
    mockClient = createMockTelegramClient();
    mockStore = createMockTopicLinkStore();
    mockMembership = createMockMembershipService();
    mockGetCandidates = jest.fn().mockResolvedValue(candidateGroups);
    handler = new LinkHandler(mockClient, mockStore, mockMembership, mockGetCandidates);
  });

  it('should show inline keyboard with available groups', async () => {
    const message = createPrivateMessage();

    await handler.execute(message, []);

    expect(mockGetCandidates).toHaveBeenCalledWith(42);
    expect(mockMembership.isGroupMember).toHaveBeenCalledTimes(2);
    expect(mockStore.getUserLinks).toHaveBeenCalledWith(42);
    expect(mockClient.sendInlineKeyboard).toHaveBeenCalledWith(
      100,
      'Select a group to link:',
      {
        inline_keyboard: [
          [{ text: 'Group A', callback_data: 'link:-1001111111111' }],
          [{ text: 'Group B', callback_data: 'link:-1002222222222' }],
        ],
      },
    );
  });

  it('should reject non-private chats', async () => {
    const message = createPrivateMessage({
      chat: { id: -100999, type: 'supergroup', title: 'Some Group' },
    });

    await handler.execute(message, []);

    expect(mockClient.sendMessage).toHaveBeenCalledWith(
      -100999,
      expect.stringContaining('private chat'),
    );
    expect(mockGetCandidates).not.toHaveBeenCalled();
  });

  it('should handle missing user ID', async () => {
    const message = createPrivateMessage({ from: undefined });

    await handler.execute(message, []);

    expect(mockClient.sendMessage).toHaveBeenCalledWith(
      100,
      'Could not identify user.',
    );
  });

  it('should handle no candidate groups', async () => {
    mockGetCandidates.mockResolvedValueOnce([]);
    const message = createPrivateMessage();

    await handler.execute(message, []);

    expect(mockClient.sendMessage).toHaveBeenCalledWith(
      100,
      expect.stringContaining('No groups available'),
    );
  });

  it('should filter out groups where user is not a member', async () => {
    mockMembership.isGroupMember
      .mockResolvedValueOnce(true)   // Group A
      .mockResolvedValueOnce(false); // Group B

    const message = createPrivateMessage();

    await handler.execute(message, []);

    expect(mockClient.sendInlineKeyboard).toHaveBeenCalledWith(
      100,
      'Select a group to link:',
      {
        inline_keyboard: [
          [{ text: 'Group A', callback_data: 'link:-1001111111111' }],
        ],
      },
    );
  });

  it('should handle all membership checks failing', async () => {
    mockMembership.isGroupMember.mockResolvedValue(false);

    const message = createPrivateMessage();

    await handler.execute(message, []);

    expect(mockClient.sendMessage).toHaveBeenCalledWith(
      100,
      expect.stringContaining('No groups available'),
    );
  });

  it('should filter out already-linked groups', async () => {
    const existingLink: TopicLink = {
      userId: 42,
      topicThreadId: 10,
      groupChatId: -1001111111111,
      groupTitle: 'Group A',
      privateChatId: 100,
      linkedAt: Date.now(),
      status: 'active',
    };
    mockStore.getUserLinks.mockResolvedValueOnce([existingLink]);

    const message = createPrivateMessage();

    await handler.execute(message, []);

    expect(mockClient.sendInlineKeyboard).toHaveBeenCalledWith(
      100,
      'Select a group to link:',
      {
        inline_keyboard: [
          [{ text: 'Group B', callback_data: 'link:-1002222222222' }],
        ],
      },
    );
  });

  it('should show all-linked message when every group is linked', async () => {
    const links: TopicLink[] = candidateGroups.map((g, i) => ({
      userId: 42,
      topicThreadId: 10 + i,
      groupChatId: g.chatId,
      groupTitle: g.title,
      privateChatId: 100,
      linkedAt: Date.now(),
      status: 'active' as const,
    }));
    mockStore.getUserLinks.mockResolvedValueOnce(links);

    const message = createPrivateMessage();

    await handler.execute(message, []);

    expect(mockClient.sendMessage).toHaveBeenCalledWith(
      100,
      expect.stringContaining('already linked'),
    );
    expect(mockClient.sendInlineKeyboard).not.toHaveBeenCalled();
  });
});

describe('handleLinkCallback', () => {
  let mockClient: jest.Mocked<TelegramClient>;
  let mockStore: jest.Mocked<TopicLinkStore>;

  beforeEach(() => {
    mockClient = createMockTelegramClient();
    mockStore = createMockTopicLinkStore();
  });

  it('should create topic, store link, and confirm', async () => {
    mockClient.getChat.mockResolvedValueOnce({ id: -1001111111111, type: 'supergroup', title: 'Dev Team Chat' });
    mockClient.createForumTopic.mockResolvedValueOnce({
      message_thread_id: 99,
      name: 'Dev Team Chat',
      icon_color: 0,
    });

    await handleLinkCallback(
      'cb-123',
      'link:-1001111111111',
      42,
      100,
      mockClient,
      mockStore,
    );

    expect(mockClient.getChat).toHaveBeenCalledWith(-1001111111111);
    expect(mockClient.createForumTopic).toHaveBeenCalledWith(100, 'Dev Team Chat');
    expect(mockStore.createLink).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        topicThreadId: 99,
        groupChatId: -1001111111111,
        privateChatId: 100,
        status: 'active',
      }),
    );
    expect(mockClient.sendMessage).toHaveBeenCalledWith(
      100,
      expect.stringContaining('Linked to'),
      99,
    );
    expect(mockClient.answerCallbackQuery).toHaveBeenCalledWith('cb-123', 'Group linked!');
  });

  it('should reject invalid callback data prefix', async () => {
    await handleLinkCallback('cb-123', 'invalid:data', 42, 100, mockClient, mockStore);

    expect(mockClient.answerCallbackQuery).toHaveBeenCalledWith('cb-123', 'Invalid action.');
    expect(mockClient.createForumTopic).not.toHaveBeenCalled();
  });

  it('should reject non-numeric group ID', async () => {
    await handleLinkCallback('cb-123', 'link:notanumber', 42, 100, mockClient, mockStore);

    expect(mockClient.answerCallbackQuery).toHaveBeenCalledWith('cb-123', 'Invalid group.');
    expect(mockClient.createForumTopic).not.toHaveBeenCalled();
  });

  it('should reject already-linked group', async () => {
    mockStore.getLinkByGroup.mockResolvedValueOnce({
      userId: 42,
      topicThreadId: 10,
      groupChatId: -1001111111111,
      groupTitle: 'Already Linked',
      privateChatId: 100,
      linkedAt: Date.now(),
      status: 'active',
    });

    await handleLinkCallback('cb-123', 'link:-1001111111111', 42, 100, mockClient, mockStore);

    expect(mockClient.answerCallbackQuery).toHaveBeenCalledWith('cb-123', 'This group is already linked.');
    expect(mockClient.createForumTopic).not.toHaveBeenCalled();
  });

  it('should handle createForumTopic failure', async () => {
    mockClient.createForumTopic.mockRejectedValueOnce(new Error('API error'));

    await handleLinkCallback('cb-123', 'link:-1001111111111', 42, 100, mockClient, mockStore);

    expect(mockClient.answerCallbackQuery).toHaveBeenCalledWith(
      'cb-123',
      'Failed to create topic. Please try again.',
    );
    expect(mockStore.createLink).not.toHaveBeenCalled();
  });
});

describe('parseLinkCallbackData', () => {
  it('should parse valid callback data', () => {
    expect(parseLinkCallbackData('link:-1001111111111')).toBe(-1001111111111);
  });

  it('should return null for invalid prefix', () => {
    expect(parseLinkCallbackData('unlink:-1001111111111')).toBeNull();
  });

  it('should return null for non-numeric ID', () => {
    expect(parseLinkCallbackData('link:notanumber')).toBeNull();
  });

  it('should return null for empty data', () => {
    expect(parseLinkCallbackData('')).toBeNull();
  });
});
