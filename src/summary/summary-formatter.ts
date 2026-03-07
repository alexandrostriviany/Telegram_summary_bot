/**
 * Summary Formatter Implementation
 *
 * Parses JSON summaries from the AI provider and renders them as
 * Telegram-friendly HTML-escaped plain text with intelligent truncation.
 *
 * The AI provider returns JSON: {"s":["point1","point2"],"q":["question?"]}
 * This module renders it into the final user-facing bullet format.
 * Falls back to raw text with HTML escaping if JSON parsing fails.
 *
 * @module summary/summary-formatter
 */

// ============================================================================
// Constants
// ============================================================================

/** Maximum output length to leave room within Telegram's 4096 char limit */
const MAX_OUTPUT_LENGTH = 4000;

const HEADER = '🧵 Summary';

const QUESTIONS_HEADER = '❓ Open questions:';

const EMPTY_SUMMARY = '🧵 Summary\n\n• No significant topics to summarize.';

// ============================================================================
// Interfaces
// ============================================================================

export interface SummaryFormatter {
  format(rawSummary: string): string;
}

/**
 * Parsed summary structure matching the AI provider JSON output.
 * Short keys to minimize token overhead: "s" for summary, "q" for questions.
 */
export interface SummaryJson {
  s: string[];
  q: string[];
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
// JSON Parsing
// ============================================================================

/**
 * Attempt to parse a raw string as SummaryJson.
 * Returns null if parsing fails or the structure is invalid.
 */
export function tryParseSummaryJson(raw: string): SummaryJson | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.s)) {
      return {
        s: parsed.s.filter((item: unknown): item is string => typeof item === 'string'),
        q: Array.isArray(parsed.q)
          ? parsed.q.filter((item: unknown): item is string => typeof item === 'string')
          : [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Rendering
// ============================================================================

/**
 * Render a SummaryJson object into Telegram-friendly formatted text.
 * Applies HTML escaping to all content.
 */
export function renderSummary(data: SummaryJson): string {
  const lines: string[] = [HEADER];

  for (const point of data.s) {
    lines.push('');
    lines.push(`• ${escapeHtml(point)}`);
  }

  if (data.q.length > 0) {
    lines.push('');
    lines.push(QUESTIONS_HEADER);
    for (const question of data.q) {
      lines.push('');
      lines.push(`• ${escapeHtml(question)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Render and intelligently truncate to fit within MAX_OUTPUT_LENGTH.
 * Drops questions first, then removes summary points from the end,
 * keeping at least one point.
 */
function renderAndTruncate(data: SummaryJson): string {
  let rendered = renderSummary(data);
  if (rendered.length <= MAX_OUTPUT_LENGTH) {
    return rendered;
  }

  // First try removing questions
  const truncated: SummaryJson = { s: [...data.s], q: [...data.q] };
  if (truncated.q.length > 0) {
    truncated.q = [];
    rendered = renderSummary(truncated);
    if (rendered.length <= MAX_OUTPUT_LENGTH) {
      return rendered;
    }
  }

  // Then remove summary points from the end, keeping at least 1
  while (truncated.s.length > 1) {
    truncated.s.pop();
    rendered = renderSummary(truncated);
    if (rendered.length <= MAX_OUTPUT_LENGTH) {
      return rendered;
    }
  }

  // Last resort: hard truncate the single remaining point
  if (rendered.length > MAX_OUTPUT_LENGTH) {
    return rendered.substring(0, MAX_OUTPUT_LENGTH - 3) + '...';
  }

  return rendered;
}

// ============================================================================
// Default Summary Formatter Implementation
// ============================================================================

export class DefaultSummaryFormatter implements SummaryFormatter {
  format(rawSummary: string): string {
    if (!rawSummary || rawSummary.trim().length === 0) {
      return EMPTY_SUMMARY;
    }

    const trimmed = rawSummary.trim();

    // Try to parse as JSON (expected format from AI providers)
    const parsed = tryParseSummaryJson(trimmed);
    if (parsed) {
      if (parsed.s.length === 0 && parsed.q.length === 0) {
        return EMPTY_SUMMARY;
      }
      return renderAndTruncate(parsed);
    }

    // Fallback: treat as raw text with HTML escaping (backward compatibility)
    return escapeHtml(trimmed);
  }
}

/**
 * Create a SummaryFormatter instance
 */
export function createSummaryFormatter(): SummaryFormatter {
  return new DefaultSummaryFormatter();
}
