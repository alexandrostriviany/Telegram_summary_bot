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
  handleBotAdded,
  storeMessage,
  isTextMessage,
  isBotAddedEvent,
  isCommand,
  getMessageText,
} from './handler';
import { TelegramUpdate, Message, StoredMessage } from './types';
import { MessageStore } from './store/message-store';
import { CommandRouter, createCommandRouter } from './commands/command-router';
import { TelegramClient } from './telegram/telegram-client';

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
