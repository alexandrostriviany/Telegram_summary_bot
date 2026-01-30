/**
 * Unit Tests for AWS Bedrock Provider
 * 
 * Tests the Bedrock provider implementation including API calls,
 * error handling, and response parsing.
 * 
 * @module ai/bedrock-provider.test
 * 
 * **Validates: Requirements 5.3** - AWS Bedrock with Claude support
 * **Validates: Requirements 5.4** - Graceful error handling
 */

import { BedrockProvider } from './bedrock-provider';
import { AIProviderError } from './ai-provider';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-bedrock-runtime');

const MockBedrockRuntimeClient = BedrockRuntimeClient as jest.MockedClass<typeof BedrockRuntimeClient>;
const MockInvokeModelCommand = InvokeModelCommand as jest.MockedClass<typeof InvokeModelCommand>;

describe('BedrockProvider', () => {
  const originalEnv = { ...process.env };
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AWS_REGION = 'us-east-1';
    
    // Set up mock send function
    mockSend = jest.fn();
    MockBedrockRuntimeClient.mockImplementation(() => ({
      send: mockSend,
    } as unknown as BedrockRuntimeClient));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  /**
   * Helper to create a mock successful response
   */
  function createMockResponse(text: string) {
    const responseBody = {
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text }],
      model: 'anthropic.claude-instant-v1',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    
    return {
      body: new TextEncoder().encode(JSON.stringify(responseBody)),
    };
  }

  describe('constructor', () => {
    it('should create provider with default region from environment', () => {
      process.env.AWS_REGION = 'eu-west-1';
      const provider = new BedrockProvider();
      expect(provider).toBeInstanceOf(BedrockProvider);
      expect(MockBedrockRuntimeClient).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'eu-west-1' })
      );
    });

    it('should create provider with explicit region', () => {
      const provider = new BedrockProvider('ap-southeast-1');
      expect(provider).toBeInstanceOf(BedrockProvider);
      expect(MockBedrockRuntimeClient).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'ap-southeast-1' })
      );
    });

    it('should default to us-east-1 when no region is specified', () => {
      delete process.env.AWS_REGION;
      const provider = new BedrockProvider();
      expect(provider).toBeInstanceOf(BedrockProvider);
      expect(MockBedrockRuntimeClient).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'us-east-1' })
      );
    });

    it('should accept custom model ID', () => {
      const provider = new BedrockProvider(undefined, 'anthropic.claude-v2');
      expect(provider).toBeInstanceOf(BedrockProvider);
    });

    it('should accept pre-configured client for testing', () => {
      const mockClient = new MockBedrockRuntimeClient({});
      const provider = new BedrockProvider(undefined, undefined, mockClient);
      expect(provider).toBeInstanceOf(BedrockProvider);
    });
  });

  describe('getMaxContextTokens', () => {
    it('should return 8192 tokens for Claude 3 Haiku', () => {
      const provider = new BedrockProvider();
      expect(provider.getMaxContextTokens()).toBe(8192);
    });
  });

  describe('summarize', () => {
    let provider: BedrockProvider;

    beforeEach(() => {
      provider = new BedrockProvider();
    });

    it('should return empty summary message for empty messages array', async () => {
      const result = await provider.summarize([]);
      expect(result).toContain('No messages to summarize');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should make API request with correct parameters', async () => {
      const expectedSummary = '🧵 **Summary**\nTest summary content';
      mockSend.mockResolvedValueOnce(createMockResponse(expectedSummary));

      await provider.summarize(['User1: Hello', 'User2: Hi there']);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(MockInvokeModelCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
          contentType: 'application/json',
          accept: 'application/json',
        })
      );

      // Verify the request body
      const commandCall = MockInvokeModelCommand.mock.calls[0][0];
      const body = JSON.parse(commandCall.body as string);
      expect(body.anthropic_version).toBe('bedrock-2023-05-31');
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[0].content).toContain('User1: Hello');
      expect(body.messages[0].content).toContain('User2: Hi there');
      expect(body.system).toBeDefined();
    });

    it('should use default max_tokens and temperature', async () => {
      mockSend.mockResolvedValueOnce(createMockResponse('Summary'));

      await provider.summarize(['Test message']);

      const commandCall = MockInvokeModelCommand.mock.calls[0][0];
      const body = JSON.parse(commandCall.body as string);
      expect(body.max_tokens).toBe(500);
      expect(body.temperature).toBe(0.3);
    });

    it('should use custom max_tokens and temperature from options', async () => {
      mockSend.mockResolvedValueOnce(createMockResponse('Summary'));

      await provider.summarize(['Test message'], { maxTokens: 1000, temperature: 0.7 });

      const commandCall = MockInvokeModelCommand.mock.calls[0][0];
      const body = JSON.parse(commandCall.body as string);
      expect(body.max_tokens).toBe(1000);
      expect(body.temperature).toBe(0.7);
    });

    it('should return summary content from API response', async () => {
      const expectedSummary = '🧵 **Summary**\nThis is a test summary with topics.';
      mockSend.mockResolvedValueOnce(createMockResponse(expectedSummary));

      const result = await provider.summarize(['Test message']);
      expect(result).toBe(expectedSummary);
    });

    it('should trim whitespace from response', async () => {
      mockSend.mockResolvedValueOnce(createMockResponse('  Summary with whitespace  \n'));

      const result = await provider.summarize(['Test message']);
      expect(result).toBe('Summary with whitespace');
    });

    describe('error handling', () => {
      /**
       * Helper to create an error with a specific name
       */
      function createNamedError(name: string, message: string): Error {
        const error = new Error(message);
        Object.defineProperty(error, 'name', { value: name, writable: true });
        return error;
      }

      it('should throw AIProviderError on AccessDeniedException', async () => {
        const error = createNamedError('AccessDeniedException', 'Access denied');
        mockSend.mockRejectedValue(error);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockSend.mockRejectedValue(error);
        await expect(provider.summarize(['Test'])).rejects.toThrow('Access denied');
      });

      it('should throw AIProviderError on UnrecognizedClientException', async () => {
        const error = createNamedError('UnrecognizedClientException', 'Invalid credentials');
        mockSend.mockRejectedValue(error);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockSend.mockRejectedValue(error);
        await expect(provider.summarize(['Test'])).rejects.toThrow('Authentication failed');
      });

      it('should throw AIProviderError on ThrottlingException', async () => {
        const error = createNamedError('ThrottlingException', 'Rate exceeded');
        mockSend.mockRejectedValue(error);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockSend.mockRejectedValue(error);
        await expect(provider.summarize(['Test'])).rejects.toThrow('Too many requests');
      });

      it('should throw AIProviderError on ServiceUnavailableException', async () => {
        const error = createNamedError('ServiceUnavailableException', 'Service unavailable');
        mockSend.mockRejectedValue(error);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockSend.mockRejectedValue(error);
        await expect(provider.summarize(['Test'])).rejects.toThrow('temporarily unavailable');
      });

      it('should throw AIProviderError on InternalServerException', async () => {
        const error = createNamedError('InternalServerException', 'Internal server error');
        mockSend.mockRejectedValue(error);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockSend.mockRejectedValue(error);
        await expect(provider.summarize(['Test'])).rejects.toThrow('temporarily unavailable');
      });

      it('should throw AIProviderError on ResourceNotFoundException', async () => {
        const error = createNamedError('ResourceNotFoundException', 'Model not found');
        mockSend.mockRejectedValue(error);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockSend.mockRejectedValue(error);
        await expect(provider.summarize(['Test'])).rejects.toThrow('model is not available');
      });

      it('should throw AIProviderError on ValidationException with token error', async () => {
        const error = createNamedError('ValidationException', 'Token limit exceeded');
        mockSend.mockRejectedValue(error);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockSend.mockRejectedValue(error);
        await expect(provider.summarize(['Test'])).rejects.toThrow('too long to summarize');
      });

      it('should throw generic error on other ValidationException', async () => {
        const error = createNamedError('ValidationException', 'Invalid parameter');
        mockSend.mockRejectedValue(error);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockSend.mockRejectedValue(error);
        await expect(provider.summarize(['Test'])).rejects.toThrow('Unable to process');
      });

      it('should throw AIProviderError on timeout', async () => {
        const error = createNamedError('TimeoutError', 'Request timeout');
        mockSend.mockRejectedValue(error);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockSend.mockRejectedValue(error);
        await expect(provider.summarize(['Test'])).rejects.toThrow('timed out');
      });

      it('should throw AIProviderError on network error', async () => {
        const error = new Error('Network connection failed');
        mockSend.mockRejectedValue(error);

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        
        mockSend.mockRejectedValue(error);
        await expect(provider.summarize(['Test'])).rejects.toThrow('Unable to connect');
      });

      it('should throw AIProviderError on empty response body', async () => {
        mockSend.mockResolvedValueOnce({ body: undefined });

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        await expect(provider.summarize(['Test'])).rejects.toThrow('Unable to generate summary');
      });

      it('should throw AIProviderError on empty content array', async () => {
        const responseBody = {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'anthropic.claude-instant-v1',
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 0 },
        };
        
        mockSend.mockResolvedValueOnce({
          body: new TextEncoder().encode(JSON.stringify(responseBody)),
        });

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        await expect(provider.summarize(['Test'])).rejects.toThrow('Unable to generate summary');
      });

      it('should throw AIProviderError on missing text content', async () => {
        const responseBody = {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'image', source: {} }],
          model: 'anthropic.claude-instant-v1',
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 0 },
        };
        
        mockSend.mockResolvedValueOnce({
          body: new TextEncoder().encode(JSON.stringify(responseBody)),
        });

        await expect(provider.summarize(['Test'])).rejects.toThrow(AIProviderError);
        await expect(provider.summarize(['Test'])).rejects.toThrow('Unable to generate summary');
      });

      it('should not expose internal error details in user messages', async () => {
        const error = createNamedError('InternalServerException', 'Internal error with sensitive data: api_key=sk-123');
        mockSend.mockRejectedValueOnce(error);

        try {
          await provider.summarize(['Test']);
          fail('Expected error to be thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(AIProviderError);
          const errorMessage = (err as AIProviderError).message;
          expect(errorMessage).not.toContain('sk-');
          expect(errorMessage).not.toContain('api_key');
          expect(errorMessage).not.toContain('sensitive');
        }
      });

      it('should include provider type in all errors', async () => {
        const error = new Error('Some error');
        mockSend.mockRejectedValueOnce(error);

        try {
          await provider.summarize(['Test']);
          fail('Expected error to be thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(AIProviderError);
          expect((err as AIProviderError).provider).toBe('bedrock');
        }
      });

      it('should include original error as cause', async () => {
        const originalError = new Error('Original error');
        mockSend.mockRejectedValueOnce(originalError);

        try {
          await provider.summarize(['Test']);
          fail('Expected error to be thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(AIProviderError);
          expect((err as AIProviderError).cause).toBe(originalError);
        }
      });
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens based on character count', () => {
      // 1 token ≈ 4 characters
      expect(BedrockProvider.estimateTokens('')).toBe(0);
      expect(BedrockProvider.estimateTokens('test')).toBe(1);
      expect(BedrockProvider.estimateTokens('hello world')).toBe(3); // 11 chars / 4 = 2.75 → 3
      expect(BedrockProvider.estimateTokens('a'.repeat(100))).toBe(25);
    });

    it('should round up token estimates', () => {
      // 5 characters should round up to 2 tokens
      expect(BedrockProvider.estimateTokens('hello')).toBe(2);
    });
  });

  describe('AIProvider interface compliance', () => {
    it('should implement summarize method', () => {
      const provider = new BedrockProvider();
      expect(typeof provider.summarize).toBe('function');
    });

    it('should implement getMaxContextTokens method', () => {
      const provider = new BedrockProvider();
      expect(typeof provider.getMaxContextTokens).toBe('function');
    });

    it('should return positive max context tokens', () => {
      const provider = new BedrockProvider();
      expect(provider.getMaxContextTokens()).toBeGreaterThan(0);
    });
  });
});
