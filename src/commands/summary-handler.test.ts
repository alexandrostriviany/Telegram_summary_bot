/**
 * Unit Tests for Summary Command Handler
 * 
 * Tests the /summary command parameter parsing functionality including:
 * - Time parameter parsing (e.g., "1h", "30m")
 * - Count parameter parsing (e.g., "50", "100")
 * - Default behavior when no parameter is provided
 * - SummaryHandler class execution
 * 
 * @module commands/summary-handler.test
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */

import {
  parseTimeParameter,
  parseCountParameter,
  parseSummaryParameter,
  SummaryHandler,
  DEFAULT_SUMMARY_HOURS,
  PrivateTopicDeps,
} from './summary-handler';
import { Message } from '../types';
import { CreditsStore, UserCredits } from '../store/credits-store';
import { TopicLinkStore, TopicLink } from '../store/topic-link-store';
import { MembershipService } from '../services/membership-service';
import { TelegramClient } from '../telegram/telegram-client';

describe('parseTimeParameter', () => {
  describe('valid hour formats', () => {
    it('should parse "1h" as 1 hour', () => {
      expect(parseTimeParameter('1h')).toBe(1);
    });

    it('should parse "2h" as 2 hours', () => {
      expect(parseTimeParameter('2h')).toBe(2);
    });

    it('should parse "24h" as 24 hours', () => {
      expect(parseTimeParameter('24h')).toBe(24);
    });

    it('should parse uppercase "1H" as 1 hour', () => {
      expect(parseTimeParameter('1H')).toBe(1);
    });

    it('should handle whitespace around the parameter', () => {
      expect(parseTimeParameter('  2h  ')).toBe(2);
    });
  });

  describe('valid minute formats', () => {
    it('should parse "30m" as 0.5 hours', () => {
      expect(parseTimeParameter('30m')).toBe(0.5);
    });

    it('should parse "60m" as 1 hour', () => {
      expect(parseTimeParameter('60m')).toBe(1);
    });

    it('should parse "90m" as 1.5 hours', () => {
      expect(parseTimeParameter('90m')).toBe(1.5);
    });

    it('should parse "15m" as 0.25 hours', () => {
      expect(parseTimeParameter('15m')).toBe(0.25);
    });

    it('should parse uppercase "30M" as 0.5 hours', () => {
      expect(parseTimeParameter('30M')).toBe(0.5);
    });
  });

  describe('invalid formats', () => {
    it('should return null for empty string', () => {
      expect(parseTimeParameter('')).toBeNull();
    });

    it('should return null for null-like input', () => {
      expect(parseTimeParameter(null as unknown as string)).toBeNull();
      expect(parseTimeParameter(undefined as unknown as string)).toBeNull();
    });

    it('should return null for plain numbers', () => {
      expect(parseTimeParameter('50')).toBeNull();
    });

    it('should return null for invalid units', () => {
      expect(parseTimeParameter('1d')).toBeNull();
      expect(parseTimeParameter('1s')).toBeNull();
      expect(parseTimeParameter('1w')).toBeNull();
    });

    it('should return null for zero values', () => {
      expect(parseTimeParameter('0h')).toBeNull();
      expect(parseTimeParameter('0m')).toBeNull();
    });

    it('should return null for negative values', () => {
      expect(parseTimeParameter('-1h')).toBeNull();
      expect(parseTimeParameter('-30m')).toBeNull();
    });

    it('should return null for non-numeric values', () => {
      expect(parseTimeParameter('abch')).toBeNull();
      expect(parseTimeParameter('h')).toBeNull();
      expect(parseTimeParameter('m')).toBeNull();
    });

    it('should return null for decimal values', () => {
      expect(parseTimeParameter('1.5h')).toBeNull();
      expect(parseTimeParameter('30.5m')).toBeNull();
    });
  });
});

describe('parseCountParameter', () => {
  describe('valid count formats', () => {
    it('should parse "50" as 50', () => {
      expect(parseCountParameter('50')).toBe(50);
    });

    it('should parse "100" as 100', () => {
      expect(parseCountParameter('100')).toBe(100);
    });

    it('should parse "1" as 1', () => {
      expect(parseCountParameter('1')).toBe(1);
    });

    it('should parse "500" as 500', () => {
      expect(parseCountParameter('500')).toBe(500);
    });

    it('should handle whitespace around the parameter', () => {
      expect(parseCountParameter('  50  ')).toBe(50);
    });
  });

  describe('invalid count formats', () => {
    it('should return null for empty string', () => {
      expect(parseCountParameter('')).toBeNull();
    });

    it('should return null for null-like input', () => {
      expect(parseCountParameter(null as unknown as string)).toBeNull();
      expect(parseCountParameter(undefined as unknown as string)).toBeNull();
    });

    it('should return null for zero', () => {
      expect(parseCountParameter('0')).toBeNull();
    });

    it('should return null for negative numbers', () => {
      expect(parseCountParameter('-50')).toBeNull();
    });

    it('should return null for decimal numbers', () => {
      expect(parseCountParameter('50.5')).toBeNull();
    });

    it('should return null for time formats', () => {
      expect(parseCountParameter('1h')).toBeNull();
      expect(parseCountParameter('30m')).toBeNull();
    });

    it('should return null for non-numeric strings', () => {
      expect(parseCountParameter('abc')).toBeNull();
      expect(parseCountParameter('fifty')).toBeNull();
    });

    it('should return null for mixed formats', () => {
      expect(parseCountParameter('50messages')).toBeNull();
      expect(parseCountParameter('50 messages')).toBeNull();
    });
  });
});

describe('parseSummaryParameter', () => {
  describe('default behavior (no parameter)', () => {
    /**
     * **Validates: Requirements 3.1**
     */
    it('should return default 24 hours when no parameter is provided', () => {
      const result = parseSummaryParameter(undefined);
      expect(result).toEqual({ type: 'time', value: DEFAULT_SUMMARY_HOURS });
    });

    it('should return default 24 hours for empty string', () => {
      const result = parseSummaryParameter('');
      expect(result).toEqual({ type: 'time', value: DEFAULT_SUMMARY_HOURS });
    });

    it('should return default 24 hours for whitespace-only string', () => {
      const result = parseSummaryParameter('   ');
      expect(result).toEqual({ type: 'time', value: DEFAULT_SUMMARY_HOURS });
    });
  });

  describe('time parameter parsing', () => {
    /**
     * **Validates: Requirements 3.2**
     */
    it('should parse "1h" as time range of 1 hour', () => {
      const result = parseSummaryParameter('1h');
      expect(result).toEqual({ type: 'time', value: 1 });
    });

    it('should parse "2h" as time range of 2 hours', () => {
      const result = parseSummaryParameter('2h');
      expect(result).toEqual({ type: 'time', value: 2 });
    });

    it('should parse "30m" as time range of 0.5 hours', () => {
      const result = parseSummaryParameter('30m');
      expect(result).toEqual({ type: 'time', value: 0.5 });
    });

    it('should parse "90m" as time range of 1.5 hours', () => {
      const result = parseSummaryParameter('90m');
      expect(result).toEqual({ type: 'time', value: 1.5 });
    });
  });

  describe('count parameter parsing', () => {
    /**
     * **Validates: Requirements 3.3**
     */
    it('should parse "50" as count range of 50', () => {
      const result = parseSummaryParameter('50');
      expect(result).toEqual({ type: 'count', value: 50 });
    });

    it('should parse "100" as count range of 100', () => {
      const result = parseSummaryParameter('100');
      expect(result).toEqual({ type: 'count', value: 100 });
    });

    it('should parse "1" as count range of 1', () => {
      const result = parseSummaryParameter('1');
      expect(result).toEqual({ type: 'count', value: 1 });
    });
  });

  describe('invalid parameters', () => {
    it('should return null for invalid format', () => {
      expect(parseSummaryParameter('invalid')).toBeNull();
    });

    it('should return null for negative numbers', () => {
      expect(parseSummaryParameter('-50')).toBeNull();
    });

    it('should return null for zero', () => {
      expect(parseSummaryParameter('0')).toBeNull();
    });

    it('should return null for unsupported time units', () => {
      expect(parseSummaryParameter('1d')).toBeNull();
      expect(parseSummaryParameter('1w')).toBeNull();
    });
  });
});

describe('SummaryHandler', () => {
  let mockSendMessage: jest.Mock;
  let mockGenerateSummary: jest.Mock;
  let handler: SummaryHandler;

  const createMockMessage = (chatId: number): Message => ({
    message_id: 1,
    chat: { id: chatId, type: 'group' },
    date: Math.floor(Date.now() / 1000),
    text: '/summary',
  });

  beforeEach(() => {
    mockSendMessage = jest.fn().mockResolvedValue(undefined);
    mockGenerateSummary = jest.fn().mockResolvedValue('📝 Summary content');
    handler = new SummaryHandler(mockSendMessage, mockGenerateSummary);
  });

  describe('execute with no arguments', () => {
    /**
     * **Validates: Requirements 3.1**
     */
    it('should use default 24 hours when no argument is provided', async () => {
      const message = createMockMessage(123);
      
      await handler.execute(message, []);

      expect(mockGenerateSummary).toHaveBeenCalledWith(123, {
        type: 'time',
        value: DEFAULT_SUMMARY_HOURS,
      }, undefined);
      expect(mockSendMessage).toHaveBeenCalledWith(123, '📝 Summary content', 123);
    });
  });

  describe('execute with time arguments', () => {
    /**
     * **Validates: Requirements 3.2**
     */
    it('should parse "1h" and generate summary for 1 hour', async () => {
      const message = createMockMessage(456);
      
      await handler.execute(message, ['1h']);

      expect(mockGenerateSummary).toHaveBeenCalledWith(456, {
        type: 'time',
        value: 1,
      }, undefined);
    });

    it('should parse "30m" and generate summary for 0.5 hours', async () => {
      const message = createMockMessage(456);

      await handler.execute(message, ['30m']);

      expect(mockGenerateSummary).toHaveBeenCalledWith(456, {
        type: 'time',
        value: 0.5,
      }, undefined);
    });
  });

  describe('execute with count arguments', () => {
    /**
     * **Validates: Requirements 3.3**
     */
    it('should parse "50" and generate summary for 50 messages', async () => {
      const message = createMockMessage(789);
      
      await handler.execute(message, ['50']);

      expect(mockGenerateSummary).toHaveBeenCalledWith(789, {
        type: 'count',
        value: 50,
      }, undefined);
    });

    it('should parse "100" and generate summary for 100 messages', async () => {
      const message = createMockMessage(789);

      await handler.execute(message, ['100']);

      expect(mockGenerateSummary).toHaveBeenCalledWith(789, {
        type: 'count',
        value: 100,
      }, undefined);
    });
  });

  describe('execute with invalid arguments', () => {
    it('should send error message for invalid parameter', async () => {
      const message = createMockMessage(123);
      
      await handler.execute(message, ['invalid']);

      expect(mockGenerateSummary).not.toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('Invalid parameter format')
      );
    });

    it('should send error message for zero count', async () => {
      const message = createMockMessage(123);
      
      await handler.execute(message, ['0']);

      expect(mockGenerateSummary).not.toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('Invalid parameter format')
      );
    });
  });

  describe('error handling', () => {
    it('should send error message when summary generation fails', async () => {
      const message = createMockMessage(123);
      mockGenerateSummary.mockRejectedValue(new Error('AI provider error'));
      
      await handler.execute(message, []);

      // Centralized error handler returns user-friendly messages with ❌ prefix
      expect(mockSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringMatching(/^❌\s+.+/)
      );
      // Verify generateSummary was called before the error
      expect(mockGenerateSummary).toHaveBeenCalled();
    });

    it('should use centralized error handler for NoMessagesError', async () => {
      const message = createMockMessage(123);
      const noMessagesError = new Error('No messages found');
      noMessagesError.name = 'NoMessagesError';
      mockGenerateSummary.mockRejectedValue(noMessagesError);
      
      await handler.execute(message, []);

      // Should get user-friendly message for no messages
      expect(mockSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('❌')
      );
    });
  });

  describe('only uses first argument', () => {
    it('should ignore additional arguments', async () => {
      const message = createMockMessage(123);

      await handler.execute(message, ['1h', 'extra', 'args']);

      expect(mockGenerateSummary).toHaveBeenCalledWith(123, {
        type: 'time',
        value: 1,
      }, undefined);
    });
  });

  describe('forum topic isolation', () => {
    it('should pass message_thread_id to generateSummary for forum topics', async () => {
      const message: Message = {
        ...createMockMessage(123),
        message_thread_id: 456,
      };

      await handler.execute(message, []);

      expect(mockGenerateSummary).toHaveBeenCalledWith(123, {
        type: 'time',
        value: DEFAULT_SUMMARY_HOURS,
      }, 456);
    });

    it('should pass undefined threadId for non-forum chats', async () => {
      const message = createMockMessage(123);

      await handler.execute(message, []);

      expect(mockGenerateSummary).toHaveBeenCalledWith(123, {
        type: 'time',
        value: DEFAULT_SUMMARY_HOURS,
      }, undefined);
    });
  });
});

describe('SummaryHandler with credits', () => {
  let mockSendMessage: jest.Mock;
  let mockGenerateSummary: jest.Mock;
  let mockCreditsStore: jest.Mocked<CreditsStore>;
  let handler: SummaryHandler;

  const defaultCredits: UserCredits = {
    userId: 999,
    dailyLimit: 10,
    creditsUsedToday: 3,
    lastResetDate: '2026-03-06',
    isPaid: false,
    createdAt: 1700000000000,
  };

  beforeEach(() => {
    mockSendMessage = jest.fn().mockResolvedValue(undefined);
    mockGenerateSummary = jest.fn().mockResolvedValue('Summary content');
    mockCreditsStore = {
      userExists: jest.fn().mockResolvedValue(true),
      getOrCreateUser: jest.fn().mockResolvedValue(defaultCredits),
      hasCredit: jest.fn().mockResolvedValue(true),
      consumeCredit: jest.fn().mockResolvedValue(true),
      getCredits: jest.fn().mockResolvedValue(defaultCredits),
      setDailyLimit: jest.fn().mockResolvedValue(undefined),
      setChatOwner: jest.fn().mockResolvedValue(undefined),
      getChatOwner: jest.fn().mockResolvedValue(null),
      getAllChats: jest.fn().mockResolvedValue([]),
    };
    handler = new SummaryHandler(mockSendMessage, mockGenerateSummary, mockCreditsStore);
  });

  it('should consume credit from sender in private chat', async () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 100, type: 'private' },
      from: { id: 999, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      text: '/summary',
    };

    await handler.execute(message, []);

    expect(mockCreditsStore.consumeCredit).toHaveBeenCalledWith(999);
    expect(mockGenerateSummary).toHaveBeenCalled();
  });

  it('should consume credit from sender in group', async () => {
    const message: Message = {
      message_id: 1,
      chat: { id: -200, type: 'group' },
      from: { id: 999, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      text: '/summary',
    };

    await handler.execute(message, []);

    expect(mockCreditsStore.userExists).toHaveBeenCalledWith(999);
    expect(mockCreditsStore.consumeCredit).toHaveBeenCalledWith(999);
    expect(mockGenerateSummary).toHaveBeenCalled();
  });

  it('should prompt user to start bot when userExists returns false in group', async () => {
    mockCreditsStore.userExists.mockResolvedValueOnce(false);

    const message: Message = {
      message_id: 1,
      chat: { id: -200, type: 'group' },
      from: { id: 999, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      text: '/summary',
    };

    await handler.execute(message, []);

    expect(mockCreditsStore.userExists).toHaveBeenCalledWith(999);
    expect(mockCreditsStore.consumeCredit).not.toHaveBeenCalled();
    expect(mockGenerateSummary).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(
      -200,
      expect.stringContaining('start the bot first')
    );
  });

  it('should reject when credits are exhausted', async () => {
    mockCreditsStore.hasCredit.mockResolvedValueOnce(false);

    const message: Message = {
      message_id: 1,
      chat: { id: 100, type: 'private' },
      from: { id: 999, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      text: '/summary',
    };

    await handler.execute(message, []);

    expect(mockGenerateSummary).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(
      100,
      expect.stringContaining('Credits')
    );
  });
});

describe('SummaryHandler private topic flow', () => {
  let mockSendMessage: jest.Mock;
  let mockGenerateSummary: jest.Mock;
  let mockCreditsStore: jest.Mocked<CreditsStore>;
  let mockTopicLinkStore: jest.Mocked<TopicLinkStore>;
  let mockMembershipService: jest.Mocked<MembershipService>;
  let mockTelegramClient: jest.Mocked<TelegramClient>;
  let handler: SummaryHandler;

  const sampleLink: TopicLink = {
    userId: 100,
    topicThreadId: 7,
    groupChatId: -1001234567890,
    groupTitle: 'Dev Team Chat',
    privateChatId: 100,
    linkedAt: 1700000000000,
    status: 'active',
  };

  const defaultCredits: UserCredits = {
    userId: 100,
    dailyLimit: 10,
    creditsUsedToday: 3,
    lastResetDate: '2026-03-06',
    isPaid: false,
    createdAt: 1700000000000,
  };

  beforeEach(() => {
    mockSendMessage = jest.fn().mockResolvedValue(undefined);
    mockGenerateSummary = jest.fn().mockResolvedValue('Private summary content');
    mockCreditsStore = {
      userExists: jest.fn().mockResolvedValue(true),
      getOrCreateUser: jest.fn().mockResolvedValue(defaultCredits),
      hasCredit: jest.fn().mockResolvedValue(true),
      consumeCredit: jest.fn().mockResolvedValue(true),
      getCredits: jest.fn().mockResolvedValue(defaultCredits),
      setDailyLimit: jest.fn().mockResolvedValue(undefined),
      setChatOwner: jest.fn().mockResolvedValue(undefined),
      getChatOwner: jest.fn().mockResolvedValue(null),
      getAllChats: jest.fn().mockResolvedValue([]),
    };
    mockTopicLinkStore = {
      createLink: jest.fn().mockResolvedValue(undefined),
      getLink: jest.fn().mockResolvedValue(sampleLink),
      getUserLinks: jest.fn().mockResolvedValue([]),
      getLinkByGroup: jest.fn().mockResolvedValue(null),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      deleteLink: jest.fn().mockResolvedValue(undefined),
    };
    mockMembershipService = {
      isGroupMember: jest.fn().mockResolvedValue(true),
      getMemberStatus: jest.fn().mockResolvedValue({ isMember: true, status: 'member' }),
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
    editMessageText: jest.fn().mockResolvedValue(undefined),
      setMyCommands: jest.fn().mockResolvedValue(undefined),
      getMe: jest.fn().mockResolvedValue({ id: 123, is_bot: true, first_name: 'Bot' }),
      sendWithReplyKeyboard: jest.fn().mockResolvedValue(undefined),
    };

    const privateTopicDeps: PrivateTopicDeps = {
      topicLinkStore: mockTopicLinkStore,
      membershipService: mockMembershipService,
      telegramClient: mockTelegramClient,
    };

    handler = new SummaryHandler(
      mockSendMessage,
      mockGenerateSummary,
      mockCreditsStore,
      privateTopicDeps
    );
  });

  const createPrivateTopicMessage = (threadId: number = 7): Message => ({
    message_id: 1,
    chat: { id: 100, type: 'private' },
    from: { id: 100, first_name: 'John' },
    date: Math.floor(Date.now() / 1000),
    text: '/summary',
    message_thread_id: threadId,
  });

  it('should generate summary using groupChatId from topic link', async () => {
    const message = createPrivateTopicMessage();

    await handler.execute(message, []);

    expect(mockTopicLinkStore.getLink).toHaveBeenCalledWith(100, 7);
    expect(mockMembershipService.isGroupMember).toHaveBeenCalledWith(-1001234567890, 100);
    // generateSummary called with groupChatId, NOT the private chat ID
    expect(mockGenerateSummary).toHaveBeenCalledWith(
      -1001234567890,
      { type: 'time', value: DEFAULT_SUMMARY_HOURS }
    );
    // Result sent to the private chat, with groupChatId for keyboard context
    expect(mockSendMessage).toHaveBeenCalledWith(100, 'Private summary content', -1001234567890);
  });

  it('should NOT pass threadId to generateSummary (summarize entire group)', async () => {
    const message = createPrivateTopicMessage();

    await handler.execute(message, []);

    // generateSummary should be called with only 2 args (groupChatId, range)
    // NOT with a threadId — we want all group messages
    expect(mockGenerateSummary).toHaveBeenCalledWith(
      -1001234567890,
      { type: 'time', value: DEFAULT_SUMMARY_HOURS }
    );
    expect(mockGenerateSummary.mock.calls[0].length).toBe(2);
  });

  it('should charge the requesting user credits (not group owner)', async () => {
    const message = createPrivateTopicMessage();

    await handler.execute(message, []);

    expect(mockCreditsStore.consumeCredit).toHaveBeenCalledWith(100);
    // Should NOT call getChatOwner — user pays their own credits
    expect(mockCreditsStore.getChatOwner).not.toHaveBeenCalled();
  });

  it('should send error when topic is not linked', async () => {
    mockTopicLinkStore.getLink.mockResolvedValueOnce(null);

    const message = createPrivateTopicMessage();

    await handler.execute(message, []);

    expect(mockGenerateSummary).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(
      100,
      expect.stringContaining('not linked')
    );
  });

  it('should revoke access when user is no longer a group member', async () => {
    mockMembershipService.isGroupMember.mockResolvedValueOnce(false);

    const message = createPrivateTopicMessage();

    await handler.execute(message, []);

    expect(mockGenerateSummary).not.toHaveBeenCalled();
    // Should send error about membership
    expect(mockSendMessage).toHaveBeenCalledWith(
      100,
      expect.stringContaining('no longer a member')
    );
    // Should close the topic
    expect(mockTelegramClient.closeForumTopic).toHaveBeenCalledWith(100, 7);
    // Should update link status to closed
    expect(mockTopicLinkStore.updateStatus).toHaveBeenCalledWith(100, 7, 'closed');
    // Should NOT charge credits
    expect(mockCreditsStore.consumeCredit).not.toHaveBeenCalled();
  });

  it('should still update link status even if closeForumTopic fails', async () => {
    mockMembershipService.isGroupMember.mockResolvedValueOnce(false);
    mockTelegramClient.closeForumTopic.mockRejectedValueOnce(new Error('API error'));

    const message = createPrivateTopicMessage();

    await handler.execute(message, []);

    expect(mockTopicLinkStore.updateStatus).toHaveBeenCalledWith(100, 7, 'closed');
  });

  it('should reject when credits are exhausted in private topic', async () => {
    mockCreditsStore.hasCredit.mockResolvedValueOnce(false);

    const message = createPrivateTopicMessage();

    await handler.execute(message, []);

    expect(mockGenerateSummary).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(
      100,
      expect.stringContaining('Credits')
    );
  });

  it('should parse time parameters in private topic context', async () => {
    const message = createPrivateTopicMessage();

    await handler.execute(message, ['2h']);

    expect(mockGenerateSummary).toHaveBeenCalledWith(
      -1001234567890,
      { type: 'time', value: 2 }
    );
  });

  it('should parse count parameters in private topic context', async () => {
    const message = createPrivateTopicMessage();

    await handler.execute(message, ['50']);

    expect(mockGenerateSummary).toHaveBeenCalledWith(
      -1001234567890,
      { type: 'count', value: 50 }
    );
  });

  it('should send invalid parameter error in private topic context', async () => {
    const message = createPrivateTopicMessage();

    await handler.execute(message, ['invalid']);

    expect(mockGenerateSummary).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(
      100,
      expect.stringContaining('Invalid parameter format')
    );
  });

  it('should handle missing from field in private topic', async () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 100, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text: '/summary',
      message_thread_id: 7,
    };

    await handler.execute(message, []);

    expect(mockSendMessage).toHaveBeenCalledWith(100, 'Unable to identify the user.');
  });

  it('should handle missing private topic deps gracefully', async () => {
    // Create handler without private topic deps
    const handlerWithoutDeps = new SummaryHandler(
      mockSendMessage,
      mockGenerateSummary,
      mockCreditsStore
    );

    const message = createPrivateTopicMessage();

    await handlerWithoutDeps.execute(message, []);

    expect(mockSendMessage).toHaveBeenCalledWith(
      100,
      'Private topic summaries are not configured.'
    );
  });

  it('should use group chat flow for private chat WITHOUT thread_id', async () => {
    // Private chat without message_thread_id = regular private summary (General topic)
    const message: Message = {
      message_id: 1,
      chat: { id: 100, type: 'private' },
      from: { id: 100, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      text: '/summary',
    };

    await handler.execute(message, []);

    // Should use the group/regular flow, not the private topic flow
    expect(mockTopicLinkStore.getLink).not.toHaveBeenCalled();
    expect(mockMembershipService.isGroupMember).not.toHaveBeenCalled();
    // generateSummary called with the private chatId
    expect(mockGenerateSummary).toHaveBeenCalledWith(
      100,
      { type: 'time', value: DEFAULT_SUMMARY_HOURS },
      undefined
    );
  });

  it('should use group chat flow for group messages with thread_id', async () => {
    // Group chat with a forum topic thread — existing behavior unchanged
    const message: Message = {
      message_id: 1,
      chat: { id: -200, type: 'group' },
      from: { id: 100, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      text: '/summary',
      message_thread_id: 42,
    };

    await handler.execute(message, []);

    // Should use the group flow — NOT the private topic flow
    expect(mockTopicLinkStore.getLink).not.toHaveBeenCalled();
    // generateSummary called with group chatId and thread_id
    expect(mockGenerateSummary).toHaveBeenCalledWith(
      -200,
      { type: 'time', value: DEFAULT_SUMMARY_HOURS },
      42
    );
  });
});
