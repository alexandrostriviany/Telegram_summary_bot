/**
 * Summary Formatter Implementation
 *
 * Transforms structured JSON from AI providers into Telegram-friendly HTML.
 * Includes a 3-level JSON parsing fallback and legacy plain-text fallback.
 *
 * @module summary/summary-formatter
 *
 * **Validates: Requirements 3.4**
 */

import { StructuredSummary } from './summary-types';

// ============================================================================
// Constants
// ============================================================================

export const EMOJI = {
  HEADER: '🧵',
  BULLET: '•',
  QUESTION: '❓',
} as const;

export const DEFAULT_HEADER = 'Summary of recent discussion';
export const OPEN_QUESTIONS_HEADER = 'Open questions';

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
 * Escape HTML special characters in text content.
 * Only the three characters that Telegram's HTML mode requires escaping.
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
 * Attempt to parse structured summary JSON with 3-level fallback:
 * 1. Direct JSON.parse
 * 2. Extract from markdown code fences
 * 3. Extract first {...} from the string
 *
 * @returns parsed object or null if all attempts fail
 */
function tryParseJson(raw: string): unknown | null {
  // Level 1: direct parse
  try {
    return JSON.parse(raw);
  } catch {
    // continue to next level
  }

  // Level 2: extract from code fences
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // continue to next level
    }
  }

  // Level 3: extract first { ... } block
  const braceStart = raw.indexOf('{');
  const braceEnd = raw.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    try {
      return JSON.parse(raw.substring(braceStart, braceEnd + 1));
    } catch {
      // all attempts failed
    }
  }

  return null;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate that a parsed object conforms to the StructuredSummary shape.
 */
function validateStructuredSummary(obj: unknown): obj is StructuredSummary {
  if (typeof obj !== 'object' || obj === null) return false;
  const record = obj as Record<string, unknown>;

  if (typeof record.overview !== 'string') return false;

  if (!Array.isArray(record.topics)) return false;
  for (const topic of record.topics) {
    if (typeof topic !== 'object' || topic === null) return false;
    const t = topic as Record<string, unknown>;
    if (typeof t.title !== 'string') return false;
    if (!Array.isArray(t.points)) return false;
    for (const point of t.points) {
      if (typeof point !== 'string') return false;
    }
  }

  if (!Array.isArray(record.questions)) return false;
  for (const q of record.questions) {
    if (typeof q !== 'string') return false;
  }

  return true;
}

// ============================================================================
// HTML Rendering
// ============================================================================

/**
 * Render a validated StructuredSummary into Telegram HTML.
 */
function renderHtml(summary: StructuredSummary): string {
  const parts: string[] = [];

  // Header
  parts.push(`${EMOJI.HEADER} <b>${escapeHtml(DEFAULT_HEADER)}</b>`);
  parts.push('');

  // Overview
  if (summary.overview) {
    parts.push(escapeHtml(summary.overview));
    parts.push('');
  }

  // Topics
  for (const topic of summary.topics) {
    parts.push(`<b>${escapeHtml(topic.title)}</b>`);
    for (const point of topic.points) {
      parts.push(`${EMOJI.BULLET} ${escapeHtml(point)}`);
    }
    parts.push('');
  }

  // Questions
  if (summary.questions.length > 0) {
    parts.push(`${EMOJI.QUESTION} <b>${escapeHtml(OPEN_QUESTIONS_HEADER)}</b>`);
    for (const question of summary.questions) {
      parts.push(`${EMOJI.BULLET} ${escapeHtml(question)}`);
    }
  }

  // Trim trailing blank lines
  while (parts.length > 0 && parts[parts.length - 1] === '') {
    parts.pop();
  }

  return parts.join('\n');
}

/**
 * Legacy fallback: render raw text with HTML escaping under the standard header.
 */
function renderLegacyFallback(rawSummary: string): string {
  console.warn('summary-formatter: JSON parsing failed, using legacy fallback');
  const parts: string[] = [];
  parts.push(`${EMOJI.HEADER} <b>${escapeHtml(DEFAULT_HEADER)}</b>`);
  parts.push('');
  parts.push(escapeHtml(rawSummary));
  return parts.join('\n');
}

// ============================================================================
// Default Summary Formatter Implementation
// ============================================================================

export class DefaultSummaryFormatter implements SummaryFormatter {
  format(rawSummary: string): string {
    if (!rawSummary || rawSummary.trim().length === 0) {
      return `${EMOJI.HEADER} <b>${escapeHtml(DEFAULT_HEADER)}</b>\n\n${EMOJI.BULLET} No significant topics to summarize.`;
    }

    const trimmed = rawSummary.trim();

    // Try to parse as structured JSON
    const parsed = tryParseJson(trimmed);
    if (parsed !== null && validateStructuredSummary(parsed)) {
      return renderHtml(parsed);
    }

    // Fallback: render as escaped plain text
    return renderLegacyFallback(trimmed);
  }
}

/**
 * Create a SummaryFormatter instance
 */
export function createSummaryFormatter(): SummaryFormatter {
  return new DefaultSummaryFormatter();
}
