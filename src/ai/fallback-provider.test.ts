/**
 * Unit Tests for Fallback Provider
 *
 * Tests the fallback chain behavior: successful primary, quota-error
 * fallback, non-quota errors thrown immediately, full chain exhaustion.
 *
 * @module ai/fallback-provider.test
 */

import { FallbackProvider, isQuotaOrRateLimitError } from './fallback-provider';
import { AIProvider, AIProviderError, SummarizeResult } from './ai-provider';

// Helper to create a mock AIProvider
function createMockProvider(
  summarizeImpl: (messages: string[]) => Promise<SummarizeResult>,
  maxTokens = 8192
): AIProvider {
  return {
    summarize: jest.fn(summarizeImpl),
    getMaxContextTokens: () => maxTokens,
  };
}

describe('isQuotaOrRateLimitError', () => {
  it('should return true for "too many requests" errors', () => {
    const error = new AIProviderError('Too many requests. Please wait.', 'gemini');
    expect(isQuotaOrRateLimitError(error)).toBe(true);
  });

  it('should return true for "rate limit" errors', () => {
    const error = new AIProviderError('Rate limit exceeded', 'openai');
    expect(isQuotaOrRateLimitError(error)).toBe(true);
  });

  it('should return true for "quota" errors', () => {
    const error = new AIProviderError('Grok API quota exhausted.', 'grok');
    expect(isQuotaOrRateLimitError(error)).toBe(true);
  });

  it('should return true for "resource_exhausted" errors', () => {
    const error = new AIProviderError('resource_exhausted: quota', 'gemini');
    expect(isQuotaOrRateLimitError(error)).toBe(true);
  });

  it('should return false for auth errors', () => {
    const error = new AIProviderError('Authentication failed.', 'openai');
    expect(isQuotaOrRateLimitError(error)).toBe(false);
  });

  it('should return false for network errors', () => {
    const error = new AIProviderError('Unable to connect.', 'gemini');
    expect(isQuotaOrRateLimitError(error)).toBe(false);
  });

  it('should return false for non-AIProviderError', () => {
    const error = new Error('some error');
    expect(isQuotaOrRateLimitError(error)).toBe(false);
  });

  it('should return true when cause contains 429', () => {
    const cause = new Error('HTTP 429 response');
    const error = new AIProviderError('Request failed', 'grok', cause);
    expect(isQuotaOrRateLimitError(error)).toBe(true);
  });
});

describe('FallbackProvider', () => {
  describe('constructor', () => {
    it('should throw if chain is empty', () => {
      expect(() => new FallbackProvider([])).toThrow('at least one provider');
    });
  });

  describe('summarize', () => {
    it('should return result from primary provider on success', async () => {
      const primary = createMockProvider(async () => ({ text: 'primary result' }));
      const fallback = createMockProvider(async () => ({ text: 'fallback result' }));

      const provider = new FallbackProvider([
        { type: 'gemini', provider: primary },
        { type: 'grok', provider: fallback },
      ]);

      const result = await provider.summarize(['hello']);
      expect(result.text).toBe('primary result');
      expect(primary.summarize).toHaveBeenCalledTimes(1);
      expect(fallback.summarize).not.toHaveBeenCalled();
    });

    it('should fall back to next provider on quota error', async () => {
      const primary = createMockProvider(async () => {
        throw new AIProviderError('Too many requests. Please wait.', 'gemini');
      });
      const fallback = createMockProvider(async () => ({ text: 'fallback result' }));

      const provider = new FallbackProvider([
        { type: 'gemini', provider: primary },
        { type: 'grok', provider: fallback },
      ]);

      const result = await provider.summarize(['hello']);
      expect(result.text).toBe('fallback result');
      expect(primary.summarize).toHaveBeenCalledTimes(1);
      expect(fallback.summarize).toHaveBeenCalledTimes(1);
    });

    it('should try all providers in chain on consecutive quota errors', async () => {
      const p1 = createMockProvider(async () => {
        throw new AIProviderError('Too many requests.', 'gemini');
      });
      const p2 = createMockProvider(async () => {
        throw new AIProviderError('Rate limit exceeded', 'grok');
      });
      const p3 = createMockProvider(async () => ({ text: 'openai result' }));

      const provider = new FallbackProvider([
        { type: 'gemini', provider: p1 },
        { type: 'grok', provider: p2 },
        { type: 'openai', provider: p3 },
      ]);

      const result = await provider.summarize(['hello']);
      expect(result.text).toBe('openai result');
      expect(p1.summarize).toHaveBeenCalledTimes(1);
      expect(p2.summarize).toHaveBeenCalledTimes(1);
      expect(p3.summarize).toHaveBeenCalledTimes(1);
    });

    it('should throw immediately on non-quota error', async () => {
      const primary = createMockProvider(async () => {
        throw new AIProviderError('Authentication failed.', 'gemini');
      });
      const fallback = createMockProvider(async () => ({ text: 'fallback result' }));

      const provider = new FallbackProvider([
        { type: 'gemini', provider: primary },
        { type: 'grok', provider: fallback },
      ]);

      await expect(provider.summarize(['hello'])).rejects.toThrow('Authentication failed.');
      expect(fallback.summarize).not.toHaveBeenCalled();
    });

    it('should throw last error when all providers fail with quota errors', async () => {
      const p1 = createMockProvider(async () => {
        throw new AIProviderError('Too many requests.', 'gemini');
      });
      const p2 = createMockProvider(async () => {
        throw new AIProviderError('Rate limit exceeded', 'grok');
      });

      const provider = new FallbackProvider([
        { type: 'gemini', provider: p1 },
        { type: 'grok', provider: p2 },
      ]);

      await expect(provider.summarize(['hello'])).rejects.toThrow('Rate limit exceeded');
    });

    it('should pass options through to providers', async () => {
      const primary = createMockProvider(async () => ({ text: 'result' }));
      const provider = new FallbackProvider([{ type: 'gemini', provider: primary }]);

      const options = { maxTokens: 500, temperature: 0.5 };
      await provider.summarize(['hello'], options);
      expect(primary.summarize).toHaveBeenCalledWith(['hello'], options);
    });
  });

  describe('getMaxContextTokens', () => {
    it('should return tokens from primary provider', () => {
      const primary = createMockProvider(async () => ({ text: '' }), 4096);
      const fallback = createMockProvider(async () => ({ text: '' }), 8192);

      const provider = new FallbackProvider([
        { type: 'openai', provider: primary },
        { type: 'gemini', provider: fallback },
      ]);

      expect(provider.getMaxContextTokens()).toBe(4096);
    });
  });

  describe('getChainTypes', () => {
    it('should return the provider type list', () => {
      const p1 = createMockProvider(async () => ({ text: '' }));
      const p2 = createMockProvider(async () => ({ text: '' }));

      const provider = new FallbackProvider([
        { type: 'gemini', provider: p1 },
        { type: 'grok', provider: p2 },
      ]);

      expect(provider.getChainTypes()).toEqual(['gemini', 'grok']);
    });
  });
});
