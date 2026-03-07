/**
 * Property-Based Tests for Summary Output Formatting
 *
 * These tests use fast-check to verify properties hold across many randomly
 * generated structured JSON inputs (matching the StructuredSummary schema).
 *
 * **Validates: Requirements 3.4**
 *
 * @module summary/summary-formatter.property.test
 */

import * as fc from 'fast-check';
import {
  SummaryFormatter,
  EMOJI,
  DEFAULT_HEADER,
  OPEN_QUESTIONS_HEADER,
  createSummaryFormatter,
} from './summary-formatter';

// ============================================================================
// Arbitrary Generators
// ============================================================================

/** Generate a non-empty single-line string */
const lineArbitrary: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter(s => s.trim().length > 0)
  .map(s => s.replace(/[\n\r]/g, ' ').trim());

/** Generate a valid StructuredSummary JSON string */
const structuredSummaryJsonArbitrary: fc.Arbitrary<string> = fc
  .tuple(
    lineArbitrary, // overview
    fc.array(
      fc.tuple(
        lineArbitrary, // topic title
        fc.array(lineArbitrary, { minLength: 1, maxLength: 5 }) // topic points
      ),
      { minLength: 1, maxLength: 5 }
    ),
    fc.array(lineArbitrary.map(s => s + '?'), { minLength: 0, maxLength: 3 }) // questions
  )
  .map(([overview, topics, questions]) =>
    JSON.stringify({
      overview,
      topics: topics.map(([title, points]) => ({ title, points })),
      questions,
    })
  );

/** Generate a StructuredSummary with at least one question */
const structuredSummaryWithQuestionsArbitrary: fc.Arbitrary<string> = fc
  .tuple(
    lineArbitrary,
    fc.array(
      fc.tuple(lineArbitrary, fc.array(lineArbitrary, { minLength: 1, maxLength: 5 })),
      { minLength: 1, maxLength: 5 }
    ),
    fc.array(lineArbitrary.map(s => s + '?'), { minLength: 1, maxLength: 3 })
  )
  .map(([overview, topics, questions]) =>
    JSON.stringify({
      overview,
      topics: topics.map(([title, points]) => ({ title, points })),
      questions,
    })
  );

/** Generate a valid StructuredSummary JSON wrapped in code fences */
const codeFencedJsonArbitrary: fc.Arbitrary<string> = structuredSummaryJsonArbitrary.map(
  json => '```json\n' + json + '\n```'
);

/** Generate a plain text string that is NOT valid JSON */
const plainTextArbitrary: fc.Arbitrary<string> = fc
  .string({ minLength: 5, maxLength: 200 })
  .filter(s => {
    const trimmed = s.trim();
    if (trimmed.length === 0) return false;
    try {
      JSON.parse(trimmed);
      return false; // reject valid JSON
    } catch {
      return true;
    }
  });

// ============================================================================
// Property Tests
// ============================================================================

describe('Property Tests: Summary Output Formatting', () => {
  let formatter: SummaryFormatter;

  beforeEach(() => {
    formatter = createSummaryFormatter();
  });

  describe('Property 6: Summary Output Formatting (JSON)', () => {
    it('should contain header emoji for any valid JSON summary', () => {
      fc.assert(
        fc.property(structuredSummaryJsonArbitrary, (json: string) => {
          const formatted = formatter.format(json);
          expect(formatted).toContain(EMOJI.HEADER);
          expect(formatted.startsWith(EMOJI.HEADER)).toBe(true);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should contain bullet points for any JSON summary with topic points', () => {
      fc.assert(
        fc.property(structuredSummaryJsonArbitrary, (json: string) => {
          const formatted = formatter.format(json);
          expect(formatted).toContain(EMOJI.BULLET);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should contain open questions section when questions are present', () => {
      fc.assert(
        fc.property(structuredSummaryWithQuestionsArbitrary, (json: string) => {
          const formatted = formatter.format(json);
          expect(formatted).toContain(EMOJI.QUESTION);
          expect(formatted).toContain(OPEN_QUESTIONS_HEADER);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should contain default header text', () => {
      fc.assert(
        fc.property(structuredSummaryJsonArbitrary, (json: string) => {
          const formatted = formatter.format(json);
          expect(formatted).toContain(DEFAULT_HEADER);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should render bold topic titles', () => {
      fc.assert(
        fc.property(structuredSummaryJsonArbitrary, (json: string) => {
          const formatted = formatter.format(json);
          expect(formatted).toContain('<b>');
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should place questions section after topics', () => {
      fc.assert(
        fc.property(structuredSummaryWithQuestionsArbitrary, (json: string) => {
          const formatted = formatter.format(json);
          const bulletIndex = formatted.indexOf(EMOJI.BULLET);
          const questionIndex = formatted.indexOf(EMOJI.QUESTION);
          expect(bulletIndex).toBeGreaterThan(-1);
          expect(questionIndex).toBeGreaterThan(-1);
          expect(questionIndex).toBeGreaterThan(bulletIndex);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should handle code-fenced JSON', () => {
      fc.assert(
        fc.property(codeFencedJsonArbitrary, (raw: string) => {
          const formatted = formatter.format(raw);
          expect(formatted).toContain(EMOJI.HEADER);
          expect(formatted).toContain(EMOJI.BULLET);
          expect(formatted).toContain(DEFAULT_HEADER);
          return true;
        }),
        { numRuns: 50 }
      );
    });

    it('should produce non-empty output for any valid input', () => {
      fc.assert(
        fc.property(structuredSummaryJsonArbitrary, (json: string) => {
          const formatted = formatter.format(json);
          expect(formatted.length).toBeGreaterThan(0);
          expect(formatted.trim().length).toBeGreaterThan(0);
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Legacy fallback', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('should still contain header for any non-JSON text', () => {
      fc.assert(
        fc.property(plainTextArbitrary, (raw: string) => {
          const formatted = formatter.format(raw);
          expect(formatted).toContain(EMOJI.HEADER);
          expect(formatted).toContain(DEFAULT_HEADER);
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });
});
