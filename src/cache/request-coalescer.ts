/**
 * Request Coalescer for Summary Deduplication
 *
 * Deduplicates concurrent summary requests for the same chat by
 * sharing a single AI call's Promise across multiple callers.
 *
 * @module cache/request-coalescer
 */

/** Grace period after a promise resolves before the entry is evicted */
const GRACE_PERIOD_MS = 60_000;

interface CoalescerEntry {
  promise: Promise<string>;
  createdAt: number;
}

export interface RequestCoalescer {
  /**
   * Get or create a summary for the given key.
   * If an in-flight request exists for this key, returns its promise.
   * Otherwise executes the factory and caches the result for a grace period.
   */
  getOrExecute(key: string, factory: () => Promise<string>): Promise<string>;

  /** Number of entries currently in the coalescer */
  size(): number;

  /** Clear all entries (for testing) */
  clear(): void;
}

/**
 * Create a RequestCoalescer instance
 */
export function createRequestCoalescer(): RequestCoalescer {
  const entries = new Map<string, CoalescerEntry>();
  const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    getOrExecute(key: string, factory: () => Promise<string>): Promise<string> {
      const existing = entries.get(key);
      if (existing && (Date.now() - existing.createdAt) < GRACE_PERIOD_MS) {
        console.log(`Coalesced request for key: ${key}`);
        console.log(JSON.stringify({ metric: 'SummaryCacheCoalesced', key, coalescerSize: entries.size }));
        return existing.promise;
      }

      // Clean up expired entry if present
      if (existing) {
        entries.delete(key);
        const timer = cleanupTimers.get(key);
        if (timer) {
          clearTimeout(timer);
          cleanupTimers.delete(key);
        }
      }

      const promise = factory().then(
        (result) => {
          // Schedule cleanup after grace period
          const timer = setTimeout(() => {
            entries.delete(key);
            cleanupTimers.delete(key);
          }, GRACE_PERIOD_MS);
          // Unref timer so it doesn't keep Lambda alive
          if (typeof timer === 'object' && 'unref' in timer) {
            timer.unref();
          }
          cleanupTimers.set(key, timer);
          return result;
        },
        (error) => {
          // Don't cache errors — remove immediately
          entries.delete(key);
          throw error;
        },
      );

      entries.set(key, { promise, createdAt: Date.now() });
      console.log(JSON.stringify({ metric: 'SummaryCoalescerSize', coalescerSize: entries.size }));
      return promise;
    },

    size(): number {
      return entries.size;
    },

    clear(): void {
      for (const timer of cleanupTimers.values()) {
        clearTimeout(timer);
      }
      cleanupTimers.clear();
      entries.clear();
    },
  };
}
