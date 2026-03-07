/**
 * Summary Formatter Implementation
 *
 * Escapes AI-generated plain-text summaries for Telegram HTML mode.
 * The AI provider returns the summary in the final user-facing format;
 * this module only handles HTML entity escaping.
 *
 * @module summary/summary-formatter
 */

// ============================================================================
// Interfaces
// ============================================================================

export interface SummaryFormatter {
  format(rawSummary: string): string;
}

// ============================================================================
// HTML Escaping
// ============================================================================

/**
 * Escape HTML special characters for Telegram's HTML parse mode.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ============================================================================
// Default Summary Formatter Implementation
// ============================================================================

export class DefaultSummaryFormatter implements SummaryFormatter {
  format(rawSummary: string): string {
    if (!rawSummary || rawSummary.trim().length === 0) {
      return '🧵 Summary of recent discussion\n\n• No significant topics to summarize.';
    }

    return escapeHtml(rawSummary.trim());
  }
}

/**
 * Create a SummaryFormatter instance
 */
export function createSummaryFormatter(): SummaryFormatter {
  return new DefaultSummaryFormatter();
}
