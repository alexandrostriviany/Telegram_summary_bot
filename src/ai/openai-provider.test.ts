/**
 * Unit Tests for OpenAI Provider
 * 
 * Tests the OpenAI provider implementation including API calls,
 * error handling, and response parsing.
 * 
 * @module ai/openai-provider.test
 * 
 * **Validates: Requirements 5.2** - OpenAI API support
 * **Validates: Requirements 5.4** - Graceful error handling
 */

import { OpenAIProvider } from './openai-provider';
import { AIProviderError } from './ai-provider';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('OpenAIProvider', () => {
  const originalEnv = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.OPENAI_API_KEY = originalEnv;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  describe('constructor', () => {
    it('should create provider with API key from environment', () => {
      process.env.OPENAI_API_KEY = 'env-api-key';
      const provider = new OpenAIProvider();
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it('should create provider with explicit API key', () => {
      delete process.env.OPENAI_API_KEY;
      const provider = new OpenAIProvider('explicit-api-key');
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it('should throw AIProviderError when API key is not configured', () => {
      delete process.env.OPENAI_API_KEY;
      expect(() => new OpenAIProvider()).toThrow(AIProviderError);
      expect(() => new OpenAIProvider()).toThrow('OpenAI API key is not configured');
    });

    it('should throw AIProviderError with correct provider type', () => {
      delete process.env.OPENAI_API_KEY;
      try {
        new OpenAIProvider();
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AIProviderError);
        expect((error as AIProviderError).provider).toBe('openai');
      }
    });
  });

  describe('getMaxContextTokens', () => {
    it('should return 4096 tokens for GPT-3.5-turbo', () => {
      const provider = new OpenAIProvider('test-key');
      expect(provider.getMaxContextTokens()).toBe(4096);
    });
  });

  describe('summarize', () => {
    let provider: OpenAIProvider;

    beforeEach(() => {
      provider = new OpenAIProvider('test-api-key');
    });

    it('should return empty summary message for empty messages array', async () => {
      const result = await provider.summarize([]);
      expect(result).toContain('No messages to summarize');
    });

    it('should make API request with correct parameters', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-3.5-turbo',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: '🧵 **Summary**\nTest summary content',
          },
          finish_reason: 'stop',
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await provider.summarize(['User1: Hello', 'User2: Hi there']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(options?.method).toBe('POST');
      expect(options?.headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-api-key',
      });

      const body = JSON.parse(options?.body as string);
      expect(body.model).toBe('gpt-3.5-turbo');
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
      expect(body.messages[1].content).toContain('User1: Hello');
      expect(body.messages[1].content).toContain('User2: Hi there');
    });

    it('should use default max_tokens and temperature', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'Summary' },
          finish_reason: 'stop',
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await provider.summarize(['Test message']);

      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.max_tokens).toBe(500);
      expect(body.temperature).toBe(0.3);
    });

    it('should use custom max_tokens and temperature from options', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'Summary' },
          finish_reason: 'stop',
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await provider.summarize(['Test message'], { maxTokens: 1000, temperature: 0.7 });

      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.max_tokens).toBe(1000);
      expect(body.temperature).toBe(0.7);
    });

    it('should return summary content from API response', async () => {
      const expectedSummary = '🧵 **Summary**\nThis is a test summary with topics.';
      const mockResponse = {
        choices: [{
          message: { content: expectedSummary },
          finish_reason: 'stop',
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
        choices: [{
          message: { content: '  Summary with whitespace  \n' },
          finish_reason: 'stop',
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
            error: { message: 'Invalid API key', type: 'invalid_request_error' },
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockFetch.mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({
            error: { message: 'Invalid API key', type: 'invalid_request_error' },
          }),
        } as Response);
        
        await expect(provider.summarize(['Test'])).rejects.toThrow('Authentication failed');
      });

      it('should throw AIProviderError on 429 rate limit', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 429,
          json: async () => ({
            error: { message: 'Rate limit exceeded', type: 'rate_limit_error' },
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockFetch.mockResolvedValue({
          ok: false,
          status: 429,
          json: async () => ({
            error: { message: 'Rate limit exceeded', type: 'rate_limit_error' },
          }),
        } as Response);
        
        await expect(provider.summarize(['Test'])).rejects.toThrow('Too many requests');
      });

      it('should throw AIProviderError on 500 server error', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({
            error: { message: 'Internal server error', type: 'server_error' },
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({
            error: { message: 'Internal server error', type: 'server_error' },
          }),
        } as Response);
        
        await expect(provider.summarize(['Test'])).rejects.toThrow('temporarily unavailable');
      });

      it('should throw AIProviderError on 503 service unavailable', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 503,
          json: async () => ({
            error: { message: 'Service unavailable', type: 'server_error' },
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockFetch.mockResolvedValue({
          ok: false,
          status: 503,
          json: async () => ({
            error: { message: 'Service unavailable', type: 'server_error' },
          }),
        } as Response);
        
        await expect(provider.summarize(['Test'])).rejects.toThrow('temporarily unavailable');
      });

      it('should throw AIProviderError on context length exceeded', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              message: 'Context length exceeded',
              type: 'invalid_request_error',
              code: 'context_length_exceeded',
            },
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockFetch.mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              message: 'Context length exceeded',
              type: 'invalid_request_error',
              code: 'context_length_exceeded',
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
            error: { message: 'Bad request', type: 'invalid_request_error' },
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockFetch.mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({
            error: { message: 'Bad request', type: 'invalid_request_error' },
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

      it('should throw AIProviderError on empty choices array', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({ choices: [] }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({ choices: [] }),
        } as Response);
        
        await expect(provider.summarize(['Test'])).rejects.toThrow('Unable to generate summary');
      });

      it('should throw AIProviderError on missing content', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: null } }],
          }),
        } as Response);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: null } }],
          }),
        } as Response);
        
        await expect(provider.summarize(['Test'])).rejects.toThrow('Unable to generate summary');
      });

      it('should not expose API key in error messages', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({
            error: { message: 'Invalid API key: sk-test123...', type: 'invalid_request_error' },
          }),
        } as Response);

        try {
          await provider.summarize(['Test']);
          fail('Expected error to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AIProviderError);
          const errorMessage = (error as AIProviderError).message;
          expect(errorMessage).not.toContain('sk-');
          expect(errorMessage).not.toContain('test-api-key');
        }
      });

      it('should not expose stack traces in error messages', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({
            error: {
              message: 'Error at line 123 in file.js\n  at function()',
              type: 'server_error',
            },
          }),
        } as Response);

        try {
          await provider.summarize(['Test']);
          fail('Expected error to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AIProviderError);
          const errorMessage = (error as AIProviderError).message;
          expect(errorMessage).not.toContain('line 123');
          expect(errorMessage).not.toContain('file.js');
          expect(errorMessage).not.toContain('at function');
        }
      });

      it('should include provider type in all errors', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({
            error: { message: 'Server error', type: 'server_error' },
          }),
        } as Response);

        try {
          await provider.summarize(['Test']);
          fail('Expected error to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AIProviderError);
          expect((error as AIProviderError).provider).toBe('openai');
        }
      });
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens based on character count', () => {
      // 1 token ≈ 4 characters
      expect(OpenAIProvider.estimateTokens('')).toBe(0);
      expect(OpenAIProvider.estimateTokens('test')).toBe(1);
      expect(OpenAIProvider.estimateTokens('hello world')).toBe(3); // 11 chars / 4 = 2.75 → 3
      expect(OpenAIProvider.estimateTokens('a'.repeat(100))).toBe(25);
    });

    it('should round up token estimates', () => {
      // 5 characters should round up to 2 tokens
      expect(OpenAIProvider.estimateTokens('hello')).toBe(2);
    });
  });

  describe('AIProvider interface compliance', () => {
    it('should implement summarize method', () => {
      const provider = new OpenAIProvider('test-key');
      expect(typeof provider.summarize).toBe('function');
    });

    it('should implement getMaxContextTokens method', () => {
      const provider = new OpenAIProvider('test-key');
      expect(typeof provider.getMaxContextTokens).toBe('function');
    });

    it('should return positive max context tokens', () => {
      const provider = new OpenAIProvider('test-key');
      expect(provider.getMaxContextTokens()).toBeGreaterThan(0);
    });
  });
});
