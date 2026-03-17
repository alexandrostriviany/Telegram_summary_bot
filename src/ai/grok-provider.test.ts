/**
 * Unit Tests for Grok Provider
 *
 * Tests the Grok provider implementation including API calls,
 * error handling, and response parsing.
 *
 * @module ai/grok-provider.test
 */

import { GrokProvider } from './grok-provider';
import { AIProviderError } from './ai-provider';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('GrokProvider', () => {
  const originalApiKey = process.env.GROK_API_KEY;
  const originalLlmModel = process.env.LLM_MODEL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GROK_API_KEY = 'test-grok-key';
    delete process.env.LLM_MODEL;
  });

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env.GROK_API_KEY = originalApiKey;
    } else {
      delete process.env.GROK_API_KEY;
    }
    if (originalLlmModel !== undefined) {
      process.env.LLM_MODEL = originalLlmModel;
    } else {
      delete process.env.LLM_MODEL;
    }
  });

  describe('constructor', () => {
    it('should create provider with API key from environment', () => {
      process.env.GROK_API_KEY = 'env-api-key';
      const provider = new GrokProvider();
      expect(provider).toBeInstanceOf(GrokProvider);
    });

    it('should create provider with explicit API key', () => {
      delete process.env.GROK_API_KEY;
      const provider = new GrokProvider('explicit-key');
      expect(provider).toBeInstanceOf(GrokProvider);
    });

    it('should throw AIProviderError when API key is not configured', () => {
      delete process.env.GROK_API_KEY;
      expect(() => new GrokProvider()).toThrow(AIProviderError);
      expect(() => new GrokProvider()).toThrow('Grok API key is not configured');
    });

    it('should include provider type in error', () => {
      delete process.env.GROK_API_KEY;
      try {
        new GrokProvider();
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AIProviderError);
        expect((error as AIProviderError).provider).toBe('grok');
      }
    });

    it('should use LLM_MODEL env var for model', () => {
      process.env.LLM_MODEL = 'grok-3';
      const provider = new GrokProvider();
      expect(provider).toBeInstanceOf(GrokProvider);
    });
  });

  describe('summarize', () => {
    it('should return empty JSON for empty messages array', async () => {
      const provider = new GrokProvider();
      const result = await provider.summarize([]);
      expect(result.text).toBe('{"t":[],"q":[]}');
    });

    it('should call the xAI API and return summary', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          choices: [{ index: 0, message: { role: 'assistant', content: '{"t":[{"h":"Test","b":["summary"]}],"q":[]}' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }),
      });

      const provider = new GrokProvider();
      const result = await provider.summarize(['Hello world']);
      expect(result.text).toBe('{"t":[{"h":"Test","b":["summary"]}],"q":[]}');
      expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.x.ai/v1/chat/completions');
      expect(options.headers['Authorization']).toBe('Bearer test-grok-key');
    });

    it('should throw AIProviderError on 401', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key', type: 'auth_error' } }),
      });

      const provider = new GrokProvider();
      await expect(provider.summarize(['test'])).rejects.toThrow(AIProviderError);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key', type: 'auth_error' } }),
      });
      await expect(provider.summarize(['test'])).rejects.toThrow('Authentication failed');
    });

    it('should throw AIProviderError on 429 after retries', async () => {
      // 429 is retried MAX_RETRIES times, so we need 4 responses total
      for (let i = 0; i < 4; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: async () => ({ error: { message: 'Rate limit exceeded', type: 'rate_limit' } }),
        });
      }

      const provider = new GrokProvider();
      await expect(provider.summarize(['test'])).rejects.toThrow(AIProviderError);
    }, 30000);

    it('should handle timeout errors', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const provider = new GrokProvider();
      await expect(provider.summarize(['test'])).rejects.toThrow('Request timed out');
    });

    it('should handle empty response choices', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'chatcmpl-123', choices: [] }),
      });

      const provider = new GrokProvider();
      await expect(provider.summarize(['test'])).rejects.toThrow('Unable to generate summary');
    });
  });

  describe('getMaxContextTokens', () => {
    it('should return 8192', () => {
      const provider = new GrokProvider();
      expect(provider.getMaxContextTokens()).toBe(8192);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens based on character count', () => {
      expect(GrokProvider.estimateTokens('hello world')).toBe(3); // 11 chars / 4
    });

    it('should return 0 for empty string', () => {
      expect(GrokProvider.estimateTokens('')).toBe(0);
    });
  });
});
