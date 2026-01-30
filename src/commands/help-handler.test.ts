/**
 * Unit Tests for Help Command Handler
 * 
 * Tests the /help command handler functionality including:
 * - Help message content validation
 * - Available commands listing
 * - Privacy information inclusion
 * - Telegram formatting
 * 
 * @module commands/help-handler.test
 * 
 * **Validates: Requirements 4.1, 4.2**
 */

import {
  HelpHandler,
  HELP_MESSAGE,
  DATA_RETENTION_HOURS,
  getPlainTextHelpMessage,
  createHelpHandler,
} from './help-handler';
import { Message } from '../types';

describe('HelpHandler', () => {
  let mockSendMessage: jest.Mock;
  let handler: HelpHandler;

  const createMockMessage = (chatId: number): Message => ({
    message_id: 1,
    chat: { id: chatId, type: 'group' },
    date: Math.floor(Date.now() / 1000),
    text: '/help',
  });

  beforeEach(() => {
    mockSendMessage = jest.fn().mockResolvedValue(undefined);
    handler = new HelpHandler(mockSendMessage);
  });

  describe('execute', () => {
    /**
     * **Validates: Requirements 4.1, 4.2**
     */
    it('should send help message to the chat', async () => {
      const message = createMockMessage(123);
      
      await handler.execute(message, []);

      expect(mockSendMessage).toHaveBeenCalledWith(123, HELP_MESSAGE);
    });

    it('should send help message with correct chat ID', async () => {
      const message = createMockMessage(456);
      
      await handler.execute(message, []);

      expect(mockSendMessage).toHaveBeenCalledWith(456, expect.any(String));
    });

    it('should ignore any arguments passed to the command', async () => {
      const message = createMockMessage(789);
      
      await handler.execute(message, ['extra', 'args', 'ignored']);

      expect(mockSendMessage).toHaveBeenCalledWith(789, HELP_MESSAGE);
    });

    it('should propagate errors from sendMessage', async () => {
      const message = createMockMessage(123);
      mockSendMessage.mockRejectedValue(new Error('Send failed'));
      
      await expect(handler.execute(message, [])).rejects.toThrow('Send failed');
    });
  });
});

describe('HELP_MESSAGE content', () => {
  describe('available commands listing', () => {
    /**
     * **Validates: Requirements 4.1**
     */
    it('should include /summary command', () => {
      expect(HELP_MESSAGE).toContain('/summary');
    });

    it('should include /help command', () => {
      expect(HELP_MESSAGE).toContain('/help');
    });

    it('should include time-based summary example (e.g., 2h)', () => {
      expect(HELP_MESSAGE).toMatch(/\/summary\s+\d+h/);
    });

    it('should include minute-based summary example (e.g., 30m)', () => {
      expect(HELP_MESSAGE).toMatch(/\/summary\s+\d+m/);
    });

    it('should include count-based summary example (e.g., 50)', () => {
      expect(HELP_MESSAGE).toMatch(/\/summary\s+\d+[^hm]/);
    });

    it('should mention default 24 hours behavior', () => {
      expect(HELP_MESSAGE).toContain('24 hours');
    });
  });

  describe('usage examples', () => {
    /**
     * **Validates: Requirements 4.1**
     */
    it('should include usage examples section', () => {
      expect(HELP_MESSAGE).toContain('Usage Examples');
    });

    it('should explain how to catch up on discussions', () => {
      expect(HELP_MESSAGE.toLowerCase()).toContain('catch up');
    });

    it('should provide example for time-based summary', () => {
      expect(HELP_MESSAGE).toContain('/summary 1h');
    });

    it('should provide example for count-based summary', () => {
      expect(HELP_MESSAGE).toContain('/summary 100');
    });
  });

  describe('privacy information', () => {
    /**
     * **Validates: Requirements 4.2**
     */
    it('should include privacy section', () => {
      expect(HELP_MESSAGE).toContain('Privacy');
    });

    it('should mention data retention period', () => {
      expect(HELP_MESSAGE).toContain(`${DATA_RETENTION_HOURS} hours`);
    });

    it('should explain messages are stored temporarily', () => {
      expect(HELP_MESSAGE.toLowerCase()).toContain('temporarily');
    });

    it('should mention automatic deletion', () => {
      expect(HELP_MESSAGE.toLowerCase()).toContain('automatically deleted');
    });

    it('should mention that only text messages are stored', () => {
      expect(HELP_MESSAGE.toLowerCase()).toContain('text messages');
    });

    it('should mention media and stickers are ignored', () => {
      expect(HELP_MESSAGE.toLowerCase()).toContain('media');
      expect(HELP_MESSAGE.toLowerCase()).toContain('stickers');
    });
  });

  describe('Telegram formatting', () => {
    it('should include emoji for visual appeal', () => {
      expect(HELP_MESSAGE).toMatch(/[\u{1F300}-\u{1F9FF}]/u);
    });

    it('should use Markdown bold formatting', () => {
      expect(HELP_MESSAGE).toContain('*');
    });

    it('should use Markdown code formatting for commands', () => {
      expect(HELP_MESSAGE).toContain('`/summary`');
      expect(HELP_MESSAGE).toContain('`/help`');
    });
  });
});

describe('DATA_RETENTION_HOURS', () => {
  it('should be 72 hours as per requirements', () => {
    expect(DATA_RETENTION_HOURS).toBe(72);
  });
});

describe('getPlainTextHelpMessage', () => {
  it('should return a string without Markdown formatting', () => {
    const plainText = getPlainTextHelpMessage();
    
    // Should not contain Markdown bold markers around text
    expect(plainText).not.toMatch(/\*[^*]+\*/);
  });

  it('should include all essential information', () => {
    const plainText = getPlainTextHelpMessage();
    
    expect(plainText).toContain('/summary');
    expect(plainText).toContain('/help');
    expect(plainText).toContain('Privacy');
    expect(plainText).toContain(`${DATA_RETENTION_HOURS} hours`);
  });

  it('should include usage examples', () => {
    const plainText = getPlainTextHelpMessage();
    
    expect(plainText).toContain('/summary 1h');
    expect(plainText).toContain('/summary 100');
  });
});

describe('createHelpHandler', () => {
  it('should create a HelpHandler instance', () => {
    const mockSendMessage = jest.fn();
    const handler = createHelpHandler(mockSendMessage);
    
    expect(handler).toBeInstanceOf(HelpHandler);
  });

  it('should use the provided sendMessage function', async () => {
    const mockSendMessage = jest.fn().mockResolvedValue(undefined);
    const handler = createHelpHandler(mockSendMessage);
    const message = {
      message_id: 1,
      chat: { id: 123, type: 'group' as const },
      date: Math.floor(Date.now() / 1000),
      text: '/help',
    };
    
    await handler.execute(message, []);
    
    expect(mockSendMessage).toHaveBeenCalled();
  });
});
