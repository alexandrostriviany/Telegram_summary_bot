/**
 * Unit Tests for Gemini Provider
 *
 * Tests the Gemini provider implementation including API calls,
 * error handling, and response parsing.
 *
 * @module ai/gemini-provider.test
 *
 * **Validates: Requirements 5.2** - Gemini API support
 * **Validates: Requirements 5.4** - Graceful error handling
 */

import { GeminiProvider } from './gemini-provider';
import { AIProviderError } from './ai-provider';
import { SUMMARY_SYSTEM_PROMPT } from './prompts';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('GeminiProvider', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalLlmModel = process.env.LLM_MODEL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    delete process.env.LLM_MODEL;
  });

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    if (originalLlmModel !== undefined) {
      process.env.LLM_MODEL = originalLlmModel;
    } else {
      delete process.env.LLM_MODEL;
    }
  });

  describe('constructor', () => {
    it('should create provider with API key from environment', () => {
      process.env.GEMINI_API_KEY = 'env-api-key';
      const provider = new GeminiProvider();
      expect(provider).toBeInstanceOf(GeminiProvider);
    });

    it('should create provider with explicit API key', () => {
      delete process.env.GEMINI_API_KEY;
      const provider = new GeminiProvider('explicit-api-key');
      expect(provider).toBeInstanceOf(GeminiProvider);
    });

    it('should throw AIProviderError when API key is not configured', () => {
      delete process.env.GEMINI_API_KEY;
      expect(() => new GeminiProvider()).toThrow(AIProviderError);
      expect(() => new GeminiProvider()).toThrow('Gemini API key is not configured');
    });

    it('should throw AIProviderError with correct provider type', () => {
      delete process.env.GEMINI_API_KEY;
      try {
        new GeminiProvider();
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AIProviderError);
        expect((error as AIProviderError).provider).toBe('gemini');
      }
    });

    it('should use LLM_MODEL env var when set', () => {
      process.env.LLM_MODEL = 'gemini-1.5-pro';
      const provider = new GeminiProvider('test-key');
      // We can verify the model is used by checking the API call
      expect(provider).toBeInstanceOf(GeminiProvider);
    });
  });

  describe('getMaxContextTokens', () => {
    it('should return 8192 tokens', () => {
      const provider = new GeminiProvider('test-key');
      expect(provider.getMaxContextTokens()).toBe(8192);
    });
  });

  describe('summarize', () => {
    let provider: GeminiProvider;

    beforeEach(() => {
      provider = new GeminiProvider('test-gemini-key');
    });

    it('should return empty summary message for empty messages array', async () => {
      const result = await provider.summarize([]);
      expect(result).toContain('No messages to summarize');
    });

    it('should make API request with correct parameters', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: '🧵 **Summary**\nTest summary content' }],
            role: 'model',
          },
          finishReason: 'STOP',
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await provider.summarize(['User1: Hello', 'User2: Hi there']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
      expect(url).toContain('key=test-gemini-key');
      expect(options?.method).toBe('POST');
      expect(options?.headers).toEqual({
        'Content-Type': 'application/json',
      });

      const body = JSON.parse(options?.body as string);
      expect(body.contents).toHaveLength(1);
      expect(body.contents[0].role).toBe('user');
      expect(body.contents[0].parts[0].text).toContain('User1: Hello');
      expect(body.contents[0].parts[0].text).toContain('User2: Hi there');
      expect(body.systemInstruction).toBeDefined();
      expect(body.systemInstruction.parts[0].text).toBe(SUMMARY_SYSTEM_PROMPT);
      expect(body.generationConfig.responseMimeType).toBeUndefined();
      expect(body.generationConfig.responseSchema).toBeUndefined();
    });

    it('should use LLM_MODEL env var in API URL', async () => {
      process.env.LLM_MODEL = 'gemini-1.5-pro';
      const customProvider = new GeminiProvider('test-key');

      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Summary' }],
            role: 'model',
          },
          finishReason: 'STOP',
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await customProvider.summarize(['Test message']);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('gemini-1.5-pro:generateContent');
    });

    it('should use default max_tokens and temperature', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Summary' }],
            role: 'model',
          },
          finishReason: 'STOP',
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await provider.summarize(['Test message']);

      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.generationConfig.maxOutputTokens).toBe(2048);
      expect(body.generationConfig.temperature).toBe(0.3);
    });

    it('should use custom max_tokens and temperature from options', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Summary' }],
            role: 'model',
          },
          finishReason: 'STOP',
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await provider.summarize(['Test message'], { maxTokens: 1000, temperature: 0.7 });

      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.generationConfig.maxOutputTokens).toBe(1000);
      expect(body.generationConfig.temperature).toBe(0.7);
    });

    it('should return summary content from API response', async () => {
      const expectedSummary = '🧵 **Summary**\nThis is a test summary with topics.';
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: expectedSummary }],
            role: 'model',
          },
          finishReason: 'STOP',
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await provider.summarize(['Test message']);
      expect(result).toBe(expectedSummary);
    });

    it('should trim whitespace from response', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: '  Summary with whitespace  \n' }],
            role: 'model',
          },
          finishReason: 'STOP',
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await provider.summarize(['Test message']);
      expect(result).toBe('Summary with whitespace');
    });

    describe('error handling', () => {
      it('should throw AIProviderError on 401 unauthorized', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({
            error: { code: 401, message: 'API key not valid', status: 'UNAUTHENTICATED' },
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);

        mockFetch.mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({
            error: { code: 401, message: 'API key not valid', status: 'UNAUTHENTICATED' },
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow('Authentication failed');
      });

      it('should throw AIProviderError on 403 forbidden', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 403,
          json: async () => ({
            error: { code: 403, message: 'Permission denied', status: 'PERMISSION_DENIED' },
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);

        mockFetch.mockResolvedValue({
          ok: false,
          status: 403,
          json: async () => ({
            error: { code: 403, message: 'Permission denied', status: 'PERMISSION_DENIED' },
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow('Authentication failed');
      });

      it('should retry on 429 rate limit then throw', async () => {
        const errorResponse = {
          ok: false,
          status: 429,
          json: async () => ({
            error: { code: 429, message: 'Resource exhausted', status: 'RESOURCE_EXHAUSTED' },
          }),
        } as Response;

        // 1 initial + 3 retries = 4 calls
        mockFetch
          .mockResolvedValueOnce(errorResponse)
          .mockResolvedValueOnce(errorResponse)
          .mockResolvedValueOnce(errorResponse)
          .mockResolvedValueOnce(errorResponse);

        await expect(provider.summarize(['Test'])).rejects.toThrow('Too many requests');
        expect(mockFetch).toHaveBeenCalledTimes(4);
      });

      it('should succeed after transient 429 retry', async () => {
        const errorResponse = {
          ok: false,
          status: 429,
          json: async () => ({
            error: { code: 429, message: 'Resource exhausted', status: 'RESOURCE_EXHAUSTED' },
          }),
        } as Response;
        const successResponse = {
          ok: true,
          json: async () => ({
            candidates: [{
              content: { parts: [{ text: 'Summary after retry' }], role: 'model' },
              finishReason: 'STOP',
            }],
          }),
        } as Response;

        mockFetch
          .mockResolvedValueOnce(errorResponse)
          .mockResolvedValueOnce(successResponse);

        const result = await provider.summarize(['Test']);
        expect(result).toBe('Summary after retry');
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('should retry on 500 server error then throw', async () => {
        const errorResponse = {
          ok: false,
          status: 500,
          json: async () => ({
            error: { code: 500, message: 'Internal error', status: 'INTERNAL' },
          }),
        } as Response;

        mockFetch
          .mockResolvedValueOnce(errorResponse)
          .mockResolvedValueOnce(errorResponse)
          .mockResolvedValueOnce(errorResponse)
          .mockResolvedValueOnce(errorResponse);

        await expect(provider.summarize(['Test'])).rejects.toThrow('temporarily unavailable');
        expect(mockFetch).toHaveBeenCalledTimes(4);
      });

      it('should retry on 503 service unavailable then throw', async () => {
        const errorResponse = {
          ok: false,
          status: 503,
          json: async () => ({
            error: { code: 503, message: 'Service unavailable', status: 'UNAVAILABLE' },
          }),
        } as Response;

        mockFetch
          .mockResolvedValueOnce(errorResponse)
          .mockResolvedValueOnce(errorResponse)
          .mockResolvedValueOnce(errorResponse)
          .mockResolvedValueOnce(errorResponse);

        await expect(provider.summarize(['Test'])).rejects.toThrow('temporarily unavailable');
        expect(mockFetch).toHaveBeenCalledTimes(4);
      });

      it('should throw AIProviderError on context length exceeded', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              code: 400,
              message: 'Request payload size exceeds the token limit',
              status: 'INVALID_ARGUMENT',
            },
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);

        mockFetch.mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              code: 400,
              message: 'Request payload size exceeds the token limit',
              status: 'INVALID_ARGUMENT',
            },
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow('too long to summarize');
      });

      it('should throw generic error on other 400 errors', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({
            error: { code: 400, message: 'Bad request', status: 'INVALID_ARGUMENT' },
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);

        mockFetch.mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({
            error: { code: 400, message: 'Bad request', status: 'INVALID_ARGUMENT' },
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow('Unable to process');
      });

      it('should throw AIProviderError on network error', async () => {
        mockFetch.mockRejectedValue(new Error('fetch failed: network error'));

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);

        mockFetch.mockRejectedValue(new Error('fetch failed: network error'));

        await expect(provider.summarize(['Test'])).rejects.toThrow('Unable to connect');
      });

      it('should skip thinking parts and extract actual content', async () => {
        const mockResponse = {
          candidates: [{
            content: {
              parts: [
                { text: 'Let me analyze this conversation...', thought: true },
                { text: '{"overview":"Test","topics":[],"questions":[]}' },
              ],
              role: 'model',
            },
            finishReason: 'STOP',
          }],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        } as Response);

        const result = await provider.summarize(['Test message']);
        expect(result).toBe('{"overview":"Test","topics":[],"questions":[]}');
      });

      it('should throw AIProviderError on empty candidates array', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({ candidates: [] }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);

        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({ candidates: [] }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow('Unable to generate summary');
      });

      it('should throw AIProviderError on missing content', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: null }], role: 'model' } }],
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);

        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: null }], role: 'model' } }],
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow('Unable to generate summary');
      });

      it('should not expose API key in error messages', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({
            error: { code: 401, message: 'API key not valid: AIza...', status: 'UNAUTHENTICATED' },
          }),
        } as Response);

        try {
          await provider.summarize(['Test']);
          fail('Expected error to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AIProviderError);
          const errorMessage = (error as AIProviderError).message;
          expect(errorMessage).not.toContain('AIza');
          expect(errorMessage).not.toContain('test-gemini-key');
        }
      });

      it('should include provider type in all errors', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({
            error: { code: 500, message: 'Server error', status: 'INTERNAL' },
          }),
        } as Response);

        try {
          await provider.summarize(['Test']);
          fail('Expected error to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AIProviderError);
          expect((error as AIProviderError).provider).toBe('gemini');
        }
      });
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens based on character count', () => {
      expect(GeminiProvider.estimateTokens('')).toBe(0);
      expect(GeminiProvider.estimateTokens('test')).toBe(1);
      expect(GeminiProvider.estimateTokens('hello world')).toBe(3);
      expect(GeminiProvider.estimateTokens('a'.repeat(100))).toBe(25);
    });

    it('should round up token estimates', () => {
      expect(GeminiProvider.estimateTokens('hello')).toBe(2);
    });
  });

  describe('AIProvider interface compliance', () => {
    it('should implement summarize method', () => {
      const provider = new GeminiProvider('test-key');
      expect(typeof provider.summarize).toBe('function');
    });

    it('should implement getMaxContextTokens method', () => {
      const provider = new GeminiProvider('test-key');
      expect(typeof provider.getMaxContextTokens).toBe('function');
    });

    it('should return positive max context tokens', () => {
      const provider = new GeminiProvider('test-key');
      expect(provider.getMaxContextTokens()).toBeGreaterThan(0);
    });
  });
});
