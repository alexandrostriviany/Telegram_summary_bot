/**
 * Unit Tests for User Group Store
 *
 * @module store/user-group-store.test
 */

import {
  DynamoDBUserGroupStore,
  UserGroupStore,
} from './user-group-store';

// Mock the DynamoDB client
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => {
  return {
    DynamoDBClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutItemCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'PutItemCommand' })),
    QueryCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'QueryCommand' })),
  };
});

describe('DynamoDBUserGroupStore', () => {
  let store: UserGroupStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new DynamoDBUserGroupStore(
      undefined,
      'test-user-groups-table'
    );
  });

  describe('trackUserInGroup', () => {
    it('should upsert a user-group record', async () => {
      mockSend.mockResolvedValueOnce({});

      await store.trackUserInGroup(12345, -1001234567890, 'Dev Team Chat');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command._type).toBe('PutItemCommand');
      expect(command.input.TableName).toBe('test-user-groups-table');
      expect(command.input.Item.userId.N).toBe('12345');
      expect(command.input.Item.groupChatId.N).toBe('-1001234567890');
      expect(command.input.Item.groupTitle.S).toBe('Dev Team Chat');
      expect(command.input.Item.lastSeenAt.N).toBeDefined();
    });

    it('should propagate DynamoDB errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(
        store.trackUserInGroup(12345, -1001234567890, 'Dev Team Chat')
      ).rejects.toThrow('DynamoDB error');
    });
  });

  describe('getUserGroups', () => {
    it('should return all groups for a user', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            userId: { N: '12345' },
            groupChatId: { N: '-1001234567890' },
            groupTitle: { S: 'Dev Team Chat' },
            lastSeenAt: { N: '1700000000000' },
          },
          {
            userId: { N: '12345' },
            groupChatId: { N: '-1009876543210' },
            groupTitle: { S: 'Product Discussion' },
            lastSeenAt: { N: '1700000001000' },
          },
        ],
      });

      const result = await store.getUserGroups(12345);

      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe(12345);
      expect(result[0].groupChatId).toBe(-1001234567890);
      expect(result[0].groupTitle).toBe('Dev Team Chat');
      expect(result[0].lastSeenAt).toBe(1700000000000);
      expect(result[1].groupChatId).toBe(-1009876543210);
      expect(result[1].groupTitle).toBe('Product Discussion');
    });

    it('should return empty array when user has no groups', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await store.getUserGroups(99999);

      expect(result).toEqual([]);
    });

    it('should return empty array when Items is undefined', async () => {
      mockSend.mockResolvedValueOnce({ Items: undefined });

      const result = await store.getUserGroups(99999);

      expect(result).toEqual([]);
    });

    it('should query with correct key condition', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await store.getUserGroups(12345);

      const command = mockSend.mock.calls[0][0];
      expect(command._type).toBe('QueryCommand');
      expect(command.input.KeyConditionExpression).toBe('userId = :uid');
      expect(command.input.ExpressionAttributeValues[':uid'].N).toBe('12345');
    });

    it('should propagate DynamoDB errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network error'));

      await expect(store.getUserGroups(12345)).rejects.toThrow('Network error');
    });
  });

  describe('constructor', () => {
    it('should use environment variables for table name', () => {
      const originalEnv = process.env.USER_GROUPS_TABLE;
      process.env.USER_GROUPS_TABLE = 'env-table-name';

      const envStore = new DynamoDBUserGroupStore();
      expect(envStore).toBeInstanceOf(DynamoDBUserGroupStore);

      process.env.USER_GROUPS_TABLE = originalEnv;
    });

    it('should use default table name when no env var set', () => {
      const originalEnv = process.env.USER_GROUPS_TABLE;
      delete process.env.USER_GROUPS_TABLE;

      const defaultStore = new DynamoDBUserGroupStore();
      expect(defaultStore).toBeInstanceOf(DynamoDBUserGroupStore);

      process.env.USER_GROUPS_TABLE = originalEnv;
    });
  });
});
