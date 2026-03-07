/**
 * Summary Formatter Implementation
 *
 * Parses JSON summaries from the AI provider and renders them as
 * Telegram-friendly HTML text with bold topic names and bullet highlights.
 *
 * The AI provider returns JSON:
 *   {"t":[{"n":"Topic","h":["highlight1","highlight2"]}],"q":["question?"]}
 * This module renders it into the final user-facing format.
 * Falls back to the legacy flat format or raw text if parsing fails.
 *
 * @module summary/summary-formatter
 */

// ============================================================================
// Constants
// ============================================================================

/** Maximum output length to leave room within Telegram's 4096 char limit */
const MAX_OUTPUT_LENGTH = 4000;

const HEADER = '🧵 <b>Summary</b>';

const QUESTIONS_HEADER = '❓ <b>Open questions</b>';

const EMPTY_SUMMARY = '🧵 <b>Summary</b>\n\n• No significant topics to summarize.';

// ============================================================================
// Interfaces
// ============================================================================

export interface SummaryFormatter {
  format(rawSummary: string): string;
}

/**
 * A single topic with a name and highlights.
 */
export interface TopicJson {
  n: string;
  h: string[];
}

/**
 * Parsed summary structure matching the new AI provider JSON output.
 * "t" for topics (each with name + highlights), "q" for open questions.
 */
export interface SummaryJson {
  t: TopicJson[];
  q: string[];
}

/**
 * Legacy flat summary structure for backward compatibility.
 */
export interface LegacySummaryJson {
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
 * Attempt to parse a raw string as the new topic-based SummaryJson.
 * Returns null if parsing fails or the structure is invalid.
 */
export function tryParseSummaryJson(raw: string): SummaryJson | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed) return null;

    // New format: { t: [...], q: [...] }
    if (Array.isArray(parsed.t)) {
      const topics: TopicJson[] = [];
      for (const item of parsed.t) {
        if (item && typeof item.n === 'string' && Array.isArray(item.h)) {
          topics.push({
            n: item.n,
            h: item.h.filter((x: unknown): x is string => typeof x === 'string'),
          });
        }
      }
      if (topics.length > 0) {
        return {
          t: topics,
          q: Array.isArray(parsed.q)
            ? parsed.q.filter((x: unknown): x is string => typeof x === 'string')
            : [],
        };
      }
    }

    // Legacy format: { s: [...], q: [...] } — convert to new structure
    if (Array.isArray(parsed.s)) {
      const legacyPoints: string[] = parsed.s.filter(
        (x: unknown): x is string => typeof x === 'string'
      );
      if (legacyPoints.length > 0) {
        return {
          t: legacyPoints.map(point => ({ n: '', h: [point] })),
          q: Array.isArray(parsed.q)
            ? parsed.q.filter((x: unknown): x is string => typeof x === 'string')
            : [],
        };
      }
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
 * Render a SummaryJson object into Telegram-friendly HTML text.
 * Topics are rendered with bold names and bullet highlights.
 */
export function renderSummary(data: SummaryJson): string {
  const lines: string[] = [HEADER];

  for (const topic of data.t) {
    lines.push('');
    if (topic.n) {
      lines.push(`<b>${escapeHtml(topic.n)}</b>`);
    }
    for (const highlight of topic.h) {
      lines.push(`• ${escapeHtml(highlight)}`);
    }
  }

  if (data.q.length > 0) {
    lines.push('');
    lines.push(QUESTIONS_HEADER);
    for (const question of data.q) {
      lines.push(`• ${escapeHtml(question)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Render and intelligently truncate to fit within MAX_OUTPUT_LENGTH.
 * Drops questions first, then removes topics from the end,
 * keeping at least one topic.
 */
function renderAndTruncate(data: SummaryJson): string {
  let rendered = renderSummary(data);
  if (rendered.length <= MAX_OUTPUT_LENGTH) {
    return rendered;
  }

  // First try removing questions
  const truncated: SummaryJson = {
    t: data.t.map(topic => ({ n: topic.n, h: [...topic.h] })),
    q: [...data.q],
  };
  if (truncated.q.length > 0) {
    truncated.q = [];
    rendered = renderSummary(truncated);
    if (rendered.length <= MAX_OUTPUT_LENGTH) {
      return rendered;
    }
  }

  // Then remove topics from the end, keeping at least 1
  while (truncated.t.length > 1) {
    truncated.t.pop();
    rendered = renderSummary(truncated);
    if (rendered.length <= MAX_OUTPUT_LENGTH) {
      return rendered;
    }
  }

  // Then trim highlights from the remaining topic
  while (truncated.t[0].h.length > 1) {
    truncated.t[0].h.pop();
    rendered = renderSummary(truncated);
    if (rendered.length <= MAX_OUTPUT_LENGTH) {
      return rendered;
    }
  }

  // Last resort: hard truncate
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
      const hasContent = parsed.t.some(topic => topic.h.length > 0);
      if (!hasContent && parsed.q.length === 0) {
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
