/**
 * Unit Tests for Groups Command Handler
 *
 * @module commands/groups-handler.test
 */

import { GroupsHandler } from './groups-handler';
import { TopicLinkStore, TopicLink } from '../store/topic-link-store';
import { Message } from '../types';

describe('GroupsHandler', () => {
  let mockSendMessage: jest.Mock;
  let mockTopicLinkStore: jest.Mocked<TopicLinkStore>;
  let handler: GroupsHandler;

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
    handler = new GroupsHandler(mockSendMessage, mockTopicLinkStore);
  });

  it('should reject if not in private chat', async () => {
    const message: Message = {
      message_id: 1,
      chat: { id: -200, type: 'group' },
      from: { id: 100, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      text: '/groups',
    };

    await handler.execute(message, []);

    expect(mockSendMessage).toHaveBeenCalledWith(
      -200,
      expect.stringContaining('can only be used in your private chat')
    );
    expect(mockTopicLinkStore.getUserLinks).not.toHaveBeenCalled();
  });

  it('should reject if no from field', async () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 100, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text: '/groups',
    };

    await handler.execute(message, []);

    expect(mockSendMessage).toHaveBeenCalledWith(100, 'Unable to identify the user.');
  });

  it('should show no groups message when user has no links', async () => {
    mockTopicLinkStore.getUserLinks.mockResolvedValueOnce([]);

    const message: Message = {
      message_id: 1,
      chat: { id: 100, type: 'private' },
      from: { id: 100, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      text: '/groups',
    };

    await handler.execute(message, []);

    expect(mockTopicLinkStore.getUserLinks).toHaveBeenCalledWith(100);
    expect(mockSendMessage).toHaveBeenCalledWith(
      100,
      'No groups linked yet. Use /link to get started.'
    );
  });

  it('should list linked groups with active status', async () => {
    const links: TopicLink[] = [
      {
        userId: 100,
        topicThreadId: 7,
        groupChatId: -1001234567890,
        groupTitle: 'Dev Team Chat',
        privateChatId: 100,
        linkedAt: 1700000000000,
        status: 'active',
      },
    ];
    mockTopicLinkStore.getUserLinks.mockResolvedValueOnce(links);

    const message: Message = {
      message_id: 1,
      chat: { id: 100, type: 'private' },
      from: { id: 100, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      text: '/groups',
    };

    await handler.execute(message, []);

    const sentText = mockSendMessage.mock.calls[0][1] as string;
    expect(sentText).toContain('Linked Groups');
    expect(sentText).toContain('Dev Team Chat');
    expect(sentText).toContain('active');
  });

  it('should list multiple groups with mixed statuses', async () => {
    const links: TopicLink[] = [
      {
        userId: 100,
        topicThreadId: 7,
        groupChatId: -1001234567890,
        groupTitle: 'Dev Team Chat',
        privateChatId: 100,
        linkedAt: 1700000000000,
        status: 'active',
      },
      {
        userId: 100,
        topicThreadId: 12,
        groupChatId: -1009876543210,
        groupTitle: 'Weekend Planners',
        privateChatId: 100,
        linkedAt: 1700000001000,
        status: 'closed',
      },
    ];
    mockTopicLinkStore.getUserLinks.mockResolvedValueOnce(links);

    const message: Message = {
      message_id: 1,
      chat: { id: 100, type: 'private' },
      from: { id: 100, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      text: '/groups',
    };

    await handler.execute(message, []);

    const sentText = mockSendMessage.mock.calls[0][1] as string;
    expect(sentText).toContain('Dev Team Chat');
    expect(sentText).toContain('active');
    expect(sentText).toContain('Weekend Planners');
    expect(sentText).toContain('closed');
  });

  it('should work in private chat with message_thread_id (inside a topic)', async () => {
    mockTopicLinkStore.getUserLinks.mockResolvedValueOnce([]);

    const message: Message = {
      message_id: 1,
      chat: { id: 100, type: 'private' },
      from: { id: 100, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      text: '/groups',
      message_thread_id: 7,
    };

    await handler.execute(message, []);

    // Should still work — /groups works in any private chat context
    expect(mockTopicLinkStore.getUserLinks).toHaveBeenCalledWith(100);
    expect(mockSendMessage).toHaveBeenCalledWith(
      100,
      'No groups linked yet. Use /link to get started.'
    );
  });

  it('should include usage hints in the group list', async () => {
    const links: TopicLink[] = [
      {
        userId: 100,
        topicThreadId: 7,
        groupChatId: -1001234567890,
        groupTitle: 'Dev Team Chat',
        privateChatId: 100,
        linkedAt: 1700000000000,
        status: 'active',
      },
    ];
    mockTopicLinkStore.getUserLinks.mockResolvedValueOnce(links);

    const message: Message = {
      message_id: 1,
      chat: { id: 100, type: 'private' },
      from: { id: 100, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      text: '/groups',
    };

    await handler.execute(message, []);

    const sentText = mockSendMessage.mock.calls[0][1] as string;
    expect(sentText).toContain('/summary');
    expect(sentText).toContain('/unlink');
  });
});
