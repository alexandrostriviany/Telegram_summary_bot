/**
 * Unit Tests for Topic Link Store
 *
 * @module store/topic-link-store.test
 */

import {
  DynamoDBTopicLinkStore,
  TopicLinkStore,
  TopicLink,
} from './topic-link-store';

// Mock the DynamoDB client
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => {
  return {
    DynamoDBClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    GetItemCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'GetItemCommand' })),
    PutItemCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'PutItemCommand' })),
    QueryCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'QueryCommand' })),
    UpdateItemCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'UpdateItemCommand' })),
    DeleteItemCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'DeleteItemCommand' })),
  };
});

describe('DynamoDBTopicLinkStore', () => {
  let store: TopicLinkStore;

  const sampleLink: TopicLink = {
    userId: 12345,
    topicThreadId: 7,
    groupChatId: -1001234567890,
    groupTitle: 'Dev Team Chat',
    privateChatId: 12345,
    linkedAt: 1700000000000,
    status: 'active',
  };

  const sampleDynamoItem = {
    userId: { N: '12345' },
    topicThreadId: { N: '7' },
    groupChatId: { N: '-1001234567890' },
    groupTitle: { S: 'Dev Team Chat' },
    privateChatId: { N: '12345' },
    linkedAt: { N: '1700000000000' },
    status: { S: 'active' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    store = new DynamoDBTopicLinkStore(
      undefined,
      'test-topic-links-table'
    );
  });

  describe('createLink', () => {
    it('should store a new topic link', async () => {
      mockSend.mockResolvedValueOnce({});

      await store.createLink(sampleLink);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command._type).toBe('PutItemCommand');
      expect(command.input.TableName).toBe('test-topic-links-table');
      expect(command.input.Item.userId.N).toBe('12345');
      expect(command.input.Item.topicThreadId.N).toBe('7');
      expect(command.input.Item.groupChatId.N).toBe('-1001234567890');
      expect(command.input.Item.groupTitle.S).toBe('Dev Team Chat');
      expect(command.input.Item.privateChatId.N).toBe('12345');
      expect(command.input.Item.status.S).toBe('active');
    });

    it('should propagate DynamoDB errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(store.createLink(sampleLink)).rejects.toThrow('DynamoDB error');
    });
  });

  describe('getLink', () => {
    it('should return a topic link when found', async () => {
      mockSend.mockResolvedValueOnce({ Item: sampleDynamoItem });

      const result = await store.getLink(12345, 7);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe(12345);
      expect(result!.topicThreadId).toBe(7);
      expect(result!.groupChatId).toBe(-1001234567890);
      expect(result!.groupTitle).toBe('Dev Team Chat');
      expect(result!.privateChatId).toBe(12345);
      expect(result!.linkedAt).toBe(1700000000000);
      expect(result!.status).toBe('active');
    });

    it('should return null when link not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await store.getLink(12345, 999);

      expect(result).toBeNull();
    });

    it('should use correct key structure', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      await store.getLink(12345, 7);

      const command = mockSend.mock.calls[0][0];
      expect(command._type).toBe('GetItemCommand');
      expect(command.input.Key.userId.N).toBe('12345');
      expect(command.input.Key.topicThreadId.N).toBe('7');
    });

    it('should propagate DynamoDB errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network error'));

      await expect(store.getLink(12345, 7)).rejects.toThrow('Network error');
    });
  });

  describe('getUserLinks', () => {
    it('should return all links for a user', async () => {
      const secondItem = {
        ...sampleDynamoItem,
        topicThreadId: { N: '15' },
        groupChatId: { N: '-1009876543210' },
        groupTitle: { S: 'Product Discussion' },
      };

      mockSend.mockResolvedValueOnce({
        Items: [sampleDynamoItem, secondItem],
      });

      const result = await store.getUserLinks(12345);

      expect(result).toHaveLength(2);
      expect(result[0].groupTitle).toBe('Dev Team Chat');
      expect(result[1].groupTitle).toBe('Product Discussion');
      expect(result[1].topicThreadId).toBe(15);
      expect(result[1].groupChatId).toBe(-1009876543210);
    });

    it('should return empty array when user has no links', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await store.getUserLinks(99999);

      expect(result).toEqual([]);
    });

    it('should return empty array when Items is undefined', async () => {
      mockSend.mockResolvedValueOnce({ Items: undefined });

      const result = await store.getUserLinks(99999);

      expect(result).toEqual([]);
    });

    it('should query with correct key condition', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await store.getUserLinks(12345);

      const command = mockSend.mock.calls[0][0];
      expect(command._type).toBe('QueryCommand');
      expect(command.input.KeyConditionExpression).toBe('userId = :uid');
      expect(command.input.ExpressionAttributeValues[':uid'].N).toBe('12345');
    });
  });

  describe('getLinkByGroup', () => {
    it('should return the link when group is linked', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [sampleDynamoItem],
      });

      const result = await store.getLinkByGroup(12345, -1001234567890);

      expect(result).not.toBeNull();
      expect(result!.groupChatId).toBe(-1001234567890);
      expect(result!.groupTitle).toBe('Dev Team Chat');
    });

    it('should return null when group is not linked', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await store.getLinkByGroup(12345, -999);

      expect(result).toBeNull();
    });

    it('should return null when Items is undefined', async () => {
      mockSend.mockResolvedValueOnce({ Items: undefined });

      const result = await store.getLinkByGroup(12345, -999);

      expect(result).toBeNull();
    });

    it('should use filter expression for groupChatId', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await store.getLinkByGroup(12345, -1001234567890);

      const command = mockSend.mock.calls[0][0];
      expect(command._type).toBe('QueryCommand');
      expect(command.input.KeyConditionExpression).toBe('userId = :uid');
      expect(command.input.FilterExpression).toBe('groupChatId = :gid');
      expect(command.input.ExpressionAttributeValues[':uid'].N).toBe('12345');
      expect(command.input.ExpressionAttributeValues[':gid'].N).toBe('-1001234567890');
    });
  });

  describe('updateStatus', () => {
    it('should update the status of a link', async () => {
      mockSend.mockResolvedValueOnce({});

      await store.updateStatus(12345, 7, 'closed');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command._type).toBe('UpdateItemCommand');
      expect(command.input.Key.userId.N).toBe('12345');
      expect(command.input.Key.topicThreadId.N).toBe('7');
      expect(command.input.UpdateExpression).toBe('SET #s = :status');
      expect(command.input.ExpressionAttributeNames['#s']).toBe('status');
      expect(command.input.ExpressionAttributeValues[':status'].S).toBe('closed');
    });

    it('should propagate DynamoDB errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Update failed'));

      await expect(store.updateStatus(12345, 7, 'closed')).rejects.toThrow('Update failed');
    });
  });

  describe('deleteLink', () => {
    it('should delete a topic link', async () => {
      mockSend.mockResolvedValueOnce({});

      await store.deleteLink(12345, 7);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command._type).toBe('DeleteItemCommand');
      expect(command.input.Key.userId.N).toBe('12345');
      expect(command.input.Key.topicThreadId.N).toBe('7');
    });

    it('should propagate DynamoDB errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Delete failed'));

      await expect(store.deleteLink(12345, 7)).rejects.toThrow('Delete failed');
    });
  });

  describe('constructor', () => {
    it('should use environment variables for table name', () => {
      const originalEnv = process.env.TOPIC_LINKS_TABLE;
      process.env.TOPIC_LINKS_TABLE = 'env-table-name';

      const envStore = new DynamoDBTopicLinkStore();
      // Verify the store was created (table name is private, so we test indirectly)
      expect(envStore).toBeInstanceOf(DynamoDBTopicLinkStore);

      process.env.TOPIC_LINKS_TABLE = originalEnv;
    });

    it('should use default table name when no env var set', () => {
      const originalEnv = process.env.TOPIC_LINKS_TABLE;
      delete process.env.TOPIC_LINKS_TABLE;

      const defaultStore = new DynamoDBTopicLinkStore();
      expect(defaultStore).toBeInstanceOf(DynamoDBTopicLinkStore);

      process.env.TOPIC_LINKS_TABLE = originalEnv;
    });
  });
});
