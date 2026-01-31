/**
 * DynamoDB Message Store Implementation
 * 
 * This module provides the MessageStore implementation using AWS DynamoDB.
 * It handles storing, querying, and deleting messages with automatic TTL expiration.
 * 
 * @module store/message-store
 */

import {
  DynamoDBClient,
  DynamoDBClientConfig,
  PutItemCommand,
  QueryCommand,
  BatchWriteItemCommand,
  AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { StoredMessage, MessageQuery } from '../types';

/**
 * Default TTL in hours for stored messages
 * Messages are automatically deleted after this period
 */
const DEFAULT_TTL_HOURS = 72;

/**
 * Maximum number of items that can be deleted in a single BatchWriteItem request
 * DynamoDB limit is 25 items per batch
 */
const BATCH_DELETE_SIZE = 25;

/**
 * Maximum retry attempts for DynamoDB operations
 * AWS SDK default is 3, we increase to 5 for better resilience
 * against transient throttling errors
 */
const MAX_RETRY_ATTEMPTS = 5;

/**
 * Interface for the MessageStore operations
 */
export interface MessageStore {
  /**
   * Store a message in DynamoDB
   * @param message - The message to store
   */
  store(message: StoredMessage): Promise<void>;

  /**
   * Query messages from DynamoDB based on filters
   * @param query - Query parameters including chatId, time range, and limit
   * @returns Array of stored messages matching the query
   */
  query(query: MessageQuery): Promise<StoredMessage[]>;

  /**
   * Delete all messages for a specific chat
   * @param chatId - The chat ID to delete messages for
   */
  deleteAll(chatId: number): Promise<void>;
}

/**
 * DynamoDB implementation of the MessageStore interface
 * 
 * Uses AWS SDK v3 for DynamoDB operations with the following access patterns:
 * - Store message: PutItem with chatId (PK) + timestamp (SK)
 * - Query by time range: Query with chatId and timestamp between start/end
 * - Query by count: Query with chatId, ScanIndexForward=false, Limit=N
 * - Delete all for chat: Query + BatchWriteItem delete
 */
export class DynamoDBMessageStore implements MessageStore {
  private client: DynamoDBClient;
  private tableName: string;
  private ttlHours: number;

  /**
   * Create a new DynamoDBMessageStore instance
   * 
   * @param client - Optional DynamoDB client (creates default if not provided)
   * @param tableName - Optional table name (uses DYNAMODB_TABLE env var if not provided)
   * @param ttlHours - Optional TTL in hours (uses MESSAGE_TTL_HOURS env var or default 72)
   */
  constructor(
    client?: DynamoDBClient,
    tableName?: string,
    ttlHours?: number
  ) {
    if (client) {
      // Use provided client directly
      this.client = client;
    } else {
      // Create client with optional local endpoint support for testing
      const endpoint = process.env.DYNAMODB_ENDPOINT;
      const clientConfig: DynamoDBClientConfig = {
        // Configure retry attempts for better resilience against throttling
        // AWS SDK default is 3, we use 5 for transient errors
        maxAttempts: MAX_RETRY_ATTEMPTS,
      };
      
      if (endpoint) {
        clientConfig.endpoint = endpoint;
        clientConfig.region = process.env.AWS_REGION || 'us-east-1';
        // Use dummy credentials for local DynamoDB
        clientConfig.credentials = {
          accessKeyId: 'local',
          secretAccessKey: 'local'
        };
      }
      
      this.client = new DynamoDBClient(clientConfig);
    }
    
    this.tableName = tableName ?? process.env.DYNAMODB_TABLE ?? 'telegram-summary-messages';
    this.ttlHours = ttlHours ?? parseInt(process.env.MESSAGE_TTL_HOURS ?? String(DEFAULT_TTL_HOURS), 10);
  }

  /**
   * Calculate the TTL expiration timestamp
   * 
   * @param timestampMs - Message timestamp in milliseconds
   * @returns TTL timestamp in epoch seconds (72 hours from message timestamp)
   * 
   * **Validates: Requirements 2.3** - TTL of 72 hours on each stored message
   */
  private calculateExpireAt(timestampMs: number): number {
    const timestampSeconds = Math.floor(timestampMs / 1000);
    const ttlSeconds = this.ttlHours * 60 * 60; // Convert hours to seconds
    return timestampSeconds + ttlSeconds;
  }

  /**
   * Convert a StoredMessage to DynamoDB attribute map
   * 
   * @param message - The message to convert
   * @returns DynamoDB attribute value map
   */
  private toAttributeMap(message: StoredMessage): Record<string, AttributeValue> {
    const item: Record<string, AttributeValue> = {
      chatId: { N: String(message.chatId) },
      timestamp: { N: String(message.timestamp) },
      messageId: { N: String(message.messageId) },
      userId: { N: String(message.userId) },
      username: { S: message.username },
      text: { S: message.text },
      expireAt: { N: String(message.expireAt) },
    };

    // Add optional fields if present
    if (message.replyToMessageId !== undefined) {
      item.replyToMessageId = { N: String(message.replyToMessageId) };
    }
    if (message.threadId !== undefined) {
      item.threadId = { N: String(message.threadId) };
    }
    if (message.forwardFromName !== undefined) {
      item.forwardFromName = { S: message.forwardFromName };
    }

    return item;
  }

  /**
   * Convert a DynamoDB attribute map to StoredMessage
   * 
   * @param item - DynamoDB attribute value map
   * @returns StoredMessage object
   */
  private fromAttributeMap(item: Record<string, AttributeValue>): StoredMessage {
    const message: StoredMessage = {
      chatId: parseInt(item.chatId.N!, 10),
      timestamp: parseInt(item.timestamp.N!, 10),
      messageId: parseInt(item.messageId.N!, 10),
      userId: parseInt(item.userId.N!, 10),
      username: item.username.S!,
      text: item.text.S!,
      expireAt: parseInt(item.expireAt.N!, 10),
    };

    // Add optional fields if present
    if (item.replyToMessageId?.N) {
      message.replyToMessageId = parseInt(item.replyToMessageId.N, 10);
    }
    if (item.threadId?.N) {
      message.threadId = parseInt(item.threadId.N, 10);
    }
    if (item.forwardFromName?.S) {
      message.forwardFromName = item.forwardFromName.S;
    }

    return message;
  }

  /**
   * Store a message in DynamoDB
   * 
   * Stores the message with automatic TTL calculation. The expireAt field
   * is set to 72 hours (259200 seconds) after the message timestamp.
   * 
   * @param message - The message to store
   * 
   * **Validates: Requirements 2.1** - Store message with chatId, messageId, username, timestamp, and text
   * **Validates: Requirements 2.3** - Set TTL of 72 hours on each stored message
   */
  async store(message: StoredMessage): Promise<void> {
    // Ensure expireAt is calculated if not provided
    const messageWithTTL: StoredMessage = {
      ...message,
      expireAt: message.expireAt || this.calculateExpireAt(message.timestamp),
    };

    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: this.toAttributeMap(messageWithTTL),
    });

    await this.client.send(command);
  }

  /**
   * Query messages from DynamoDB based on filters
   * 
   * Supports two query patterns:
   * 1. Time range query: Returns messages between startTime and endTime
   * 2. Count query: Returns the N most recent messages (limit)
   * 
   * @param query - Query parameters
   * @returns Array of stored messages matching the query, sorted by timestamp
   * 
   * **Validates: Requirements 3.2** - Query by time range
   * **Validates: Requirements 3.3** - Query by count (limit)
   */
  async query(query: MessageQuery): Promise<StoredMessage[]> {
    const { chatId, startTime, endTime, limit } = query;

    // Build the key condition expression
    let keyConditionExpression = 'chatId = :chatId';
    const expressionAttributeValues: Record<string, AttributeValue> = {
      ':chatId': { N: String(chatId) },
    };

    // Add time range conditions if specified
    if (startTime !== undefined && endTime !== undefined) {
      keyConditionExpression += ' AND #ts BETWEEN :startTime AND :endTime';
      expressionAttributeValues[':startTime'] = { N: String(startTime) };
      expressionAttributeValues[':endTime'] = { N: String(endTime) };
    } else if (startTime !== undefined) {
      keyConditionExpression += ' AND #ts >= :startTime';
      expressionAttributeValues[':startTime'] = { N: String(startTime) };
    } else if (endTime !== undefined) {
      keyConditionExpression += ' AND #ts <= :endTime';
      expressionAttributeValues[':endTime'] = { N: String(endTime) };
    }

    // Determine scan direction based on query type
    // For count-based queries (limit only), we want most recent first
    // For time-based queries, we want chronological order
    const isCountQuery = limit !== undefined && startTime === undefined && endTime === undefined;
    const scanIndexForward = !isCountQuery;

    // Only include ExpressionAttributeNames if we're using #ts in the expression
    const hasTimestampCondition = startTime !== undefined || endTime !== undefined;
    
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(hasTimestampCondition && {
        ExpressionAttributeNames: {
          '#ts': 'timestamp', // timestamp is a reserved word in DynamoDB
        },
      }),
      ScanIndexForward: scanIndexForward,
      Limit: limit,
    });

    const response = await this.client.send(command);
    const messages = (response.Items ?? []).map((item) => this.fromAttributeMap(item));

    // For count queries, reverse to get chronological order
    if (isCountQuery) {
      messages.reverse();
    }

    return messages;
  }

  /**
   * Delete all messages for a specific chat
   * 
   * This operation queries all messages for the chat and deletes them in batches.
   * DynamoDB BatchWriteItem supports up to 25 items per request.
   * 
   * @param chatId - The chat ID to delete messages for
   */
  async deleteAll(chatId: number): Promise<void> {
    // First, query all messages for this chat
    const queryCommand = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'chatId = :chatId',
      ExpressionAttributeValues: {
        ':chatId': { N: String(chatId) },
      },
      ProjectionExpression: 'chatId, #ts',
      ExpressionAttributeNames: {
        '#ts': 'timestamp',
      },
    });

    const response = await this.client.send(queryCommand);
    const items = response.Items ?? [];

    if (items.length === 0) {
      return; // Nothing to delete
    }

    // Delete items in batches of 25 (DynamoDB limit)
    for (let i = 0; i < items.length; i += BATCH_DELETE_SIZE) {
      const batch = items.slice(i, i + BATCH_DELETE_SIZE);
      
      const deleteRequests = batch.map((item) => ({
        DeleteRequest: {
          Key: {
            chatId: item.chatId,
            timestamp: item.timestamp,
          },
        },
      }));

      const batchCommand = new BatchWriteItemCommand({
        RequestItems: {
          [this.tableName]: deleteRequests,
        },
      });

      await this.client.send(batchCommand);
    }
  }
}

/**
 * Create a new MessageStore instance with default configuration
 * 
 * Uses environment variables for configuration:
 * - DYNAMODB_TABLE: DynamoDB table name
 * - MESSAGE_TTL_HOURS: TTL in hours (default: 72)
 * 
 * @returns MessageStore instance
 */
export function createMessageStore(): MessageStore {
  return new DynamoDBMessageStore();
}
