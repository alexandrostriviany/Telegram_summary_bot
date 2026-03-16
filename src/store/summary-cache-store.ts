/**
 * DynamoDB Summary Cache Store Implementation
 *
 * This module provides a time-bucketed cache for AI-generated summaries.
 * Multiple users requesting the same summary within a time bucket
 * receive the cached result without consuming AI tokens or credits.
 *
 * @module store/summary-cache-store
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { createDynamoDBClient } from './dynamodb-client';

/**
 * Default cache bucket size in minutes
 */
const DEFAULT_BUCKET_MINUTES = 30;

/**
 * Default TTL in hours for cached summaries
 */
const DEFAULT_CACHE_TTL_HOURS = 6;

/**
 * Cached summary record
 */
export interface CachedSummary {
  summary: string;
  createdAt: number;
  chatId: number;
}

/**
 * Interface for the SummaryCacheStore operations
 */
export interface SummaryCacheStore {
  /**
   * Get a cached summary by cache key
   * @param cacheKey - The time-bucketed cache key
   * @returns The cached summary, or null if not found
   */
  get(cacheKey: string): Promise<CachedSummary | null>;

  /**
   * Store a summary in the cache
   * @param cacheKey - The time-bucketed cache key
   * @param summary - The generated summary text
   * @param chatId - The chat ID the summary was generated for
   * @param rangeType - The range type (time or count)
   * @param rangeValue - The range value
   */
  put(cacheKey: string, summary: string, chatId: number, rangeType: string, rangeValue: number): Promise<void>;
}

/**
 * Build a time-bucketed cache key for summary deduplication.
 *
 * Requests with the same chatId, rangeType, and rangeValue that fall
 * within the same time bucket will share the same cache key.
 *
 * @param chatId - The chat ID
 * @param rangeType - The range type (e.g. "time" or "count")
 * @param rangeValue - The range value (e.g. 24 for hours, 50 for count)
 * @param bucketMinutes - Bucket size in minutes (default from env or 30)
 * @returns A cache key string
 */
export function buildCacheKey(
  chatId: number,
  rangeType: string,
  rangeValue: number,
  bucketMinutes?: number
): string {
  const bucket = bucketMinutes ?? parseInt(
    process.env.SUMMARY_CACHE_BUCKET_MINUTES ?? String(DEFAULT_BUCKET_MINUTES),
    10
  );
  const timeBucket = Math.floor(Date.now() / (bucket * 60 * 1000));
  return `${chatId}:${rangeType}:${rangeValue}:${timeBucket}`;
}

/**
 * DynamoDB implementation of the SummaryCacheStore interface
 */
export class DynamoDBSummaryCacheStore implements SummaryCacheStore {
  private client: DynamoDBClient;
  private tableName: string;
  private ttlHours: number;

  constructor(
    client?: DynamoDBClient,
    tableName?: string,
    ttlHours?: number
  ) {
    this.client = createDynamoDBClient(client);
    this.tableName = tableName ?? process.env.SUMMARY_CACHE_TABLE ?? 'telegram-summary-cache';
    this.ttlHours = ttlHours ?? DEFAULT_CACHE_TTL_HOURS;
  }

  async get(cacheKey: string): Promise<CachedSummary | null> {
    const command = new GetItemCommand({
      TableName: this.tableName,
      Key: {
        cacheKey: { S: cacheKey },
      },
    });

    const response = await this.client.send(command);

    if (!response.Item) {
      return null;
    }

    return {
      summary: response.Item.summary.S!,
      createdAt: parseInt(response.Item.createdAt.N!, 10),
      chatId: parseInt(response.Item.chatId.N!, 10),
    };
  }

  async put(
    cacheKey: string,
    summary: string,
    chatId: number,
    rangeType: string,
    rangeValue: number
  ): Promise<void> {
    const now = Date.now();
    const expireAt = Math.floor(now / 1000) + this.ttlHours * 60 * 60;

    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: {
        cacheKey: { S: cacheKey },
        summary: { S: summary },
        chatId: { N: String(chatId) },
        rangeType: { S: rangeType },
        rangeValue: { N: String(rangeValue) },
        createdAt: { N: String(now) },
        expireAt: { N: String(expireAt) },
      },
    });

    await this.client.send(command);
  }
}

/**
 * Create a new SummaryCacheStore instance with default configuration
 *
 * @returns SummaryCacheStore instance
 */
export function createSummaryCacheStore(): SummaryCacheStore {
  return new DynamoDBSummaryCacheStore();
}
