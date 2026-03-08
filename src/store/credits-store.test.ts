/**
 * Unit Tests for Credits Store
 *
 * @module store/credits-store.test
 */

import {
  DynamoDBCreditsStore,
  CreditsStore,
  getTodayUTC,
} from './credits-store';

// Mock the DynamoDB client
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => {
  return {
    DynamoDBClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    GetItemCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'GetItemCommand' })),
    PutItemCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'PutItemCommand' })),
    UpdateItemCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'UpdateItemCommand' })),
  };
});

describe('getTodayUTC', () => {
  it('should return a date string in YYYY-MM-DD format', () => {
    const today = getTodayUTC();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('DynamoDBCreditsStore', () => {
  let store: CreditsStore;
  const today = getTodayUTC();

  beforeEach(() => {
    jest.clearAllMocks();
    store = new DynamoDBCreditsStore(
      undefined,
      'test-credits-table',
      'test-ownership-table',
      10
    );
  });

  describe('userExists', () => {
    it('should return true when user record exists', async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          userId: { N: '12345' },
          dailyLimit: { N: '10' },
          creditsUsedToday: { N: '0' },
          lastResetDate: { S: today },
          isPaid: { BOOL: false },
          createdAt: { N: '1700000000000' },
        },
      });

      const exists = await store.userExists(12345);
      expect(exists).toBe(true);
    });

    it('should return false when user record does not exist', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const exists = await store.userExists(99999);
      expect(exists).toBe(false);
    });
  });

  describe('getOrCreateUser', () => {
    it('should return existing user record', async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          userId: { N: '12345' },
          dailyLimit: { N: '10' },
          creditsUsedToday: { N: '3' },
          lastResetDate: { S: today },
          isPaid: { BOOL: false },
          createdAt: { N: '1700000000000' },
        },
      });

      const user = await store.getOrCreateUser(12345);

      expect(user.userId).toBe(12345);
      expect(user.dailyLimit).toBe(10);
      expect(user.creditsUsedToday).toBe(3);
      expect(user.lastResetDate).toBe(today);
      expect(user.isPaid).toBe(false);
    });

    it('should auto-reset credits when date has changed', async () => {
      mockSend
        .mockResolvedValueOnce({
          Item: {
            userId: { N: '12345' },
            dailyLimit: { N: '10' },
            creditsUsedToday: { N: '8' },
            lastResetDate: { S: '2020-01-01' },
            isPaid: { BOOL: false },
            createdAt: { N: '1700000000000' },
          },
        })
        .mockResolvedValueOnce({}); // UpdateItemCommand

      const user = await store.getOrCreateUser(12345);

      expect(user.creditsUsedToday).toBe(0);
      expect(user.lastResetDate).toBe(today);
      // Should have called update to reset
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should create new user if not found', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: undefined }) // GetItemCommand
        .mockResolvedValueOnce({}); // PutItemCommand

      const user = await store.getOrCreateUser(99999);

      expect(user.userId).toBe(99999);
      expect(user.dailyLimit).toBe(10);
      expect(user.creditsUsedToday).toBe(0);
      expect(user.isPaid).toBe(false);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('consumeCredit', () => {
    it('should return true when credit is successfully consumed', async () => {
      // getOrCreateUser call
      mockSend.mockResolvedValueOnce({
        Item: {
          userId: { N: '12345' },
          dailyLimit: { N: '10' },
          creditsUsedToday: { N: '3' },
          lastResetDate: { S: today },
          isPaid: { BOOL: false },
          createdAt: { N: '1700000000000' },
        },
      });
      // UpdateItemCommand (atomic increment)
      mockSend.mockResolvedValueOnce({});

      const result = await store.consumeCredit(12345);

      expect(result).toBe(true);
    });

    it('should return false when credits are exhausted', async () => {
      // getOrCreateUser call
      mockSend.mockResolvedValueOnce({
        Item: {
          userId: { N: '12345' },
          dailyLimit: { N: '10' },
          creditsUsedToday: { N: '10' },
          lastResetDate: { S: today },
          isPaid: { BOOL: false },
          createdAt: { N: '1700000000000' },
        },
      });
      // UpdateItemCommand fails with ConditionalCheckFailedException
      const condError = new Error('The conditional request failed');
      condError.name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValueOnce(condError);

      const result = await store.consumeCredit(12345);

      expect(result).toBe(false);
    });

    it('should rethrow non-conditional errors', async () => {
      // getOrCreateUser call
      mockSend.mockResolvedValueOnce({
        Item: {
          userId: { N: '12345' },
          dailyLimit: { N: '10' },
          creditsUsedToday: { N: '3' },
          lastResetDate: { S: today },
          isPaid: { BOOL: false },
          createdAt: { N: '1700000000000' },
        },
      });
      // UpdateItemCommand fails with other error
      mockSend.mockRejectedValueOnce(new Error('Network error'));

      await expect(store.consumeCredit(12345)).rejects.toThrow('Network error');
    });
  });

  describe('getCredits', () => {
    it('should return user credit info', async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          userId: { N: '12345' },
          dailyLimit: { N: '10' },
          creditsUsedToday: { N: '5' },
          lastResetDate: { S: today },
          isPaid: { BOOL: true },
          createdAt: { N: '1700000000000' },
        },
      });

      const credits = await store.getCredits(12345);

      expect(credits.userId).toBe(12345);
      expect(credits.creditsUsedToday).toBe(5);
      expect(credits.dailyLimit).toBe(10);
      expect(credits.isPaid).toBe(true);
    });
  });

  describe('setDailyLimit', () => {
    it('should update the daily limit for a user', async () => {
      // getOrCreateUser call
      mockSend.mockResolvedValueOnce({
        Item: {
          userId: { N: '12345' },
          dailyLimit: { N: '10' },
          creditsUsedToday: { N: '0' },
          lastResetDate: { S: today },
          isPaid: { BOOL: false },
          createdAt: { N: '1700000000000' },
        },
      });
      // UpdateItemCommand
      mockSend.mockResolvedValueOnce({});

      await store.setDailyLimit(12345, 50);

      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('setChatOwner', () => {
    it('should store chat ownership record', async () => {
      mockSend.mockResolvedValueOnce({});

      await store.setChatOwner(-100123, 12345);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('getChatOwner', () => {
    it('should return chat ownership record', async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          chatId: { N: '-100123' },
          ownerUserId: { N: '12345' },
          addedAt: { N: '1700000000000' },
        },
      });

      const ownership = await store.getChatOwner(-100123);

      expect(ownership).not.toBeNull();
      expect(ownership!.chatId).toBe(-100123);
      expect(ownership!.ownerUserId).toBe(12345);
    });

    it('should return null when chat has no owner', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const ownership = await store.getChatOwner(-999);

      expect(ownership).toBeNull();
    });
  });
});
