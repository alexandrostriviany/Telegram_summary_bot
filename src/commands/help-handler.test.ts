/**
 * Unit Tests for Help Command Handler
 *
 * Tests context-aware help: compact in groups, full in private chats.
 *
 * @module commands/help-handler.test
 *
 * **Validates: Requirements 4.1, 4.2**
 */

import {
  HelpHandler,
  GROUP_HELP_MESSAGE,
  PRIVATE_HELP_MESSAGE,
  DATA_RETENTION_HOURS,
  createHelpHandler,
} from './help-handler';
import { Message } from '../types';

describe('HelpHandler', () => {
  let mockSendMessage: jest.Mock;
  let handler: HelpHandler;

  const createMockMessage = (
    chatId: number,
    chatType: 'group' | 'supergroup' | 'private' = 'group'
  ): Message => ({
    message_id: 1,
    chat: { id: chatId, type: chatType },
    date: Math.floor(Date.now() / 1000),
    text: '/help',
  });

  beforeEach(() => {
    mockSendMessage = jest.fn().mockResolvedValue(undefined);
    handler = new HelpHandler(mockSendMessage);
  });

  describe('execute — group chat', () => {
    it('should send GROUP_HELP_MESSAGE in a group chat', async () => {
      const message = createMockMessage(123, 'group');

      await handler.execute(message, []);

      expect(mockSendMessage).toHaveBeenCalledWith(123, GROUP_HELP_MESSAGE);
    });

    it('should send GROUP_HELP_MESSAGE in a supergroup chat', async () => {
      const message = createMockMessage(456, 'supergroup');

      await handler.execute(message, []);

      expect(mockSendMessage).toHaveBeenCalledWith(456, GROUP_HELP_MESSAGE);
    });
  });

  describe('execute — private chat', () => {
    it('should send PRIVATE_HELP_MESSAGE in a private chat', async () => {
      const message = createMockMessage(789, 'private');

      await handler.execute(message, []);

      expect(mockSendMessage).toHaveBeenCalledWith(789, PRIVATE_HELP_MESSAGE);
    });
  });

  describe('execute — general', () => {
    it('should ignore any arguments passed to the command', async () => {
      const message = createMockMessage(100, 'private');

      await handler.execute(message, ['extra', 'args']);

      expect(mockSendMessage).toHaveBeenCalledWith(100, PRIVATE_HELP_MESSAGE);
    });

    it('should propagate errors from sendMessage', async () => {
      const message = createMockMessage(123, 'group');
      mockSendMessage.mockRejectedValue(new Error('Send failed'));

      await expect(handler.execute(message, [])).rejects.toThrow('Send failed');
    });
  });
});

describe('GROUP_HELP_MESSAGE content', () => {
  it('should include /summary command', () => {
    expect(GROUP_HELP_MESSAGE).toContain('/summary');
  });

  it('should include /credits command', () => {
    expect(GROUP_HELP_MESSAGE).toContain('/credits');
  });

  it('should include time-based example', () => {
    expect(GROUP_HELP_MESSAGE).toContain('/summary 2h');
  });

  it('should include count-based example', () => {
    expect(GROUP_HELP_MESSAGE).toContain('/summary 50');
  });

  it('should mention DM for private summaries', () => {
    expect(GROUP_HELP_MESSAGE.toLowerCase()).toContain('dm me');
  });

  it('should NOT include private-only commands', () => {
    expect(GROUP_HELP_MESSAGE).not.toContain('/link');
    expect(GROUP_HELP_MESSAGE).not.toContain('/unlink');
    expect(GROUP_HELP_MESSAGE).not.toContain('/groups');
  });

  it('should use HTML formatting', () => {
    expect(GROUP_HELP_MESSAGE).toContain('<b>');
    expect(GROUP_HELP_MESSAGE).toContain('</b>');
  });
});

describe('PRIVATE_HELP_MESSAGE content', () => {
  it('should include /summary command', () => {
    expect(PRIVATE_HELP_MESSAGE).toContain('/summary');
  });

  it('should include time-based examples', () => {
    expect(PRIVATE_HELP_MESSAGE).toContain('/summary 2h');
    expect(PRIVATE_HELP_MESSAGE).toContain('/summary 30m');
  });

  it('should include count-based example', () => {
    expect(PRIVATE_HELP_MESSAGE).toContain('/summary 50');
  });

  it('should include private-only commands', () => {
    expect(PRIVATE_HELP_MESSAGE).toContain('/link');
    expect(PRIVATE_HELP_MESSAGE).toContain('/unlink');
    expect(PRIVATE_HELP_MESSAGE).toContain('/groups');
  });

  it('should include /credits command', () => {
    expect(PRIVATE_HELP_MESSAGE).toContain('/credits');
  });

  it('should include privacy information with retention period', () => {
    expect(PRIVATE_HELP_MESSAGE).toContain(`${DATA_RETENTION_HOURS}h`);
  });

  it('should mention data is not shared', () => {
    expect(PRIVATE_HELP_MESSAGE.toLowerCase()).toContain('no data is shared');
  });

  it('should include how-it-works instructions', () => {
    expect(PRIVATE_HELP_MESSAGE).toContain('How it works');
  });

  it('should use HTML formatting', () => {
    expect(PRIVATE_HELP_MESSAGE).toContain('<b>');
    expect(PRIVATE_HELP_MESSAGE).toContain('</b>');
  });
});

describe('DATA_RETENTION_HOURS', () => {
  it('should be 72 hours as per requirements', () => {
    expect(DATA_RETENTION_HOURS).toBe(72);
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
    const message: Message = {
      message_id: 1,
      chat: { id: 123, type: 'group' },
      date: Math.floor(Date.now() / 1000),
      text: '/help',
    };

    await handler.execute(message, []);

    expect(mockSendMessage).toHaveBeenCalled();
  });
});
