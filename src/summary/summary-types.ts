/**
 * Structured Summary Types
 *
 * Type definitions for the structured JSON output from AI providers.
 *
 * @module summary/summary-types
 */

/**
 * A single topic in the structured summary
 */
export interface SummaryTopic {
  title: string;
  points: string[];
}

/**
 * Structured summary returned by AI providers as JSON
 */
export interface StructuredSummary {
  overview: string;
  topics: SummaryTopic[];
  questions: string[];
}
