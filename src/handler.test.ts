/**
 * Unit tests for the main Lambda handler
 * 
 * Tests the webhook handler routing logic and message processing
 * 
 * @module handler.test
 */

import { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  handler,
  handleWebhook,
  handleCallbackQuery,
  handleBotAdded,
  storeMessage,
  isTextMessage,
  isBotAddedEvent,
  isCommand,
  isKeyboardButton,
  handleKeyboardButton,
  getMessageText,
} from './handler';
import { TelegramUpdate, Message, CallbackQuery, StoredMessage } from './types';
import { MessageStore } from './store/message-store';
import { CreditsStore } from './store/credits-store';
import { TopicLinkStore } from './store/topic-link-store';
import { UserGroupStore } from './store/user-group-store';
import { CommandRouter, CommandHandler, createCommandRouter } from './commands/command-router';
import { TelegramClient } from './telegram/telegram-client';
import { createUnlinkHandler } from './commands/unlink-handler';

// Mock the fetch function for Telegram API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock MessageStore
const mockMessageStore: jest.Mocked<MessageStore> = {
  store: jest.fn(),
  query: jest.fn(),
  deleteAll: jest.fn(),
};

// Mock TelegramClient
const mockTelegramClient: jest.Mocked<TelegramClient> = {
  sendMessage: jest.fn().mockResolvedValue(undefined),
  createForumTopic: jest.fn().mockResolvedValue({ message_thread_id: 1, name: 'test', icon_color: 0 }),
  editForumTopic: jest.fn().mockResolvedValue(undefined),
  deleteForumTopic: jest.fn().mockResolvedValue(undefined),
  closeForumTopic: jest.fn().mockResolvedValue(undefined),
  reopenForumTopic: jest.fn().mockResolvedValue(undefined),
  getChatMember: jest.fn().mockResolvedValue({ status: 'member', user: { id: 0, first_name: '' } }),
  sendInlineKeyboard: jest.fn().mockResolvedValue(undefined),
  answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
    editMessageText: jest.fn().mockResolvedValue(undefined),
  getChat: jest.fn().mockResolvedValue({ id: 0, type: 'supergroup', title: 'Test Group' }),
  setMyCommands: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn().mockResolvedValue({ id: 123456789, is_bot: true, first_name: 'SummaryBot' }),
  sendWithReplyKeyboard: jest.fn().mockResolvedValue(undefined),
};

// Mock CreditsStore
const mockCreditsStore: jest.Mocked<CreditsStore> = {
  getOrCreateUser: jest.fn().mockResolvedValue({
    userId: 0, dailyLimit: 10, creditsUsedToday: 0,
    lastResetDate: '2026-03-06', isPaid: false, createdAt: 0,
  }),
  consumeCredit: jest.fn().mockResolvedValue(true),
  getCredits: jest.fn().mockResolvedValue({
    userId: 0, dailyLimit: 10, creditsUsedToday: 0,
    lastResetDate: '2026-03-06', isPaid: false, createdAt: 0,
  }),
  setDailyLimit: jest.fn().mockResolvedValue(undefined),
  setChatOwner: jest.fn().mockResolvedValue(undefined),
  getChatOwner: jest.fn().mockResolvedValue(null),
  getAllChats: jest.fn().mockResolvedValue([]),
};

// Mock TopicLinkStore
const mockTopicLinkStore: jest.Mocked<TopicLinkStore> = {
  createLink: jest.fn().mockResolvedValue(undefined),
  getLink: jest.fn().mockResolvedValue(null),
  getUserLinks: jest.fn().mockResolvedValue([]),
  getLinkByGroup: jest.fn().mockResolvedValue(null),
  updateStatus: jest.fn().mockResolvedValue(undefined),
  deleteLink: jest.fn().mockResolvedValue(undefined),
};

// Mock UserGroupStore
const mockUserGroupStore: jest.Mocked<UserGroupStore> = {
  trackUserInGroup: jest.fn().mockResolvedValue(undefined),
  getUserGroups: jest.fn().mockResolvedValue([]),
};

// Mock sendMessage function for CommandRouter
const mockSendMessage = jest.fn().mockResolvedValue(undefined);

// Create a mock CommandRouter
let mockCommandRouter: CommandRouter;

// Set up environment variables
const MOCK_BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TELEGRAM_BOT_TOKEN = MOCK_BOT_TOKEN;
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ ok: true }),
    text: () => Promise.resolve('{}'),
  });
  mockSendMessage.mockResolvedValue(undefined);
  mockTelegramClient.sendMessage.mockResolvedValue(undefined);
  mockCommandRouter = createCommandRouter(mockSendMessage);
});

afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
});

describe('isTextMessage', () => {
  it('should return true for a message with text', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
      text: 'Hello world',
    };
    expect(isTextMessage(message)).toBe(true);
  });

  it('should return true for a photo message with caption', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
      caption: 'Check out this photo!',
      photo: [{ file_id: 'abc', file_unique_id: 'xyz', width: 100, height: 100 }],
    };
    expect(isTextMessage(message)).toBe(true);
  });

  it('should return false for a message without text', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
    };
    expect(isTextMessage(message)).toBe(false);
  });

  it('should return false for a photo without caption', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
      photo: [{ file_id: 'abc', file_unique_id: 'xyz', width: 100, height: 100 }],
    };
    expect(isTextMessage(message)).toBe(false);
  });

  it('should return false for a command message', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
      text: '/summary',
    };
    expect(isTextMessage(message)).toBe(false);
  });

  it('should return false for a caption that is a command', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
      caption: '/summary',
      photo: [{ file_id: 'abc', file_unique_id: 'xyz', width: 100, height: 100 }],
    };
    expect(isTextMessage(message)).toBe(false);
  });

  it('should return false for a message with empty text', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
      text: '',
    };
    expect(isTextMessage(message)).toBe(false);
  });
});

describe('getMessageText', () => {
  it('should return text for a text message', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
      text: 'Hello world',
    };
    expect(getMessageText(message)).toBe('Hello world');
  });

  it('should return caption with photo prefix for photo messages', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
      caption: 'Check out this photo!',
      photo: [{ file_id: 'abc', file_unique_id: 'xyz', width: 100, height: 100 }],
    };
    expect(getMessageText(message)).toBe('[📷 Photo] Check out this photo!');
  });

  it('should prefer text over caption when both exist', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
      text: 'Text content',
      caption: 'Caption content',
    };
    expect(getMessageText(message)).toBe('Text content');
  });

  it('should return empty string for message without text or caption', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
    };
    expect(getMessageText(message)).toBe('');
  });
});

describe('isCommand', () => {
  it('should return true for a /summary command', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
      text: '/summary',
    };
    expect(isCommand(message)).toBe(true);
  });

  it('should return true for a /help command', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
      text: '/help',
    };
    expect(isCommand(message)).toBe(true);
  });

  it('should return true for a command with arguments', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
      text: '/summary 2h',
    };
    expect(isCommand(message)).toBe(true);
  });

  it('should return false for a regular text message', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
      text: 'Hello world',
    };
    expect(isCommand(message)).toBe(false);
  });

  it('should return false for a message without text', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
    };
    expect(isCommand(message)).toBe(false);
  });
});

describe('isKeyboardButton', () => {
  it('should return true for Link Group button in private chat', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 999, type: 'private' },
      date: Date.now() / 1000,
      text: '\u{1F517} Link Group',
    };
    expect(isKeyboardButton(message)).toBe(true);
  });

  it('should return true for My Groups button in private chat', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 999, type: 'private' },
      date: Date.now() / 1000,
      text: '\u{1F4CB} My Groups',
    };
    expect(isKeyboardButton(message)).toBe(true);
  });

  it('should return true for Credits button in private chat', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 999, type: 'private' },
      date: Date.now() / 1000,
      text: '\u{1F4CA} Credits',
    };
    expect(isKeyboardButton(message)).toBe(true);
  });

  it('should return true for Help button in private chat', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 999, type: 'private' },
      date: Date.now() / 1000,
      text: '\u{2753} Help',
    };
    expect(isKeyboardButton(message)).toBe(true);
  });

  it('should return false for keyboard button text in group chat', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: -100123, type: 'group' },
      date: Date.now() / 1000,
      text: '\u{2753} Help',
    };
    expect(isKeyboardButton(message)).toBe(false);
  });

  it('should return false for a command in private chat', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 999, type: 'private' },
      date: Date.now() / 1000,
      text: '/help',
    };
    expect(isKeyboardButton(message)).toBe(false);
  });

  it('should return false for unrecognized text in private chat', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 999, type: 'private' },
      date: Date.now() / 1000,
      text: 'random message',
    };
    expect(isKeyboardButton(message)).toBe(false);
  });

  it('should return false for message without text', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 999, type: 'private' },
      date: Date.now() / 1000,
    };
    expect(isKeyboardButton(message)).toBe(false);
  });
});

describe('handleKeyboardButton', () => {
  it('should route Link Group button to /link command', async () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 999, type: 'private' },
      date: Date.now() / 1000,
      text: '\u{1F517} Link Group',
    };

    const mockHandler: CommandHandler = { execute: jest.fn().mockResolvedValue(undefined) };
    mockCommandRouter.register('link', mockHandler);

    await handleKeyboardButton(message, mockCommandRouter);

    expect(mockHandler.execute).toHaveBeenCalledWith(
      expect.objectContaining({ text: '/link' }),
      []
    );
  });

  it('should route My Groups button to /groups command', async () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 999, type: 'private' },
      date: Date.now() / 1000,
      text: '\u{1F4CB} My Groups',
    };

    const mockHandler: CommandHandler = { execute: jest.fn().mockResolvedValue(undefined) };
    mockCommandRouter.register('groups', mockHandler);

    await handleKeyboardButton(message, mockCommandRouter);

    expect(mockHandler.execute).toHaveBeenCalledWith(
      expect.objectContaining({ text: '/groups' }),
      []
    );
  });

  it('should route Credits button to /credits command', async () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 999, type: 'private' },
      date: Date.now() / 1000,
      text: '\u{1F4CA} Credits',
    };

    const mockHandler: CommandHandler = { execute: jest.fn().mockResolvedValue(undefined) };
    mockCommandRouter.register('credits', mockHandler);

    await handleKeyboardButton(message, mockCommandRouter);

    expect(mockHandler.execute).toHaveBeenCalledWith(
      expect.objectContaining({ text: '/credits' }),
      []
    );
  });

  it('should route Help button to /help command', async () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 999, type: 'private' },
      date: Date.now() / 1000,
      text: '\u{2753} Help',
    };

    const mockHandler: CommandHandler = { execute: jest.fn().mockResolvedValue(undefined) };
    mockCommandRouter.register('help', mockHandler);

    await handleKeyboardButton(message, mockCommandRouter);

    expect(mockHandler.execute).toHaveBeenCalledWith(
      expect.objectContaining({ text: '/help' }),
      []
    );
  });
});

describe('handleWebhook keyboard button routing', () => {
  it('should route keyboard button press to command handler instead of storing as text', async () => {
    const mockHandler: CommandHandler = { execute: jest.fn().mockResolvedValue(undefined) };
    mockCommandRouter.register('help', mockHandler);

    const update: TelegramUpdate = {
      update_id: 20,
      message: {
        message_id: 20,
        chat: { id: 999, type: 'private' },
        from: { id: 999, first_name: 'Alice' },
        date: Date.now() / 1000,
        text: '\u{2753} Help',
      },
    };

    await handleWebhook(update, mockMessageStore, mockCommandRouter, mockTelegramClient);

    expect(mockHandler.execute).toHaveBeenCalled();
    expect(mockMessageStore.store).not.toHaveBeenCalled();
  });

  it('should not intercept keyboard button text in group chats', async () => {
    const update: TelegramUpdate = {
      update_id: 21,
      message: {
        message_id: 21,
        chat: { id: -100123, type: 'group' },
        from: { id: 999, first_name: 'Alice' },
        date: Date.now() / 1000,
        text: '\u{2753} Help',
      },
    };

    await handleWebhook(update, mockMessageStore, mockCommandRouter, mockTelegramClient);

    // Should be stored as a regular text message, not intercepted as button
    expect(mockMessageStore.store).toHaveBeenCalledTimes(1);
  });
});

describe('isBotAddedEvent', () => {
  it('should return true when bot is in new_chat_members', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
      new_chat_members: [
        { id: 123456789, first_name: 'SummaryBot', username: 'summary_bot' },
      ],
    };
    expect(isBotAddedEvent(message)).toBe(true);
  });

  it('should return false when new_chat_members is empty', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
      new_chat_members: [],
    };
    expect(isBotAddedEvent(message)).toBe(false);
  });

  it('should return false when new_chat_members is undefined', () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Date.now() / 1000,
    };
    expect(isBotAddedEvent(message)).toBe(false);
  });
});

describe('handleBotAdded', () => {
  it('should send welcome message when bot is added to group', async () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group', title: 'Test Group' },
      date: Date.now() / 1000,
      new_chat_members: [
        { id: 123456789, first_name: 'SummaryBot' },
      ],
    };

    await handleBotAdded(message, mockTelegramClient);

    expect(mockTelegramClient.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockTelegramClient.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Hello')
    );
  });

  it('should include privacy information in welcome message', async () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 456, type: 'supergroup', title: 'Super Group' },
      date: Date.now() / 1000,
      new_chat_members: [
        { id: 123456789, first_name: 'SummaryBot' },
      ],
    };

    await handleBotAdded(message, mockTelegramClient);

    const callArgs = mockTelegramClient.sendMessage.mock.calls[0];
    const messageText = callArgs[1];

    // Verify welcome message contains privacy information
    expect(messageText).toContain('Privacy');
    expect(messageText).toContain('72 hours');
    expect(messageText).toContain('/summary');
    expect(messageText).toContain('/help');
  });

  it('should record chat ownership when creditsStore is provided', async () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group', title: 'Test Group' },
      from: { id: 777, first_name: 'Adder' },
      date: Date.now() / 1000,
      new_chat_members: [
        { id: 123456789, first_name: 'SummaryBot' },
      ],
    };

    await handleBotAdded(message, mockTelegramClient, mockCreditsStore);

    expect(mockCreditsStore.setChatOwner).toHaveBeenCalledWith(123, 777);
  });

  it('should not fail if creditsStore is not provided', async () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group', title: 'Test Group' },
      from: { id: 777, first_name: 'Adder' },
      date: Date.now() / 1000,
      new_chat_members: [
        { id: 123456789, first_name: 'SummaryBot' },
      ],
    };

    await handleBotAdded(message, mockTelegramClient);

    expect(mockTelegramClient.sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('storeMessage', () => {
  it('should store a text message with all required fields', async () => {
    const message: Message = {
      message_id: 42,
      chat: { id: 123, type: 'group' },
      from: { id: 999, first_name: 'John', username: 'johndoe' },
      date: 1700000000,
      text: 'Hello, this is a test message',
    };

    await storeMessage(message, mockMessageStore);

    expect(mockMessageStore.store).toHaveBeenCalledTimes(1);
    const storedMessage = mockMessageStore.store.mock.calls[0][0] as StoredMessage;
    
    expect(storedMessage.chatId).toBe(123);
    expect(storedMessage.messageId).toBe(42);
    expect(storedMessage.userId).toBe(999);
    expect(storedMessage.username).toBe('johndoe');
    expect(storedMessage.text).toBe('Hello, this is a test message');
    // Timestamp is base (date * 1000) + (message_id % 1000) for uniqueness
    expect(storedMessage.timestamp).toBe(1700000000000 + (42 % 1000));
  });

  it('should use first_name when username is not available', async () => {
    const message: Message = {
      message_id: 43,
      chat: { id: 123, type: 'group' },
      from: { id: 888, first_name: 'Jane' },
      date: 1700000000,
      text: 'Another test message',
    };

    await storeMessage(message, mockMessageStore);

    const storedMessage = mockMessageStore.store.mock.calls[0][0] as StoredMessage;
    expect(storedMessage.username).toBe('Jane');
  });

  it('should use "Unknown" when from is not available', async () => {
    const message: Message = {
      message_id: 44,
      chat: { id: 123, type: 'group' },
      date: 1700000000,
      text: 'Message without sender',
    };

    await storeMessage(message, mockMessageStore);

    const storedMessage = mockMessageStore.store.mock.calls[0][0] as StoredMessage;
    expect(storedMessage.username).toBe('Unknown');
    expect(storedMessage.userId).toBe(0);
  });

  it('should include reply context when message is a reply', async () => {
    const message: Message = {
      message_id: 45,
      chat: { id: 123, type: 'group' },
      from: { id: 999, first_name: 'John' },
      date: 1700000000,
      text: 'This is a reply',
      reply_to_message: {
        message_id: 40,
        chat: { id: 123, type: 'group' },
        date: 1699999000,
        text: 'Original message',
      },
    };

    await storeMessage(message, mockMessageStore);

    const storedMessage = mockMessageStore.store.mock.calls[0][0] as StoredMessage;
    expect(storedMessage.replyToMessageId).toBe(40);
  });

  it('should include thread ID for forum topics', async () => {
    const message: Message = {
      message_id: 46,
      chat: { id: 123, type: 'supergroup' },
      from: { id: 999, first_name: 'John' },
      date: 1700000000,
      text: 'Message in a topic',
      message_thread_id: 100,
    };

    await storeMessage(message, mockMessageStore);

    const storedMessage = mockMessageStore.store.mock.calls[0][0] as StoredMessage;
    expect(storedMessage.threadId).toBe(100);
  });

  it('should store photo caption with photo prefix', async () => {
    const message: Message = {
      message_id: 47,
      chat: { id: 123, type: 'group' },
      from: { id: 999, first_name: 'John', username: 'johndoe' },
      date: 1700000000,
      caption: 'Look at this amazing sunset!',
      photo: [{ file_id: 'abc', file_unique_id: 'xyz', width: 800, height: 600 }],
    };

    await storeMessage(message, mockMessageStore);

    expect(mockMessageStore.store).toHaveBeenCalledTimes(1);
    const storedMessage = mockMessageStore.store.mock.calls[0][0] as StoredMessage;
    
    expect(storedMessage.text).toBe('[📷 Photo] Look at this amazing sunset!');
    expect(storedMessage.username).toBe('johndoe');
  });
});

describe('handleWebhook', () => {
  it('should handle bot added to group event', async () => {
    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 123, type: 'group', title: 'Test Group' },
        date: Date.now() / 1000,
        new_chat_members: [
          { id: 123456789, first_name: 'SummaryBot' },
        ],
      },
    };

    await handleWebhook(update, mockMessageStore, mockCommandRouter, mockTelegramClient);

    // Should send welcome message via TelegramClient
    expect(mockTelegramClient.sendMessage).toHaveBeenCalledTimes(1);
    // Should NOT store the message
    expect(mockMessageStore.store).not.toHaveBeenCalled();
  });

  it('should handle command messages', async () => {
    const update: TelegramUpdate = {
      update_id: 2,
      message: {
        message_id: 2,
        chat: { id: 123, type: 'group' },
        from: { id: 999, first_name: 'John' },
        date: Date.now() / 1000,
        text: '/summary 2h',
      },
    };

    await handleWebhook(update, mockMessageStore, mockCommandRouter, mockTelegramClient);

    // Should NOT store command messages
    expect(mockMessageStore.store).not.toHaveBeenCalled();
    // Should send unknown command message (since no handler is registered)
    expect(mockSendMessage).toHaveBeenCalled();
  });

  it('should store text messages', async () => {
    const update: TelegramUpdate = {
      update_id: 3,
      message: {
        message_id: 3,
        chat: { id: 123, type: 'group' },
        from: { id: 999, first_name: 'John' },
        date: Date.now() / 1000,
        text: 'Hello everyone!',
      },
    };

    await handleWebhook(update, mockMessageStore, mockCommandRouter, mockTelegramClient);

    expect(mockMessageStore.store).toHaveBeenCalledTimes(1);
  });

  it('should ignore messages without text (stickers, media)', async () => {
    const update: TelegramUpdate = {
      update_id: 4,
      message: {
        message_id: 4,
        chat: { id: 123, type: 'group' },
        from: { id: 999, first_name: 'John' },
        date: Date.now() / 1000,
        // No text field - simulates a sticker or media message without caption
      },
    };

    await handleWebhook(update, mockMessageStore, mockCommandRouter, mockTelegramClient);

    // Should NOT store non-text messages
    expect(mockMessageStore.store).not.toHaveBeenCalled();
    // Should NOT send any Telegram messages
    expect(mockTelegramClient.sendMessage).not.toHaveBeenCalled();
  });

  it('should store photo messages with captions', async () => {
    const update: TelegramUpdate = {
      update_id: 7,
      message: {
        message_id: 7,
        chat: { id: 123, type: 'group' },
        from: { id: 999, first_name: 'John' },
        date: Date.now() / 1000,
        caption: 'Check out this photo!',
        photo: [{ file_id: 'abc', file_unique_id: 'xyz', width: 100, height: 100 }],
      },
    };

    await handleWebhook(update, mockMessageStore, mockCommandRouter, mockTelegramClient);

    expect(mockMessageStore.store).toHaveBeenCalledTimes(1);
  });

  it('should skip updates without a message', async () => {
    const update: TelegramUpdate = {
      update_id: 5,
      // No message field
    };

    await handleWebhook(update, mockMessageStore, mockCommandRouter, mockTelegramClient);

    expect(mockMessageStore.store).not.toHaveBeenCalled();
    expect(mockTelegramClient.sendMessage).not.toHaveBeenCalled();
  });

  it('should prioritize bot added event over text in same message', async () => {
    // Edge case: message has both new_chat_members and text
    const update: TelegramUpdate = {
      update_id: 6,
      message: {
        message_id: 6,
        chat: { id: 123, type: 'group', title: 'Test Group' },
        date: Date.now() / 1000,
        text: 'User joined the group',
        new_chat_members: [
          { id: 123456789, first_name: 'SummaryBot' },
        ],
      },
    };

    await handleWebhook(update, mockMessageStore, mockCommandRouter, mockTelegramClient);

    // Should send welcome message (bot added takes priority)
    expect(mockTelegramClient.sendMessage).toHaveBeenCalledTimes(1);
    // Should NOT store the message
    expect(mockMessageStore.store).not.toHaveBeenCalled();
  });

  it('should track user in group when storing text messages from non-private chats', async () => {
    const update: TelegramUpdate = {
      update_id: 8,
      message: {
        message_id: 8,
        chat: { id: -1001234567, type: 'supergroup', title: 'Dev Team' },
        from: { id: 999, first_name: 'John' },
        date: Date.now() / 1000,
        text: 'Hello everyone!',
      },
    };

    await handleWebhook(
      update, mockMessageStore, mockCommandRouter, mockTelegramClient,
      mockCreditsStore, mockUserGroupStore
    );

    expect(mockMessageStore.store).toHaveBeenCalledTimes(1);
    expect(mockUserGroupStore.trackUserInGroup).toHaveBeenCalledWith(
      999, -1001234567, 'Dev Team'
    );
  });

  it('should not track user in group for private chat messages', async () => {
    const update: TelegramUpdate = {
      update_id: 9,
      message: {
        message_id: 9,
        chat: { id: 999, type: 'private' },
        from: { id: 999, first_name: 'John' },
        date: Date.now() / 1000,
        text: 'Hello bot',
      },
    };

    await handleWebhook(
      update, mockMessageStore, mockCommandRouter, mockTelegramClient,
      mockCreditsStore, mockUserGroupStore
    );

    expect(mockMessageStore.store).toHaveBeenCalledTimes(1);
    expect(mockUserGroupStore.trackUserInGroup).not.toHaveBeenCalled();
  });

  it('should not break message storage if user-group tracking fails', async () => {
    mockUserGroupStore.trackUserInGroup.mockRejectedValueOnce(new Error('DynamoDB error'));

    const update: TelegramUpdate = {
      update_id: 10,
      message: {
        message_id: 10,
        chat: { id: -1001234567, type: 'group', title: 'Test Group' },
        from: { id: 999, first_name: 'John' },
        date: Date.now() / 1000,
        text: 'Hello everyone!',
      },
    };

    // Should not throw even though tracking fails
    await handleWebhook(
      update, mockMessageStore, mockCommandRouter, mockTelegramClient,
      mockCreditsStore, mockUserGroupStore
    );

    expect(mockMessageStore.store).toHaveBeenCalledTimes(1);
    expect(mockUserGroupStore.trackUserInGroup).toHaveBeenCalled();
  });

  it('should use "Unknown Group" when chat title is missing', async () => {
    const update: TelegramUpdate = {
      update_id: 11,
      message: {
        message_id: 11,
        chat: { id: -1001234567, type: 'group' },
        from: { id: 999, first_name: 'John' },
        date: Date.now() / 1000,
        text: 'Hello!',
      },
    };

    await handleWebhook(
      update, mockMessageStore, mockCommandRouter, mockTelegramClient,
      mockCreditsStore, mockUserGroupStore
    );

    expect(mockUserGroupStore.trackUserInGroup).toHaveBeenCalledWith(
      999, -1001234567, 'Unknown Group'
    );
  });
});

describe('handleCallbackQuery', () => {
  it('should answer with "No action data" when data is missing', async () => {
    const callbackQuery: CallbackQuery = {
      id: 'cb-1',
      from: { id: 999, first_name: 'John' },
      chat_instance: 'test',
    };

    const unlinkHandler = createUnlinkHandler(mockSendMessage, mockTopicLinkStore, mockTelegramClient);
    await handleCallbackQuery(callbackQuery, mockTelegramClient, mockTopicLinkStore, unlinkHandler);

    expect(mockTelegramClient.answerCallbackQuery).toHaveBeenCalledWith('cb-1', 'No action data.');
  });

  it('should route link callbacks to handleLinkCallback', async () => {
    mockTopicLinkStore.getLinkByGroup.mockResolvedValueOnce(null);
    mockTelegramClient.createForumTopic.mockResolvedValueOnce({
      message_thread_id: 42,
      name: 'Test Group',
      icon_color: 0,
    });

    const callbackQuery: CallbackQuery = {
      id: 'cb-2',
      from: { id: 999, first_name: 'John' },
      message: {
        message_id: 100,
        chat: { id: 999, type: 'private' },
        date: Date.now() / 1000,
      },
      data: 'link:-1001234567',
      chat_instance: 'test',
    };

    const unlinkHandler = createUnlinkHandler(mockSendMessage, mockTopicLinkStore, mockTelegramClient);
    await handleCallbackQuery(callbackQuery, mockTelegramClient, mockTopicLinkStore, unlinkHandler);

    // Should have created a forum topic
    expect(mockTelegramClient.createForumTopic).toHaveBeenCalled();
    // Should have stored the link
    expect(mockTopicLinkStore.createLink).toHaveBeenCalled();
    // Should have answered the callback query
    expect(mockTelegramClient.answerCallbackQuery).toHaveBeenCalledWith('cb-2', 'Group linked!');
  });

  it('should route unlink confirm callbacks', async () => {
    mockTopicLinkStore.getLink.mockResolvedValueOnce({
      userId: 999,
      topicThreadId: 42,
      groupChatId: -1001234567,
      groupTitle: 'Test Group',
      privateChatId: 999,
      linkedAt: Date.now(),
      status: 'active',
    });

    const callbackQuery: CallbackQuery = {
      id: 'cb-3',
      from: { id: 999, first_name: 'John' },
      message: {
        message_id: 100,
        chat: { id: 999, type: 'private' },
        date: Date.now() / 1000,
      },
      data: 'unlink:confirm:999:42',
      chat_instance: 'test',
    };

    const unlinkHandler = createUnlinkHandler(mockSendMessage, mockTopicLinkStore, mockTelegramClient);
    await handleCallbackQuery(callbackQuery, mockTelegramClient, mockTopicLinkStore, unlinkHandler);

    // Should have deleted the link
    expect(mockTopicLinkStore.deleteLink).toHaveBeenCalledWith(999, 42);
    // Should have deleted the forum topic
    expect(mockTelegramClient.deleteForumTopic).toHaveBeenCalledWith(999, 42);
    // Should have answered the callback query
    expect(mockTelegramClient.answerCallbackQuery).toHaveBeenCalledWith('cb-3', 'Unlinked successfully.');
  });

  it('should route unlink cancel callbacks', async () => {
    const callbackQuery: CallbackQuery = {
      id: 'cb-4',
      from: { id: 999, first_name: 'John' },
      message: {
        message_id: 100,
        chat: { id: 999, type: 'private' },
        date: Date.now() / 1000,
      },
      data: 'unlink:cancel:999:42',
      chat_instance: 'test',
    };

    const unlinkHandler = createUnlinkHandler(mockSendMessage, mockTopicLinkStore, mockTelegramClient);
    await handleCallbackQuery(callbackQuery, mockTelegramClient, mockTopicLinkStore, unlinkHandler);

    expect(mockTelegramClient.answerCallbackQuery).toHaveBeenCalledWith('cb-4', 'Unlink cancelled.');
  });

  it('should answer with "Unknown action" for unrecognized callback data', async () => {
    const callbackQuery: CallbackQuery = {
      id: 'cb-5',
      from: { id: 999, first_name: 'John' },
      data: 'something:unknown',
      chat_instance: 'test',
    };

    const unlinkHandler = createUnlinkHandler(mockSendMessage, mockTopicLinkStore, mockTelegramClient);
    await handleCallbackQuery(callbackQuery, mockTelegramClient, mockTopicLinkStore, unlinkHandler);

    expect(mockTelegramClient.answerCallbackQuery).toHaveBeenCalledWith('cb-5', 'Unknown action.');
  });

  it('should handle errors in callback query processing gracefully', async () => {
    // Make the link callback throw
    mockTopicLinkStore.getLinkByGroup.mockRejectedValueOnce(new Error('DB error'));

    const callbackQuery: CallbackQuery = {
      id: 'cb-6',
      from: { id: 999, first_name: 'John' },
      message: {
        message_id: 100,
        chat: { id: 999, type: 'private' },
        date: Date.now() / 1000,
      },
      data: 'link:-1001234567',
      chat_instance: 'test',
    };

    const unlinkHandler = createUnlinkHandler(mockSendMessage, mockTopicLinkStore, mockTelegramClient);

    // Should not throw
    await handleCallbackQuery(callbackQuery, mockTelegramClient, mockTopicLinkStore, unlinkHandler);

    // Should attempt to answer with error
    expect(mockTelegramClient.answerCallbackQuery).toHaveBeenCalledWith('cb-6', 'An error occurred.');
  });
});

describe('handler (Lambda entry point)', () => {
  it('should return 400 for missing request body', async () => {
    const event = {
      body: undefined,
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);

    expect(typeof result).not.toBe('string');
    if (typeof result !== 'string') {
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body as string)).toEqual({ error: 'Missing request body' });
    }
  });

  it('should return 400 for invalid JSON', async () => {
    const event = {
      body: 'not valid json',
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);

    expect(typeof result).not.toBe('string');
    if (typeof result !== 'string') {
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body as string)).toEqual({ error: 'Invalid JSON in request body' });
    }
  });

  it('should return 200 for valid update', async () => {
    const update: TelegramUpdate = {
      update_id: 100,
      message: {
        message_id: 100,
        chat: { id: 123, type: 'group' },
        from: { id: 999, first_name: 'John' },
        date: Date.now() / 1000,
        text: 'Test message',
      },
    };

    const event = {
      body: JSON.stringify(update),
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);

    expect(typeof result).not.toBe('string');
    if (typeof result !== 'string') {
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body as string)).toEqual({ ok: true });
    }
  });

  it('should return 200 even on internal errors (to prevent Telegram retries)', async () => {
    // Simulate an error by not setting the bot token
    delete process.env.TELEGRAM_BOT_TOKEN;

    const update: TelegramUpdate = {
      update_id: 101,
      message: {
        message_id: 101,
        chat: { id: 123, type: 'group', title: 'Test' },
        date: Date.now() / 1000,
        new_chat_members: [
          { id: 123456789, first_name: 'SummaryBot' },
        ],
      },
    };

    const event = {
      body: JSON.stringify(update),
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);

    // Should still return 200 to prevent Telegram from retrying
    expect(typeof result).not.toBe('string');
    if (typeof result !== 'string') {
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body as string)).toEqual({ ok: true });
    }
  });
});
