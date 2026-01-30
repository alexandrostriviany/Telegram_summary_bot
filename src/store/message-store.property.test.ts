/**
 * Property-Based Tests for DynamoDB Message Store
 * 
 * These tests use fast-check to verify properties hold across many randomly generated inputs.
 * 
 * @module store/message-store.property.test
 */

import * as fc from 'fast-check';
import {
  DynamoDBClient,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBMessageStore } from './message-store';
import { StoredMessage } from '../types';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-dynamodb', () => {
  return {
    DynamoDBClient: jest.fn(() => ({
      send: jest.fn(),
    })),
    PutItemCommand: jest.fn(),
    QueryCommand: jest.fn(),
    BatchWriteItemCommand: jest.fn(),
  };
});

// Get the mocked PutItemCommand for type-safe access
const MockedPutItemCommand = PutItemCommand as unknown as jest.Mock;

/**
 * **Validates: Requirements 2.1**
 * 
 * Property 1: Message Storage Completeness
 * 
 * For any valid text message received from Telegram, the stored message SHALL contain
 * all required fields: chatId, messageId, username, timestamp, and text, with none
 * being null or undefined.
 */
describe('Property Tests: Message Store', () => {
  let mockClient: jest.Mocked<DynamoDBClient>;
  let mockSend: jest.Mock;
  let store: DynamoDBMessageStore;
  let capturedItems: Record<string, any>[];
  const tableName = 'test-messages-table';
  const ttlHours = 72;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedItems = [];
    
    // Create a mock send function that captures the items being stored
    mockSend = jest.fn().mockImplementation((command) => {
      if (command instanceof PutItemCommand) {
        // Capture the item being stored
        const item = MockedPutItemCommand.mock.calls.slice(-1)[0]?.[0]?.Item;
        if (item) {
          capturedItems.push(item);
        }
      }
      return Promise.resolve({});
    });
    
    mockClient = {
      send: mockSend,
    } as unknown as jest.Mocked<DynamoDBClient>;
    
    store = new DynamoDBMessageStore(mockClient, tableName, ttlHours);
  });

  /**
   * Arbitrary generator for valid StoredMessage objects
   * 
   * Generates random but valid message data that simulates what would be
   * received from Telegram and stored in DynamoDB.
   */
  const storedMessageArbitrary = fc.record({
    chatId: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
    timestamp: fc.integer({ min: 1, max: Date.now() + 86400000 }), // Up to 1 day in future
    messageId: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
    userId: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
    username: fc.string({ minLength: 1, maxLength: 64 }).filter(s => s.trim().length > 0),
    text: fc.string({ minLength: 1, maxLength: 4096 }).filter(s => s.trim().length > 0),
    expireAt: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
    // Optional fields
    replyToMessageId: fc.option(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), { nil: undefined }),
    threadId: fc.option(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), { nil: undefined }),
  });

  describe('Property 1: Message Storage Completeness', () => {
    /**
     * **Validates: Requirements 2.1**
     * 
     * For any valid text message received from Telegram, the stored message SHALL contain
     * all required fields: chatId, messageId, username, timestamp, and text, with none
     * being null or undefined.
     */
    it('should store all required fields (chatId, messageId, username, timestamp, text) as non-null/undefined values', async () => {
      await fc.assert(
        fc.asyncProperty(storedMessageArbitrary, async (message: StoredMessage) => {
          // Clear captured items for this iteration
          capturedItems = [];
          MockedPutItemCommand.mockClear();
          
          // Store the message
          await store.store(message);
          
          // Verify PutItemCommand was called
          expect(MockedPutItemCommand).toHaveBeenCalledTimes(1);
          
          // Get the item that was passed to PutItemCommand
          const putItemCall = MockedPutItemCommand.mock.calls[0][0];
          const storedItem = putItemCall.Item;
          
          // Verify all required fields are present and non-null/undefined
          // chatId
          expect(storedItem.chatId).toBeDefined();
          expect(storedItem.chatId.N).toBeDefined();
          expect(storedItem.chatId.N).not.toBeNull();
          expect(parseInt(storedItem.chatId.N, 10)).toBe(message.chatId);
          
          // messageId
          expect(storedItem.messageId).toBeDefined();
          expect(storedItem.messageId.N).toBeDefined();
          expect(storedItem.messageId.N).not.toBeNull();
          expect(parseInt(storedItem.messageId.N, 10)).toBe(message.messageId);
          
          // username
          expect(storedItem.username).toBeDefined();
          expect(storedItem.username.S).toBeDefined();
          expect(storedItem.username.S).not.toBeNull();
          expect(storedItem.username.S).toBe(message.username);
          
          // timestamp
          expect(storedItem.timestamp).toBeDefined();
          expect(storedItem.timestamp.N).toBeDefined();
          expect(storedItem.timestamp.N).not.toBeNull();
          expect(parseInt(storedItem.timestamp.N, 10)).toBe(message.timestamp);
          
          // text
          expect(storedItem.text).toBeDefined();
          expect(storedItem.text.S).toBeDefined();
          expect(storedItem.text.S).not.toBeNull();
          expect(storedItem.text.S).toBe(message.text);
          
          // Also verify expireAt is present (required for TTL)
          expect(storedItem.expireAt).toBeDefined();
          expect(storedItem.expireAt.N).toBeDefined();
          expect(storedItem.expireAt.N).not.toBeNull();
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 2.1**
     * 
     * Additional property: Verify that the stored values exactly match the input values
     * for all required fields.
     */
    it('should preserve exact values for all required fields across random inputs', async () => {
      await fc.assert(
        fc.asyncProperty(storedMessageArbitrary, async (message: StoredMessage) => {
          MockedPutItemCommand.mockClear();
          
          // Store the message
          await store.store(message);
          
          // Get the stored item
          const putItemCall = MockedPutItemCommand.mock.calls[0][0];
          const storedItem = putItemCall.Item;
          
          // Verify exact value preservation for required fields
          expect(parseInt(storedItem.chatId.N, 10)).toStrictEqual(message.chatId);
          expect(parseInt(storedItem.messageId.N, 10)).toStrictEqual(message.messageId);
          expect(storedItem.username.S).toStrictEqual(message.username);
          expect(parseInt(storedItem.timestamp.N, 10)).toStrictEqual(message.timestamp);
          expect(storedItem.text.S).toStrictEqual(message.text);
        }),
        { numRuns: 100, verbose: true }
      );
    });
  });

  /**
   * **Validates: Requirements 2.3**
   * 
   * Property 3: TTL Configuration
   * 
   * For any message stored in the Message_Store, the expireAt field SHALL be set
   * to exactly 72 hours (259200 seconds) after the message timestamp.
   */
  describe('Property 3: TTL Configuration', () => {
    /**
     * **Validates: Requirements 2.3**
     * 
     * For any message stored in the Message_Store, the expireAt field SHALL be set
     * to exactly 72 hours (259200 seconds) after the message timestamp.
     */
    it('should set expireAt to exactly 72 hours (259200 seconds) after the message timestamp', async () => {
      const TTL_SECONDS = 259200; // 72 hours in seconds

      // Generator for messages with various timestamps
      // Using expireAt: 0 to trigger TTL calculation in the store
      const messageWithZeroExpireAtArbitrary = fc.record({
        chatId: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        // Generate timestamps across a wide range (from year 2000 to 2100)
        timestamp: fc.integer({ min: 946684800000, max: 4102444800000 }), // milliseconds
        messageId: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        userId: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        username: fc.string({ minLength: 1, maxLength: 64 }).filter(s => s.trim().length > 0),
        text: fc.string({ minLength: 1, maxLength: 4096 }).filter(s => s.trim().length > 0),
        expireAt: fc.constant(0), // Set to 0 to trigger TTL calculation
        replyToMessageId: fc.option(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), { nil: undefined }),
        threadId: fc.option(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), { nil: undefined }),
      });

      await fc.assert(
        fc.asyncProperty(messageWithZeroExpireAtArbitrary, async (message: StoredMessage) => {
          MockedPutItemCommand.mockClear();
          
          // Store the message with expireAt = 0 to trigger TTL calculation
          await store.store(message);
          
          // Verify PutItemCommand was called
          expect(MockedPutItemCommand).toHaveBeenCalledTimes(1);
          
          // Get the stored item
          const putItemCall = MockedPutItemCommand.mock.calls[0][0];
          const storedItem = putItemCall.Item;
          
          // Calculate expected expireAt: timestamp_in_seconds + 259200 (72 hours)
          const timestampInSeconds = Math.floor(message.timestamp / 1000);
          const expectedExpireAt = timestampInSeconds + TTL_SECONDS;
          
          // Verify expireAt is set correctly
          expect(storedItem.expireAt).toBeDefined();
          expect(storedItem.expireAt.N).toBeDefined();
          
          const actualExpireAt = parseInt(storedItem.expireAt.N, 10);
          
          // The expireAt should be exactly timestamp_in_seconds + 259200
          expect(actualExpireAt).toBe(expectedExpireAt);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 2.3**
     * 
     * Additional property: Verify TTL calculation is consistent across edge case timestamps
     * (very old timestamps, current timestamps, future timestamps)
     */
    it('should calculate TTL correctly for edge case timestamps', async () => {
      const TTL_SECONDS = 259200; // 72 hours in seconds

      // Generator for edge case timestamps
      const edgeCaseTimestampArbitrary = fc.oneof(
        // Very old timestamp (year 2000)
        fc.constant(946684800000),
        // Recent past (within last year)
        fc.integer({ min: Date.now() - 31536000000, max: Date.now() }),
        // Current time
        fc.constant(Date.now()),
        // Near future (within next day)
        fc.integer({ min: Date.now(), max: Date.now() + 86400000 }),
        // Random timestamps across a wide range
        fc.integer({ min: 946684800000, max: 4102444800000 })
      );

      const messageWithEdgeCaseTimestampArbitrary = fc.record({
        chatId: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        timestamp: edgeCaseTimestampArbitrary,
        messageId: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        userId: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        username: fc.string({ minLength: 1, maxLength: 64 }).filter(s => s.trim().length > 0),
        text: fc.string({ minLength: 1, maxLength: 4096 }).filter(s => s.trim().length > 0),
        expireAt: fc.constant(0), // Trigger TTL calculation
        replyToMessageId: fc.option(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), { nil: undefined }),
        threadId: fc.option(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), { nil: undefined }),
      });

      await fc.assert(
        fc.asyncProperty(messageWithEdgeCaseTimestampArbitrary, async (message: StoredMessage) => {
          MockedPutItemCommand.mockClear();
          
          await store.store(message);
          
          const putItemCall = MockedPutItemCommand.mock.calls[0][0];
          const storedItem = putItemCall.Item;
          
          const timestampInSeconds = Math.floor(message.timestamp / 1000);
          const expectedExpireAt = timestampInSeconds + TTL_SECONDS;
          const actualExpireAt = parseInt(storedItem.expireAt.N, 10);
          
          // Verify the TTL formula: expireAt = floor(timestamp_ms / 1000) + 259200
          expect(actualExpireAt).toBe(expectedExpireAt);
          
          // Also verify the difference is exactly 72 hours (259200 seconds)
          const actualTimestampInSeconds = parseInt(storedItem.timestamp.N, 10) / 1000;
          const ttlDifference = actualExpireAt - Math.floor(actualTimestampInSeconds);
          expect(ttlDifference).toBe(TTL_SECONDS);
        }),
        { numRuns: 100, verbose: true }
      );
    });
  });
});
