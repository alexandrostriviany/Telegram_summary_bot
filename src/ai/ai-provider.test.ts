/**
 * Unit Tests for AI Provider Interface and Factory
 * 
 * Tests the AIProvider interface, factory function, and error handling.
 * 
 * @module ai/ai-provider.test
 */

import {
  AIProvider,
  AIProviderError,
  AIProviderConfigError,
  SummarizeOptions,
  OpenAIProvider,
  BedrockProvider,
  createAIProvider,
  getProviderTypeFromEnv,
  isAIProviderConfigured,
} from './ai-provider';

describe('AI Provider Module', () => {
  // Store original env value to restore after tests
  const originalEnv = process.env.LLM_PROVIDER;

  afterEach(() => {
    // Restore original environment variable
    if (originalEnv !== undefined) {
      process.env.LLM_PROVIDER = originalEnv;
    } else {
      delete process.env.LLM_PROVIDER;
    }
  });

  describe('SummarizeOptions interface', () => {
    it('should allow optional maxTokens', () => {
      const options: SummarizeOptions = { maxTokens: 500 };
      expect(options.maxTokens).toBe(500);
    });

    it('should allow optional temperature', () => {
      const options: SummarizeOptions = { temperature: 0.7 };
      expect(options.temperature).toBe(0.7);
    });

    it('should allow both options together', () => {
      const options: SummarizeOptions = { maxTokens: 1000, temperature: 0.3 };
      expect(options.maxTokens).toBe(1000);
      expect(options.temperature).toBe(0.3);
    });

    it('should allow empty options object', () => {
      const options: SummarizeOptions = {};
      expect(options.maxTokens).toBeUndefined();
      expect(options.temperature).toBeUndefined();
    });
  });

  describe('AIProviderError', () => {
    it('should create error with message and provider', () => {
      const error = new AIProviderError('Test error', 'openai');
      expect(error.message).toBe('Test error');
      expect(error.provider).toBe('openai');
      expect(error.name).toBe('AIProviderError');
      expect(error.cause).toBeUndefined();
    });

    it('should create error with cause', () => {
      const cause = new Error('Original error');
      const error = new AIProviderError('Wrapped error', 'bedrock', cause);
      expect(error.message).toBe('Wrapped error');
      expect(error.provider).toBe('bedrock');
      expect(error.cause).toBe(cause);
    });

    it('should be an instance of Error', () => {
      const error = new AIProviderError('Test', 'openai');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AIProviderError);
    });
  });

  describe('AIProviderConfigError', () => {
    it('should create error with message', () => {
      const error = new AIProviderConfigError('Config error');
      expect(error.message).toBe('Config error');
      expect(error.name).toBe('AIProviderConfigError');
    });

    it('should be an instance of Error', () => {
      const error = new AIProviderConfigError('Test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AIProviderConfigError);
    });
  });

  describe('OpenAIProvider', () => {
    let provider: OpenAIProvider;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;

    beforeEach(() => {
      // Set a test API key for OpenAI provider tests
      process.env.OPENAI_API_KEY = 'test-api-key';
      provider = new OpenAIProvider();
    });

    afterEach(() => {
      // Restore original API key
      if (originalOpenAIKey !== undefined) {
        process.env.OPENAI_API_KEY = originalOpenAIKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });

    it('should implement AIProvider interface', () => {
      expect(provider.summarize).toBeDefined();
      expect(provider.getMaxContextTokens).toBeDefined();
    });

    it('should return correct max context tokens', () => {
      expect(provider.getMaxContextTokens()).toBe(4096);
    });

    it('should throw AIProviderError when API key is not configured', () => {
      delete process.env.OPENAI_API_KEY;
      expect(() => new OpenAIProvider()).toThrow(AIProviderError);
      expect(() => new OpenAIProvider()).toThrow('OpenAI API key is not configured');
    });

    it('should include provider type in error', () => {
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

  describe('BedrockProvider', () => {
    let provider: BedrockProvider;

    beforeEach(() => {
      provider = new BedrockProvider();
    });

    it('should implement AIProvider interface', () => {
      expect(provider.summarize).toBeDefined();
      expect(provider.getMaxContextTokens).toBeDefined();
    });

    it('should return correct max context tokens', () => {
      expect(provider.getMaxContextTokens()).toBe(8192);
    });

    it('should return empty summary for empty messages array', async () => {
      const result = await provider.summarize([]);
      expect(result).toContain('No messages to summarize');
    });

    it('should include provider type in error', async () => {
      // Mock the client to throw an error
      jest.mock('@aws-sdk/client-bedrock-runtime');
      try {
        // This will fail because the mock client isn't set up
        await provider.summarize(['test']);
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AIProviderError);
        expect((error as AIProviderError).provider).toBe('bedrock');
      }
    });
  });

  describe('getProviderTypeFromEnv', () => {
    it('should return "openai" when LLM_PROVIDER is "openai"', () => {
      process.env.LLM_PROVIDER = 'openai';
      expect(getProviderTypeFromEnv()).toBe('openai');
    });

    it('should return "bedrock" when LLM_PROVIDER is "bedrock"', () => {
      process.env.LLM_PROVIDER = 'bedrock';
      expect(getProviderTypeFromEnv()).toBe('bedrock');
    });

    it('should handle uppercase values', () => {
      process.env.LLM_PROVIDER = 'OPENAI';
      expect(getProviderTypeFromEnv()).toBe('openai');

      process.env.LLM_PROVIDER = 'BEDROCK';
      expect(getProviderTypeFromEnv()).toBe('bedrock');
    });

    it('should handle mixed case values', () => {
      process.env.LLM_PROVIDER = 'OpenAI';
      expect(getProviderTypeFromEnv()).toBe('openai');

      process.env.LLM_PROVIDER = 'BedRock';
      expect(getProviderTypeFromEnv()).toBe('bedrock');
    });

    it('should handle values with whitespace', () => {
      process.env.LLM_PROVIDER = '  openai  ';
      expect(getProviderTypeFromEnv()).toBe('openai');

      process.env.LLM_PROVIDER = '\tbedrock\n';
      expect(getProviderTypeFromEnv()).toBe('bedrock');
    });

    it('should throw AIProviderConfigError when LLM_PROVIDER is not set', () => {
      delete process.env.LLM_PROVIDER;
      expect(() => getProviderTypeFromEnv()).toThrow(AIProviderConfigError);
      expect(() => getProviderTypeFromEnv()).toThrow(
        'LLM_PROVIDER environment variable is not set'
      );
    });

    it('should throw AIProviderConfigError for invalid provider type', () => {
      process.env.LLM_PROVIDER = 'invalid';
      expect(() => getProviderTypeFromEnv()).toThrow(AIProviderConfigError);
      expect(() => getProviderTypeFromEnv()).toThrow('Invalid LLM_PROVIDER value');
    });

    it('should throw AIProviderConfigError for empty string', () => {
      process.env.LLM_PROVIDER = '';
      expect(() => getProviderTypeFromEnv()).toThrow(AIProviderConfigError);
    });
  });

  describe('createAIProvider', () => {
    const originalOpenAIKey = process.env.OPENAI_API_KEY;

    beforeEach(() => {
      // Set a test API key for OpenAI provider tests
      process.env.OPENAI_API_KEY = 'test-api-key';
    });

    afterEach(() => {
      // Restore original API key
      if (originalOpenAIKey !== undefined) {
        process.env.OPENAI_API_KEY = originalOpenAIKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });

    describe('with explicit provider type', () => {
      it('should create OpenAIProvider when type is "openai"', () => {
        const provider = createAIProvider('openai');
        expect(provider).toBeInstanceOf(OpenAIProvider);
      });

      it('should create BedrockProvider when type is "bedrock"', () => {
        const provider = createAIProvider('bedrock');
        expect(provider).toBeInstanceOf(BedrockProvider);
      });
    });

    describe('with environment variable', () => {
      it('should create OpenAIProvider when LLM_PROVIDER is "openai"', () => {
        process.env.LLM_PROVIDER = 'openai';
        const provider = createAIProvider();
        expect(provider).toBeInstanceOf(OpenAIProvider);
      });

      it('should create BedrockProvider when LLM_PROVIDER is "bedrock"', () => {
        process.env.LLM_PROVIDER = 'bedrock';
        const provider = createAIProvider();
        expect(provider).toBeInstanceOf(BedrockProvider);
      });

      it('should throw AIProviderConfigError when LLM_PROVIDER is not set', () => {
        delete process.env.LLM_PROVIDER;
        expect(() => createAIProvider()).toThrow(AIProviderConfigError);
      });

      it('should throw AIProviderConfigError for invalid LLM_PROVIDER', () => {
        process.env.LLM_PROVIDER = 'gpt4';
        expect(() => createAIProvider()).toThrow(AIProviderConfigError);
      });
    });

    describe('provider interface compliance', () => {
      it('should return provider with summarize method', () => {
        const provider = createAIProvider('openai');
        expect(typeof provider.summarize).toBe('function');
      });

      it('should return provider with getMaxContextTokens method', () => {
        const provider = createAIProvider('openai');
        expect(typeof provider.getMaxContextTokens).toBe('function');
      });

      it('should return positive max context tokens', () => {
        const openaiProvider = createAIProvider('openai');
        const bedrockProvider = createAIProvider('bedrock');
        
        expect(openaiProvider.getMaxContextTokens()).toBeGreaterThan(0);
        expect(bedrockProvider.getMaxContextTokens()).toBeGreaterThan(0);
      });
    });
  });

  describe('isAIProviderConfigured', () => {
    it('should return true when LLM_PROVIDER is "openai"', () => {
      process.env.LLM_PROVIDER = 'openai';
      expect(isAIProviderConfigured()).toBe(true);
    });

    it('should return true when LLM_PROVIDER is "bedrock"', () => {
      process.env.LLM_PROVIDER = 'bedrock';
      expect(isAIProviderConfigured()).toBe(true);
    });

    it('should return false when LLM_PROVIDER is not set', () => {
      delete process.env.LLM_PROVIDER;
      expect(isAIProviderConfigured()).toBe(false);
    });

    it('should return false when LLM_PROVIDER is invalid', () => {
      process.env.LLM_PROVIDER = 'invalid';
      expect(isAIProviderConfigured()).toBe(false);
    });

    it('should return false when LLM_PROVIDER is empty', () => {
      process.env.LLM_PROVIDER = '';
      expect(isAIProviderConfigured()).toBe(false);
    });
  });

  describe('AIProvider interface contract', () => {
    const originalOpenAIKey = process.env.OPENAI_API_KEY;

    beforeEach(() => {
      // Set a test API key for OpenAI provider tests
      process.env.OPENAI_API_KEY = 'test-api-key';
    });

    afterEach(() => {
      // Restore original API key
      if (originalOpenAIKey !== undefined) {
        process.env.OPENAI_API_KEY = originalOpenAIKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });

    const providers: Array<{ name: string; create: () => AIProvider }> = [
      { name: 'OpenAIProvider', create: () => new OpenAIProvider() },
      { name: 'BedrockProvider', create: () => new BedrockProvider() },
    ];

    providers.forEach(({ name, create }) => {
      describe(`${name}`, () => {
        let provider: AIProvider;

        beforeEach(() => {
          provider = create();
        });

        it('should have summarize method that returns a Promise', async () => {
          const result = provider.summarize(['test']);
          expect(result).toBeInstanceOf(Promise);
          // Catch the rejection to prevent unhandled promise rejection
          await expect(result).rejects.toThrow();
        });

        it('should have getMaxContextTokens method that returns a number', () => {
          const result = provider.getMaxContextTokens();
          expect(typeof result).toBe('number');
        });

        it('should accept empty messages array', async () => {
          // Should not throw synchronously
          const promise = provider.summarize([]);
          expect(promise).toBeInstanceOf(Promise);
          // Both providers now return a message for empty arrays
          await expect(promise).resolves.toContain('No messages');
        });

        it('should accept messages with options', async () => {
          const options: SummarizeOptions = { maxTokens: 500, temperature: 0.5 };
          const promise = provider.summarize(['test'], options);
          expect(promise).toBeInstanceOf(Promise);
          // OpenAI provider will try to make an API call (which fails in tests)
          // Bedrock provider throws because it's not implemented
          await expect(promise).rejects.toThrow();
        });
      });
    });
  });
});
