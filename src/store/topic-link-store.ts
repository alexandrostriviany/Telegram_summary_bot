/**
 * DynamoDB Topic Link Store Implementation
 *
 * This module provides the TopicLinkStore implementation using AWS DynamoDB.
 * It handles CRUD operations for topic-to-group link mappings, enabling
 * private per-group summaries delivered into organized topics within
 * a user's 1-on-1 chat with the bot.
 *
 * @module store/topic-link-store
 */

import {
  DynamoDBClient,
  DynamoDBClientConfig,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';

/**
 * Maximum retry attempts for DynamoDB operations
 */
const MAX_RETRY_ATTEMPTS = 5;

/**
 * Represents a link between a private chat topic and a group chat
 */
export interface TopicLink {
  userId: number;
  topicThreadId: number;
  groupChatId: number;
  groupTitle: string;
  privateChatId: number;
  linkedAt: number;
  status: 'active' | 'closed';
}

/**
 * Interface for the TopicLinkStore operations
 */
export interface TopicLinkStore {
  /**
   * Create a new topic-to-group link
   * @param link - The topic link record to store
   */
  createLink(link: TopicLink): Promise<void>;

  /**
   * Get a specific topic link by userId and topicThreadId
   * @param userId - The Telegram user ID
   * @param topicThreadId - The topic thread ID in the private chat
   * @returns The topic link record, or null if not found
   */
  getLink(userId: number, topicThreadId: number): Promise<TopicLink | null>;

  /**
   * Get all topic links for a user
   * @param userId - The Telegram user ID
   * @returns Array of topic link records
   */
  getUserLinks(userId: number): Promise<TopicLink[]>;

  /**
   * Check if a group is already linked for a user
   * @param userId - The Telegram user ID
   * @param groupChatId - The group chat ID to check
   * @returns The topic link record if found, or null
   */
  getLinkByGroup(userId: number, groupChatId: number): Promise<TopicLink | null>;

  /**
   * Update the status of a topic link
   * @param userId - The Telegram user ID
   * @param topicThreadId - The topic thread ID
   * @param status - The new status ('active' or 'closed')
   */
  updateStatus(userId: number, topicThreadId: number, status: string): Promise<void>;

  /**
   * Delete a topic link
   * @param userId - The Telegram user ID
   * @param topicThreadId - The topic thread ID
   */
  deleteLink(userId: number, topicThreadId: number): Promise<void>;
}

/**
 * DynamoDB implementation of the TopicLinkStore interface
 *
 * Table schema:
 *   Partition Key: userId (Number)
 *   Sort Key: topicThreadId (Number)
 */
export class DynamoDBTopicLinkStore implements TopicLinkStore {
  private client: DynamoDBClient;
  private tableName: string;

  constructor(client?: DynamoDBClient, tableName?: string) {
    if (client) {
      this.client = client;
    } else {
      const endpoint = process.env.DYNAMODB_ENDPOINT;
      const clientConfig: DynamoDBClientConfig = {
        maxAttempts: MAX_RETRY_ATTEMPTS,
      };

      if (endpoint) {
        clientConfig.endpoint = endpoint;
        clientConfig.region = process.env.AWS_REGION || 'us-east-1';
        clientConfig.credentials = {
          accessKeyId: 'local',
          secretAccessKey: 'local',
        };
      }

      this.client = new DynamoDBClient(clientConfig);
    }

    this.tableName = tableName ?? process.env.TOPIC_LINKS_TABLE ?? 'telegram-summary-topic-links';
  }

  async createLink(link: TopicLink): Promise<void> {
    const putCommand = new PutItemCommand({
      TableName: this.tableName,
      Item: {
        userId: { N: String(link.userId) },
        topicThreadId: { N: String(link.topicThreadId) },
        groupChatId: { N: String(link.groupChatId) },
        groupTitle: { S: link.groupTitle },
        privateChatId: { N: String(link.privateChatId) },
        linkedAt: { N: String(link.linkedAt) },
        status: { S: link.status },
      },
    });

    await this.client.send(putCommand);
  }

  async getLink(userId: number, topicThreadId: number): Promise<TopicLink | null> {
    const getCommand = new GetItemCommand({
      TableName: this.tableName,
      Key: {
        userId: { N: String(userId) },
        topicThreadId: { N: String(topicThreadId) },
      },
    });

    const response = await this.client.send(getCommand);

    if (!response.Item) {
      return null;
    }

    return this.itemToTopicLink(response.Item);
  }

  async getUserLinks(userId: number): Promise<TopicLink[]> {
    const queryCommand = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: {
        ':uid': { N: String(userId) },
      },
    });

    const response = await this.client.send(queryCommand);

    if (!response.Items || response.Items.length === 0) {
      return [];
    }

    return response.Items.map((item) => this.itemToTopicLink(item));
  }

  async getLinkByGroup(userId: number, groupChatId: number): Promise<TopicLink | null> {
    const queryCommand = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'groupChatId = :gid',
      ExpressionAttributeValues: {
        ':uid': { N: String(userId) },
        ':gid': { N: String(groupChatId) },
      },
    });

    const response = await this.client.send(queryCommand);

    if (!response.Items || response.Items.length === 0) {
      return null;
    }

    return this.itemToTopicLink(response.Items[0]);
  }

  async updateStatus(userId: number, topicThreadId: number, status: string): Promise<void> {
    const updateCommand = new UpdateItemCommand({
      TableName: this.tableName,
      Key: {
        userId: { N: String(userId) },
        topicThreadId: { N: String(topicThreadId) },
      },
      UpdateExpression: 'SET #s = :status',
      ExpressionAttributeNames: {
        '#s': 'status',
      },
      ExpressionAttributeValues: {
        ':status': { S: status },
      },
    });

    await this.client.send(updateCommand);
  }

  async deleteLink(userId: number, topicThreadId: number): Promise<void> {
    const deleteCommand = new DeleteItemCommand({
      TableName: this.tableName,
      Key: {
        userId: { N: String(userId) },
        topicThreadId: { N: String(topicThreadId) },
      },
    });

    await this.client.send(deleteCommand);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private itemToTopicLink(item: Record<string, any>): TopicLink {
    return {
      userId: parseInt(item.userId.N!, 10),
      topicThreadId: parseInt(item.topicThreadId.N!, 10),
      groupChatId: parseInt(item.groupChatId.N!, 10),
      groupTitle: item.groupTitle.S!,
      privateChatId: parseInt(item.privateChatId.N!, 10),
      linkedAt: parseInt(item.linkedAt.N!, 10),
      status: item.status.S! as 'active' | 'closed',
    };
  }
}

/**
 * Create a new TopicLinkStore instance with default configuration
 *
 * @returns TopicLinkStore instance
 */
export function createTopicLinkStore(): TopicLinkStore {
  return new DynamoDBTopicLinkStore();
}
