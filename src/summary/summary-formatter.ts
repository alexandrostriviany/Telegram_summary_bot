/**
 * Summary Formatter Implementation
 * 
 * This module provides the SummaryFormatter that transforms raw AI output
 * into a Telegram-friendly format with:
 * - Emoji header (🧵)
 * - Bullet points for topics (•)
 * - Open questions section (❓)
 * 
 * @module summary/summary-formatter
 * 
 * **Validates: Requirements 3.4**
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Emoji constants for formatting
 */
export const EMOJI = {
  /** Header emoji for summary */
  HEADER: '🧵',
  /** Bullet point for topics */
  BULLET: '•',
  /** Open questions section marker */
  QUESTION: '❓',
} as const;

/**
 * Default header text for summaries
 */
export const DEFAULT_HEADER = 'Summary of recent discussion';

/**
 * Default open questions header
 */
export const OPEN_QUESTIONS_HEADER = 'Open questions';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Interface for the SummaryFormatter
 * 
 * Transforms raw AI output into Telegram-friendly format with
 * proper emoji headers, bullet points, and sections.
 */
export interface SummaryFormatter {
  /**
   * Format raw AI summary output into Telegram-friendly format
   * 
   * @param rawSummary - The raw summary text from the AI provider
   * @returns Formatted summary with emoji headers and bullet points
   */
  format(rawSummary: string): string;
}

// ============================================================================
// Default Summary Formatter Implementation
// ============================================================================

/**
 * Default implementation of the SummaryFormatter
 * 
 * Transforms raw AI output into a structured format:
 * 
 * 🧵 Summary of recent discussion
 * • Topic: [topic] – [details]
 * • Topic: [topic] – [details]
 * ❓ Open questions
 * • [question]
 * 
 * **Validates: Requirements 3.4**
 */
export class DefaultSummaryFormatter implements SummaryFormatter {
  /**
   * Format raw AI summary output into Telegram-friendly format
   * 
   * @param rawSummary - The raw summary text from the AI provider
   * @returns Formatted summary with emoji headers and bullet points
   * 
   * **Validates: Requirements 3.4**
   */
  format(rawSummary: string): string {
    // Handle empty or whitespace-only input
    if (!rawSummary || rawSummary.trim().length === 0) {
      return this.formatEmptySummary();
    }

    const trimmedSummary = rawSummary.trim();
    
    // Parse the raw summary into sections
    const { topics, questions } = this.parseSummary(trimmedSummary);

    // Build the formatted output
    return this.buildFormattedOutput(topics, questions);
  }

  /**
   * Format an empty summary response
   * 
   * @returns Formatted message indicating no content
   */
  private formatEmptySummary(): string {
    return `${EMOJI.HEADER} ${DEFAULT_HEADER}\n\n${EMOJI.BULLET} No significant topics to summarize.`;
  }

  /**
   * Parse raw summary into topics and questions
   * 
   * This method attempts to intelligently parse the AI output,
   * identifying topic lines and open questions.
   * 
   * @param rawSummary - The raw summary text
   * @returns Object containing arrays of topics and questions
   */
  private parseSummary(rawSummary: string): { topics: string[]; questions: string[] } {
    const lines = rawSummary.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const topics: string[] = [];
    const questions: string[] = [];
    
    let inQuestionsSection = false;

    for (const line of lines) {
      // Check if we're entering the questions section
      if (this.isQuestionsHeader(line)) {
        inQuestionsSection = true;
        continue;
      }

      // Skip header lines that look like section titles
      if (this.isSectionHeader(line)) {
        continue;
      }

      // Clean the line (remove existing bullets, numbers, etc.)
      const cleanedLine = this.cleanLine(line);
      
      if (cleanedLine.length === 0) {
        continue;
      }

      // Determine if this is a question based on context or content
      if (inQuestionsSection || this.isQuestion(cleanedLine)) {
        questions.push(cleanedLine);
      } else {
        topics.push(cleanedLine);
      }
    }

    return { topics, questions };
  }

  /**
   * Check if a line is a questions section header
   * 
   * @param line - The line to check
   * @returns True if the line is a questions header
   */
  private isQuestionsHeader(line: string): boolean {
    const lowerLine = line.toLowerCase();
    return (
      lowerLine.includes('open question') ||
      lowerLine.includes('questions:') ||
      lowerLine.includes('unanswered') ||
      lowerLine.includes('unresolved') ||
      lowerLine === 'questions' ||
      line.startsWith(EMOJI.QUESTION)
    );
  }

  /**
   * Check if a line is a section header (to be skipped)
   * 
   * @param line - The line to check
   * @returns True if the line is a section header
   */
  private isSectionHeader(line: string): boolean {
    const lowerLine = line.toLowerCase();
    return (
      lowerLine.includes('summary') ||
      lowerLine.includes('topics discussed') ||
      lowerLine.includes('key points') ||
      lowerLine.includes('main discussion') ||
      line.startsWith('#') ||
      line.startsWith(EMOJI.HEADER)
    );
  }

  /**
   * Check if a line appears to be a question
   * 
   * @param line - The line to check
   * @returns True if the line appears to be a question
   */
  private isQuestion(line: string): boolean {
    return (
      line.endsWith('?') ||
      line.toLowerCase().startsWith('what ') ||
      line.toLowerCase().startsWith('how ') ||
      line.toLowerCase().startsWith('why ') ||
      line.toLowerCase().startsWith('when ') ||
      line.toLowerCase().startsWith('where ') ||
      line.toLowerCase().startsWith('who ') ||
      line.toLowerCase().startsWith('should ') ||
      line.toLowerCase().startsWith('could ') ||
      line.toLowerCase().startsWith('would ') ||
      line.toLowerCase().startsWith('is there ') ||
      line.toLowerCase().startsWith('are there ')
    );
  }

  /**
   * Clean a line by removing existing formatting
   * 
   * Removes:
   * - Leading bullets (•, -, *, etc.)
   * - Leading numbers (1., 2., etc.)
   * - Leading whitespace
   * 
   * @param line - The line to clean
   * @returns Cleaned line
   */
  private cleanLine(line: string): string {
    return line
      // Remove leading bullets and dashes
      .replace(/^[•\-\*\+]\s*/, '')
      // Remove leading numbers with dots or parentheses
      .replace(/^\d+[\.\)]\s*/, '')
      // Remove leading emoji bullets
      .replace(/^[🔹🔸▪️▫️◾◽]\s*/, '')
      // Trim any remaining whitespace
      .trim();
  }

  /**
   * Build the formatted output string
   * 
   * @param topics - Array of topic strings
   * @param questions - Array of question strings
   * @returns Formatted summary string
   */
  private buildFormattedOutput(topics: string[], questions: string[]): string {
    const parts: string[] = [];

    // Add header
    parts.push(`${EMOJI.HEADER} ${DEFAULT_HEADER}`);
    parts.push('');

    // Add topics
    if (topics.length > 0) {
      for (const topic of topics) {
        parts.push(`${EMOJI.BULLET} ${topic}`);
      }
    } else {
      parts.push(`${EMOJI.BULLET} No significant topics to summarize.`);
    }

    // Add questions section if there are any
    if (questions.length > 0) {
      parts.push('');
      parts.push(`${EMOJI.QUESTION} ${OPEN_QUESTIONS_HEADER}`);
      for (const question of questions) {
        parts.push(`${EMOJI.BULLET} ${question}`);
      }
    }

    return parts.join('\n');
  }
}

/**
 * Create a SummaryFormatter instance
 * 
 * @returns Configured SummaryFormatter instance
 */
export function createSummaryFormatter(): SummaryFormatter {
  return new DefaultSummaryFormatter();
}
