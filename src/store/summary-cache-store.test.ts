/**
 * Unit Tests for Summary Cache Store
 *
 * @module store/summary-cache-store.test
 */

import {
  DynamoDBSummaryCacheStore,
  SummaryCacheStore,
  buildCacheKey,
} from './summary-cache-store';

// Mock the DynamoDB client
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => {
  return {
    DynamoDBClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    GetItemCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'GetItemCommand' })),
    PutItemCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'PutItemCommand' })),
  };
});

describe('buildCacheKey', () => {
  it('should generate correct format', () => {
    const key = buildCacheKey(-1001234567890, 'time', 24, 30);

    const parts = key.split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('-1001234567890');
    expect(parts[1]).toBe('time');
    expect(parts[2]).toBe('24');
    expect(parseInt(parts[3], 10)).toBeGreaterThan(0);
  });

  it('should produce the same bucket within a 30-minute window', () => {
    // Align to start of a bucket to avoid boundary issues
    const bucketMs = 30 * 60 * 1000;
    const aligned = Math.floor(Date.now() / bucketMs) * bucketMs;

    jest.spyOn(Date, 'now').mockReturnValue(aligned);
    const key1 = buildCacheKey(-100, 'time', 24, 30);

    // 10 minutes later — same bucket
    jest.spyOn(Date, 'now').mockReturnValue(aligned + 10 * 60 * 1000);
    const key2 = buildCacheKey(-100, 'time', 24, 30);

    expect(key1).toBe(key2);

    jest.restoreAllMocks();
  });

  it('should produce a different bucket after 30 minutes', () => {
    const now = Date.now();
    // Align to start of a bucket to guarantee crossing a boundary
    const bucketMs = 30 * 60 * 1000;
    const aligned = Math.floor(now / bucketMs) * bucketMs;

    jest.spyOn(Date, 'now').mockReturnValue(aligned);
    const key1 = buildCacheKey(-100, 'time', 24, 30);

    // Exactly one bucket later
    jest.spyOn(Date, 'now').mockReturnValue(aligned + bucketMs);
    const key2 = buildCacheKey(-100, 'time', 24, 30);

    expect(key1).not.toBe(key2);

    jest.restoreAllMocks();
  });

  it('should use env var for bucket minutes when not specified', () => {
    const original = process.env.SUMMARY_CACHE_BUCKET_MINUTES;
    process.env.SUMMARY_CACHE_BUCKET_MINUTES = '15';

    const bucketMs = 15 * 60 * 1000;
    const aligned = Math.floor(Date.now() / bucketMs) * bucketMs;
    jest.spyOn(Date, 'now').mockReturnValue(aligned);

    const key = buildCacheKey(-100, 'count', 50);
    const timeBucket = Math.floor(aligned / bucketMs);
    expect(key).toBe(`-100:count:50:${timeBucket}`);

    process.env.SUMMARY_CACHE_BUCKET_MINUTES = original;
    jest.restoreAllMocks();
  });
});

describe('DynamoDBSummaryCacheStore', () => {
  let store: SummaryCacheStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new DynamoDBSummaryCacheStore(
      undefined,
      'test-summary-cache'
    );
  });

  describe('get', () => {
    it('should return null when item not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await store.get('some:cache:key:123');

      expect(result).toBeNull();
      const command = mockSend.mock.calls[0][0];
      expect(command._type).toBe('GetItemCommand');
      expect(command.input.TableName).toBe('test-summary-cache');
      expect(command.input.Key.cacheKey.S).toBe('some:cache:key:123');
    });

    it('should return CachedSummary when found', async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          cacheKey: { S: '-100:time:24:999' },
          summary: { S: 'This is a cached summary' },
          createdAt: { N: '1700000000000' },
          chatId: { N: '-100' },
          rangeType: { S: 'time' },
          rangeValue: { N: '24' },
          expireAt: { N: '1700021600' },
        },
      });

      const result = await store.get('-100:time:24:999');

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('This is a cached summary');
      expect(result!.createdAt).toBe(1700000000000);
      expect(result!.chatId).toBe(-100);
    });

    it('should propagate DynamoDB errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(store.get('key')).rejects.toThrow('DynamoDB error');
    });
  });

  describe('put', () => {
    it('should call PutItemCommand with correct attributes including TTL', async () => {
      mockSend.mockResolvedValueOnce({});
      const now = 1700000000000;
      jest.spyOn(Date, 'now').mockReturnValue(now);

      await store.put('-100:time:24:999', 'Summary text', -100, 'time', 24);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command._type).toBe('PutItemCommand');
      expect(command.input.TableName).toBe('test-summary-cache');
      expect(command.input.Item.cacheKey.S).toBe('-100:time:24:999');
      expect(command.input.Item.summary.S).toBe('Summary text');
      expect(command.input.Item.chatId.N).toBe('-100');
      expect(command.input.Item.rangeType.S).toBe('time');
      expect(command.input.Item.rangeValue.N).toBe('24');
      expect(command.input.Item.createdAt.N).toBe(String(now));
      // TTL: 6 hours from now in epoch seconds
      const expectedExpireAt = Math.floor(now / 1000) + 6 * 60 * 60;
      expect(command.input.Item.expireAt.N).toBe(String(expectedExpireAt));

      jest.restoreAllMocks();
    });

    it('should propagate DynamoDB errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Write failed'));

      await expect(
        store.put('key', 'text', -100, 'time', 24)
      ).rejects.toThrow('Write failed');
    });
  });

  describe('constructor', () => {
    it('should use environment variables for table name', () => {
      const original = process.env.SUMMARY_CACHE_TABLE;
      process.env.SUMMARY_CACHE_TABLE = 'env-cache-table';

      const envStore = new DynamoDBSummaryCacheStore();
      expect(envStore).toBeInstanceOf(DynamoDBSummaryCacheStore);

      process.env.SUMMARY_CACHE_TABLE = original;
    });

    it('should use default table name when no env var set', () => {
      const original = process.env.SUMMARY_CACHE_TABLE;
      delete process.env.SUMMARY_CACHE_TABLE;

      const defaultStore = new DynamoDBSummaryCacheStore();
      expect(defaultStore).toBeInstanceOf(DynamoDBSummaryCacheStore);

      process.env.SUMMARY_CACHE_TABLE = original;
    });
  });
});
