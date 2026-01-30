/**
 * Unit tests for DynamoDB Message Store
 * 
 * Tests the MessageStore implementation with mocked DynamoDB client.
 * 
 * @module store/message-store.test
 */

import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  BatchWriteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBMessageStore, createMessageStore } from './message-store';
import { StoredMessage, MessageQuery } from '../types';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-dynamodb', () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({
      send: mockSend,
    })),
    PutItemCommand: jest.fn(),
    QueryCommand: jest.fn(),
    BatchWriteItemCommand: jest.fn(),
  };
});

describe('DynamoDBMessageStore', () => {
  let mockClient: jest.Mocked<DynamoDBClient>;
  let mockSend: jest.Mock;
  let store: DynamoDBMessageStore;
  const tableName = 'test-messages-table';
  const ttlHours = 72;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend = jest.fn();
    mockClient = {
      send: mockSend,
    } as unknown as jest.Mocked<DynamoDBClient>;
    store = new DynamoDBMessageStore(mockClient, tableName, ttlHours);
  });

  describe('store()', () => {
    it('should store a message with all required fields', async () => {
      const message: StoredMessage = {
        chatId: 123456,
        timestamp: 1700000000000,
        messageId: 789,
        userId: 111,
        username: 'testuser',
        text: 'Hello, world!',
        expireAt: 1700259200, // 72 hours later in seconds
      };

      mockSend.mockResolvedValueOnce({});

      await store.store(message);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(PutItemCommand).toHaveBeenCalledWith({
        TableName: tableName,
        Item: {
          chatId: { N: '123456' },
          timestamp: { N: '1700000000000' },
          messageId: { N: '789' },
          userId: { N: '111' },
          username: { S: 'testuser' },
          text: { S: 'Hello, world!' },
          expireAt: { N: '1700259200' },
        },
      });
    });

    it('should store a message with optional thread fields', async () => {
      const message: StoredMessage = {
        chatId: 123456,
        timestamp: 1700000000000,
        messageId: 789,
        userId: 111,
        username: 'testuser',
        text: 'Reply message',
        expireAt: 1700259200,
        replyToMessageId: 788,
        threadId: 100,
      };

      mockSend.mockResolvedValueOnce({});

      await store.store(message);

      expect(PutItemCommand).toHaveBeenCalledWith({
        TableName: tableName,
        Item: expect.objectContaining({
          replyToMessageId: { N: '788' },
          threadId: { N: '100' },
        }),
      });
    });

    it('should calculate TTL if expireAt is not provided', async () => {
      const timestamp = 1700000000000; // milliseconds
      const message: StoredMessage = {
        chatId: 123456,
        timestamp,
        messageId: 789,
        userId: 111,
        username: 'testuser',
        text: 'Hello!',
        expireAt: 0, // Will be recalculated
      };

      mockSend.mockResolvedValueOnce({});

      // Create store with explicit TTL
      const storeWithTTL = new DynamoDBMessageStore(mockClient, tableName, 72);
      
      // Store with expireAt = 0 to trigger calculation
      const messageWithoutTTL = { ...message, expireAt: 0 };
      await storeWithTTL.store(messageWithoutTTL);

      // Expected: timestamp in seconds + 72 hours in seconds
      const expectedExpireAt = Math.floor(timestamp / 1000) + (72 * 60 * 60);
      
      expect(PutItemCommand).toHaveBeenCalledWith({
        TableName: tableName,
        Item: expect.objectContaining({
          expireAt: { N: String(expectedExpireAt) },
        }),
      });
    });
  });

  describe('query()', () => {
    it('should query messages by chatId only', async () => {
      const mockItems = [
        {
          chatId: { N: '123456' },
          timestamp: { N: '1700000000000' },
          messageId: { N: '789' },
          userId: { N: '111' },
          username: { S: 'testuser' },
          text: { S: 'Hello!' },
          expireAt: { N: '1700259200' },
        },
      ];

      mockSend.mockResolvedValueOnce({ Items: mockItems });

      const query: MessageQuery = { chatId: 123456 };
      const result = await store.query(query);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        chatId: 123456,
        timestamp: 1700000000000,
        messageId: 789,
        userId: 111,
        username: 'testuser',
        text: 'Hello!',
        expireAt: 1700259200,
      });
    });

    it('should query messages by time range', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const query: MessageQuery = {
        chatId: 123456,
        startTime: 1700000000000,
        endTime: 1700100000000,
      };

      await store.query(query);

      expect(QueryCommand).toHaveBeenCalledWith({
        TableName: tableName,
        KeyConditionExpression: 'chatId = :chatId AND #ts BETWEEN :startTime AND :endTime',
        ExpressionAttributeValues: {
          ':chatId': { N: '123456' },
          ':startTime': { N: '1700000000000' },
          ':endTime': { N: '1700100000000' },
        },
        ExpressionAttributeNames: {
          '#ts': 'timestamp',
        },
        ScanIndexForward: true,
        Limit: undefined,
      });
    });

    it('should query messages by count (limit)', async () => {
      const mockItems = [
        {
          chatId: { N: '123456' },
          timestamp: { N: '1700000002000' },
          messageId: { N: '791' },
          userId: { N: '111' },
          username: { S: 'user1' },
          text: { S: 'Message 2' },
          expireAt: { N: '1700259202' },
        },
        {
          chatId: { N: '123456' },
          timestamp: { N: '1700000001000' },
          messageId: { N: '790' },
          userId: { N: '112' },
          username: { S: 'user2' },
          text: { S: 'Message 1' },
          expireAt: { N: '1700259201' },
        },
      ];

      mockSend.mockResolvedValueOnce({ Items: mockItems });

      const query: MessageQuery = {
        chatId: 123456,
        limit: 2,
      };

      const result = await store.query(query);

      // Should be reversed to chronological order
      expect(result[0].text).toBe('Message 1');
      expect(result[1].text).toBe('Message 2');

      expect(QueryCommand).toHaveBeenCalledWith({
        TableName: tableName,
        KeyConditionExpression: 'chatId = :chatId',
        ExpressionAttributeValues: {
          ':chatId': { N: '123456' },
        },
        ExpressionAttributeNames: {
          '#ts': 'timestamp',
        },
        ScanIndexForward: false, // Most recent first for count queries
        Limit: 2,
      });
    });

    it('should query messages with startTime only', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const query: MessageQuery = {
        chatId: 123456,
        startTime: 1700000000000,
      };

      await store.query(query);

      expect(QueryCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          KeyConditionExpression: 'chatId = :chatId AND #ts >= :startTime',
        })
      );
    });

    it('should query messages with endTime only', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const query: MessageQuery = {
        chatId: 123456,
        endTime: 1700100000000,
      };

      await store.query(query);

      expect(QueryCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          KeyConditionExpression: 'chatId = :chatId AND #ts <= :endTime',
        })
      );
    });

    it('should return empty array when no items found', async () => {
      mockSend.mockResolvedValueOnce({ Items: undefined });

      const query: MessageQuery = { chatId: 123456 };
      const result = await store.query(query);

      expect(result).toEqual([]);
    });

    it('should include optional fields in query results', async () => {
      const mockItems = [
        {
          chatId: { N: '123456' },
          timestamp: { N: '1700000000000' },
          messageId: { N: '789' },
          userId: { N: '111' },
          username: { S: 'testuser' },
          text: { S: 'Reply!' },
          expireAt: { N: '1700259200' },
          replyToMessageId: { N: '788' },
          threadId: { N: '100' },
        },
      ];

      mockSend.mockResolvedValueOnce({ Items: mockItems });

      const query: MessageQuery = { chatId: 123456 };
      const result = await store.query(query);

      expect(result[0].replyToMessageId).toBe(788);
      expect(result[0].threadId).toBe(100);
    });
  });

  describe('deleteAll()', () => {
    it('should delete all messages for a chat', async () => {
      const mockItems = [
        { chatId: { N: '123456' }, timestamp: { N: '1700000000000' } },
        { chatId: { N: '123456' }, timestamp: { N: '1700000001000' } },
      ];

      mockSend
        .mockResolvedValueOnce({ Items: mockItems }) // Query response
        .mockResolvedValueOnce({}); // BatchWriteItem response

      await store.deleteAll(123456);

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(QueryCommand).toHaveBeenCalledWith({
        TableName: tableName,
        KeyConditionExpression: 'chatId = :chatId',
        ExpressionAttributeValues: {
          ':chatId': { N: '123456' },
        },
        ProjectionExpression: 'chatId, #ts',
        ExpressionAttributeNames: {
          '#ts': 'timestamp',
        },
      });
      expect(BatchWriteItemCommand).toHaveBeenCalledWith({
        RequestItems: {
          [tableName]: [
            {
              DeleteRequest: {
                Key: {
                  chatId: { N: '123456' },
                  timestamp: { N: '1700000000000' },
                },
              },
            },
            {
              DeleteRequest: {
                Key: {
                  chatId: { N: '123456' },
                  timestamp: { N: '1700000001000' },
                },
              },
            },
          ],
        },
      });
    });

    it('should handle empty chat (no messages to delete)', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await store.deleteAll(123456);

      expect(mockSend).toHaveBeenCalledTimes(1); // Only query, no delete
      expect(BatchWriteItemCommand).not.toHaveBeenCalled();
    });

    it('should batch delete when more than 25 items', async () => {
      // Create 30 mock items
      const mockItems = Array.from({ length: 30 }, (_, i) => ({
        chatId: { N: '123456' },
        timestamp: { N: String(1700000000000 + i * 1000) },
      }));

      mockSend
        .mockResolvedValueOnce({ Items: mockItems }) // Query response
        .mockResolvedValueOnce({}) // First batch (25 items)
        .mockResolvedValueOnce({}); // Second batch (5 items)

      await store.deleteAll(123456);

      expect(mockSend).toHaveBeenCalledTimes(3);
      expect(BatchWriteItemCommand).toHaveBeenCalledTimes(2);
    });
  });

  describe('createMessageStore()', () => {
    it('should create a MessageStore instance', () => {
      const store = createMessageStore();
      expect(store).toBeDefined();
      expect(store.store).toBeDefined();
      expect(store.query).toBeDefined();
      expect(store.deleteAll).toBeDefined();
    });
  });
});
