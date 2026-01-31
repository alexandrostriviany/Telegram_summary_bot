/**
 * Unit Tests for Summary Formatter
 * 
 * Tests the DefaultSummaryFormatter class that transforms raw AI output
 * into Telegram-friendly format with emoji headers and bullet points.
 * 
 * @module summary/summary-formatter.test
 * 
 * **Validates: Requirements 3.4**
 */

import {
  SummaryFormatter,
  DefaultSummaryFormatter,
  createSummaryFormatter,
  EMOJI,
  DEFAULT_HEADER,
  OPEN_QUESTIONS_HEADER,
} from './summary-formatter';

describe('DefaultSummaryFormatter', () => {
  let formatter: SummaryFormatter;

  beforeEach(() => {
    formatter = new DefaultSummaryFormatter();
  });

  describe('format()', () => {
    describe('header formatting', () => {
      it('should add emoji header to formatted output', () => {
        const rawSummary = 'The team discussed project deadlines.';
        const result = formatter.format(rawSummary);

        expect(result).toContain(EMOJI.HEADER);
        expect(result).toContain(DEFAULT_HEADER);
        expect(result.startsWith(`${EMOJI.HEADER} ${DEFAULT_HEADER}`)).toBe(true);
      });

      it('should format single topic with bullet point', () => {
        const rawSummary = 'The team discussed project deadlines.';
        const result = formatter.format(rawSummary);

        expect(result).toContain(`${EMOJI.BULLET} The team discussed project deadlines.`);
      });
    });

    describe('topic formatting', () => {
      it('should format multiple topics as bullet points', () => {
        const rawSummary = `
          The team discussed project deadlines.
          Budget allocation was reviewed.
          New team members were introduced.
        `;
        const result = formatter.format(rawSummary);

        expect(result).toContain(`${EMOJI.BULLET} The team discussed project deadlines.`);
        expect(result).toContain(`${EMOJI.BULLET} Budget allocation was reviewed.`);
        expect(result).toContain(`${EMOJI.BULLET} New team members were introduced.`);
      });

      it('should remove existing bullet points from input', () => {
        const rawSummary = `
          • Topic one
          - Topic two
          * Topic three
          + Topic four
        `;
        const result = formatter.format(rawSummary);

        // Should have our bullet points, not the original ones
        expect(result).toContain(`${EMOJI.BULLET} Topic one`);
        expect(result).toContain(`${EMOJI.BULLET} Topic two`);
        expect(result).toContain(`${EMOJI.BULLET} Topic three`);
        expect(result).toContain(`${EMOJI.BULLET} Topic four`);
        
        // Should not have double bullets
        expect(result).not.toContain(`${EMOJI.BULLET} • `);
        expect(result).not.toContain(`${EMOJI.BULLET} - `);
      });

      it('should remove numbered list formatting from input', () => {
        const rawSummary = `
          1. First topic
          2. Second topic
          3) Third topic
        `;
        const result = formatter.format(rawSummary);

        expect(result).toContain(`${EMOJI.BULLET} First topic`);
        expect(result).toContain(`${EMOJI.BULLET} Second topic`);
        expect(result).toContain(`${EMOJI.BULLET} Third topic`);
        
        // Should not have numbers
        expect(result).not.toContain('1.');
        expect(result).not.toContain('2.');
        expect(result).not.toContain('3)');
      });

      it('should skip section headers from AI output', () => {
        const rawSummary = `
          Summary:
          The team discussed project deadlines.
          Key Points:
          Budget was approved.
        `;
        const result = formatter.format(rawSummary);

        // Should not include "Summary:" or "Key Points:" as topics
        expect(result).not.toContain(`${EMOJI.BULLET} Summary:`);
        expect(result).not.toContain(`${EMOJI.BULLET} Key Points:`);
        
        // Should include actual topics
        expect(result).toContain(`${EMOJI.BULLET} The team discussed project deadlines.`);
        expect(result).toContain(`${EMOJI.BULLET} Budget was approved.`);
      });
    });

    describe('questions section formatting', () => {
      it('should add open questions section when questions are present', () => {
        const rawSummary = `
          The team discussed project deadlines.
          Open Questions:
          What is the final deadline?
          Who will lead the project?
        `;
        const result = formatter.format(rawSummary);

        expect(result).toContain(`${EMOJI.QUESTION} ${OPEN_QUESTIONS_HEADER}`);
        expect(result).toContain(`${EMOJI.BULLET} What is the final deadline?`);
        expect(result).toContain(`${EMOJI.BULLET} Who will lead the project?`);
      });

      it('should detect questions by question mark', () => {
        const rawSummary = `
          The team discussed project deadlines.
          Is the budget approved?
          When will we start?
        `;
        const result = formatter.format(rawSummary);

        expect(result).toContain(`${EMOJI.QUESTION} ${OPEN_QUESTIONS_HEADER}`);
        expect(result).toContain(`${EMOJI.BULLET} Is the budget approved?`);
        expect(result).toContain(`${EMOJI.BULLET} When will we start?`);
      });

      it('should detect questions by question words', () => {
        const rawSummary = `
          The team discussed project deadlines.
          What the team needs to decide
          How to proceed with the project
          Why the delay occurred
        `;
        const result = formatter.format(rawSummary);

        expect(result).toContain(`${EMOJI.QUESTION} ${OPEN_QUESTIONS_HEADER}`);
      });

      it('should not add questions section when no questions present', () => {
        const rawSummary = `
          The team discussed project deadlines.
          Budget was approved.
          New team members joined.
        `;
        const result = formatter.format(rawSummary);

        expect(result).not.toContain(EMOJI.QUESTION);
        expect(result).not.toContain(OPEN_QUESTIONS_HEADER);
      });

      it('should handle various question section headers', () => {
        const testCases = [
          'Open Questions:\nWhat is the deadline?',
          'Questions:\nWhat is the deadline?',
          'Unanswered:\nWhat is the deadline?',
          'Unresolved:\nWhat is the deadline?',
        ];

        for (const rawSummary of testCases) {
          const result = formatter.format(rawSummary);
          expect(result).toContain(`${EMOJI.QUESTION} ${OPEN_QUESTIONS_HEADER}`);
        }
      });
    });

    describe('edge cases', () => {
      it('should handle empty string input', () => {
        const result = formatter.format('');

        expect(result).toContain(EMOJI.HEADER);
        expect(result).toContain('No significant topics to summarize.');
      });

      it('should handle whitespace-only input', () => {
        const result = formatter.format('   \n\t\n   ');

        expect(result).toContain(EMOJI.HEADER);
        expect(result).toContain('No significant topics to summarize.');
      });

      it('should handle null-like input gracefully', () => {
        const result = formatter.format(null as unknown as string);

        expect(result).toContain(EMOJI.HEADER);
        expect(result).toContain('No significant topics to summarize.');
      });

      it('should handle undefined input gracefully', () => {
        const result = formatter.format(undefined as unknown as string);

        expect(result).toContain(EMOJI.HEADER);
        expect(result).toContain('No significant topics to summarize.');
      });

      it('should handle single line input', () => {
        const rawSummary = 'Single topic discussed.';
        const result = formatter.format(rawSummary);

        expect(result).toContain(EMOJI.HEADER);
        expect(result).toContain(`${EMOJI.BULLET} Single topic discussed.`);
      });

      it('should handle input with only questions', () => {
        const rawSummary = `
          What is the deadline?
          Who is responsible?
        `;
        const result = formatter.format(rawSummary);

        expect(result).toContain(EMOJI.HEADER);
        expect(result).toContain(`${EMOJI.QUESTION} ${OPEN_QUESTIONS_HEADER}`);
        expect(result).toContain(`${EMOJI.BULLET} What is the deadline?`);
        expect(result).toContain(`${EMOJI.BULLET} Who is responsible?`);
      });

      it('should preserve special characters in content', () => {
        const rawSummary = 'Discussion about API endpoints: /users, /posts & /comments';
        const result = formatter.format(rawSummary);

        expect(result).toContain('/users');
        expect(result).toContain('/posts');
        expect(result).toContain('&');
      });

      it('should convert markdown to HTML formatting', () => {
        const rawSummary = 'Use *bold* and _italic_ with `code`';
        const result = formatter.format(rawSummary);

        // Should convert markdown to HTML
        expect(result).toContain('<b>bold</b>');
        expect(result).toContain('<i>italic</i>');
        expect(result).toContain('<code>code</code>');
      });

      it('should handle mixed markdown and regular text', () => {
        const rawSummary = 'Topic: Use API_KEY for authentication';
        const result = formatter.format(rawSummary);

        // Underscores in regular text should not be converted
        expect(result).toContain('API_KEY');
      });

      it('should escape HTML special characters', () => {
        const rawSummary = 'Use <script> tags & entities';
        const result = formatter.format(rawSummary);

        // Should escape HTML special characters
        expect(result).toContain('&lt;script&gt;');
        expect(result).toContain('&amp;');
      });

      it('should handle unicode characters', () => {
        const rawSummary = 'Обсуждение проекта. 项目讨论。';
        const result = formatter.format(rawSummary);

        expect(result).toContain('Обсуждение проекта');
        expect(result).toContain('项目讨论');
      });

      it('should handle very long lines', () => {
        const longLine = 'A'.repeat(1000);
        const result = formatter.format(longLine);

        expect(result).toContain(EMOJI.HEADER);
        expect(result).toContain(longLine);
      });
    });

    describe('output structure', () => {
      it('should have correct structure with topics only', () => {
        const rawSummary = `
          Topic one
          Topic two
        `;
        const result = formatter.format(rawSummary);
        const lines = result.split('\n');

        // First line should be header
        expect(lines[0]).toBe(`${EMOJI.HEADER} ${DEFAULT_HEADER}`);
        // Second line should be empty
        expect(lines[1]).toBe('');
        // Following lines should be topics
        expect(lines[2]).toContain(EMOJI.BULLET);
        expect(lines[3]).toContain(EMOJI.BULLET);
      });

      it('should have correct structure with topics and questions', () => {
        const rawSummary = `
          Topic one
          Open Questions:
          Question one?
        `;
        const result = formatter.format(rawSummary);

        // Should have header, topics, then questions section
        const headerIndex = result.indexOf(EMOJI.HEADER);
        const topicIndex = result.indexOf('Topic one');
        const questionHeaderIndex = result.indexOf(EMOJI.QUESTION);
        const questionIndex = result.indexOf('Question one?');

        expect(headerIndex).toBeLessThan(topicIndex);
        expect(topicIndex).toBeLessThan(questionHeaderIndex);
        expect(questionHeaderIndex).toBeLessThan(questionIndex);
      });
    });
  });
});

describe('createSummaryFormatter', () => {
  it('should create a DefaultSummaryFormatter instance', () => {
    const formatter = createSummaryFormatter();

    expect(formatter).toBeInstanceOf(DefaultSummaryFormatter);
  });

  it('should create a working formatter', () => {
    const formatter = createSummaryFormatter();
    const result = formatter.format('Test topic');

    expect(result).toContain(EMOJI.HEADER);
    expect(result).toContain('Test topic');
  });
});

describe('EMOJI constants', () => {
  it('should have correct emoji values', () => {
    expect(EMOJI.HEADER).toBe('🧵');
    expect(EMOJI.BULLET).toBe('•');
    expect(EMOJI.QUESTION).toBe('❓');
  });
});
