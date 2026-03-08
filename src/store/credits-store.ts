/**
 * DynamoDB Credits Store Implementation
 *
 * This module provides the CreditsStore implementation using AWS DynamoDB.
 * It handles user credit tracking, daily resets, and chat ownership mapping.
 *
 * @module store/credits-store
 */

import {
  DynamoDBClient,
  DynamoDBClientConfig,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';

/**
 * Default daily credit limit for free users
 */
const DEFAULT_DAILY_LIMIT = 10;

/**
 * Maximum retry attempts for DynamoDB operations
 */
const MAX_RETRY_ATTEMPTS = 5;

/**
 * User credit record
 */
export interface UserCredits {
  userId: number;
  dailyLimit: number;
  creditsUsedToday: number;
  lastResetDate: string;
  isPaid: boolean;
  createdAt: number;
}

/**
 * Chat ownership record
 */
export interface ChatOwnership {
  chatId: number;
  ownerUserId: number;
  addedAt: number;
}

/**
 * Interface for the CreditsStore operations
 */
export interface CreditsStore {
  /**
   * Check if a user record exists without creating one
   * @param userId - The Telegram user ID
   * @returns true if the user has started the bot (record exists)
   */
  userExists(userId: number): Promise<boolean>;

  /**
   * Get or create a user credit record
   * @param userId - The Telegram user ID
   * @returns The user's credit record
   */
  getOrCreateUser(userId: number): Promise<UserCredits>;

  /**
   * Attempt to consume one credit for a user.
   * Auto-resets credits if the date has changed.
   * @param userId - The Telegram user ID
   * @returns true if credit was consumed, false if exhausted
   */
  consumeCredit(userId: number): Promise<boolean>;

  /**
   * Get current credits info for a user
   * @param userId - The Telegram user ID
   * @returns The user's credit record
   */
  getCredits(userId: number): Promise<UserCredits>;

  /**
   * Set the daily limit for a user
   * @param userId - The Telegram user ID
   * @param limit - The new daily limit
   */
  setDailyLimit(userId: number, limit: number): Promise<void>;

  /**
   * Set the chat owner (the user who added the bot)
   * @param chatId - The Telegram chat ID
   * @param ownerUserId - The user ID who added the bot
   */
  setChatOwner(chatId: number, ownerUserId: number): Promise<void>;

  /**
   * Get the owner of a chat
   * @param chatId - The Telegram chat ID
   * @returns The chat ownership record, or null if not found
   */
  getChatOwner(chatId: number): Promise<ChatOwnership | null>;

  /**
   * Get all known chat ownership records (all groups the bot was added to)
   * @returns Array of chat ownership records
   */
  getAllChats(): Promise<ChatOwnership[]>;
}

/**
 * Get today's date string in UTC (YYYY-MM-DD)
 */
export function getTodayUTC(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * DynamoDB implementation of the CreditsStore interface
 */
export class DynamoDBCreditsStore implements CreditsStore {
  private client: DynamoDBClient;
  private creditsTableName: string;
  private ownershipTableName: string;
  private defaultDailyLimit: number;

  constructor(
    client?: DynamoDBClient,
    creditsTableName?: string,
    ownershipTableName?: string,
    defaultDailyLimit?: number
  ) {
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

    this.creditsTableName = creditsTableName ?? process.env.CREDITS_TABLE ?? 'telegram-summary-user-credits';
    this.ownershipTableName = ownershipTableName ?? process.env.CHAT_OWNERSHIP_TABLE ?? 'telegram-summary-chat-ownership';
    this.defaultDailyLimit = defaultDailyLimit ?? parseInt(process.env.DEFAULT_DAILY_CREDITS ?? String(DEFAULT_DAILY_LIMIT), 10);
  }

  async userExists(userId: number): Promise<boolean> {
    const getCommand = new GetItemCommand({
      TableName: this.creditsTableName,
      Key: {
        userId: { N: String(userId) },
      },
    });

    const response = await this.client.send(getCommand);
    return !!response.Item;
  }

  async getOrCreateUser(userId: number): Promise<UserCredits> {
    const today = getTodayUTC();

    const getCommand = new GetItemCommand({
      TableName: this.creditsTableName,
      Key: {
        userId: { N: String(userId) },
      },
    });

    const response = await this.client.send(getCommand);

    if (response.Item) {
      const record: UserCredits = {
        userId: parseInt(response.Item.userId.N!, 10),
        dailyLimit: parseInt(response.Item.dailyLimit.N!, 10),
        creditsUsedToday: parseInt(response.Item.creditsUsedToday.N!, 10),
        lastResetDate: response.Item.lastResetDate.S!,
        isPaid: response.Item.isPaid.BOOL!,
        createdAt: parseInt(response.Item.createdAt.N!, 10),
      };

      // Auto-reset if date has changed
      if (record.lastResetDate !== today) {
        record.creditsUsedToday = 0;
        record.lastResetDate = today;

        const resetCommand = new UpdateItemCommand({
          TableName: this.creditsTableName,
          Key: {
            userId: { N: String(userId) },
          },
          UpdateExpression: 'SET creditsUsedToday = :zero, lastResetDate = :today',
          ExpressionAttributeValues: {
            ':zero': { N: '0' },
            ':today': { S: today },
          },
        });
        await this.client.send(resetCommand);
      }

      return record;
    }

    // Create new user record
    const newUser: UserCredits = {
      userId,
      dailyLimit: this.defaultDailyLimit,
      creditsUsedToday: 0,
      lastResetDate: today,
      isPaid: false,
      createdAt: Date.now(),
    };

    const putCommand = new PutItemCommand({
      TableName: this.creditsTableName,
      Item: {
        userId: { N: String(newUser.userId) },
        dailyLimit: { N: String(newUser.dailyLimit) },
        creditsUsedToday: { N: String(newUser.creditsUsedToday) },
        lastResetDate: { S: newUser.lastResetDate },
        isPaid: { BOOL: newUser.isPaid },
        createdAt: { N: String(newUser.createdAt) },
      },
    });
    await this.client.send(putCommand);

    return newUser;
  }

  async consumeCredit(userId: number): Promise<boolean> {
    const today = getTodayUTC();

    // Ensure user exists and is reset for today
    await this.getOrCreateUser(userId);

    try {
      // Atomic increment with condition: creditsUsedToday < dailyLimit
      const updateCommand = new UpdateItemCommand({
        TableName: this.creditsTableName,
        Key: {
          userId: { N: String(userId) },
        },
        UpdateExpression: 'SET creditsUsedToday = creditsUsedToday + :one, lastResetDate = :today',
        ConditionExpression: 'creditsUsedToday < dailyLimit',
        ExpressionAttributeValues: {
          ':one': { N: '1' },
          ':today': { S: today },
        },
      });

      await this.client.send(updateCommand);
      return true;
    } catch (error: unknown) {
      // ConditionalCheckFailedException means credits are exhausted
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        return false;
      }
      throw error;
    }
  }

  async getCredits(userId: number): Promise<UserCredits> {
    return this.getOrCreateUser(userId);
  }

  async setDailyLimit(userId: number, limit: number): Promise<void> {
    // Ensure user exists first
    await this.getOrCreateUser(userId);

    const updateCommand = new UpdateItemCommand({
      TableName: this.creditsTableName,
      Key: {
        userId: { N: String(userId) },
      },
      UpdateExpression: 'SET dailyLimit = :limit',
      ExpressionAttributeValues: {
        ':limit': { N: String(limit) },
      },
    });

    await this.client.send(updateCommand);
  }

  async setChatOwner(chatId: number, ownerUserId: number): Promise<void> {
    const putCommand = new PutItemCommand({
      TableName: this.ownershipTableName,
      Item: {
        chatId: { N: String(chatId) },
        ownerUserId: { N: String(ownerUserId) },
        addedAt: { N: String(Date.now()) },
      },
      ConditionExpression: 'attribute_not_exists(chatId)',
    });

    try {
      await this.client.send(putCommand);
    } catch (error: unknown) {
      // If ownership already exists, silently keep the existing owner
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        return;
      }
      throw error;
    }
  }

  async getChatOwner(chatId: number): Promise<ChatOwnership | null> {
    const getCommand = new GetItemCommand({
      TableName: this.ownershipTableName,
      Key: {
        chatId: { N: String(chatId) },
      },
    });

    const response = await this.client.send(getCommand);

    if (!response.Item) {
      return null;
    }

    return {
      chatId: parseInt(response.Item.chatId.N!, 10),
      ownerUserId: parseInt(response.Item.ownerUserId.N!, 10),
      addedAt: parseInt(response.Item.addedAt.N!, 10),
    };
  }

  async getAllChats(): Promise<ChatOwnership[]> {
    const scanCommand = new ScanCommand({
      TableName: this.ownershipTableName,
    });

    const response = await this.client.send(scanCommand);

    if (!response.Items || response.Items.length === 0) {
      return [];
    }

    return response.Items.map((item) => ({
      chatId: parseInt(item.chatId.N!, 10),
      ownerUserId: parseInt(item.ownerUserId.N!, 10),
      addedAt: parseInt(item.addedAt.N!, 10),
    }));
  }
}

/**
 * Create a new CreditsStore instance with default configuration
 *
 * @returns CreditsStore instance
 */
export function createCreditsStore(): CreditsStore {
  return new DynamoDBCreditsStore();
}
