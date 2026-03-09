/**
 * DynamoDB User Group Store Implementation
 *
 * This module tracks which groups a user has been seen in, based on
 * messages stored by the bot. It enables the /link command to discover
 * groups available for linking without requiring a full table scan
 * of the messages table.
 *
 * @module store/user-group-store
 */

import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { createDynamoDBClient } from './dynamodb-client';

/**
 * Represents a user's known membership in a group
 */
export interface UserGroupRecord {
  userId: number;
  groupChatId: number;
  groupTitle: string;
  lastSeenAt: number;
}

/**
 * Interface for the UserGroupStore operations
 */
export interface UserGroupStore {
  /**
   * Track a user's presence in a group (upsert).
   * Called passively when storing group messages.
   * @param userId - The Telegram user ID
   * @param groupChatId - The group chat ID
   * @param groupTitle - The current group title
   */
  trackUserInGroup(userId: number, groupChatId: number, groupTitle: string): Promise<void>;

  /**
   * Get all groups a user has been seen in
   * @param userId - The Telegram user ID
   * @returns Array of user-group records
   */
  getUserGroups(userId: number): Promise<UserGroupRecord[]>;
}

/**
 * DynamoDB implementation of the UserGroupStore interface
 *
 * Table schema:
 *   Partition Key: userId (Number)
 *   Sort Key: groupChatId (Number)
 */
export class DynamoDBUserGroupStore implements UserGroupStore {
  private client: DynamoDBClient;
  private tableName: string;

  constructor(client?: DynamoDBClient, tableName?: string) {
    this.client = createDynamoDBClient(client);

    this.tableName = tableName ?? process.env.USER_GROUPS_TABLE ?? 'telegram-summary-user-groups';
  }

  async trackUserInGroup(userId: number, groupChatId: number, groupTitle: string): Promise<void> {
    const putCommand = new PutItemCommand({
      TableName: this.tableName,
      Item: {
        userId: { N: String(userId) },
        groupChatId: { N: String(groupChatId) },
        groupTitle: { S: groupTitle },
        lastSeenAt: { N: String(Date.now()) },
      },
    });

    await this.client.send(putCommand);
  }

  async getUserGroups(userId: number): Promise<UserGroupRecord[]> {
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

    return response.Items.map((item) => ({
      userId: parseInt(item.userId.N!, 10),
      groupChatId: parseInt(item.groupChatId.N!, 10),
      groupTitle: item.groupTitle.S!,
      lastSeenAt: parseInt(item.lastSeenAt.N!, 10),
    }));
  }
}

/**
 * Create a new UserGroupStore instance with default configuration
 *
 * @returns UserGroupStore instance
 */
export function createUserGroupStore(): UserGroupStore {
  return new DynamoDBUserGroupStore();
}
