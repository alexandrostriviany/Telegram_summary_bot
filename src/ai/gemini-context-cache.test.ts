/**
 * Unit Tests for Gemini Context Cache
 *
 * Tests the Gemini CachedContent API integration including cache creation,
 * reuse, expiry, and graceful error handling.
 *
 * @module ai/gemini-context-cache.test
 */

import { DefaultGeminiContextCache } from './gemini-context-cache';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('DefaultGeminiContextCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createCache = () => new DefaultGeminiContextCache('test-key', 'gemini-2.5-flash');

  const mockSuccessResponse = (name = 'cachedContents/abc123', expireTime?: string) => {
    const expire = expireTime ?? new Date(Date.now() + 3600 * 1000).toISOString();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name, expireTime: expire }),
    });
  };

  describe('getCachedContentName', () => {
    it('should create cached content on first call', async () => {
      const cache = createCache();
      mockSuccessResponse();

      const name = await cache.getCachedContentName();

      expect(name).toBe('cachedContents/abc123');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('cachedContents?key=test-key'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('gemini-2.5-flash'),
        })
      );
    });

    it('should return existing cache when still valid', async () => {
      const cache = createCache();
      mockSuccessResponse();

      const name1 = await cache.getCachedContentName();
      const name2 = await cache.getCachedContentName();

      expect(name1).toBe('cachedContents/abc123');
      expect(name2).toBe('cachedContents/abc123');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should refresh cache when expired', async () => {
      const cache = createCache();

      // First call: cache that expires immediately
      const pastExpiry = new Date(Date.now() - 1000).toISOString();
      mockSuccessResponse('cachedContents/old', pastExpiry);

      const name1 = await cache.getCachedContentName();
      expect(name1).toBe('cachedContents/old');

      // Second call: should create new cache since old one expired
      mockSuccessResponse('cachedContents/new');

      const name2 = await cache.getCachedContentName();
      expect(name2).toBe('cachedContents/new');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return null gracefully when API call fails with HTTP error', async () => {
      const cache = createCache();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const name = await cache.getCachedContentName();

      expect(name).toBeNull();
      consoleSpy.mockRestore();
    });

    it('should return null gracefully when fetch throws', async () => {
      const cache = createCache();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const name = await cache.getCachedContentName();

      expect(name).toBeNull();
      consoleSpy.mockRestore();
    });

    it('should return null when response is missing name field', async () => {
      const cache = createCache();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ expireTime: new Date(Date.now() + 3600000).toISOString() }),
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const name = await cache.getCachedContentName();

      expect(name).toBeNull();
      consoleSpy.mockRestore();
    });

    it('should never throw errors', async () => {
      const cache = createCache();
      mockFetch.mockRejectedValueOnce(new Error('catastrophic failure'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Should not throw
      const name = await cache.getCachedContentName();
      expect(name).toBeNull();

      consoleSpy.mockRestore();
    });

    it('should include system instruction in request body', async () => {
      const cache = createCache();
      mockSuccessResponse();

      await cache.getCachedContentName();

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.systemInstruction).toBeDefined();
      expect(requestBody.systemInstruction.parts[0].text).toBeTruthy();
      expect(requestBody.model).toBe('models/gemini-2.5-flash');
      expect(requestBody.ttl).toBe('3600s');
    });
  });

  describe('isValid', () => {
    it('should return false initially', () => {
      const cache = createCache();
      expect(cache.isValid()).toBe(false);
    });

    it('should return true after successful cache creation', async () => {
      const cache = createCache();
      mockSuccessResponse();

      await cache.getCachedContentName();

      expect(cache.isValid()).toBe(true);
    });

    it('should return false after cache expires', async () => {
      const cache = createCache();
      const pastExpiry = new Date(Date.now() - 1000).toISOString();
      mockSuccessResponse('cachedContents/expired', pastExpiry);

      await cache.getCachedContentName();

      expect(cache.isValid()).toBe(false);
    });

    it('should return false after API failure resets cache', async () => {
      const cache = createCache();

      // Create cache that expires in the past (will be immediately invalid)
      const pastExpiry = new Date(Date.now() - 1000).toISOString();
      mockSuccessResponse('cachedContents/old', pastExpiry);
      await cache.getCachedContentName();

      // Cache name was set but already expired
      expect(cache.isValid()).toBe(false);

      // Next call tries to refresh but fails
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      await cache.getCachedContentName();
      consoleSpy.mockRestore();

      expect(cache.isValid()).toBe(false);
    });
  });
});
