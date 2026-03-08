/**
 * Unit Tests for Admin Command Handler
 *
 * @module commands/admin-handler.test
 */

import { AdminHandler } from './admin-handler';
import { CreditsStore, UserCredits } from '../store/credits-store';
import { UnauthorizedError } from '../errors/error-handler';
import { Message } from '../types';

describe('AdminHandler', () => {
  let mockSendMessage: jest.Mock;
  let mockCreditsStore: jest.Mocked<CreditsStore>;
  let handler: AdminHandler;

  const ADMIN_ID = 999;

  const defaultCredits: UserCredits = {
    userId: 12345,
    dailyLimit: 10,
    creditsUsedToday: 3,
    lastResetDate: '2026-03-06',
    isPaid: false,
    createdAt: 1700000000000,
  };

  const createMessage = (fromId: number, text: string): Message => ({
    message_id: 1,
    chat: { id: 100, type: 'private' },
    from: { id: fromId, first_name: 'Admin' },
    date: Math.floor(Date.now() / 1000),
    text,
  });

  beforeEach(() => {
    mockSendMessage = jest.fn().mockResolvedValue(undefined);
    mockCreditsStore = {
      getOrCreateUser: jest.fn().mockResolvedValue(defaultCredits),
      consumeCredit: jest.fn().mockResolvedValue(true),
      getCredits: jest.fn().mockResolvedValue(defaultCredits),
      setDailyLimit: jest.fn().mockResolvedValue(undefined),
      setChatOwner: jest.fn().mockResolvedValue(undefined),
      getChatOwner: jest.fn().mockResolvedValue(null),
      getAllChats: jest.fn().mockResolvedValue([]),
    };
    handler = new AdminHandler(mockSendMessage, mockCreditsStore, ADMIN_ID);
  });

  describe('authorization', () => {
    it('should throw UnauthorizedError for non-admin users', async () => {
      const message = createMessage(123, '/admin getuser 12345');

      await expect(handler.execute(message, ['getuser', '12345'])).rejects.toThrow(
        UnauthorizedError
      );
    });

    it('should allow admin user', async () => {
      const message = createMessage(ADMIN_ID, '/admin getuser 12345');

      await handler.execute(message, ['getuser', '12345']);

      expect(mockCreditsStore.getCredits).toHaveBeenCalledWith(12345);
    });
  });

  describe('setcredits subcommand', () => {
    it('should set daily limit for a user', async () => {
      const message = createMessage(ADMIN_ID, '/admin setcredits 12345 50');

      await handler.execute(message, ['setcredits', '12345', '50']);

      expect(mockCreditsStore.setDailyLimit).toHaveBeenCalledWith(12345, 50);
      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        'Daily limit for user 12345 set to 50.'
      );
    });

    it('should show usage when missing arguments', async () => {
      const message = createMessage(ADMIN_ID, '/admin setcredits');

      await handler.execute(message, ['setcredits']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        'Usage: /admin setcredits <userId> <limit>'
      );
    });

    it('should reject invalid limit', async () => {
      const message = createMessage(ADMIN_ID, '/admin setcredits 12345 abc');

      await handler.execute(message, ['setcredits', '12345', 'abc']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        'Invalid parameters. userId must be a positive number, limit must be between 1 and 1000.'
      );
    });

    it('should reject zero limit', async () => {
      const message = createMessage(ADMIN_ID, '/admin setcredits 12345 0');

      await handler.execute(message, ['setcredits', '12345', '0']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        'Invalid parameters. userId must be a positive number, limit must be between 1 and 1000.'
      );
    });

    it('should reject limit exceeding 1000', async () => {
      const message = createMessage(ADMIN_ID, '/admin setcredits 12345 9999');

      await handler.execute(message, ['setcredits', '12345', '9999']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        'Invalid parameters. userId must be a positive number, limit must be between 1 and 1000.'
      );
    });
  });

  describe('getuser subcommand', () => {
    it('should display user credit info', async () => {
      const message = createMessage(ADMIN_ID, '/admin getuser 12345');

      await handler.execute(message, ['getuser', '12345']);

      expect(mockCreditsStore.getCredits).toHaveBeenCalledWith(12345);
      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        expect.stringContaining('User: 12345')
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        expect.stringContaining('Daily Limit: 10')
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        expect.stringContaining('Remaining: 7')
      );
    });

    it('should show usage when missing userId', async () => {
      const message = createMessage(ADMIN_ID, '/admin getuser');

      await handler.execute(message, ['getuser']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        'Usage: /admin getuser <userId>'
      );
    });

    it('should reject invalid userId', async () => {
      const message = createMessage(ADMIN_ID, '/admin getuser abc');

      await handler.execute(message, ['getuser', 'abc']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        'Invalid userId. Must be a number.'
      );
    });
  });

  describe('unknown subcommand', () => {
    it('should show usage for unknown subcommand', async () => {
      const message = createMessage(ADMIN_ID, '/admin unknown');

      await handler.execute(message, ['unknown']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        expect.stringContaining('Admin commands:')
      );
    });

    it('should show usage when no subcommand provided', async () => {
      const message = createMessage(ADMIN_ID, '/admin');

      await handler.execute(message, []);

      expect(mockSendMessage).toHaveBeenCalledWith(
        100,
        expect.stringContaining('Admin commands:')
      );
    });
  });
});
