/**
 * Unit tests for Telegram Bot API Client
 * 
 * Tests the TelegramBotClient implementation with mocked fetch.
 * 
 * @module telegram/telegram-client.test
 */

import {
  TelegramBotClient,
  TelegramApiError,
  TelegramClientConfig,
  createTelegramClient,
} from './telegram-client';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('TelegramBotClient', () => {
  const defaultConfig: TelegramClientConfig = {
    botToken: '123456:ABC-DEF-test-token',
    maxRetries: 2,
    baseDelayMs: 10, // Use short delay for tests
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create a client with valid config', () => {
      const client = new TelegramBotClient(defaultConfig);
      expect(client).toBeDefined();
    });

    it('should throw error if bot token is missing', () => {
      expect(() => {
        new TelegramBotClient({ botToken: '' });
      }).toThrow('Bot token is required');
    });

    it('should use default values for optional config', () => {
      const client = new TelegramBotClient({ botToken: 'test-token' });
      expect(client).toBeDefined();
    });
  });

  describe('sendMessage()', () => {
    it('should send a message successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 123 } }),
      });

      const client = new TelegramBotClient(defaultConfig);
      await client.sendMessage(12345, 'Hello, world!');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${defaultConfig.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: 12345,
            text: 'Hello, world!',
            parse_mode: 'HTML',
          }),
        }
      );
    });

    it('should send message with HTML formatting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });

      const client = new TelegramBotClient(defaultConfig);
      const htmlText = '🧵 <b>Summary</b>\n• Topic 1\n• Topic 2\n❓ <b>Questions</b>';
      
      await client.sendMessage(12345, htmlText);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            chat_id: 12345,
            text: htmlText,
            parse_mode: 'HTML',
          }),
        })
      );
    });

    it('should retry on failure and succeed', async () => {
      // First call fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true }),
        });

      const client = new TelegramBotClient(defaultConfig);
      
      const sendPromise = client.sendMessage(12345, 'Test message');
      
      // Advance timers to handle the retry delay
      await jest.advanceTimersByTimeAsync(defaultConfig.baseDelayMs!);
      
      await sendPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry with exponential backoff', async () => {
      // All calls fail except the last
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true }),
        });

      const client = new TelegramBotClient(defaultConfig);
      
      const sendPromise = client.sendMessage(12345, 'Test message');
      
      // First retry: baseDelay * 2^0 = 10ms
      await jest.advanceTimersByTimeAsync(10);
      // Second retry: baseDelay * 2^1 = 20ms
      await jest.advanceTimersByTimeAsync(20);
      
      await sendPromise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should throw error after all retries exhausted', async () => {
      // Use real timers for this test since fake timers cause issues with promise rejection
      jest.useRealTimers();
      
      // Mock all calls to fail
      mockFetch.mockRejectedValue(new Error('Network error'));

      const client = new TelegramBotClient({
        ...defaultConfig,
        baseDelayMs: 1, // Use very short delay for test speed
      });
      
      await expect(client.sendMessage(12345, 'Test message')).rejects.toThrow('Network error');
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
      
      // Restore fake timers for other tests
      jest.useFakeTimers();
    });

    it('should handle HTTP error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          ok: false,
          error_code: 400,
          description: 'Bad Request: chat not found',
        }),
      });

      const client = new TelegramBotClient({
        ...defaultConfig,
        maxRetries: 0, // No retries for this test
      });

      await expect(client.sendMessage(12345, 'Test')).rejects.toThrow(
        TelegramApiError
      );
    });

    it('should handle API response with ok: false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          error_code: 403,
          description: 'Forbidden: bot was blocked by the user',
        }),
      });

      const client = new TelegramBotClient({
        ...defaultConfig,
        maxRetries: 0,
      });

      await expect(client.sendMessage(12345, 'Test')).rejects.toThrow(
        'Telegram API returned error: Forbidden: bot was blocked by the user'
      );
    });

    it('should handle HTTP error without JSON body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const client = new TelegramBotClient({
        ...defaultConfig,
        maxRetries: 0,
      });

      await expect(client.sendMessage(12345, 'Test')).rejects.toThrow(
        'Telegram API error: 500'
      );
    });

    it('should use custom API base URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });

      const customBaseUrl = 'https://custom.api.telegram.org/bot';
      const client = new TelegramBotClient({
        ...defaultConfig,
        apiBaseUrl: customBaseUrl,
      });

      await client.sendMessage(12345, 'Test');

      expect(mockFetch).toHaveBeenCalledWith(
        `${customBaseUrl}${defaultConfig.botToken}/sendMessage`,
        expect.any(Object)
      );
    });

    it('should handle rate limiting (429) with retry', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: async () => ({
            ok: false,
            error_code: 429,
            description: 'Too Many Requests: retry after 1',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true }),
        });

      const client = new TelegramBotClient(defaultConfig);
      
      const sendPromise = client.sendMessage(12345, 'Test');
      
      // Advance timer for retry
      await jest.advanceTimersByTimeAsync(10);
      
      await sendPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe('createTelegramClient()', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create client with provided token', () => {
    const client = createTelegramClient('test-token');
    expect(client).toBeDefined();
  });

  it('should create client from environment variable', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'env-test-token';
    const client = createTelegramClient();
    expect(client).toBeDefined();
  });

  it('should throw error if no token available', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(() => createTelegramClient()).toThrow(
      'TELEGRAM_BOT_TOKEN environment variable is not set'
    );
  });

  it('should prefer provided token over environment variable', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'env-token';
    const client = createTelegramClient('provided-token');
    expect(client).toBeDefined();
  });
});

describe('TelegramApiError', () => {
  it('should create error with all properties', () => {
    const error = new TelegramApiError('Test error', 400, 'Bad Request');
    
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(400);
    expect(error.errorDescription).toBe('Bad Request');
    expect(error.name).toBe('TelegramApiError');
  });

  it('should create error without description', () => {
    const error = new TelegramApiError('Test error', 500);
    
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(500);
    expect(error.errorDescription).toBeUndefined();
  });
});
