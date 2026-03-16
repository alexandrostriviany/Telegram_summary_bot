/**
 * Gemini Context Cache Manager
 *
 * Manages Gemini's CachedContent API to avoid re-processing the system prompt
 * on every summarization call. The cached content is stored server-side by Google
 * and referenced by name in subsequent requests.
 *
 * @module ai/gemini-context-cache
 */

import { SUMMARY_SYSTEM_PROMPT } from './prompts';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Interface for managing Gemini cached content
 */
export interface GeminiContextCache {
  /** Get the cached content name, creating/refreshing if needed */
  getCachedContentName(): Promise<string | null>;
  /** Check if cache is currently valid */
  isValid(): boolean;
}

/**
 * Response from the Gemini CachedContent API
 */
interface CachedContentResponse {
  name: string;
  expireTime: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Gemini CachedContent API base URL */
const CACHED_CONTENT_API_URL = 'https://generativelanguage.googleapis.com/v1beta/cachedContents';

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 10000;

/** Buffer time before expiry to trigger refresh (1 minute) */
const EXPIRY_BUFFER_MS = 60000;

/** Cache TTL in seconds (1 hour) */
const CACHE_TTL_SECONDS = 3600;

// ============================================================================
// Implementation
// ============================================================================

/**
 * Default implementation of GeminiContextCache
 *
 * Caches the system prompt server-side via Gemini's CachedContent API.
 * Falls back gracefully to inline system instructions if caching fails.
 */
export class DefaultGeminiContextCache implements GeminiContextCache {
  private cachedContentName: string | null = null;
  private expiresAt: number = 0;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Get the cached content name, creating or refreshing as needed.
   * Returns null if caching fails (caller should fall back to inline system prompt).
   */
  async getCachedContentName(): Promise<string | null> {
    try {
      if (this.cachedContentName && Date.now() < this.expiresAt - EXPIRY_BUFFER_MS) {
        return this.cachedContentName;
      }

      await this.createCachedContent();
      return this.cachedContentName;
    } catch (error) {
      console.error('Gemini context cache error:', error instanceof Error ? error.message : String(error));
      this.cachedContentName = null;
      this.expiresAt = 0;
      return null;
    }
  }

  /**
   * Check if the cache is currently valid
   */
  isValid(): boolean {
    return this.cachedContentName !== null && Date.now() < this.expiresAt;
  }

  /**
   * Create a new cached content entry via the Gemini API
   */
  private async createCachedContent(): Promise<void> {
    const url = `${CACHED_CONTENT_API_URL}?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: `models/${this.model}`,
          systemInstruction: {
            parts: [{ text: SUMMARY_SYSTEM_PROMPT }],
          },
          ttl: `${CACHE_TTL_SECONDS}s`,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown');
        console.warn(`Gemini CachedContent API returned status ${response.status}: ${errorText}`);
        this.cachedContentName = null;
        this.expiresAt = 0;
        return;
      }

      const data = await response.json() as CachedContentResponse;

      if (!data.name) {
        console.warn('Gemini CachedContent response missing name field');
        this.cachedContentName = null;
        this.expiresAt = 0;
        return;
      }

      this.cachedContentName = data.name;
      this.expiresAt = data.expireTime
        ? new Date(data.expireTime).getTime()
        : Date.now() + CACHE_TTL_SECONDS * 1000;

      console.log(`Gemini context cache created: ${data.name}, expires at ${data.expireTime}`);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a GeminiContextCache instance
 */
export function createGeminiContextCache(apiKey: string, model: string): GeminiContextCache {
  return new DefaultGeminiContextCache(apiKey, model);
}
