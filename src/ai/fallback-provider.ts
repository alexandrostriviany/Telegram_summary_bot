/**
 * Fallback AI Provider
 *
 * Wraps multiple AI providers and tries them in sequence. If the primary
 * provider fails with a quota/rate-limit error, the next provider in the
 * chain is tried automatically. Non-quota errors (e.g. network, auth) are
 * thrown immediately without fallback.
 *
 * @module ai/fallback-provider
 */

import { AIProvider, AIProviderError, AIProviderType, SummarizeOptions, SummarizeResult } from './ai-provider';

// ============================================================================
// Types
// ============================================================================

/**
 * A provider entry in the fallback chain
 */
export interface FallbackProviderEntry {
  /** The provider type identifier (for logging) */
  type: AIProviderType;
  /** The actual provider instance */
  provider: AIProvider;
}

// ============================================================================
// Quota Error Detection
// ============================================================================

/**
 * Determine whether an error indicates quota/rate-limit exhaustion,
 * meaning the next provider in the chain should be tried.
 *
 * Matches on:
 * - HTTP 429 (rate limit / too many requests)
 * - HTTP 402 (payment required / quota exhausted)
 * - Error messages containing quota/rate-limit keywords
 */
export function isQuotaOrRateLimitError(error: unknown): boolean {
  if (!(error instanceof AIProviderError)) {
    return false;
  }

  const msg = error.message.toLowerCase();

  // Check for explicit quota / rate-limit keywords
  if (
    msg.includes('too many requests') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('insufficient_quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('tokens') && msg.includes('exhausted')
  ) {
    return true;
  }

  // Check the underlying cause for HTTP status hints
  const causeMsg = error.cause?.message?.toLowerCase() ?? '';
  if (
    causeMsg.includes('429') ||
    causeMsg.includes('402') ||
    causeMsg.includes('quota') ||
    causeMsg.includes('rate limit')
  ) {
    return true;
  }

  return false;
}

// ============================================================================
// Fallback Provider Implementation
// ============================================================================

/**
 * FallbackProvider tries providers in order, falling back on quota errors.
 *
 * Usage:
 * ```ts
 * const provider = new FallbackProvider([
 *   { type: 'gemini', provider: geminiProvider },
 *   { type: 'grok',   provider: grokProvider },
 *   { type: 'openai', provider: openaiProvider },
 * ]);
 * ```
 *
 * On a `/summary` call the chain behaves as:
 * 1. Try gemini. If it succeeds, return.
 * 2. If gemini throws a quota/rate-limit error, log and try grok.
 * 3. If grok also fails with quota error, try openai.
 * 4. If all providers fail, throw the last error.
 *
 * Non-quota errors (auth failures, network issues, bad requests) are
 * thrown immediately without trying the next provider.
 */
export class FallbackProvider implements AIProvider {
  private readonly chain: FallbackProviderEntry[];

  constructor(chain: FallbackProviderEntry[]) {
    if (chain.length === 0) {
      throw new Error('FallbackProvider requires at least one provider in the chain');
    }
    this.chain = chain;
  }

  /**
   * Summarize using the provider chain with automatic fallback.
   */
  async summarize(messages: string[], options?: SummarizeOptions): Promise<SummarizeResult> {
    let lastError: AIProviderError | undefined;

    for (let i = 0; i < this.chain.length; i++) {
      const { type, provider } = this.chain[i];
      try {
        const result = await provider.summarize(messages, options);
        if (i > 0) {
          console.log(`Fallback: succeeded with provider ${type} (attempt ${i + 1}/${this.chain.length})`);
        }
        return result;
      } catch (error) {
        if (error instanceof AIProviderError) {
          lastError = error;

          // Only fall back on quota/rate-limit errors
          if (isQuotaOrRateLimitError(error) && i < this.chain.length - 1) {
            const nextType = this.chain[i + 1].type;
            console.warn(
              `Fallback: provider ${type} quota/rate-limit error, falling back to ${nextType}. ` +
              `Error: ${error.message}`
            );
            continue;
          }
        }

        // Non-quota error or last provider in chain: throw immediately
        throw error;
      }
    }

    // Should not reach here, but just in case
    throw lastError ?? new AIProviderError(
      'All providers in the fallback chain failed.',
      this.chain[0].type
    );
  }

  /**
   * Return the max context tokens of the primary (first) provider.
   * All providers in the chain should ideally support similar limits.
   */
  getMaxContextTokens(): number {
    return this.chain[0].provider.getMaxContextTokens();
  }

  /**
   * Get the provider types in this chain (for logging/debugging)
   */
  getChainTypes(): AIProviderType[] {
    return this.chain.map(e => e.type);
  }
}
