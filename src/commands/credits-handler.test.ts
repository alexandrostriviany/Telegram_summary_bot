/**
 * Unit Tests for Credits Command Handler
 *
 * @module commands/credits-handler.test
 */

import { CreditsHandler } from './credits-handler';
import { CreditsStore, UserCredits, ChatOwnership } from '../store/credits-store';
import { Message } from '../types';

describe('CreditsHandler', () => {
  let mockSendMessage: jest.Mock;
  let mockCreditsStore: jest.Mocked<CreditsStore>;
  let handler: CreditsHandler;

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
    mockCreditsStore = {
      getOrCreateUser: jest.fn().mockResolvedValue(defaultCredits),
      consumeCredit: jest.fn().mockResolvedValue(true),
      getCredits: jest.fn().mockResolvedValue(defaultCredits),
      setDailyLimit: jest.fn().mockResolvedValue(undefined),
      setChatOwner: jest.fn().mockResolvedValue(undefined),
      getChatOwner: jest.fn().mockResolvedValue(null),
      getAllChats: jest.fn().mockResolvedValue([]),
    };
    handler = new CreditsHandler(mockSendMessage, mockCreditsStore);
  });

  it('should show credits for sender in private chat', async () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 100, type: 'private' },
      from: { id: 100, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      text: '/credits',
    };

    await handler.execute(message, []);

    expect(mockCreditsStore.getCredits).toHaveBeenCalledWith(100);
    expect(mockSendMessage).toHaveBeenCalledWith(100, 'Credits: 7/10 remaining today');
  });

  it('should show chat owner credits in group chat', async () => {
    const ownership: ChatOwnership = {
      chatId: -200,
      ownerUserId: 500,
      addedAt: 1700000000000,
    };
    mockCreditsStore.getChatOwner.mockResolvedValueOnce(ownership);

    const ownerCredits: UserCredits = {
      userId: 500,
      dailyLimit: 20,
      creditsUsedToday: 5,
      lastResetDate: '2026-03-06',
      isPaid: true,
      createdAt: 1700000000000,
    };
    mockCreditsStore.getCredits.mockResolvedValueOnce(ownerCredits);

    const message: Message = {
      message_id: 1,
      chat: { id: -200, type: 'group' },
      from: { id: 100, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      text: '/credits',
    };

    await handler.execute(message, []);

    expect(mockCreditsStore.getChatOwner).toHaveBeenCalledWith(-200);
    expect(mockCreditsStore.getCredits).toHaveBeenCalledWith(500);
    expect(mockSendMessage).toHaveBeenCalledWith(-200, 'Credits: 15/20 remaining today');
  });

  it('should fall back to sender in group chat without owner', async () => {
    mockCreditsStore.getChatOwner.mockResolvedValueOnce(null);

    const message: Message = {
      message_id: 1,
      chat: { id: -200, type: 'group' },
      from: { id: 100, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      text: '/credits',
    };

    await handler.execute(message, []);

    expect(mockCreditsStore.getCredits).toHaveBeenCalledWith(100);
  });

  it('should handle message without from field', async () => {
    const message: Message = {
      message_id: 1,
      chat: { id: 100, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text: '/credits',
    };

    await handler.execute(message, []);

    expect(mockSendMessage).toHaveBeenCalledWith(
      100,
      'Unable to determine user for credit lookup.'
    );
  });
});
