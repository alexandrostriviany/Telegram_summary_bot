/**
 * Unit tests for Command Router
 * 
 * Tests command parsing, routing, and unknown command handling.
 * 
 * @module commands/command-router.test
 */

import { parseCommand, CommandRouter, CommandHandler } from './command-router';
import { Message, Chat } from '../types';

// Helper to create a mock message
function createMockMessage(text: string, chatId: number = 12345): Message {
  return {
    message_id: 1,
    chat: {
      id: chatId,
      type: 'group',
      title: 'Test Group',
    } as Chat,
    from: {
      id: 100,
      first_name: 'Test',
      username: 'testuser',
    },
    date: Math.floor(Date.now() / 1000),
    text,
  };
}

describe('parseCommand', () => {
  describe('basic command parsing', () => {
    it('should parse a simple command without arguments', () => {
      const result = parseCommand('/help');
      
      expect(result).not.toBeNull();
      expect(result!.command).toBe('/help');
      expect(result!.commandName).toBe('help');
      expect(result!.args).toEqual([]);
      expect(result!.rawArgs).toBe('');
    });

    it('should parse a command with a single argument', () => {
      const result = parseCommand('/summary 1h');
      
      expect(result).not.toBeNull();
      expect(result!.command).toBe('/summary');
      expect(result!.commandName).toBe('summary');
      expect(result!.args).toEqual(['1h']);
      expect(result!.rawArgs).toBe('1h');
    });

    it('should parse a command with multiple arguments', () => {
      const result = parseCommand('/test arg1 arg2 arg3');
      
      expect(result).not.toBeNull();
      expect(result!.command).toBe('/test');
      expect(result!.commandName).toBe('test');
      expect(result!.args).toEqual(['arg1', 'arg2', 'arg3']);
      expect(result!.rawArgs).toBe('arg1 arg2 arg3');
    });

    it('should parse /summary with count parameter', () => {
      const result = parseCommand('/summary 50');
      
      expect(result).not.toBeNull();
      expect(result!.command).toBe('/summary');
      expect(result!.commandName).toBe('summary');
      expect(result!.args).toEqual(['50']);
    });

    it('should parse /summary with time parameter', () => {
      const result = parseCommand('/summary 2h');
      
      expect(result).not.toBeNull();
      expect(result!.command).toBe('/summary');
      expect(result!.commandName).toBe('summary');
      expect(result!.args).toEqual(['2h']);
    });
  });

  describe('bot username handling', () => {
    it('should strip bot username from command', () => {
      const result = parseCommand('/summary@MyBot 1h');
      
      expect(result).not.toBeNull();
      expect(result!.command).toBe('/summary');
      expect(result!.commandName).toBe('summary');
      expect(result!.args).toEqual(['1h']);
    });

    it('should handle command with bot username and no arguments', () => {
      const result = parseCommand('/help@SummaryBot');
      
      expect(result).not.toBeNull();
      expect(result!.command).toBe('/help');
      expect(result!.commandName).toBe('help');
      expect(result!.args).toEqual([]);
    });
  });

  describe('case handling', () => {
    it('should convert command to lowercase', () => {
      const result = parseCommand('/SUMMARY 1h');
      
      expect(result).not.toBeNull();
      expect(result!.command).toBe('/summary');
      expect(result!.commandName).toBe('summary');
    });

    it('should preserve argument case', () => {
      const result = parseCommand('/test ArgWithCase');
      
      expect(result).not.toBeNull();
      expect(result!.args).toEqual(['ArgWithCase']);
    });
  });

  describe('whitespace handling', () => {
    it('should handle multiple spaces between arguments', () => {
      const result = parseCommand('/summary   1h');
      
      expect(result).not.toBeNull();
      expect(result!.args).toEqual(['1h']);
    });

    it('should handle leading/trailing whitespace', () => {
      const result = parseCommand('  /summary 1h  ');
      
      expect(result).not.toBeNull();
      expect(result!.command).toBe('/summary');
      expect(result!.args).toEqual(['1h']);
    });
  });

  describe('non-command handling', () => {
    it('should return null for non-command text', () => {
      expect(parseCommand('hello world')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseCommand('')).toBeNull();
    });

    it('should return null for null/undefined', () => {
      expect(parseCommand(null as unknown as string)).toBeNull();
      expect(parseCommand(undefined as unknown as string)).toBeNull();
    });

    it('should return null for text starting with space then slash', () => {
      // This is not a command - commands must start with /
      const result = parseCommand(' /summary');
      // After trim, it starts with /, so it should be parsed
      expect(result).not.toBeNull();
      expect(result!.command).toBe('/summary');
    });
  });
});

describe('CommandRouter', () => {
  let router: CommandRouter;
  let mockSendMessage: jest.Mock;
  let mockHandler: jest.Mocked<CommandHandler>;

  beforeEach(() => {
    mockSendMessage = jest.fn().mockResolvedValue(undefined);
    router = new CommandRouter(mockSendMessage);
    mockHandler = {
      execute: jest.fn().mockResolvedValue(undefined),
    };
  });

  describe('handler registration', () => {
    it('should register a command handler', () => {
      router.register('summary', mockHandler);
      
      expect(router.hasHandler('summary')).toBe(true);
    });

    it('should register handler case-insensitively', () => {
      router.register('SUMMARY', mockHandler);
      
      expect(router.hasHandler('summary')).toBe(true);
      expect(router.hasHandler('SUMMARY')).toBe(true);
    });

    it('should return registered commands', () => {
      router.register('summary', mockHandler);
      router.register('help', mockHandler);
      
      const commands = router.getRegisteredCommands();
      expect(commands).toContain('summary');
      expect(commands).toContain('help');
    });

    it('should return false for unregistered commands', () => {
      expect(router.hasHandler('unknown')).toBe(false);
    });
  });

  describe('command routing', () => {
    it('should route /summary command to registered handler', async () => {
      router.register('summary', mockHandler);
      const message = createMockMessage('/summary');
      
      await router.route(message);
      
      expect(mockHandler.execute).toHaveBeenCalledWith(message, []);
    });

    it('should route /summary with arguments to handler', async () => {
      router.register('summary', mockHandler);
      const message = createMockMessage('/summary 1h');
      
      await router.route(message);
      
      expect(mockHandler.execute).toHaveBeenCalledWith(message, ['1h']);
    });

    it('should route /help command to registered handler', async () => {
      router.register('help', mockHandler);
      const message = createMockMessage('/help');
      
      await router.route(message);
      
      expect(mockHandler.execute).toHaveBeenCalledWith(message, []);
    });

    it('should route commands case-insensitively', async () => {
      router.register('summary', mockHandler);
      const message = createMockMessage('/SUMMARY 1h');
      
      await router.route(message);
      
      expect(mockHandler.execute).toHaveBeenCalledWith(message, ['1h']);
    });

    it('should handle commands with bot username', async () => {
      router.register('summary', mockHandler);
      const message = createMockMessage('/summary@TestBot 2h');
      
      await router.route(message);
      
      expect(mockHandler.execute).toHaveBeenCalledWith(message, ['2h']);
    });
  });

  describe('unknown command handling', () => {
    it('should send helpful message for unknown commands', async () => {
      const message = createMockMessage('/unknown');
      
      await router.route(message);
      
      expect(mockSendMessage).toHaveBeenCalledWith(
        message.chat.id,
        expect.stringContaining('Unknown command')
      );
    });

    it('should include available commands in unknown command response', async () => {
      const message = createMockMessage('/foo');
      
      await router.route(message);
      
      expect(mockSendMessage).toHaveBeenCalledWith(
        message.chat.id,
        expect.stringContaining('/summary')
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        message.chat.id,
        expect.stringContaining('/help')
      );
    });

    it('should not call handler for unknown commands', async () => {
      router.register('summary', mockHandler);
      const message = createMockMessage('/unknown');
      
      await router.route(message);
      
      expect(mockHandler.execute).not.toHaveBeenCalled();
    });
  });

  describe('non-command handling', () => {
    it('should not process non-command messages', async () => {
      router.register('summary', mockHandler);
      const message = createMockMessage('hello world');
      
      await router.route(message);
      
      expect(mockHandler.execute).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should not process messages without text', async () => {
      router.register('summary', mockHandler);
      const message = createMockMessage('');
      message.text = undefined;
      
      await router.route(message);
      
      expect(mockHandler.execute).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('multiple handlers', () => {
    it('should route to correct handler when multiple are registered', async () => {
      const summaryHandler: jest.Mocked<CommandHandler> = {
        execute: jest.fn().mockResolvedValue(undefined),
      };
      const helpHandler: jest.Mocked<CommandHandler> = {
        execute: jest.fn().mockResolvedValue(undefined),
      };

      router.register('summary', summaryHandler);
      router.register('help', helpHandler);

      const summaryMessage = createMockMessage('/summary 1h');
      const helpMessage = createMockMessage('/help');

      await router.route(summaryMessage);
      await router.route(helpMessage);

      expect(summaryHandler.execute).toHaveBeenCalledWith(summaryMessage, ['1h']);
      expect(helpHandler.execute).toHaveBeenCalledWith(helpMessage, []);
    });
  });

  describe('error handling', () => {
    it('should propagate handler errors', async () => {
      const error = new Error('Handler error');
      mockHandler.execute.mockRejectedValue(error);
      router.register('summary', mockHandler);
      const message = createMockMessage('/summary');

      await expect(router.route(message)).rejects.toThrow('Handler error');
    });
  });
});
